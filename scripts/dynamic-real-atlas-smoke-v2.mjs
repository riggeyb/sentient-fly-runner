import { AtlasCloudClientV1 } from "../sentient/dist/src/model/providers/atlas-cloud-client.js";
import {
  DEEPSEEK_V3_2_MODEL_V1,
  DEEPSEEK_COGNITION_TIMEOUT_MS_V1,
  DOTS3_COGNITION_TIMEOUT_MS_V1,
} from "../sentient/dist/src/model/providers/atlas-hybrid-router.js";

const DOTS3_MODEL = "dots-studio/dots-3-note-prev-free";
const key = process.env.ATLASCLOUD_API_KEY?.trim();
if (!key) throw new Error("atlascloud_api_key_missing");

if (DEEPSEEK_COGNITION_TIMEOUT_MS_V1 !== 12_000) {
  throw new Error(`unexpected_deepseek_timeout:${DEEPSEEK_COGNITION_TIMEOUT_MS_V1}`);
}
if (DEEPSEEK_COGNITION_TIMEOUT_MS_V1 <= 9_400) {
  throw new Error("old_deepseek_cutoff_still_present");
}
if (DOTS3_COGNITION_TIMEOUT_MS_V1 !== 9_000) {
  throw new Error(`unexpected_dots3_timeout:${DOTS3_COGNITION_TIMEOUT_MS_V1}`);
}

const client = new AtlasCloudClientV1({ apiKey: key });

const deep = await client.complete({
  model: DEEPSEEK_V3_2_MODEL_V1,
  systemPrompt: "Return only valid JSON. Do not call tools or take actions.",
  userPrompt: 'Return exactly one JSON object {"status":"ok","purpose":"deepseek connectivity smoke"}.',
  maxOutputTokens: 128,
  timeoutMs: DEEPSEEK_COGNITION_TIMEOUT_MS_V1,
  requireJsonObject: true,
});
if (!deep.ok) throw new Error(`deepseek_smoke_failed:${deep.reason}`);
if ((deep.usage.totalTokens ?? 0) <= 0) throw new Error("deepseek_usage_missing");
if (
  deep.structuredOutput === null
  || typeof deep.structuredOutput !== "object"
  || Array.isArray(deep.structuredOutput)
  || deep.structuredOutput.status !== "ok"
) {
  throw new Error("deepseek_structured_response_invalid");
}

const dots = await client.complete({
  model: DOTS3_MODEL,
  systemPrompt: "Return only valid JSON. Do not call tools or take actions.",
  userPrompt: 'Return exactly one JSON object {"status":"ok","purpose":"dots3 connectivity smoke"}.',
  maxOutputTokens: 64,
  timeoutMs: DOTS3_COGNITION_TIMEOUT_MS_V1,
  requireJsonObject: true,
});
if (!dots.ok) throw new Error(`dots3_smoke_failed:${dots.reason}`);
if ((dots.usage.totalTokens ?? 0) <= 0) throw new Error("dots3_usage_missing");
if (
  dots.structuredOutput === null
  || typeof dots.structuredOutput !== "object"
  || Array.isArray(dots.structuredOutput)
  || dots.structuredOutput.status !== "ok"
) {
  throw new Error("dots3_structured_response_invalid");
}

let abortObserved = false;
const fake = new AtlasCloudClientV1({
  apiKey: "synthetic-not-a-secret",
  fetchImpl: async (_url, init) => await new Promise((_resolve, reject) => {
    const signal = init?.signal;
    const onAbort = () => {
      abortObserved = true;
      reject(new Error("synthetic_abort"));
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  }),
});
const controller = new AbortController();
setTimeout(() => controller.abort(), 5);
const aborted = await fake.complete({
  model: DEEPSEEK_V3_2_MODEL_V1,
  systemPrompt: "synthetic",
  userPrompt: "synthetic",
  maxOutputTokens: 8,
  timeoutMs: 2_000,
  signal: controller.signal,
});
if (aborted.ok || aborted.reason !== "timeout" || !abortObserved) {
  throw new Error("candidate_abort_signal_not_wired");
}

console.log("ATLAS_AUTH=PASS");
console.log(`DEEPSEEK_MODEL=${DEEPSEEK_V3_2_MODEL_V1}`);
console.log(`DEEPSEEK_CONFIGURED_TIMEOUT_MS=${DEEPSEEK_COGNITION_TIMEOUT_MS_V1}`);
console.log("DEEPSEEK_OLD_8S_CUTOFF_REMOVED=PASS");
console.log(`DEEPSEEK_LATENCY_MS=${deep.latencyMs}`);
console.log(`DEEPSEEK_INPUT_TOKENS=${deep.usage.inputTokens ?? "NOT_REPORTED"}`);
console.log(`DEEPSEEK_CACHED_INPUT_TOKENS=${deep.usage.cachedInputTokens ?? "NOT_REPORTED"}`);
console.log(`DEEPSEEK_OUTPUT_TOKENS=${deep.usage.outputTokens ?? "NOT_REPORTED"}`);
console.log(`DEEPSEEK_REASONING_TOKENS=${deep.usage.reasoningTokens ?? "NOT_REPORTED"}`);
console.log(`DEEPSEEK_TOTAL_TOKENS=${deep.usage.totalTokens ?? "NOT_REPORTED"}`);
console.log(`DEEPSEEEK_REQUEST_ID_PRESENT=${deep.providerRequestId !== null}`);
console.log(`DEEPSEEK_REPORTED_COST_USD=${deep.reportedCostUsd ?? "UNREPORTED"}`);
console.log(`DOTS3_MODEL=${DOTS3_MODEL}`);
console.log(`DOTS3_CONFIGURED_TIMEOUT_MS=${DOTS3_COGNITION_TIMEOUT_MS_V1}`);
console.log(`DOTS3_LATENCY_MS=${dots.latencyMs}`);
console.log(`DOTS3_INPUT_TOKENS=${dots.usage.inputTokens ?? "NOT_REPORTED"}`);
console.log(`DOTS3_CACHED_INPUT_TOKENS=${dots.usage.cachedInputTokens ?? "NOT_REPORTED"}`);
console.log(`DOTS3_OUTPUT_TOKENS=${dots.usage.outputTokens ?? "NOT_REPORTED"}`);
console.log(`DOTS3_REASONING_TOKENS=${dots.usage.reasoningTokens ?? "NOT_REPORTED"}`);
console.log(`DOTS3_TOTAL_TOKENS=${dots.usage.totalTokens ?? "NOT_REPORTED"}`);
console.log(`DOTS3_REQUEST_ID_PRESENT=${dots.providerRequestId !== null}`);
console.log(`DOTS3_REPORTED_COST_USD=${dots.reportedCostUsd ?? "UNREPORTED"}`);
console.log("ABORT_SIGNAL_PATH=PASS");
console.log("USAGE_TELEMETRY_CAPTURED=PASS");
console.log("ATLASCNROUD_SECRET_EXPOSED=false");
console.log("REAL_ATLAS_SMOKE=PASS");
console.log("DEPLOYMENT_PERFORMED=false");
