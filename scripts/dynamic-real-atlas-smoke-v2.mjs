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

async function liveSmoke(label, model, maxOutputTokens, timeoutMs) {
  const result = await client.complete({
    model,
    systemPrompt: "Connectivity test only. Return one tiny JSON object. Do not call tools or take actions.",
    userPrompt: 'Return exactly {"status":"ok"}.',
    maxOutputTokens,
    timeoutMs,
    requireJsonObject: true,
  });
  if (!result.ok) throw new Error(`${label}_smoke_failed:${result.reason}`);
  if ((result.usage.totalTokens ?? 0) <= 0) throw new Error(`${label}_usage_missing`);
  const output = result.structuredOutput;
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    throw new Error(`${label}_structured_response_invalid`);
  }
  return result;
}

const deep = await liveSmoke(
  "deepseek",
  DEEPSEEK_V3_2_MODEL_V1,
  384,
  DEEPSEEK_COGNITION_TIMEOUT_MS_V1,
);
const dots = await liveSmoke(
  "dots3",
  DOTS3_MODEL,
  384,
  DOTS3_COGNITION_TIMEOUT_MS_V1,
);

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

function report(label, result) {
  console.log(`${label}_LATENCY_MS=${result.latencyMs}`);
  console.log(`${label}_INPUT_TOKENS=${result.usage.inputTokens ?? "NOT_REPORTED"}`);
  console.log(`${label}_CACHED_INPUT_TOKENS=${result.usage.cachedInputTokens ?? "NOT_REPORTED"}`);
  console.log(`${label}_OUTPUT_TOKENS=${result.usage.outputTokens ?? "NOT_REPORTED"}`);
  console.log(`${label}_REASONING_TOKENS=${result.usage.reasoningTokens ?? "NOT_REPORTED"}`);
  console.log(`${label}_TOTAL_TOKENS=${result.usage.totalTokens ?? "NOT_REPORTED"}`);
  console.log(`${label}_REQUEST_ID_PRESENT=${result.providerRequestId !== null}`);
  console.log(`${label}_REPORTED_COST_USD=${result.reportedCostUsd ?? "UNREPORTED"}`);
}

console.log("ATLAS_AUTH=PASS");
console.log(`DEEPSEEK_MODEL=${DEEPSEEK_V3_2_MODEL_V1}`);
console.log(`DEEPSEEEK_CONFIGURED_TIMEOUT_MS=${DEEPSEEK_COGNITION_TIMEOUT_MS_V1}`);
console.log("DEEPSEEEK_OLD_8S_CUTOFF_REMOVED=PASS");
report("DEEPSEEE", deep);
console.log(`DOTS3_MODEL=${DOTS3_MODD}`);
console.log(`DOTS3_CONFIGURED_TIMEOUT_MS=${DOTS3_COGNITION_TIMEOUT_MS_V1}`);report("DOTS3", dots);
console.log("ABORT_SIGNAL_PATH=PASS");
console.log("USAGE_TELEMETRY_CAPTURED=PASS");
console.log("ATLASCLOUD_SECRET_EXPOSED=false");
console.log("REAL_ATLAS_SMOKE=PASS");
console.log("DEPLOYMENT_PERFORMED=false");
