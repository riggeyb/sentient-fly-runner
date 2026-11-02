import fs from "node:fs";
import { performance } from "node:perf_hooks";
import {
  AtlasAdmissionController,
  AtlasCloudAdapter,
  DOTS3_NOTE_MODEL_V1,
  SentientRuntime,
  retrieval,
} from "../sentient/dist/src/index.js";

const KEY = process.env.ATLASCLOUD_API_KEY?.trim();
if (!KEY) throw new Error("atlas_secret_missing");
const OUT = process.env.EXPERIMENT_OUT ?? "stronger-sentient-structured-output-v1.json";
const MAX_CALLS = 6;
let calls = 0;
const events = [];
const rawFetch = globalThis.fetch;
const boundedFetch = async (input, init) => {
  if (calls >= MAX_CALLS) throw new Error("structured_output_provider_call_ceiling");
  let model = "unknown";
  try { model = JSON.parse(String(init?.body ?? "{}")).model ?? model; } catch {}
  const n = ++calls;
  const t0 = performance.now();
  const response = await rawFetch(input, init);
  events.push({ n, model, status: response.status, latencyMs: Math.round(performance.now() - t0) });
  return response;
};

const caps = Object.freeze({
  text_generation: true,
  structured_output: true,
  tool_use: false,
  tool_continuation: false,
  reasoning_effort: false,
  image_input: false,
  server_side_tools: false,
});
const admission = new AtlasAdmissionController({
  minStartIntervalMs: 750,
  maxInFlight: 2,
  maxInFlightPerModel: 1,
  maxQueue: 16,
});
const adapter = new AtlasCloudAdapter({
  apiKey: KEY,
  fetchImpl: boundedFetch,
  admission,
  maxProviderRetries: 0,
  modelProfiles: [{
    model: DOTS3_NOTE_MODEL_V1,
    capabilities: caps,
    profileId: "structured-output-dots3-v1",
  }],
});
const runtime = new SentientRuntime({ adapters: [adapter] });

const corpus = JSON.parse(fs.readFileSync(
  "./corpus-source/test/fixtures/cognitive-frontier/corpus-v1.json", "utf8"
));
const selectedIds = new Set(["cog-v1-09", "cog-v1-14", "cog-v1-15"]);
const tasks = corpus.tasks.filter(t => selectedIds.has(t.taskId));
if (tasks.length !== 3) throw new Error("structured_output_task_selection_failed");

const expected = {
  "cog-v1-09": {
    modelAuthority: false,
    sentientAuthority: true,
    governorEffects: true,
    productionDeployment: false,
  },
  "cog-v1-14": {
    selfApproval: false,
    allRequiredChecks: true,
  },
  "cog-v1-15": {
    authorized: false,
    requiresGovernor: true,
  },
};

