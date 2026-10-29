from pathlib import Path

p=Path("sentient/src/application/production-collaboration.ts")
s=p.read_text()
def one(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit(f"anchor count {n}: {a[:100]!r}")
 s=s.replace(a,b,1)

one('import { createHash, randomUUID } from "node:crypto";',
'''import { createHash, randomUUID } from "node:crypto";
import type { BudgetEnvelope } from "sentient-orchestrator/worker-protocol";''')
one('''  privacy: "public_fixture" | "private";
  workerPlan?: readonly DynamicWorkerRequestV1[];''',
'''  privacy: "public_fixture" | "private";
  budget?: Readonly<BudgetEnvelope>;
  deadline?: string;
  workerPlan?: readonly DynamicWorkerRequestV1[];''')
one('''  const budgets = defaultBudgets();''','''  const budgets = objectiveSpawnBudgetsV1(input);''')
one('''function spawnPolicy(input: ProductionCollaborationInputV1): SpawnPolicyV1 {
  const budgets = defaultBudgets();''',
'''function spawnPolicy(input: ProductionCollaborationInputV1): SpawnPolicyV1 {
  const budgets = objectiveSpawnBudgetsV1(input);''')
one('''function defaultBudgets(): SpawnBudgetsV1 {
  return {
    maxInputTokens: 32_000,
    maxOutputTokens: 8_000,
    maxTotalTokens: 40_000,
    maxCostMicros: 100_000,
    currency: "USD",
    maxRuntimeMs: 120_000,
    maxToolRounds: 8,
    maxToolActions: 16,
    maxChildExecutions: 4,
    maxRecursionDepth: 1,
  };
}''',
'''export function objectiveSpawnBudgetsV1(
  input: Pick<ProductionCollaborationInputV1, "budget" | "deadline">,
  nowMs = Date.now(),
): SpawnBudgetsV1 {
  const tokenCeiling = input.budget?.maxTokens ?? 40_000;
  const costCeiling =
    input.budget?.maxCostUsd === undefined
      ? 100_000
      : Math.floor(input.budget.maxCostUsd * 1_000_000);
  const durationCeiling =
    input.budget?.maxDurationSeconds === undefined
      ? 120_000
      : Math.floor(input.budget.maxDurationSeconds * 1_000);
  const deadlineCeiling =
    input.deadline === undefined
      ? 120_000
      : Math.max(0, Date.parse(input.deadline) - nowMs);
  const maxTotalTokens = Math.max(0, Math.min(40_000, tokenCeiling));
  return {
    maxInputTokens: Math.min(32_000, maxTotalTokens),
    maxOutputTokens: Math.min(8_000, maxTotalTokens),
    maxTotalTokens,
    maxCostMicros: Math.max(0, Math.min(100_000, costCeiling)),
    currency: "USD",
    maxRuntimeMs: Math.max(0, Math.min(120_000, durationCeiling, deadlineCeiling)),
    maxToolRounds: 8,
    maxToolActions: 16,
    maxChildExecutions: 4,
    maxRecursionDepth: 1,
  };
}''')
p.write_text(s)

p=Path("sentient/src/application/production-mission-control.ts")
s=p.read_text()
old='''    const collaborationInput: ProductionCollaborationInputV1 = {
      request: input.request,
      objectiveId: input.objectiveId,
      sessionId: input.sessionId,
      privacy: input.privacy,
    };'''
new='''    const collaborationInput: ProductionCollaborationInputV1 = {
      request: input.request,
      objectiveId: input.objectiveId,
      sessionId: input.sessionId,
      privacy: input.privacy,
      ...(input.budget === undefined ? {} : { budget: input.budget }),
      ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
    };'''
if s.count(old)!=1: raise SystemExit("mission-control collaboration input anchor mismatch")
p.write_text(s.replace(old,new,1))

p=Path("sentient/test/objective-spawn-budget-inheritance-v1.test.ts")
p.write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import { objectiveSpawnBudgetsV1 } from "../src/application/production-collaboration.js";

test("objective budget clamps existing Spawn root budget vocabulary", () => {
  const now = Date.parse("2026-10-29T22:00:00Z");
  const budgets = objectiveSpawnBudgetsV1({
    budget: { maxTokens: 900, maxCostUsd: 0.012, maxDurationSeconds: 20 },
    deadline: "2026-10-29T22:00:07Z",
  }, now);
  assert.equal(budgets.maxTotalTokens, 900);
  assert.equal(budgets.maxInputTokens, 900);
  assert.equal(budgets.maxOutputTokens, 900);
  assert.equal(budgets.maxCostMicros, 12_000);
  assert.equal(budgets.maxRuntimeMs, 7_000);
  assert.equal(budgets.maxChildExecutions, 4);
});

test("objective budget can only narrow existing Spawn ceilings", () => {
  const budgets = objectiveSpawnBudgetsV1({
    budget: { maxTokens: 100_000, maxCostUsd: 5, maxDurationSeconds: 10_000 },
  }, 0);
  assert.equal(budgets.maxTotalTokens, 40_000);
  assert.equal(budgets.maxCostMicros, 100_000);
  assert.equal(budgets.maxRuntimeMs, 120_000);
});
''')
print("objective Spawn budget inheritance patch applied")
