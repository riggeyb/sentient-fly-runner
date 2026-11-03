import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const key = String(process.env.ATLASCLOUD_API_KEY ?? "").trim();
if (!key) throw new Error("atlas_secret_missing");

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd}_failed_${r.status}`);
};
const out = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(`${cmd}_failed_${r.status}`);
  return r.stdout.trim();
};

const cwd = `${process.cwd()}/sentient`;
const baselineSha = out("git", ["rev-parse", "HEAD"], { cwd });
const baselineTree = out("git", ["show", "-s", "--format=%T", "HEAD"], { cwd });
run("npm", ["install", "--no-audit", "--no-fund", "--package-lock=false"], { cwd });
run("npm", ["run", "build"], { cwd });

const { normalizeAtlasResponse } = await import(
  pathToFileURL(`${cwd}/dist/src/model/providers/atlas-cloud-codec.js`).href
);

const content = "[challenger-fairness-preflight] Return only OK.";
const request = {
  taskId: "challenger-preflight-diagnostic",
  sessionId: "challenger-readiness-diagnostic-v1",
  traceId: "challenger-preflight-diagnostic-1",
  runtime: { name: "measurement", version: baselineSha },
  systemPolicy: "Connectivity preflight only. Model output is never authority.",
  messages: [{ role: "user", content }],
  context: { artifacts: [], contextDigest: "diagnostic" },
  tools: [],
  requiredCapabilities: ["text_generation"],
  maxOutputTokens: 64,
  timeoutMs: 20000,
  maxProviderRetries: 0,
  inputDigest: "diagnostic",
};

const body = {
  model: "deepseek-ai/deepseek-v3.2",
  messages: [
    { role: "system", content: "Connectivity preflight only. Model output is never authority." },
    { role: "user", content },
  ],
  max_tokens: 64,
  stream: false,
};

const t0 = Date.now();
const response = await fetch("https://api.atlascloud.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(20000),
});
const latencyMs = Date.now() - t0;
const raw = await response.json();

const choices = Array.isArray(raw?.choices) ? raw.choices : [];
const choice = choices[0] && typeof choices[0] === "object" ? choices[0] : null;
const message =
  choice?.message && typeof choice.message === "object" && !Array.isArray(choice.message)
    ? choice.message
    : null;
const usage = raw?.usage && typeof raw.usage === "object" ? raw.usage : {};
const details =
  usage?.completion_tokens_details && typeof usage.completion_tokens_details === "object"
    ? usage.completion_tokens_details
    : {};

const providerRequestId =
  response.headers.get("x-request-id") ||
  response.headers.get("request-id") ||
  (typeof raw?.id === "string" ? raw.id : null);

const kind = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const len = (v) =>
  typeof v === "string" ? v.length : Array.isArray(v) ? v.length : v == null ? 0 : null;

const normalized = normalizeAtlasResponse({
  raw,
  request,
  wantedModel: "deepseek-ai/deepseek-v3.2",
  latencyMs,
  providerRequestId: providerRequestId ?? undefined,
});

const reasoningLen = Math.max(
  Number(len(message?.reasoning) ?? 0),
  Number(len(message?.reasoning_content) ?? 0)
);
const contentLen = Number(len(message?.content) ?? 0);
const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? null;
const reasoningTokens = details.reasoning_tokens ?? usage.reasoning_tokens ?? null;
const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
const visible = normalized.ok && typeof normalized.text === "string" && normalized.text.trim().length > 0;

let failureClass = "OTHER_OBSERVED_CAUSE";
if (
  response.status === 200 &&
  finishReason === "length" &&
  !visible &&
  reasoningLen > 0 &&
  outputTokens === 64
) {
  failureClass = "OUTPUT_ENVELOPE_EXHAUSTED_BEFORE_VISIBLE_ARTIFACT";
} else if (response.status === 200 && !visible && reasoningLen > 0) {
  failureClass = "REASONING_ONLY_OUTPUT";
} else if (response.status === 200 && contentLen > 0 && !visible) {
  failureClass = "CONTENT_PRESENT_BUT_NOT_DECODED";
} else if (response.status === 200 && contentLen === 0 && reasoningLen === 0) {
  failureClass = "GENUINELY_EMPTY_PROVIDER_RESPONSE";
}

const report = {
  mission: "STRONGER_SENTIENT_DEEPSEEK_READINESS_DIAGNOSTIC",
  baselineSha,
  baselineTree,
  replayMaxOutputTokens: 64,
  additionalDeepseekCalls: 1,
  challengerCalls: 0,
  httpStatus: response.status,
  choiceCount: choices.length,
  finishReason,
  messageContentType: kind(message?.content),
  messageContentLength: contentLen,
  messageReasoningType: kind(message?.reasoning),
  messageReasoningLength: Number(len(message?.reasoning) ?? 0),
  messageReasoningContentType: kind(message?.reasoning_content),
  messageReasoningContentLength: Number(len(message?.reasoning_content) ?? 0),
  toolCallsType: kind(message?.tool_calls),
  toolCallsCount: Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0,
  inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
  outputTokens,
  completionTokens: usage.completion_tokens ?? null,
  reasoningTokens,
  providerRequestIdPresent: Boolean(providerRequestId),
  normalizedOk: normalized.ok,
  normalizedFinishReason: normalized.ok ? normalized.finishReason : null,
  normalizedVisibleTextPresent: visible,
  normalizedVisibleTextLength:
    normalized.ok && typeof normalized.text === "string" ? normalized.text.length : 0,
  normalizedOutputTokens: normalized.ok ? normalized.usage.outputTokens : null,
  normalizedReasoningTokens:
    normalized.ok ? (normalized.usage.reasoningTokens ?? null) : null,
  failureClass,
  transportHealth: response.status === 200 && choices.length > 0 && message !== null,
  cognitionReadiness: false,
  initial2000TokenEnvelopeSufficient: "UNMEASURED_BY_64_TOKEN_PREFLIGHT",
  codecDefect: failureClass === "CONTENT_PRESENT_BUT_NOT_DECODED",
  sentientSourceChange: false,
  productionDeployment: false,
};

console.log("DEEPSEEK_READINESS_DIAGNOSTIC=" + JSON.stringify(report));
