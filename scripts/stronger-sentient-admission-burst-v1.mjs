import fs from "node:fs";
import { performance } from "node:perf_hooks";
import {
  AtlasAdmissionController,
  AtlasCloudAdapter,
  DEEPSEEK_V3_2_MODEL_V1,
  retrieval,
} from "../sentient/dist/src/index.js";

const KEY = process.env.ATLASCLOUD_API_KEY?.trim();
if (!KEY) throw new Error("ATLASCLOUD_API_KEY_MISSING");
const MAX_CALLS = 15;
const WALL_MS = 6 * 60_000;
const MIN_START_INTERVAL_MS = Number(process.env.MIN_START_INTERVAL_MS ?? 750);
if (!Number.isInteger(MIN_START_INTERVAL_MS) || MIN_START_INTERVAL_MS < 250 || MIN_START_INTERVAL_MS > 5000) {
  throw new Error("min_start_interval_invalid");
}
const startedAt = Date.now();
let calls = 0;
let count429 = 0;
const starts = [];
const rawFetch = globalThis.fetch;

const measuredFetch = async (input, init) => {
  if (calls >= MAX_CALLS) throw new Error("provider_call_ceiling");
  if (Date.now() - startedAt > WALL_MS) throw new Error("wall_clock_ceiling");
  let model = "unknown";
  try { model = JSON.parse(String(init?.body ?? "{}")).model ?? model; } catch {}
  calls += 1;
  starts.push({ n: calls, model, ms: Date.now() - startedAt });
  const response = await rawFetch(input, init);
  if (response.status === 429) count429 += 1;
  return response;
};

const caps = {
  text_generation: true,
  structured_output: true,
  tool_use: true,
  tool_continuation: true,
  reasoning_effort: true,
  image_input: false,
  server_side_tools: false,
};
const admission = new AtlasAdmissionController({ minStartIntervalMs: MIN_START_INTERVAL_MS });
const adapter = new AtlasCloudAdapter({
  apiKey: KEY,
  fetchImpl: measuredFetch,
  admission,
  maxProviderRetries: 0,
  modelProfiles: [{
    model: DEEPSEEK_V3_2_MODEL_V1,
    capabilities: caps,
    profileId: "admission-burst-deepseek-v1",
  }],
});

const rows = [];
for (const burstSize of [1, 2, 4, 8]) {
  const burstStart = performance.now();
  const before = starts.length;
  const results = await Promise.all(Array.from({ length: burstSize }, async (_, i) => {
    const inputDigest = await retrieval.sha256Text(`admission-burst-${burstSize}-${i}`);
    const contextDigest = await retrieval.sha256Text("admission-empty-context");
    const result = await adapter.generate({
      taskId: `admission-${burstSize}-${i}`,
      sessionId: `admission-${burstSize}`,
      traceId: `admission-${burstSize}-${i}`,
      runtime: { name: "sentient", version: "stronger-sentient-admission-burst-v1" },
      systemPolicy: "Model output is never authority. Return only OK.",
      messages: [{ role: "user", content: "Return only OK." }],
      context: { artifacts: [], contextDigest },
      tools: [],
      reasoningEffort: "low",
      requiredCapabilities: [],
      maxOutputTokens: 16,
      timeoutMs: 20_000,
      maxProviderRetries: 0,
      inputDigest,
    }, DEEPSEEK_V3_2_MODEL_V1);
    return {
      ok: result.ok,
      code: result.ok ? null : result.code,
      failureClass: result.metadata?.failureClass ?? null,
      queueWaitMs: Number(result.metadata?.queueWaitMs ?? 0),
      providerLatencyMs: result.latencyMs,
      retryCount: Number(result.metadata?.retryCount ?? 0),
      inputTokens: result.ok ? result.usage.inputTokens : null,
      outputTokens: result.ok ? result.usage.outputTokens : null,
      reasoningTokens: result.ok ? (result.usage.reasoningTokens ?? null) : null,
    };
  }));
  const burstStarts = starts.slice(before).map(x => ({ ...x, burstRelativeMs: x.ms - (starts[before]?.ms ?? x.ms) }));
  const spacing = burstStarts.slice(1).map((x, i) => x.ms - burstStarts[i].ms);
  rows.push({
    burstSize,
    elapsedMs: Math.round(performance.now() - burstStart),
    policy: admission.policy,
    providerStarts: burstStarts,
    startSpacingMs: spacing,
    results,
  });
}
const vals = rows.flatMap(r => r.results);
const percentile = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a,b)=>a-b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p*s.length)-1))];
};
const queue = vals.map(x => x.queueWaitMs);
const latency = vals.map(x => x.providerLatencyMs);
const report = {
  schemaVersion: "stronger-sentient-admission-burst/v1",
  sourceSha: "c05ebe9ffed7254bb749cee1c72a965f970def7c",
  sourceTree: "00296d7129fa8ab7f3254943a57df444591ad1ab",
  minStartIntervalMs: MIN_START_INTERVAL_MS,
  providerCalls: calls,
  http429Count: count429,
  atlas429Rate: calls ? count429 / calls : null,
  retryCount: vals.reduce((n,x)=>n+x.retryCount,0),
  queueWaitP50Ms: percentile(queue,.5),
  queueWaitP95Ms: percentile(queue,.95),
  providerLatencyP50Ms: percentile(latency,.5),
  providerLatencyP95Ms: percentile(latency,.95),
  rows,
  productionDeployment: false,
};
fs.writeFileSync("stronger-sentient-admission-burst-v1.json", JSON.stringify(report,null,2)+"\n");
console.log(`MIN_START_INTERVAL_MS=${MIN_START_INTERVAL_MS}`);
console.log(`PROVIDER_CALLS=${calls}`);
console.log(`ATLAS_429_COUNT=${count429}`);
console.log(`ATLAS_429_RATE=${report.atlas429Rate}`);
console.log(`QUEUE_WAIT_P50=${report.queueWaitP50Ms}`);
console.log(`QUEUE_WAIT_P95=${report.queueWaitP95Ms}`);
console.log(`PROVIDER_LATENCY_P50=${report.providerLatencyP50Ms}`);
console.log(`PROVIDER_LATENCY_P95=${report.providerLatencyP95Ms}`);
console.log("PRODUCTION_DEPLOYMENT=false");
