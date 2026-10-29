from pathlib import Path
ROOT = Path("sentient")
def read(rel):
    return (ROOT / rel).read_text()
def write(rel, text):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)
def replace_once(rel, old, new):
    p = ROOT / rel
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{rel}: expected 1 occurrence, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))
write("test/dynamic-hard-stops-v1.test.ts", r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createModelInvocationEnvelopeV1,
  runBoundedModelInvocationV1,
} from "../src/model/model-invocation-envelope.js";
import { effectiveSpawnBudgetsV1 } from "../src/spawn/policy-budgets.js";
import type {
  SpawnBudgetsV1,
  SpawnEffectiveGrantV1,
  SpawnSentientRequestV1,
} from "../src/spawn/execution-contracts.js";
import type { SpawnPolicyV1 } from "../src/spawn/policy-types.js";

function budgets(overrides: Partial<SpawnBudgetsV1> = {}): SpawnBudgetsV1 {
  return {
    maxInputTokens: 10_000, maxOutputTokens: 2_000, maxTotalTokens: 12_000,
    maxCostMicros: 100_000, currency: "USD", maxRuntimeMs: 60_000,
    maxToolRounds: 2, maxToolActions: 4, maxChildExecutions: 4, maxRecursionDepth: 2,
    ...overrides,
  };
}

test("model invocation child cannot exceed parent time token or cost ceilings", () => {
  const parent = createModelInvocationEnvelopeV1({
    objectiveId: "o", executionId: "root", role: "root", absoluteDeadlineMs: 20_000,
    maxWallTimeMs: 15_000, maxInputTokens: 4_000, maxOutputTokens: 500, maxCostMicros: 50_000,
    nowMs: 1_000,
  });
  const child = createModelInvocationEnvelopeV1({
    objectiveId: "o", executionId: "child", parentExecutionId: "root", role: "critic",
    absoluteDeadlineMs: 99_000, maxWallTimeMs: 99_000, maxInputTokens: 99_000,
    maxOutputTokens: 99_000, maxCostMicros: 99_000, parent, nowMs: 2_000,
  });
  assert.equal(child.absoluteDeadlineMs, parent.absoluteDeadlineMs);
  assert.ok(child.maxWallTimeMs <= parent.maxWallTimeMs);
  assert.equal(child.maxInputTokens, parent.maxInputTokens);
  assert.equal(child.maxOutputTokens, parent.maxOutputTokens);
  assert.equal(child.maxCostMicros, parent.maxCostMicros);
});

test("hard model stop returns before provider ignoring cancellation and late result is dead", async () => {
  const started = Date.now();
  const envelope = createModelInvocationEnvelopeV1({
    objectiveId: "o", executionId: "e", role: "root", absoluteDeadlineMs: started + 60,
    maxWallTimeMs: 30, maxInputTokens: 100, maxOutputTokens: 20, maxCostMicros: 100,
  });
  let lateResolved = false;
  const result = await runBoundedModelInvocationV1(envelope, async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    lateResolved = true;
    return "late";
  });
  assert.equal(result.status, "aborted");
  assert.ok(Date.now() - started < 90);
  await new Promise<void>((resolve) => setTimeout(resolve, 110));
  assert.equal(lateResolved, true);
  assert.equal(result.status, "aborted");
});

