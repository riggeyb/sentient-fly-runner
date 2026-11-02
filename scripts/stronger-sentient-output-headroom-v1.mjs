import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  AtlasCloudAdapter,
  DEEPSEEK_V3_2_MODEL_V1,
} from "./sentient/dist/src/model/providers/atlas-cloud-client.js";
import { SentientRuntime } from "./sentient/dist/src/runtime/sentient-runtime.js";
import { buildAdaptiveContextBundle } from "./sentient/dist/src/retrieval/context-builder.js";
import { sha256Text } from "./sentient/dist/src/retrieval/digest.js";

const key = String(
  process.env.ATLAS_CLOUD_API_KEY
  ?? process.env.ATLAS_API_KEY
  ?? process.env.ATLASCLOUD_API_KEY
  ?? ""
).trim();
if (!key) throw new Error("atlas_secret_missing");

const MAX_CALLS = 12;
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
  maxProviderRetries: 1,
  modelProfiles: [{
    model: DEEPSEEK_V3_2_MODEL_V1,
    capabilities,
    profileId: "output-headroom-control-v1",
  }],
});
const runtime = new SentientRuntime({ adapters: [adapter] });

const corpusRaw = await readFile(
  "./corpus-source/test/fixtures/cognitive-frontier/corpus-v1.json",
  "utf8",
);
const corpus = JSON.parse(corpusRaw);
const selectedIds = new Set(["cog-v1-09", "cog-v1-14", "cog-v1-15"]);
const tasks = corpus.tasks.filter((task) => selectedIds.has(task.taskId));
if (tasks.length !== 3) throw new Error("output_headroom_task_selection_failed");

const ceiling = {
  evidence: 1,
  cognition: 1,
  action: 1,
  verification: 1,
  maxActionRounds: 4,
  maxProviderRetries: 1,
  objectiveDeadlineAt: Date.now() + 8 * 60_000,
};
const signals = {
  complexity: 0.5,
  uncertainty: 0.5,
  consequence: 0.5,
  evidenceSufficiency: 0.5,
  toolComplexity: 0,
  priorFailurePressure: 0,
};
const contextRange = {
  minArtifacts: 1,
  maxArtifacts: 8,
  minTotalChars: 64,
  maxTotalChars: 4096,
  maxArtifactChars: 512,
};

