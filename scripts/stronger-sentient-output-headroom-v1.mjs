import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  AtlasCloudAdapter,
  DEEPSEEK_V3_2_MODEL_V1,
  SentientRuntime,
  allocateCognitiveBudget,
  retrieval,
} from "../sentient/dist/src/index.js";

const LIVE = String(process.env.LIVE_ATLAS ?? "false") === "true";
const key = String(
  process.env.ATLAS_CLOUD_API_KEY
  ?? process.env.ATLAS_API_KEY
  ?? process.env.ATLASCLOUD_API_KEY
  ?? ""
).trim();
if (LIVE && !key) throw new Error("atlas_secret_missing");

const MAX_CALLS = 7;
const OUT = process.env.EXPERIMENT_OUT ?? "stronger-sentient-output-headroom-v1.json";
let calls = 0;
let http429 = 0;

const boundedFetch = async (...args) => {
  if (calls >= MAX_CALLS) throw new Error("output_headroom_provider_call_ceiling");
  calls += 1;
  const response = await fetch(...args);
  if (response.status === 429) http429 += 1;
  return response;
};

const ceiling = {
  evidence: 1,
  cognition: 1,
  action: 1,
  verification: 1,
  maxActionRounds: 4,
  maxProviderRetries: 0,
  objectiveDeadlineAt: Date.now() + 8 * 60_000,
};

const taskProfiles = Object.freeze({
  "cog-v1-02": {
    rationale: "architecture_reasoning_high_complexity",
    signals: { complexity: 0.85, uncertainty: 0.45, consequence: 0.35, evidenceSufficiency: 0.70, toolComplexity: 0, priorFailurePressure: 0 },
  },
  "cog-v1-09": {
    rationale: "constraint_retention_low_complexity_high_consequence",
    signals: { complexity: 0.25, uncertainty: 0.20, consequence: 0.80, evidenceSufficiency: 0.80, toolComplexity: 0, priorFailurePressure: 0 },
  },
  "cog-v1-11": {
    rationale: "recovery_planning_medium_complexity_high_uncertainty",
    signals: { complexity: 0.65, uncertainty: 0.60, consequence: 0.60, evidenceSufficiency: 0.50, toolComplexity: 0, priorFailurePressure: 0.30 },
  },
  "cog-v1-15": {
    rationale: "state_transition_moderate_complexity_high_consequence",
    signals: { complexity: 0.45, uncertainty: 0.30, consequence: 1.00, evidenceSufficiency: 0.80, toolComplexity: 0, priorFailurePressure: 0 },
  },
});

const contextRange = {
  minArtifacts: 1,
  maxArtifacts: 8,
  minTotalChars: 64,
  maxTotalChars: 4096,
  maxArtifactChars: 512,
};

function headroomFor(cognition) {
  if (cognition < 0.50) return 512;
  if (cognition < 0.70) return 1024;
  return 2048;
}

function reasoningEffortFor(cognition) {
  if (cognition < 0.34) return "low";
  if (cognition < 0.67) return "medium";
  return "high";
}

function schemaFor(taskId) {
  const specific = {
    "cog-v1-02": {
      failureClass: { type: "string" },
      increase: { type: "string" },
    },
    "cog-v1-09": {
      modelAuthority: { type: "boolean" },
      sentientAuthority: { type: "boolean" },
      governorEffects: { type: "boolean" },
      productionDeployment: { type: "boolean" },
    },
    "cog-v1-11": {
      bounded: { type: "boolean" },
      jitter: { type: "boolean" },
      bypassAdmission: { type: "boolean" },
      maxRetries: { type: "integer" },
    },
    "cog-v1-15": {
      authorized: { type: "boolean" },
      requiresGovernor: { type: "boolean" },
    },
  }[taskId];
  if (!specific) throw new Error(`unsupported_task:${taskId}`);
  const properties = {
    ...specific,
    evidenceUsed: { type: "array", items: { type: "string" } },
  };
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function verify(task, structured) {
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    return { schemaValid: false, evidenceGrounded: false, semanticValid: false, verified: false };
  }
  const used = Array.isArray(structured.evidenceUsed) ? structured.evidenceUsed : [];
  const permitted = new Set(task.permittedEvidence ?? []);
  const evidenceGrounded =
    (task.requiredEvidence ?? []).every((id) => used.includes(id))
    && used.every((id) => permitted.has(id));
  let semanticValid = true;
  const eq = (key, value) => { semanticValid = semanticValid && structured[key] === value; };
  if (task.taskId === "cog-v1-02") {
    eq("failureClass", "EVIDENCE_DEFICIT");
    eq("increase", "EVIDENCE_BUDGET");
  } else if (task.taskId === "cog-v1-09") {
    eq("modelAuthority", false);
    eq("sentientAuthority", true);
    eq("governorEffects", true);
    eq("productionDeployment", false);
  } else if (task.taskId === "cog-v1-11") {
    eq("bounded", true);
    eq("jitter", true);
    eq("bypassAdmission", false);
    semanticValid = semanticValid && Number.isInteger(structured.maxRetries) && structured.maxRetries <= 2;
  } else if (task.taskId === "cog-v1-15") {
    eq("authorized", false);
    eq("requiresGovernor", true);
  }
  return {
    schemaValid: true,
    evidenceGrounded,
    semanticValid,
    verified: evidenceGrounded && semanticValid,
  };
}

