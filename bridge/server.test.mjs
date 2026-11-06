import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createBridgeServer, loadConfig } from "./server.mjs";

const ACTION = "test-action-token-A";
const MCP = "test-mcp-token-B";
const FIXED_NOW = new Date("2026-11-05T23:00:00.000Z");

function env(extra = {}) {
  return {
    GPT_ACTION_BRIDGE_TOKEN: ACTION,
    MCP_CLIENT_TOKEN: MCP,
    PORT: "8080",
    ...extra,
  };
}

async function withServer(fetchImpl, fn, envValue = env(), logger = { error() {} }) {
  const server = createBridgeServer({ env: envValue, fetchImpl, now: () => FIXED_NOW, logger });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function okMcpResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("missing Bearer token is rejected before MCP", async () => {
  let calls = 0;
  await withServer(async () => { calls += 1; throw new Error("should not call"); }, async (base) => {
    const response = await fetch(`${base}/operator/health`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
    assert.equal(calls, 0);
  });
});

test("wrong Bearer token is rejected before MCP", async () => {
  let calls = 0;
  await withServer(async () => { calls += 1; throw new Error("should not call"); }, async (base) => {
    const response = await fetch(`${base}/operator/health`, {
      headers: { authorization: "Bearer wrong-token" },
    });
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  });
});

test("valid Action token invokes only existing sentient.health through MCP", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const body = JSON.parse(init.body);
    assert.equal(init.headers.authorization, `Bearer ${MCP}`);
    assert.notEqual(init.headers.authorization, `Bearer ${ACTION}`);
    if (body.method === "server/discover") {
      return okMcpResponse({ jsonrpc: "2.0", id: 1, result: { name: "sentient-ops-mcp" } });
    }
    assert.equal(body.method, "tools/call");
    assert.equal(body.params.name, "sentient.health");
    assert.deepEqual(body.params.arguments, {});
    return okMcpResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        structuredContent: {
          status: "ok",
          service: "sentient-validation-runner",
          authority: "sentient",
        },
      },
    });
  };

  await withServer(fetchImpl, async (base) => {
    const response = await fetch(`${base}/operator/health`, {
      headers: { authorization: `Bearer ${ACTION}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.bridge, "ok");
    assert.equal(body.mcpReachable, true);
    assert.equal(body.sentientReachable, true);
    assert.equal(body.authority, "sentient");
    assert.equal(body.sentientStatus, "ok");
    assert.equal(body.evidence.source, "existing-sentient-mcp");
    assert.equal(body.evidence.tool, "sentient.health");
    assert.equal(body.sentientHealth.service, "sentient-validation-runner");
  });

  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url === "https://sentient-ops-mcp.fly.dev/mcp"));
});

test("MCP unavailable returns truthful degraded response", async () => {
  const fetchImpl = async () => { throw new Error("network down"); };
  await withServer(fetchImpl, async (base) => {
    const response = await fetch(`${base}/operator/health`, {
      headers: { authorization: `Bearer ${ACTION}` },
    });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.bridge, "ok");
    assert.equal(body.mcpReachable, false);
    assert.equal(body.sentientReachable, false);
    assert.equal(body.error, "mcp_unavailable");
  });
});

test("V1 exposes no arbitrary MCP or mutation route", async () => {
  let calls = 0;
  await withServer(async () => { calls += 1; throw new Error("should not call"); }, async (base) => {
    for (const [method, path] of [
      ["POST", "/operator/call"],
      ["POST", "/operator/gate/continue"],
      ["POST", "/operator/objective/continue"],
      ["GET", "/operator/tools"],
      ["GET", "/operator/state"],
    ]) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { authorization: `Bearer ${ACTION}` },
      });
      assert.equal(response.status, 404);
    }
    const methodResponse = await fetch(`${base}/operator/health`, {
      method: "POST",
      headers: { authorization: `Bearer ${ACTION}` },
    });
    assert.equal(methodResponse.status, 405);
    assert.equal(calls, 0);
  });
});

test("secret-shaped upstream fields are redacted and logs contain no credentials", async () => {
  const logs = [];
  let sequence = 0;
  const fetchImpl = async () => {
    sequence += 1;
    if (sequence === 1) {
      return okMcpResponse({ jsonrpc: "2.0", id: 1, result: { name: "sentient-ops-mcp" } });
    }
    return okMcpResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        structuredContent: {
          status: "ok",
          token: "upstream-token",
          nested: { apiKey: "upstream-key", safe: "value" },
        },
      },
    });
  };

  await withServer(fetchImpl, async (base) => {
    const response = await fetch(`${base}/operator/health`, {
      headers: { authorization: `Bearer ${ACTION}` },
    });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.ok(!text.includes(ACTION));
    assert.ok(!text.includes(MCP));
    assert.ok(!text.includes("upstream-token"));
    assert.ok(!text.includes("upstream-key"));
    const body = JSON.parse(text);
    assert.equal(body.sentientHealth.token, "[redacted]");
    assert.equal(body.sentientHealth.nested.apiKey, "[redacted]");
    assert.equal(body.sentientHealth.nested.safe, "value");
  }, env(), { error(value) { logs.push(String(value)); } });

  assert.ok(logs.every((line) => !line.includes(ACTION) && !line.includes(MCP)));
});

test("external and internal credentials must be distinct", () => {
  assert.throws(
    () => loadConfig(env({ MCP_CLIENT_TOKEN: ACTION })),
    /GPT_ACTION_BRIDGE_TOKEN_MUST_DIFFER_FROM_MCP_CLIENT_TOKEN/,
  );
});

test("OpenAPI exposes only GET /operator/health and no secret", async () => {
  const raw = await readFile(new URL("./openapi.json", import.meta.url), "utf8");
  assert.ok(!raw.includes(ACTION));
  assert.ok(!raw.includes(MCP));
  assert.ok(!raw.includes("GPT_ACTION_BRIDGE_TOKEN"));
  assert.ok(!raw.includes("MCP_CLIENT_TOKEN"));
  const doc = JSON.parse(raw);
  assert.deepEqual(Object.keys(doc.paths), ["/operator/health"]);
  assert.deepEqual(Object.keys(doc.paths["/operator/health"]), ["get"]);
  assert.equal(doc.paths["/operator/health"].get.operationId, "checkSentientHealth");
  assert.equal(doc.components.securitySchemes.bearerAuth.scheme, "bearer");
  assert.ok(!raw.includes("/operator/call"));
  assert.ok(!raw.includes("/operator/gate/continue"));
});