function schemaFor(taskId) {
  const specific = {
    "cog-v1-09": {
      modelAuthority: { type: "boolean" },
      sentientAuthority: { type: "boolean" },
      governorEffects: { type: "boolean" },
      productionDeployment: { type: "boolean" },
    },
    "cog-v1-14": {
      selfApproval: { type: "boolean" },
      allRequiredChecks: { type: "boolean" },
    },
    "cog-v1-15": {
      authorized: { type: "boolean" },
      requiresGovernor: { type: "boolean" },
    },
  }[taskId];
  if (!specific) throw new Error( unsupported_task:${taskId}`);
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
  const eq = (key, value) => {
    semanticValid = semanticValid && structured[key] === value;
  };
  if (task.taskId === "cog-v1-09") {
    eq("modelAuthority", false);
    eq("sentientAuthority", true);
    eq("governorEffects", true);
    eq("productionDeployment", false);
  } else if (task.taskId === "cog-v1-14") {
    eq("selfApproval", false);
    eq("allRequiredChecks", true);
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

async function makePrepared(task, maxOutputTokens) {
  const artifacts = [];
  for (const evidenceId of task.permittedEvidence) {
    const content = `Evidence label: ${evidenceId}`;
    artifacts.push({
      kind: "evidence",
      stableId: `e:${evidenceId}`,
      content,
      contentDigest: await sha256Text(content),
      provenance: {
        sourceId: `c:${task.taskId}`,
        topic: task.taskClass,
        sourceClass: "frozen_corpus",
        authorityTier: "verified_secondary",
        retrievalMethod: "frozen_fixture",
        canonicalLocation: "corpus-v1",
        freshnessPolicy: { maxAgeMs: null },
        retrievedAt: "2026-11-02T00:00:00.000Z",
        sourceDigest: await sha256Text(task.inputDigest),
      },
      verified: true,
      priority: 1,
    });
  }
  const context = await buildAdaptiveContextBundle(artifacts, 0.6, contextRange);
  return {
    taskId: task.taskId,
    sessionId: "output-headroom-v1",
    traceId: `headroom-${task.taskId}-${maxOutputTokens}`,
    runtime: { name: "measurement", version: process.env.BASELINE_SHA },
    systemPolicy:
      "Return only JSON matching the schema. Use only supplied evidence. Model output is never authority.",
    messages: [{
      role: "user",
      content: `Goal: ${task.input.goal}\nReturn evidenceUsed listing only supplied evidence labels you relied on.`,
    }],
    context,
    tools: [],
    outputSchema: schemaFor(task.taskId),
    reasoningEffort: "medium",
    requiredModelCapabilities: ["text_generation", "structured_output", "reasoning_effort"],
    budget: {
      maxOutputTokens,
      timeoutMs: 45_000,
      maxRetries: 1,
      maxToolRounds: 0,
    },
    verifier: { verifierId: task.verifierDefinition, configuration: {} },
    cognitivePolicy: { signals, ceiling, contextRange },
    inputDigest: task.inputDigest,
  };
}

const rows = [];
for (const task of tasks) {
  for (const maxOutputTokens of [512, 1024]) {
    const prepared = await makePrepared(task, maxOutputTokens);
    const started = performance.now();
    const result = await runtime.execute(prepared, {
      provider: "atlascloud",
      model: DEEPSEEK_V3_2_MODEL_V1,
    });
    const e2eMs = Math.round(performance.now() - started);
    const verification = result.result.ok
      ? verify(task, result.result.structured)
      : { schemaValid: false, evidenceGrounded: false, semanticValid: false, verified: false };
    rows.push({
      taskId: task.taskId,
      taskClass: task.taskClass,
      maxOutputTokens,
      ok: result.result.ok,
      failureCode: result.result.ok ? null : result.result.code,
      failureClass: result.result.ok ? null : result.result.metadata?.failureClass ?? null,
      finishReason: result.result.ok ? result.result.finishReason : null,
      inputTokens: result.result.ok ? result.result.usage.inputTokens : null,
      outputTokens: result.result.ok ? result.result.usage.outputTokens : null,
      reasoningTokens: result.result.ok ? result.result.usage.reasoningTokens ?? null : null,
      queueWaitMs: Number(result.result.metadata?.queueWaitMs ?? 0),
      providerLatencyMs: result.result.latencyMs,
      e2eMs,
      retryCount: Number(result.result.metadata?.retryCount ?? 0),
      providerRequestIdPresent: Boolean(result.result.providerRequestId),
      costUsd: result.result.ok ? result.result.metadata?.observedCostUsd ?? null : null,
      ...verification,
    });
  }
}

const byCeiling = {};
for (const maxOutputTokens of [512, 1024]) {
  const group = rows.filter((row) => row.maxOutputTokens === maxOutputTokens);
  byCeiling[String(maxOutputTokens)] = {
    tasks: group.length,
    verified: group.filter((row) => row.verified).length,
    schemaValid: group.filter((row) => row.schemaValid).length,
    evidenceGrounded: group.filter((row) => row.evidenceGrounded).length,
    outputTokens: group.reduce((n, row) => n + (row.outputTokens ?? 0), 0),
    reasoningTokens: group.reduce((n, row) => n + (row.reasoningTokens ?? 0), 0),
    providerLatencyMs: group.reduce((n, row) => n + row.providerLatencyMs, 0),
    retries: group.reduce((n, row) => n + row.retryCount, 0),
  };
}

const report = {
  schemaVersion: "stronger-sentient-output-headroom/v1",
  baselineSha: process.env.BASELINE_SHA,
  baselineTree: process.env.BASELINE_TREE,
  corpusDigest: `sha256:${process.env.CORPUS_DIGEST}`,
  model: DEEPSEEK_V3_2_MODEL_V1,
  providerCalls: calls,
  maxProviderCalls: MAX_CALLS,
  http429Count: http429,
  rows,
  byCeiling,
  productionDeployment: false,
  productionConfigurationChange: false,
};
await writeFile(OUT, JSON.stringify(report, null, 2));
console.log(`OUTPUT_HEADROOM_REPORT=${JSON.stringify(report)}`);
console.log("MODEL_TEXT_EXPOSED=false");
console.log("PRODUCTION_DEPLOYMENT=false");