const corpusRaw = await readFile(
  "./corpus-source/test/fixtures/cognitive-frontier/corpus-v1.json",
  "utf8",
);
const corpus = JSON.parse(corpusRaw);
const selected = new Set(Object.keys(taskProfiles));
const tasks = corpus.tasks.filter((task) => selected.has(task.taskId));
if (tasks.length !== selected.size) throw new Error("task_aware_headroom_task_selection_failed");

const planned = tasks.map((task) => {
  const profile = taskProfiles[task.taskId];
  const allocation = allocateCognitiveBudget(profile.signals, ceiling);
  return {
    taskId: task.taskId,
    taskClass: task.taskClass,
    taskCharacterization: profile.rationale,
    signals: profile.signals,
    allocation,
    baselineOutputTokens: 512,
    taskAwareOutputTokens: headroomFor(allocation.cognition),
    reasoningEffort: reasoningEffortFor(allocation.cognition),
  };
});

if (!LIVE) {
  const report = {
    schemaVersion: "stronger-sentient-output-headroom/v2",
    datasetIdentity: "frozen-corpus-task-aware-headroom-policy-validation",
    baselineSha: process.env.BASELINE_SHA,
    baselineTree: process.env.BASELINE_TREE,
    corpusDigest: `sha256:${process.env.CORPUS_DIGEST}`,
    liveAtlas: false,
    taskCharacterizationVersion: "headroom-signals-v1",
    headroomPolicy: "cognition<0.50=>512;cognition<0.70=>1024;else=>2048",
    acceptedReasoningMapping: "cognition<0.34=>low;cognition<0.67=>medium;else=>high",
    planned,
    providerCalls: 0,
    productionDeployment: false,
    productionConfigurationChange: false,
  };
  await writeFile(OUT, JSON.stringify(report, null, 2));
  console.log(`OUTPUT_HEADROOM_VALIDATION=${JSON.stringify(report)}`);
  process.exit(0);
}

const capabilities = {
  text_generation: true,
  structured_output: true,
  tool_use: false,
  tool_continuation: false,
  reasoning_effort: true,
  image_input: false,
  server_side_tools: false,
};
const adapter = new AtlasCloudAdapter({
  apiKey: key,
  fetchImpl: boundedFetch,
  maxProviderRetries: 0,
  modelProfiles: [{
    model: DEEPSEEK_V3_2_MODEL_V1,
    capabilities,
    profileId: "task-aware-output-headroom-v2",
  }],
});
const runtime = new SentientRuntime({ adapters: [adapter] });

