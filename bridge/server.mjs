import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

const MCP_ENDPOINT = "https://sentient-ops-mcp.fly.dev/mcp";
const MCP_PROTOCOL = "2026-07-28";
const REQUEST_TIMEOUT_MS = 15_000;

export function loadConfig(env = process.env) {
  const actionToken = requiredSecret(env.GPT_ACTION_BRIDGE_TOKEN, "GPT_ACTION_BRIDGE_TOKEN");
  const mcpToken = requiredSecret(env.MCP_CLIENT_TOKEN, "MCP_CLIENT_TOKEN");
  if (secureEqual(actionToken, mcpToken)) {
    throw new Error("GPT_ACTION_BRIDGE_TOKEN_MUST_DIFFER_FROM_MCP_CLIENT_TOKEN");
  }
  const port = parsePort(env.PORT ?? "8080");
  return { actionToken, mcpToken, port, mcpEndpoint: MCP_ENDPOINT };
}

export function createBridgeServer({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  logger = console,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("FETCH_UNAVAILABLE");
  const config = loadConfig(env);
  return createServer((req, res) => {
    void route(req, res, { config, fetchImpl, now, logger });
  });
}

async function route(req, res, context) {
  const url = new URL(req.url ?? "/", "http://bridge.invalid");

  if (url.pathname !== "/operator/health") {
    return json(res, 404, { error: "not_found" });
  }

  if (req.method !== "GET") {
    return json(res, 405, { error: "method_not_allowed" }, { allow: "GET" });
  }

  if (!authorized(req.headers.authorization, context.config.actionToken)) {
    return json(res, 401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
  }

  try {
    const health = await readSentientHealth(context.config, context.fetchImpl);
    const safeHealth = scrub(health);
    const response = {
      bridge: "ok",
      mcpReachable: true,
      sentientReachable: true,
      authority: "sentient",
      timestamp: context.now().toISOString(),
      evidence: {
        source: "existing-sentient-mcp",
        tool: "sentient.health",
      },
      sentientHealth: safeHealth,
    };
    const status = sentientStatus(safeHealth);
    if (status !== null) response.sentientStatus = status;
    return json(res, 200, response);
  } catch (error) {
    const failure = classifyFailure(error);
    context.logger.error(JSON.stringify({
      event: "operator_health_failed",
      code: failure.code,
    }));
    return json(res, 502, {
      bridge: "ok",
      mcpReachable: failure.mcpReachable,
      sentientReachable: false,
      authority: "sentient",
      timestamp: context.now().toISOString(),
      evidence: {
        source: "existing-sentient-mcp",
        tool: "sentient.health",
      },
      error: failure.code,
    });
  }
}

async function readSentientHealth(config, fetchImpl) {
  const discover = await rpc(config, fetchImpl, "server/discover", {});
  if (discover?.error) throw new BridgeError("mcp_discover_failed", true);

  const health = await rpc(
    config,
    fetchImpl,
    "tools/call",
    { name: "sentient.health", arguments: {} },
    "sentient.health",
  );
  if (health?.error) throw new BridgeError("sentient_health_rpc_failed", true);
  if (health?.result?.isError) throw new BridgeError("sentient_health_tool_failed", true);

  const value = health?.result?.structuredContent ?? parseToolText(health?.result?.content);
  if (value === undefined || value === null) {
    throw new BridgeError("sentient_health_empty", true);
  }
  if (plain(value) && value.ok === false) {
    throw new BridgeError("sentient_health_failed", true);
  }
  return value;
}

async function rpc(config, fetchImpl, method, params, name = null) {
  const headers = {
    authorization: `Bearer ${config.mcpToken}`,
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": MCP_PROTOCOL,
    "mcp-method": method,
  };
  if (name) headers["mcp-name"] = name;

  let response;
  try {
    response = await fetchImpl(config.mcpEndpoint, {
      method: "POST",
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: {
          ...params,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL,
            "io.modelcontextprotocol/clientCapabilities": {},
            "io.modelcontextprotocol/clientInfo": {
              name: "sentient-gpt-action-bridge",
              version: "1.0.0",
            },
          },
        },
      }),
    });
  } catch {
    throw new BridgeError("mcp_unavailable", false);
  }

  if (response.status === 401 || response.status === 403) {
    throw new BridgeError("mcp_auth_failed", true);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new BridgeError("mcp_redirect_rejected", true);
  }

  let parsed;
  try {
    parsed = parseMcpResponse(await response.text());
  } catch {
    throw new BridgeError("mcp_protocol_error", true);
  }
  if (!response.ok && !parsed?.error) {
    throw new BridgeError("mcp_http_error", true);
  }
  return parsed;
}

function authorized(header, expectedToken) {
  if (typeof header !== "string") return false;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  return secureEqual(match[1] ?? "", expectedToken);
}

function secureEqual(left, right) {
  const a = createHash("sha256").update(String(left), "utf8").digest();
  const b = createHash("sha256").update(String(right), "utf8").digest();
  return timingSafeEqual(a, b);
}

function requiredSecret(value, name) {
  const secret = String(value ?? "").trim();
  if (!secret) throw new Error(`${name}_MISSING`);
  return secret;
}

function parsePort(value) {
  const port = Number.parseInt(String(value), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT_INVALID");
  return port;
}

function parseMcpResponse(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) throw new Error("empty");
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const events = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (!events.length) throw new Error("unparseable");
  return JSON.parse(events.at(-1));
}

function parseToolText(content) {
  if (!Array.isArray(content)) return undefined;
  const item = content.find((entry) => entry?.type === "text" && typeof entry.text === "string");
  if (!item) return undefined;
  try {
    return JSON.parse(item.text);
  } catch {
    return item.text;
  }
}

function scrub(value, depth = 0) {
  if (depth > 8) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 2048);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => scrub(item, depth + 1));
  if (!plain(value)) return String(value).slice(0, 256);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = /(authorization|token|secret|password|credential|cookie|api[_-]?key)/i.test(key)
      ? "[redacted]"
      : scrub(item, depth + 1);
  }
  return out;
}

function sentientStatus(value) {
  if (!plain(value)) return null;
  if (typeof value.status === "string") return value.status;
  if (plain(value.body) && typeof value.body.status === "string") return value.body.status;
  return null;
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

class BridgeError extends Error {
  constructor(code, mcpReachable) {
    super(code);
    this.code = code;
    this.mcpReachable = mcpReachable;
  }
}

function classifyFailure(error) {
  if (error instanceof BridgeError) {
    return { code: error.code, mcpReachable: error.mcpReachable };
  }
  return { code: "bridge_internal_error", mcpReachable: false };
}

function json(res, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

export async function start() {
  const server = createBridgeServer();
  const { port } = loadConfig();
  await new Promise((resolve) => server.listen(port, "0.0.0.0", resolve));
  console.log(JSON.stringify({
    event: "sentient_gpt_action_bridge_started",
    port,
    capability: "GET_/operator/health",
  }));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await start();
}
