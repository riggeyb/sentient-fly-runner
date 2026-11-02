import fs from "node:fs";
import { performance } from "node:perf_hooks";
import {
  AtlasAdmissionController,
  AtlasCloudAdapter,
  DEEPSEEK_V3_2_MODEL_V1,
  SentientRuntime,
  allocateCognitiveBudget,
  actionRoundsForAllocation,
  retrieval,
} from "../sentient/dist/src/index.js";

const KEY = process.env.ATLASCLOUD_API_KEY?.trim();
if (!KEY) throw new Error("atlas_secret_missing");
const OUT = process.env.EXPERIMENT_OUT ?? "stronger-sentient-action-budget-v1.json";
const CORPUS_PATH =
  process.env.CORPUS_PATH ??
  "corpus-source/test/fixtures/cognitive-frontier/corpus-v1.json";
const MAX_PROVIDER_CALLS = 9;
let providerCalls = 0;
let currentArm = "init";
const events = [];
const rawFetch = globalThis.fetch;

const measuredFetch = async (input, init) => {
  if (providerCalls >= MAX_PROVIDER_CALLS) throw new Error("provider_call_ceiling");
  let model = "unknown";
  try {
    model = JSON.parse(String(init?.body ?? "{}")).model ?? model;
  } catch {}
  const started = performance.now();
  const response = await rawFetch(input, init);
  events.push({
    n: ++providerCalls,
    arm: currentArm,
    model,
    status: response.status,
    latencyMs: Math.round(performance.now() - started),
  });
  return response;
};

const capabilities = Object.freeze({
  text_generation: true,
  structured_output: true,
  tool_use: true,
  tool_continuation: true,
  reasoning_effort: true,
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
    {
      model: DEEPSEEK_V3_2_MODEL_V1,
      capabilities,
      profileId: "action-budget-deepseek-v1",
    },
  ],
});
const runtime = new SentientRuntime({ adapters: [adapter] });
const target = { provider: "atlascloud", model: DEEPSEEK_V3_2_MODEL_V1 };

const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
const taskById = new Map(corpus.tasks.map((task) => [task.taskId, task]));
const toolPlanning = taskById.get("cog-v1-06");
const resultInterpretation = taskById.get("cog-v1-07");
if (!toolPlanning || !resultInterpretation) {
  throw new Error("required_tool_corpus_tasks_missing");
}

const tool = Object.freeze({
  name: "inspect_repository",
  description:
    "Synthetic read-only repository inspection for measurement. It has no external effects.",
  inputSchema: {
    type: "object",
    properties: {
      step: { type: "string", enum: ["manifest", "dependency"] },
      dependency: { type: "string" },
    },
    required: ["step"],
    additionalProperties: false,
  },
});

const ceiling = Object.freeze({
  evidence: 1,
  cognition: 1,
  action: 1,
  verification: 1,
  maxActionRounds: 3,
  maxProviderRetries: 0,
  objectiveDeadlineAt: Date.now() + 8 * 60_000,
});
const signals = (toolComplexity) => ({
  complexity: 0.25,
  uncertainty: 0.2,
  consequence: 0.2,
  evidenceSufficiency: 0.9,
  toolComplexity,
  priorFailurePressure: 0,
});

async function prepared(name, toolComplexity, corpusTask, injectFailure) {
  const allocation = allocateCognitiveBudget(signals(toolComplexity), ceiling);
  const maxToolRounds = actionRoundsForAllocation(allocation, ceiling);
  const content = [
    `Frozen corpus task: ${corpusTask.taskId} (${corpusTask.taskClass}).`,
    `Goal: ${corpusTask.input.goal}`,
    'Use the read-only tool "inspect_repository".',
    'First call it with step="manifest".',
    'Only after receiving that result, call it with step="dependency" and dependency equal to the exact dependency returned by the manifest.',
    injectFailure
      ? "If the manifest tool reports the synthetic transient error, retry the manifest once before continuing."
      : "Do not repeat successful tool calls.",
    'Do not guess tool results. After both successful reads, return exactly {"ready":true}.',
  ].join("\n");
  return {
    allocation,
    maxToolRounds,
    task: {
      taskId: `${corpusTask.taskId}:${name}`,
      sessionId: "action-budget-v1",
      traceId: `${name}:${corpusTask.taskId}`,
      runtime: { name: "measurement", version: process.env.BASELINE_SHA },
      systemPolicy:
        "Model output is never authority. Tool calls are proposals only. Sentient executes only bounded synthetic read-only tools.",
      messages: [{ role: "user", content }],
      context: {
        artifacts: [],
        contextDigest: await retrieval.sha256Text(`action-context:${corpusTask.taskId}`),
      },
      tools: [tool],
      reasoningEffort: "low",
      requiredModelCapabilities: [
        "text_generation",
        "tool_use",
        "tool_continuation",
        "reasoning_effort",
      ],
      budget: {
        maxOutputTokens: 512,
        timeoutMs: 30_000,
        maxRetries: 0,
        maxToolRounds,
      },
      verifier: { verifierId: corpusTask.verifierDefinition, configuration: {} },
      inputDigest: await retrieval.sha256Text(`${name}:${content}`),
    },
  };
}