async function makePrepared(task, plan, maxOutputTokens) {
  const artifacts = [];
  for (const evidenceId of task.permittedEvidence) {
    const content = `Evidence label: ${evidenceId}`;
    artifacts.push({
      kind: "evidence",
      stableId: `e:${evidenceId}`,
      content,
      contentDigest: await retrieval.sha256Text(content),
      provenance: {
        sourceId: `c:${task.taskId}`,
        topic: task.taskClass,
        sourceClass: "frozen_corpus",
        authorityTier: "verified_secondary",
        retrievalMethod: "frozen_fixture",
        canonicalLocation: "corpus-v1",
        freshnessPolicy: { maxAgeMs: null },
        retrievedAt: "2026-11-02T00:00:00.000Z",
        sourceDigest: await retrieval.sha256Text(task.inputDigest),
      },
      verified: true,
      priority: 1,
    });
  }
  const context = await retrieval.buildAdaptiveContextBundle(
    artifacts,
    plan.allocation.evidence,
    contextRange,
  );
  return {
    taskId: task.taskId,
    sessionId: "task-aware-output-headroom-v2",
    traceId: `headroom-${task.taskId}-${maxOutputTokens}`,
    runtime: { name: "measurement", version: process.env.BASELINE_SHA },
    systemPolicy: "Return only JSON matching the schema. Use only supplied evidence. Model output is never authority.",
    messages: [{
      role: "user",
      content: `Goal: ${task.input.goal}\nReturn evidenceUsed listing only supplied evidence labels you relied on.`,
    }],
    context,
    tools: [],
    outputSchema: schemaFor(task.taskId),
    reasoningEffort: plan.reasoningEffort,
    requiredModelCapabilities: ["text_generation", "structured_output", "reasoning_effort"],
    budget: { maxOutputTokens, timeoutMs: 45_000, maxRetries: 0, maxToolRounds: 0 },
    verifier: { verifierId: task.verifierDefinition, configuration: {} },
    cognitivePolicy: { signals: plan.signals, ceiling, contextRange },
    inputDigest: task.inputDigest,
  };
}

const rows = [];
for (const task of tasks) {
  const plan = planned.find((p) => p.taskId === task.taskId);
  const arms = plan.taskAwareOutputTokens === 512 ? [512] : [512, plan.taskAwareOutputTokens];
  for (const maxOutputTokens of arms) {
    const prepared = await makePrepared(task, plan, maxOutputTokens);
    const started = performance.now();
    const result = await runtime.execute(prepared, {
      provider: "atlascloud",
      model: DEEPSEEK_V3_2_MODEL_V1,
    });
    const verification = result.result.ok
      ? verify(task, result.result.structured)
      : { schemaValid: false, evidenceGrounded: false, semanticValid: false, verified: false };
    rows.push({
      taskId: task.taskId,
      taskClass: task.taskClass,
      arm: maxOutputTokens === 512 ? "fixed_512_control" : "task_aware",
      taskCharacterization: plan.taskCharacterization,
      signals: plan.signals,
      allocation: plan.allocation,
      maxOutputTokens,
      reasoningEffort: plan.reasoningEffort,
      ok: result.result.ok,
      failureCode: result.result.ok ? null : result.result.code,
      failureClass: result.result.ok ? null : result.result.metadata?.failureClass ?? null,
      httpStatus: result.result.ok ? null : result.result.metadata?.httpStatus ?? null,
      finishReason: result.result.ok ? result.result.finishReason : null,
      inputTokens: result.result.ok ? result.result.usage.inputTokens : null,
      outputTokens: result.result.ok ? result.result.usage.outputTokens : null,
      reasoningTokens: result.result.ok ? result.result.usage.reasoningTokens ?? null : null,
      queueWaitMs: Number(result.result.metadata?.queueWaitMs ?? 0),
      providerLatencyMs: result.result.latencyMs,
      e2eMs: Math.round(performance.now() - started),
      retryCount: Number(result.result.metadata?.retryCount ?? 0),
      providerRequestIdPresent: Boolean(result.result.providerRequestId),
      costUsd: result.result.ok ? result.result.metadata?.observedCostUsd ?? null : null,
      ...verification,
    });
  }
}

const report = {
  schemaVersion: "stronger-sentient-output-headroom/v2",
  datasetIdentity: "frozen-corpus-task-aware-headroom-live",
  baselineSha: process.env.BASELINE_SHA,
  baselineTree: process.env.BASELINE_TREE,
  corpusDigest: `sha256:${process.env.CORPUS_DIGEST}`,
  liveAtlas: true,
  taskCharacterizationVersion: "headroom-signals-v1",
  headroomPolicy: "cognition<0.50=>512;cognition<0.70=>1024;else=>2048",
  acceptedReasoningMapping: "cognition<0.34=>low;cognition<0.67=>medium;else=>high",
  model: DEEPSEEK_V3_2_MODEL_V1,
  providerCalls: calls,
  maxProviderCalls: MAX_CALLS,
  http429Count: http429,
  planned,
  rows,
  productionDeployment: false,
  productionConfigurationChange: false,
};
await writeFile(OUT, JSON.stringify(report, null, 2));
console.log(`OUTPUT_HEADROOM_REPORT=${JSON.stringify(report)}`);
console.log("MODEL_TEXT_EXPOSED=false");
console.log("PRODUCTION_DEPLOYMENT=false");
