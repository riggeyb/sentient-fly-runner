const fs = require("node:fs");
const crypto = require("node:crypto");

const originalFetch = globalThis.fetch;
if (typeof originalFetch !== "function") throw new Error("global_fetch_unavailable");

const out = process.env.RAW_SHAPES_OUT;
if (!out) throw new Error("RAW_SHAPES_OUT_missing");

let callNo = 0;

function digestText(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function describe(value) {
  if (value === undefined) return { type: "undefined" };
  if (value === null) return { type: "null" };
  if (typeof value === "string") return { type: "string", length: value.length, sha256: digestText(value) };
  if (Array.isArray(value)) return { type: "array", length: value.length };
  if (typeof value === "object") return { type: "object", keys: Object.keys(value).sort() };
  return { type: typeof value };
}

globalThis.fetch = async (...args) => {
  const started = Date.now();
  const response = await originalFetch(...args);
  const n = ++callNo;
  let raw = null;
  let parseError = false;
  try {
    raw = await response.clone().json();
  } catch {
    parseError = true;
  }

  const choices = Array.isArray(raw?.choices) ? raw.choices : [];
  const choice = choices[0] ?? null;
  const message = choice?.message && typeof choice.message === "object" && !Array.isArray(choice.message)
    ? choice.message
    : {};
  const usage = raw?.usage && typeof raw.usage === "object" ? raw.usage : {};
  const details = usage?.completion_tokens_details && typeof usage.completion_tokens_details === "object"
    ? usage.completion_tokens_details
    : {};

  const providerSpecific = {};
  for (const [key, value] of Object.entries(message)) {
    if (["content", "reasoning", "reasoning_content", "tool_calls"].includes(key)) continue;
    providerSpecific[key] = describe(value);
  }

  const record = {
    n,
    httpStatus: response.status,
    latencyMs: Date.now() - started,
    parseError,
    choiceCount: choices.length,
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
    messageKeys: Object.keys(message).sort(),
    content: describe(message.content),
    reasoning: describe(message.reasoning),
    reasoningContent: describe(message.reasoning_content),
    toolCalls: {
      type: Array.isArray(message.tool_calls) ? "array" : message.tool_calls === null ? "null" : typeof message.tool_calls,
      count: Array.isArray(message.tool_calls) ? message.tool_calls.length : null
    },
    providerSpecific,
    usage: {
      input_tokens: Number.isFinite(usage.input_tokens) ? usage.input_tokens : null,
      prompt_tokens: Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : null,
      output_tokens: Number.isFinite(usage.output_tokens) ? usage.output_tokens : null,
      completion_tokens: Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null,
      total_tokens: Number.isFinite(usage.total_tokens) ? usage.total_tokens : null,
      reasoning_tokens: Number.isFinite(details.reasoning_tokens)
        ? details.reasoning_tokens
        : Number.isFinite(usage.reasoning_tokens)
          ? usage.reasoning_tokens
          : null
    },
    responseModel: typeof raw?.model === "string" ? raw.model : null
  };

  fs.appendFileSync(out, JSON.stringify(record) + "\n");
  return response;
};
