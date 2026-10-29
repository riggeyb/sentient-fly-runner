import { AtlasCloudClientV1 } from "../sentient/dist/src/model/providers/atlas-cloud-client.js";
import { DEEPSEEK_V3_2_MODEL_V1 } from "../sentient/dist/src/model/providers/atlas-hybrid-router.js";
import { ATLAS_DOTS3_VERIFIED_MODEL_ID_V1 } from "../sentient/dist/src/model/providers/atlas-dots3.js";

const key = process.env.ATLASCLOUD_API_KEY?.trim();
if (!key) throw new Error("atlascloud_api_key_missing");
const client = new AtlasCloudClientV1({ apiKey: key });

const prompts = [
  `Solve carefully and independently verify. Six tasks A-F occupy slots 1-6. B is immediately after E. A precedes D. F is later than D. C is neither first nor last. E precedes A. D is not slot 5. Determine the number of valid schedules and the lexicographically first one. Return only JSON {"count":0,"first":"...","checks":["..."]}.`,
  `Reason carefully and cross-check two different ways. Seven jobs A-G occupy slots 1-7. B is immediately after E. A precedes D. F is later than D. C is neither first nor last. E precedes A. G is later than B but earlier than F. D is not slot 6. Determine the count of valid schedules and lexicographically first valid ordering. Return only JSON {"count":0,"first":"...","checks":["..."]}.`,
];

let deep = null;
let attempts = 0;
for (const prompt of prompts) {
  attempts += 1;
  const result = await client.complete({
    model: DEEPSEEK_V3_2_MODEL_V1,
    systemPrompt: "Use deliberate multi-step reasoning internally. Return only the requested valid JSON object.",
    userPrompt: prompt,
    maxOutputTokens: attempts === 1 ? 256 : 320,
    timeoutMs: 15_000,
    requireJsonObject: true,
    maxCostMicros: 50_000,
  });
  if (!result.ok) throw new Error(`deepseek_smoke_failed:${result.reason}`);
  if ((result.usage.totalTokens ?? 0) <= 0) throw new Error("deepseek_usage_missing");
  deep = result;
  if (result.latencyMs > 8_000) break;
}
if (!deep || deep.latencyMs <= 8_000) {
  throw new Error(`deepseek_old_cutoff_not_exceeded:last_latency_ms=${deep?.latencyMs ?? -1}`);
}
if (deep.latencyMs >= 15_000) throw new Error("deepseek_allocated_hard_stop_exceeded");

const dots = await client.complete({
  model: ATLAS_DOTS3_VERIFIED_MODEL_ID_V1,
  systemPrompt: "Return only valid JSON.",
  userPrompt: 'Return exactly one JSON object {"status":"ok","purpose":"bounded connectivity smoke"}.',
  maxOutputTokens: 64,
  timeoutMs: 15_000,
  requireJsonObject: true,
  maxCostMicros: 25_000,
});
if (!dots.ok) throw new Error(`dots3_smoke_failed:${dots.reason}`);
if ((dots.usage.totalTokens ?? 0) <= 0) throw new Error("dots3_usage_missing");

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
console.log(`DEEPSEEK_ATTEMPTS=${attempts}`);
console.log(`DEEPSEEK_LATENCY_MS=${deep.latencyMs}`);
console.log("DEEPSEEK_OLD_8S_THRESHOLD_EXCEEDED=PASS");
console.log("DEEPSEEK_WITHIN_ALLOCATED_HARD_STOP=PASS");
console.log(`DEEPSEEK_INPUT_TOKENS=${deep.usage.inputTokens ?? "NOT_REPORTED"}`);
console.log(`DEEPSEEK_OUTPUT_TOKENS=${deep.usage.outputTokens ?? "NOT_REPORTED"}`);
console.log(`DEEPSEEK_REASONING_TOKENS=${deep.usage.reasoningTokens ?? "NOT_REPORTED"}`);
console.log(`DEEPSEEK_TOTAL_TOKENS=${deep.usage.totalTokens ?? "NOT_REPORTED"}`);
console.log(`DEEPSEEEK_REQUEST_ID_PRESENT=${deep.providerRequestId !== null}`);
console.log(`DEEPSEEK_REPORTED_COST_USD=${deep.reportedCostUsd ?? "UNREPORTED"}`);
console.log(`DOTS3_MODEL=${ATLAS_DOTS3_VERIFIED_MODEL_ID_V1}`);
console.log(`DOTS3_LATENCY_MS=${dots.latencyMs}`);
console.log(`DOTS3_INPUT_TOKENS=${dots.usage.inputTokens ?? "NOT_REPORTED"}`);
console.log(`DOTS3_OUTPUT_TOKENS=${dots.usage.outputTokens ?? "NOT_REPORTED"}`);
console.log(`DOTS3_REASONING_TOKENS=${dots.usage.reasoningTokens ?? "NOT_REPORTED"}`);
console.log(`DOTS3_TOTAL_TOKENS=${dots.usage.totalTokens ?? "NOT_REPORTED"}`);
console.log(`DOTS3_REQUEST_ID_PRESENT=${dots.providerRequestId !== null}`);
console.log(`DOTS3_REPORTED_COST_USD=${dots.reportedCostUsd ?? "UNREPORTED"}`);
console.log("ABORT_SIGNAL_PATH=PASS");
console.log("USAGE_TELEMETRY_CAPTURED=PASS");
console.log("ATLASCLOUD_SECRET_EXPOSED=false");
console.log("REAL_ATLAS_SMOKE=PASS");
console.log("DEPLOYMENT_PERFORMED=false");