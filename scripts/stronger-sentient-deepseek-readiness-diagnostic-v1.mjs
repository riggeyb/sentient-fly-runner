import fs from "node:fs";
import { pathToFileURL } from "node:url";

const key = String(process.env.ATLASCLOUD_API_KEY ?? "").trim();
if (!key) throw new Error("atlas_secret_missing");

const codec = await import(pathToFileURL(`${process.cwd()}/sentient/dist/src/model/providers/atlas-cloud-codec.js`).href);
const { normalizeAtlasResponse } = codec;

const content = "[challenger-fairness-preflight] Return only OK.";
const request = {
  taskId: "challenger-preflight-diagnostic",
  sessionId: "challenger-readiness-diagnostic-v1",
  traceId: "challenger-preflight-diagnostic-1",
  runtime: { name: "measurement", version: process.env.BASELINE_SHA },
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
  max_tokens: 64,
  messages: [
    { role: "system", content: "Connectivity preflight only. Model output is never authority." },
    { role: "user", content },
  ],
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
const message = choice?.message && typeof choice.message === "object" && !Array.isArray(choice.message) ? choice.message : null;
const usage = raw?.usage && typeof raw.usage === "object" ? raw.usage : {};
const details = usage?.completion_tokens_details && typeof usage.completion_tokens_details === "object" ? usage.completion_tokens_details : {};
const providerRequestId =
  response.headers.get("x-request-id") ||
  response.headers.get("request-id") ||
  (typeof raw?.id === "string" ? raw.id : null);

const kind = (v) => v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
const len = (v) => typeof v === "string" ? v.length : Array.isArray(v) ? v.length : null;

const normalized = normalizeAtlasResponse({
  raw,
  request,
  wantedModel: "deepseek-ai/deepseek-v3.2",
  latencyMs,
  providerRequestId: providerRequestId ?? undefined,
});

const summary = {
  httpStatus: response.status,
  choiceCount: choices.length,
  finishReasonRaw: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
  messageContentType: kind(message?.content),
  messageContentLength: len(message?.content),
  messageReasoningType: kind(message?.reasoning),
  messageReasoningLength: len(message?.reasoning),
  messageReasoningContentType: kind(message?.reasoning_content),
  messageReasoningContentLength: len(message?.reasoning_content),
  toolCallsType: kind(message?.tool_calls),
  toolCallsCount: Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0,
  usageInputTokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
  usageOutputTokens: usage.completion_tokens ?? usage.output_tokens ?? null,
  usageCompletionTokens: usage.completion_tokens ?? null,
  usageReasoningTokens: details.reasoning_tokens ?? usage.reasoning_tokens ?? null,
  providerRequestId,
  normalizedOk: normalized.ok,
  normalizedFinishReason: normalized.ok ? normalized.finishReason : null,
  normalizedVisibleTextPresent: normalized.ok && typeof normalized.text === "string" && normalized.text.trim().length > 0,
  normalizedVisibleTextLength: normalized.ok && typeof normalized.text === "string" ? normalized.text.length : 0,
  normalizedOutputTokens: normalized.ok ? normalized.usage.outputTokens : null,
  normalizedReasoningTokens: normalized.ok ? (normalized.usage.reasoningTokens ?? null) : null,
};

let failureClass = "OTHER_OBSERVED_CAUSE";
if (
  response.status === 200 &&
  summary.finishReasonRaw === "length" &&
  !summary.normalizedVisibleTextPresent &&
  (summary.messageReasoningContentLength ?? summary.messageReasoningLength ?? 0) > 0 &&
  summary.usageOutputTokens === 64
) {
  failureClass = "OUTPUT_ENVELOPE_EXHAUSTED_BEFORE_VISIBLE_ARTIFACT";
} else if (
  response.status === 200 &&
  !summary.normalizedVisibleTextPresent &&
  (summary.messageReasoningContentLength ?? summary.messageReasoningLength ?? 0) > 0
) {
  failureClass = "REASONING_ONLY_OUTPUT";
} else if (
  response.status === 200 &&
  (summary.messageContentLength ?? 0) > 0 &&
  !summary.normalizedVisibleTextPresent
) {
  failureClass = "CONTENT_PRESENT_BUT_NOT_DECODED";
} else if (
  response.status === 200 &&
  (summary.messageContentLength ?? 0) === 0 &&
  (summary.messageReasoningContentLength ?? summary.messageReasoningLength ?? 0) === 0
) {
  failureClass = "GENUINELY_EMPTY_PROVIDER_RESPONSE";
}

const report = {
  schemaVersion: "stronger-sentient-deepseek-readiness-diagnostic/v1",
  baselineSha: process.env.BASELINE_SHA,
  baselineTree: process.env.BASELINE_TREE,
  replayMaxOutputTokens: 64,
  providerCalls: 1,
  transportHealth: response.status === 200 && choices.length > 0 && message !== null,
  cognitionReadiness: false,
  failureClass,
  ...summary,
  sentientSourceChange: false,
  challengerCalls: 0,
  productionDeployment: false,
};

console.log("DEEPSEEK_READINESS_DIAGNOSTIC=" + JSON.stringify(report));
if (process.env.DIAGNOSTIC_OUT) fs.writeFileSync(process.env.DIAGNOSTIC_OUT, JSON.stringify(report, null, 2) + "\n");
