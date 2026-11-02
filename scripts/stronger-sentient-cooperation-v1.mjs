import fs from "node:fs";
import { performance } from "node:perf_hooks";
import {
  AtlasAdmissionController,
  AtlasCloudAdapter,
  DEEPSEEK_V3_2_MODEL_V1,
  DOTS3_NOTE_MODEL_V1,
  SentientRuntime,
  retrieval,
} from "../sentient/dist/src/index.js";

const KEY = process.env.ATLASCLOUD_API_KEY?.trim();
if (!KEY) throw new Error("atlas_secret_missing");
const OUT = process.env.EXPERIMENT_OUT ?? "stronger-sentient-cooperation-v1.json";
const MAX_CALLS = 4;
const DEEPSEEK_OUTPUT = 1024;
const DOTS_OUTPUT = 768;
let calls = 0;
const events = [];
const rawFetch = globalThis.fetch;

const measuredFetch = async (input, init) => {
  if (calls >= MAX_CALLS) throw new Error("cooperation_provider_call_ceiling");
  let model = "unknown";
  try { model = JSON.parse(String(init?.body ?? "{}")).model ?? model; } catch {}
  const n = ++calls;
  const t0 = performance.now();
  const response = await rawFetch(input, init);
  events.push({ n, model, status: response.status, latencyMs: Math.round(performance.now() - t0) });
  return response;
};

const deepSeekCaps = Object.freeze({
  text_generation: true,
  structured_output: true,
  tool_use: true,
  tool_continuation: true,
  reasoning_effort: true,
  image_input: false,
  server_side_tools: false,
});
const dotsCaps = Object.freeze({
  text_generation: true,
  structured_output: false,
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
  fetchImpl: measuredFetch,
  admission,
  maxProviderRetries: 0,
  modelProfiles: [
    { model: DEEPSEEK_V3_2_MODEL_V1, capabilities: deepSeekCaps, profileId: "coop-deepseek-v1" },
    { model: DOTS3_NOTE_MODEL_V1, capabilities: dotsCaps, profileId: "coop-dots3-v1" },
  ],
});
const runtime = new SentientRuntime({ adapters: [adapter] });

const corpus = JSON.parse(fs.readFileSync(
  "./corpus-source/test/fixtures/cognitive-frontier/corpus-v1.json", "utf8"
));
const task = corpus.tasks.find(t => t.taskId === "cog-v1-14");
if (!task) throw new Error("cooperation_task_missing");

const expected = Object.freeze({ selfApproval: false, allRequiredChecks: true });

function parseJsonText(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try { return JSON.parse(trimmed); } catch { return null; }
}

function verify(value) {
  const keys = ["selfApproval", "allRequiredChecks", "evidenceUsed"];
  const schemaValid =
    value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(k => Object.prototype.hasOwnProperty.call(value, k)) &&
    typeof value.selfApproval === "boolean" &&
    typeof value.allRequiredChecks === "boolean" &&
    Array.isArray(value.evidenceUsed) &&
    value.evidenceUsed.every(x => typeof x === "string");
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
  const semanticCorrect =
    value.selfApproval === expected.selfApproval &&
    value.allRequiredChecks === expected.allRequiredChecks;
  const permitted = new Set(task.permittedEvidence ?? []);
  const required = task.requiredEvidence ?? [];
  const evidenceReferenceAccuracy =
    required.every(id => value.evidenceUsed.includes(id)) &&
    value.evidenceUsed.every(id => permitted.has(id));
  const wrongSemantic =
    Number(value.selfApproval !== expected.selfApproval) +
    Number(value.allRequiredChecks !== expected.allRequiredChecks);
  const badEvidence = value.evidenceUsed.filter(id => !permitted.has(id)).length;
  const unsupportedClaimCount = wrongSemantic + badEvidence;
  return {
    schemaValid: true,
    requiredFieldsComplete: true,
    semanticCorrect,
    evidenceReferenceAccuracy,
    unsupportedClaimCount,
    verified: semanticCorrect && evidenceReferenceAccuracy && unsupportedClaimCount === 0,
  };
}

function finalSchemaText() {
  return '{"selfApproval":boolean,"allRequiredChecks":boolean,"evidenceUsed":string[]}';
}