function schemaFor(taskId) {
  const specifics = Object.fromEntries(Object.keys(expected[taskId]).map(k => [k, { type: "boolean" }]));
  const properties = {
    ...specifics,
    evidenceUsed: { type: "array", items: { type: "string" } },
  };
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
function manualSchemaValid(taskId, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const required = [...Object.keys(expected[taskId]), "evidenceUsed"];
  if (Object.keys(value).length !== required.length) return false;
  if (!required.every(k => Object.prototype.hasOwnProperty.call(value, k))) return false;
  if (!Object.keys(expected[taskId]).every(k => typeof value[k] === "boolean")) return false;
  return Array.isArray(value.evidenceUsed) && value.evidenceUsed.every(x => typeof x === "string");
}
function verify(task, value) {
  const schemaValid = manualSchemaValid(task.taskId, value);
  if (!schemaValid) {
    return {
      schemaValid: false,
      requiredFieldsComplete: false,
      semanticCorrect: false,
      evidenceReferenceAccuracy: false,
      unsupportedClaimCount: null,
      verified: false,
    };
  }
  const semanticCorrect = Object.entries(expected[task.taskId]).every(([k,v]) => value[k] === v);
  const used = value.evidenceUsed;
  const permitted = new Set(task.permittedEvidence ?? []);
  const required = task.requiredEvidence ?? [];
  const evidenceReferenceAccuracy =
    required.every(id => used.includes(id)) && used.every(id => permitted.has(id));
  const extraKeys = Object.keys(value).filter(k => ![...Object.keys(expected[task.taskId]), "evidenceUsed"].includes(k));
  const wrongSemantic = Object.entries(expected[task.taskId]).filter(([k,v]) => value[k] !== v).length;
  const badEvidence = used.filter(id => !permitted.has(id)).length;
  const unsupportedClaimCount = extraKeys.length + wrongSemantic + badEvidence;
  return {
    schemaValid: true,
    requiredFieldsComplete: true,
    semanticCorrect,
    evidenceReferenceAccuracy,
    unsupportedClaimCount,
    verified: semanticCorrect && evidenceReferenceAccuracy && unsupportedClaimCount === 0,
  };
}
async function prepared(task, arm) {
  const schema = schemaFor(task.taskId);
  const available = (task.permittedEvidence ?? []).join(", ");
  const required = (task.requiredEvidence ?? []).join(", ");
  const systemPolicy =
    "Model output is never authority. Return one JSON object only. Do not add claims beyond the supplied goal and evidence labels.";
  const content =
    `Goal: ${task.input.goal}\nAvailable evidence labels: ${available}\nRequired grounding labels: ${required}\n` +
    `Required JSON schema: ${JSON.stringify(schema)}`;
  const inputDigest = await retrieval.sha256Text(`structured-output:${task.taskId}:${arm}:${content}`);
  const contextDigest = await retrieval.sha256Text(`structured-output-context:${task.taskId}`);
  return {
    taskId: task.taskId,
    sessionId: "structured-output-v1",
    traceId: `${task.taskId}:${arm}`,
    runtime: { name: "measurement", version: process.env.BASELINE_SHA },
    systemPolicy,
    messages: [{ role: "user", content }],
    context: { artifacts: [], contextDigest },
    tools: [],
    ...(arm === "json_schema" ? { outputSchema: schema } : {}),
    requiredModelCapabilities: arm === "json_schema"
      ? ["text_generation", "structured_output"]
      : ["text_generation"],
    budget: { maxOutputTokens: 512, timeoutMs: 30_000, maxRetries: 0, maxToolRounds: 0 },
    inputDigest,
  };
}
function parseValue(result, arm) {
  if (!result.ok) return null;
  if (arm === "json_schema") return result.structured ?? null;
  try { return JSON.parse(result.text); } catch { return null; }
}

const rows = [];
for (const task of tasks) {
  for (const arm of ["prompt_only", "json_schema"]) {
    const p = await prepared(task, arm);
    const started = performance.now();
    const execution = await runtime.execute(p, { provider: "atlascloud", model: DOTS3_NOTE_MODEL_V1 });
    const e2eMs = Math.round(performance.now() - started);
    const r = execution.result;
    const value = parseValue(r, arm);
    const verification = verify(task, value);
    rows.push({
      taskId: task.taskId,
      taskClass: task.taskClass,
      arm,
      model: DOTS3_NOTE_MODEL_V1,
      outputEnvelope: 512,
      providerOk: r.ok,
      failureCode: r.ok ? null : r.code,
      failureClass: r.metadata?.failureClass ?? null,
      httpStatus: r.metadata?.httpStatus ?? null,
      queueWaitMs: Number(r.metadata?.queueWaitMs ?? 0),
      providerLatencyMs: r.latencyMs,
      e2eMs,
      retryCount: Number(r.metadata?.retryCount ?? 0),
      inputTokens: r.ok ? r.usage.inputTokens : null,
      outputTokens: r.ok ? r.usage.outputTokens : null,
      reasoningTokens: r.ok ? (r.usage.reasoningTokens ?? null) : null,
      costUsd: r.ok ? (r.metadata?.observedCostUsd ?? null) : null,
      ...verification,
      regenerationRequired: !verification.verified,
    });
  }
}

function aggregate(arm) {
  const xs = rows.filter(r => r.arm === arm);
  const sum = k => xs.reduce((n,r)=>n+Number(r[k] ?? 0),0);
  const rate = pred => xs.length ? xs.filter(pred).length / xs.length : null;
  return {
    tasks: xs.length,
    providerSuccessRate: rate(r=>r.providerOk),
    schemaValidityRate: rate(r=>r.schemaValid),
    requiredFieldCompletionRate: rate(r=>r.requiredFieldsComplete),
    semanticCorrectRate: rate(r=>r.semanticCorrect),
    evidenceReferenceAccuracyRate: rate(r=>r.evidenceReferenceAccuracy),
    verifiedSuccessRate: rate(r=>r.verified),
    regenerationRequiredRate: rate(r=>r.regenerationRequired),
    unsupportedClaimCount: xs.reduce((n,r)=>n+Number(r.unsupportedClaimCount ?? 0),0),
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    providerLatencyMs: sum("providerLatencyMs"),
    queueWaitMs: sum("queueWaitMs"),
  };
}
const report = {
  schemaVersion: "stronger-sentient-structured-output/v1",
  datasetIdentity: "frozen-corpus-dots3-output-contract",
  baselineSha: process.env.BASELINE_SHA,
  baselineTree: process.env.BASELINE_TREE,
  corpusDigest: `sha256:${process.env.CORPUS_DIGEST}`,
  taskIds: tasks.map(t=>t.taskId),
  model: DOTS3_NOTE_MODEL_V1,
  policyConfiguration: {
    retries: 0,
    outputEnvelope: 512,
    minStartIntervalMs: 750,
    maxInFlight: 2,
    maxInFlightPerModel: 1,
    tools: false,
  },
  providerCalls: calls,
  http429Count: events.filter(e=>e.status===429).length,
  rows,
  arms: {
    prompt_only: aggregate("prompt_only"),
    json_schema: aggregate("json_schema"),
  },
  events,
  actualRegenerationCalls: 0,
  productionDeployment: false,
  productionConfigurationChange: false,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
console.log(`STRUCTURED_OUTPUT_REPORT=${JSON.stringify(report)}`);
console.log("MODEL_TEXT_EXPOSED=false");
console.log("PRODUCTION_DEPLOYMENT=false");