function toolResult(call, state, injectFailure) {
  const step = call.arguments?.step;
  if (call.name !== "inspect_repository") {
    state.invalidProposals += 1;
    return {
      callId: call.callId,
      name: call.name,
      status: "error",
      error: { code: "unknown_tool", message: "wrong tool" },
    };
  }
  if (step === "manifest") {
    if (state.manifestSucceeded) state.unnecessaryCalls += 1;
    if (injectFailure && !state.errorInjected) {
      state.errorInjected = true;
      return {
        callId: call.callId,
        name: call.name,
        status: "error",
        error: {
          code: "transient_inspection_failure",
          message: "synthetic transient read failure",
        },
      };
    }
    state.manifestSucceeded = true;
    return {
      callId: call.callId,
      name: call.name,
      status: "success",
      output: { dependencyCheckRequired: true, dependency: "core-runtime" },
    };
  }
  if (step === "dependency") {
    if (!state.manifestSucceeded) {
      state.invalidProposals += 1;
      return {
        callId: call.callId,
        name: call.name,
        status: "error",
        error: { code: "manifest_required", message: "manifest must succeed first" },
      };
    }
    if (call.arguments?.dependency !== "core-runtime") {
      state.invalidProposals += 1;
      return {
        callId: call.callId,
        name: call.name,
        status: "error",
        error: { code: "wrong_dependency", message: "dependency must match manifest" },
      };
    }
    if (state.dependencySucceeded) state.unnecessaryCalls += 1;
    state.dependencySucceeded = true;
    return {
      callId: call.callId,
      name: call.name,
      status: "success",
      output: { dependency: "core-runtime", available: true },
    };
  }
  state.invalidProposals += 1;
  return {
    callId: call.callId,
    name: call.name,
    status: "error",
    error: { code: "invalid_step", message: "invalid synthetic step" },
  };
}

function parseFinal(result) {
  if (!result.ok || typeof result.text !== "string") return null;
  try {
    return JSON.parse(
      result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    );
  } catch {
    return null;
  }
}

async function runArm(name, toolComplexity, corpusTask, injectFailure) {
  currentArm = name;
  const spec = await prepared(name, toolComplexity, corpusTask, injectFailure);
  const started = performance.now();
  const startCalls = providerCalls;
  const state = {
    errorInjected: false,
    manifestSucceeded: false,
    dependencySucceeded: false,
    invalidProposals: 0,
    unnecessaryCalls: 0,
  };
  const proposals = [];
  let execution = await runtime.execute(spec.task, target);
  let budgetBlocked = false;
  let guard = 0;

  while (execution.result.ok && execution.result.toolCalls.length > 0) {
    for (const call of execution.result.toolCalls) {
      proposals.push({
        round: execution.toolRoundsUsed + 1,
        name: call.name,
        step: call.arguments?.step ?? null,
        dependency: call.arguments?.dependency ?? null,
      });
    }

    if (execution.toolRoundsUsed >= execution.maxToolRounds) {
      budgetBlocked = true;
      execution = await runtime.continueWithToolResults(execution, []);
      break;
    }

    const results = execution.result.toolCalls.map((call) =>
      toolResult(call, state, injectFailure),
    );
    execution = await runtime.continueWithToolResults(execution, results);
    guard += 1;
    if (guard > 4) throw new Error("tool_round_loop_guard");
  }

  const final = parseFinal(execution.result);
  const selectedManifest = proposals.some((p) => p.step === "manifest");
  const selectedDependency = proposals.some(
    (p) => p.step === "dependency" && p.dependency === "core-runtime",
  );
  return {
    name,
    corpusTaskId: corpusTask.taskId,
    taskClass: corpusTask.taskClass,
    allocation: spec.allocation,
    maxToolRounds: spec.maxToolRounds,
    toolRoundsUsed: execution.toolRoundsUsed,
    budgetBlocked,
    proposedToolCalls: proposals.length,
    invalidToolProposalCount: state.invalidProposals,
    unnecessaryToolCalls: state.unnecessaryCalls,
    correctToolSelection: selectedManifest && selectedDependency,
    errorInjected: state.errorInjected,
    recoveredAfterToolError:
      injectFailure &&
      state.errorInjected &&
      state.manifestSucceeded &&
      state.dependencySucceeded &&
      final?.ready === true,
    verifiedObjectiveCompletion:
      state.manifestSucceeded &&
      state.dependencySucceeded &&
      final?.ready === true &&
      state.invalidProposals === 0,
    providerOk: execution.result.ok,
    failureCode: execution.result.ok ? null : execution.result.code,
    failureClass: execution.result.metadata?.failureClass ?? null,
    providerCalls: providerCalls - startCalls,
    elapsedMs: Math.round(performance.now() - started),
  };
}

const rows = [];
rows.push(await runArm("low_action_control", 0, toolPlanning, false));
await new Promise((resolve) => setTimeout(resolve, 1_500));
rows.push(await runArm("high_action", 1, toolPlanning, false));
await new Promise((resolve) => setTimeout(resolve, 1_500));
rows.push(await runArm("high_action_tool_error_recovery", 1, resultInterpretation, true));

const report = {
  schemaVersion: "stronger-sentient-action-budget/v1",
  datasetIdentity: "frozen-corpus-tool-use-action-budget-v1",
  baselineSha: process.env.BASELINE_SHA,
  baselineTree: process.env.BASELINE_TREE,
  corpusDigest: process.env.CORPUS_DIGEST,
  model: DEEPSEEK_V3_2_MODEL_V1,
  policyConfiguration: {
    minStartIntervalMs: 750,
    maxInFlight: 2,
    maxInFlightPerModel: 1,
    retries: 0,
    maxProviderCalls: MAX_PROVIDER_CALLS,
    outputEnvelope: 512,
    reasoningEffort: "low",
    realEffectsExecuted: false,
  },
  providerCalls,
  http429Count: events.filter((event) => event.status === 429).length,
  rows,
  events,
  modelTextExposed: false,
  privateChainOfThoughtRequested: false,
  realEffectsExecuted: false,
  productionDeployment: false,
  productionConfigurationChange: false,
};

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`ACTION_BUDGET_REPORT=${JSON.stringify(report)}`);