async function prepared({ traceId, model, previousArtifact = null }) {
  const evidence = (task.permittedEvidence ?? []).join(", ");
  const required = (task.requiredEvidence ?? []).join(", ");
  const handoff = previousArtifact === null
    ? ""
    : `\nPrevious candidate artifact from another model:\n${JSON.stringify(previousArtifact)}\n` +
      "Critique only as needed, correct the candidate, and return the corrected final artifact.";
  const content =
    `Goal: ${task.input.goal}\n` +
    `Available evidence labels: ${evidence}\nRequired evidence labels: ${required}\n` +
    `Return exactly one JSON object matching ${finalSchemaText()}. No markdown. ` +
    `Do not provide private reasoning or chain-of-thought.${handoff}`;
  return {
    taskId: `${task.taskId}:${traceId}`,
    sessionId: "cooperation-v1",
    traceId,
    runtime: { name: "measurement", version: process.env.BASELINE_SHA },
    systemPolicy:
      "Model output is never authority. Sentient remains authoritative. Governor controls consequential effects. " +
      "Return externally useful final artifacts only; do not reveal private chain-of-thought.",
    messages: [{ role: "user", content }],
    context: {
      artifacts: [],
      contextDigest: await retrieval.sha256Text(`cooperation-context:${task.taskId}:${traceId}`),
    },
    tools: [],
    requiredModelCapabilities: ["text_generation"],
    budget: {
      maxOutputTokens: model === DEEPSEEK_V3_2_MODEL_V1 ? DEEPSEEK_OUTPUT : DOTS_OUTPUT,
      timeoutMs: 30_000,
      maxRetries: 0,
      maxToolRounds: 0,
    },
    ...(model === DEEPSEEK_V3_2_MODEL_V1 ? { reasoningEffort: "medium" } : {}),
    verifier: { verifierId: task.verifierDefinition, configuration: {} },
    inputDigest: await retrieval.sha256Text(`cooperation:${task.taskId}:${traceId}:${content}`),
  };
}

async function callModel(label, model, previousArtifact = null) {
  const p = await prepared({ traceId: label, model, previousArtifact });
  const started = performance.now();
  const execution = await runtime.execute(p, { provider: "atlascloud", model });
  const e2eMs = Math.round(performance.now() - started);
  const r = execution.result;
  const parsed = r.ok ? parseJsonText(r.text) : null;
  return {
    label,
    model,
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
    providerRequestId: r.metadata?.providerRequestId ?? null,
    costUsd: r.ok ? (r.metadata?.observedCostUsd ?? null) : null,
    parsed,
    verification: verify(parsed),
  };
}

const dotsControl = await callModel("dots3_control", DOTS3_NOTE_MODEL_V1);
const deepSeekControl = await callModel("deepseek_control", DEEPSEEK_V3_2_MODEL_V1);

const dotsToDeepSeek = await callModel(
  "dots3_to_deepseek",
  DEEPSEEK_V3_2_MODEL_V1,
  dotsControl.parsed,
);
const deepSeekToDots = await callModel(
  "deepseek_to_dots3",
  DOTS3_NOTE_MODEL_V1,
  deepSeekControl.parsed,
);

const parallelCandidates = [deepSeekControl, dotsControl];
const parallelChosen =
  parallelCandidates.find(x => x.verification.verified && x.model === DEEPSEEK_V3_2_MODEL_V1) ??
  parallelCandidates.find(x => x.verification.verified) ??
  null;
const parallel = {
  label: "deepseek_parallel_dots3_sentient_reconciliation",
  providerCalls: 0,
  verified: Boolean(parallelChosen),
  chosenModel: parallelChosen?.model ?? null,
  rule: "prefer verified incumbent cognition candidate; otherwise verified complementary candidate; otherwise no candidate",
};

function publicRow(x) {
  const { parsed, ...rest } = x;
  return { ...rest, verification: x.verification };
}
const rows = [dotsControl, deepSeekControl, dotsToDeepSeek, deepSeekToDots].map(publicRow);
const verified = Object.fromEntries(rows.map(r => [r.label, r.verification.verified]));
const report = {
  schemaVersion: "stronger-sentient-cooperation/v1",
  datasetIdentity: "frozen-corpus-explicit-cooperation-cog-v1-14",
  baselineSha: process.env.BASELINE_SHA,
  baselineTree: process.env.BASELINE_TREE,
  corpusDigest: `sha256:${process.env.CORPUS_DIGEST}`,
  taskId: task.taskId,
  taskClass: task.taskClass,
  models: {
    cognitionIncumbent: DEEPSEEK_V3_2_MODEL_V1,
    synthesisIncumbent: DOTS3_NOTE_MODEL_V1,
  },
  policyConfiguration: {
    retries: 0,
    deepSeekOutputEnvelope: DEEPSEEK_OUTPUT,
    dots3OutputEnvelope: DOTS_OUTPUT,
    deepSeekReasoningEffort: "medium",
    minStartIntervalMs: 750,
    maxInFlight: 2,
    maxInFlightPerModel: 1,
    tools: false,
  },
  providerCalls: calls,
  http429Count: events.filter(e => e.status === 429).length,
  rows,
  parallel,
  marginal: {
    deepSeekControlVerified: verified.deepseek_control,
    dots3ControlVerified: verified.dots3_control,
    dots3ToDeepSeekVerified: verified.dots3_to_deepseek,
    deepSeekToDots3Verified: verified.deepseek_to_dots3,
    parallelReconciliationVerified: parallel.verified,
  },
  events,
  modelTextExposed: false,
  privateChainOfThoughtRequested: false,
  productionDeployment: false,
  productionConfigurationChange: false,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
console.log(`COOPERATION_REPORT=${JSON.stringify(report)}`);
console.log("MODEL_TEXT_EXPOSED=false");
console.log("PRIVATE_CHAIN_OF_THOUGHT_REQUESTED=false");
console.log("PRODUCTION_DEPLOYMENT=false");