test("existing Spawn budget min hierarchy prevents child expansion", () => {
  const policy: SpawnPolicyV1 = {
    schemaVersion: "spawn-policy/v1", policyId: "test", maxChildrenPerExecution: 4,
    maxConcurrentChildrenPerExecution: 2, maxDepth: 2, maxTotalExecutionsPerTask: 5,
    budgetCeilings: budgets(), allowedCapabilities: ["objective.cognition"], tools: [],
    scopes: { worldState: [], evidence: ["objective"], repositories: [], durableMemory: [], episodes: [] },
    privacy: { allowedClassifications: ["private"], allowedDataHandlingModes: ["local-process"], allowExternalProcessing: false },
    targetConstraints: {
      targets: { allowed: [], denied: [] }, backends: { allowed: [], denied: [] },
      providers: { allowed: [], denied: [] }, models: { allowed: [], denied: [] }, preferenceOrder: [],
    },
  };
  const parentGrant: SpawnEffectiveGrantV1 = {
    capabilities: ["objective.cognition"], tools: [], scopes: policy.scopes,
    budgets: budgets({ maxInputTokens: 3_000, maxOutputTokens: 300, maxTotalTokens: 3_300, maxCostMicros: 9_000, maxRuntimeMs: 7_000 }),
    privacyPolicy: { classification: "private", allowedDataHandlingModes: ["local-process"], allowExternalProcessing: false },
    targetConstraints: policy.targetConstraints,
    authority: { mayMergeOwnWork: false, maySelfAccept: false, maySelfPromote: false, mayCertifyOwnCandidate: false, mayWriteWorldTruth: false },
  };
  const request = {
    schemaVersion: "spawn-sentient/v1", requestId: "r", taskId: "o", parentExecutionId: "root",
    role: "analysis", objective: "x",
    targetPolicy: { requiredCapabilities: ["objective.cognition"], qualityRequirements: [], costRequirements: [], privacyRequirements: [], ...policy.targetConstraints },
    skills: { exactSkillIds: [], selectionPolicy: null }, tools: [], scopes: policy.scopes,
    budgets: budgets({ maxInputTokens: 99_000, maxOutputTokens: 99_000, maxTotalTokens: 99_000, maxCostMicros: 99_000, maxRuntimeMs: 99_000 }),
    outputSchema: {}, acceptanceContract: { verifierId: "v", configuration: {}, allowedOutcomes: ["accept"] },
    privacyPolicy: parentGrant.privacyPolicy,
  } satisfies SpawnSentientRequestV1;
  const effective = effectiveSpawnBudgetsV1(policy, {
    identity: {
      taskId: "o", executionId: "root", parentExecutionId: null, depth: 0, role: "root",
      targetId: "root", backendId: "root", provider: null, model: null, targetRevision: null,
      sentientCode: { sha: "a".repeat(40), version: "v" }, requestDigest: "r", packageDigest: "p",
      skillSetDigest: "s", contextDigest: "c", startedAt: new Date(0).toISOString(), endedAt: null, status: "running",
    },
    effectiveGrant: parentGrant,
    remainingBudgets: budgets({ maxInputTokens: 2_000, maxOutputTokens: 200, maxTotalTokens: 2_200, maxCostMicros: 5_000, maxRuntimeMs: 5_000 }),
  }, request);
  assert.equal(effective.maxInputTokens, 2_000);
  assert.equal(effective.maxOutputTokens, 200);
  assert.equal(effective.maxTotalTokens, 2_200);
  assert.equal(effective.maxCostMicros, 5_000);
  assert.equal(effective.maxRuntimeMs, 5_000);
});

test("Spawn orchestrator derives reservation timeout signal and kills late success before verification", async () => {
  const source = await readFile("src/spawn/orchestrator.ts", "utf8");
  assert.match(source, /AbortSignal\.timeout\(Math\.max\(1,dec\.reservation\.runtimeMs\)\)/);
  assert.match(source, /Promise\.race\(\[/);
  assert.match(source, /late_model_output_rejected/);
  assert.match(source, /runtime_budget_exhausted/);
});

test("Phase1 rejects late model output and objective runner persists external envelope", async () => {
  const phase1 = await readFile("src/phase1/core-runtime.ts", "utf8");
  const runner = await readFile("src/fly/self-execution.ts", "utf8");
  assert.match(phase1, /runBoundedModelInvocationV1/);
  assert.match(phase1, /late_model_output_rejected/);
  assert.match(runner, /budget: input\.budget === undefined \? null/);
  assert.match(runner, /absoluteDeadline: input\.absoluteDeadline \?\? null/);
  assert.match(runner, /metadata\.budget/);
});
''')

router = read("src/model/providers/atlas-hybrid-router.ts")
for required in [
    "DEEPSEEK_COGNITION_TIMEOUT_MS_V1 = 12_000",
    "DOTS3_COGNITION_TIMEOUT_MS_V1 = 9_000",
    "DOTS3_SYNTHESIS_TIMEOUT_MS_V1 = 10_000",
    "DEEPSEEK_SYNTHESIS_FALLBACK_TIMEOUT_MS_V1 = 11_000",
    "LOCAL_HF_ATTEMPT_TIMEOUT_MS_V1 = 6_000",
]:
    if required not in router:
        raise SystemExit(f"missing timing precursor: {required}")

print("hard-stop patch applied")
