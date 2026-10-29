from pathlib import Path
def rep(path,a,b):
 p=Path(path);s=p.read_text();n=s.count(a)
 if n!=1: raise SystemExit(f"{path}: anchor count {n}: {a[:90]!r}")
 p.write_text(s.replace(a,b,1))

path="sentient/src/application/production-mission-control.ts"
rep(path,'''  runProductionCollaborationV1,
  type ProductionCollaborationInputV1,
} from "./production-collaboration.js";''','''  ensureProductionSpawnRootV1,
  proposeProductionCognitionPlanV1,
  runProductionCollaborationV1,
  type ProductionCollaborationInputV1,
} from "./production-collaboration.js";''')
rep(path,'''    const root = productionRootContext(input);
    const workers = productionMissionWorkers(input);
    const sessionId = missionControlSessionId(input.objectiveId);''','''    const root = productionRootContext(input);
    const sessionId = missionControlSessionId(input.objectiveId);''')
rep(path,'''    for (const worker of workers) {
      const context = productionWorkerContext(root, worker);
      await this.#collaboration.join(sessionId, worker.key, worker.role);
      await publishMissionContext({
        coordination: this.#coordination,
        sessionId,
        participantKey: worker.key,
        workerId: worker.workerId,
        collaborationRole: worker.role,
        receipt: context.receipt,
      });
      await publishMissionEvent({
        coordination: this.#coordination,
        sessionId,
        participantKey: rootKey,
        workerId: root.workerId,
        type: "SUBTASK_ASSIGNED",
        summary: `Root assigned bounded ${worker.role.toLowerCase()} work.`,
        details: {
          assigneeWorkerId: worker.workerId,
          assignedMission: worker.mission,
          maxCapabilityTier: context.receipt.maxCapabilityTier,
          delegatedScope: context.receipt.delegatedScope.join(","),
        },
        idempotencyKey: `assign:${worker.workerId}`,
      });
    }

''','')
anchor='''    const result = await runProductionCollaborationV1(
      this.#state,
      collaborationInput,
      {
        sourceSha: this.#identity.source.sha,
        applicationVersion: PRODUCTION_MISSION_CONTROL_CONTRACT,
      },
      this.#spawnBackends,
    );'''
new='''    const collaborationIdentity = {
      sourceSha: this.#identity.source.sha,
      applicationVersion: PRODUCTION_MISSION_CONTROL_CONTRACT,
    };
    await ensureProductionSpawnRootV1(this.#state, collaborationInput, collaborationIdentity);
    const cognitionPlan = await proposeProductionCognitionPlanV1(
      this.#state,
      collaborationInput,
      collaborationIdentity,
      this.#spawnBackends,
    );
    const workers = productionMissionWorkers(input, cognitionPlan);

    await publishMissionEvent({
      coordination: this.#coordination,
      sessionId,
      participantKey: rootKey,
      workerId: root.workerId,
      type: "ORCHESTRATOR_STARTED",
      summary: `Root admitted cognition plan v${cognitionPlan.version} without granting authority.`,
      details: {
        humanIntentSource: "human",
        interpretation: truncateMissionText(cognitionPlan.interpretation, 1_000),
        successCriteriaCount: cognitionPlan.successCriteria.length,
        subgoalCount: cognitionPlan.subgoals.length,
        planStepCount: cognitionPlan.plan.length,
        workerCount: workers.length,
        reasoningResultCount: cognitionPlan.results.length,
        unresolvedQuestionCount: cognitionPlan.unresolvedQuestions.length,
        cognitiveScope: cognitionPlan.cognitiveScope.join(","),
        modelOutputIsAuthority: false,
        cognitiveScopeGrantsEffectAuthority: false,
      },
      idempotencyKey: `cognition-plan:${cognitionPlan.version}`,
    });

    for (const worker of workers) {
      const context = productionWorkerContext(root, worker);
      await this.#collaboration.join(sessionId, worker.key, worker.role);
      await publishMissionContext({
        coordination: this.#coordination,
        sessionId,
        participantKey: worker.key,
        workerId: worker.workerId,
        collaborationRole: worker.role,
        receipt: context.receipt,
      });
      await publishMissionEvent({
        coordination: this.#coordination,
        sessionId,
        participantKey: rootKey,
        workerId: root.workerId,
        type: "SUBTASK_ASSIGNED",
        summary: `Root assigned bounded ${worker.kind} work.`,
        details: {
          assigneeWorkerId: worker.workerId,
          assignedMission: worker.mission,
          maxCapabilityTier: context.receipt.maxCapabilityTier,
          delegatedScope: context.receipt.delegatedScope.join(","),
        },
        idempotencyKey: `assign:${worker.workerId}`,
      });
    }

    const result = await runProductionCollaborationV1(
      this.#state,
      { ...collaborationInput, workerPlan: cognitionPlan.workers },
      collaborationIdentity,
      this.#spawnBackends,
    );'''
rep(path,anchor,new)
rep(path,'''      status: succeeded ? "SUCCEEDED" : "NOT_CONVERGED",
      authorityOwner: "SENTIENT_RUNTIME",
      rootProjection,
      authoritativeResultRef,
      authoritativeContent,
      workerEffectsCanonical: false,
      operatingContextIsNotAuthority: true,
    });''','''      status: succeeded ? "SUCCEEDED" : "NOT_CONVERGED",
      authorityOwner: "SENTIENT_RUNTIME",
      rootProjection,
      authoritativeResultRef,
      authoritativeContent,
      cognitionPlanVersion: cognitionPlan.version,
      interpretation: cognitionPlan.interpretation,
      successCriteria: cognitionPlan.successCriteria,
      subgoals: cognitionPlan.subgoals,
      plan: cognitionPlan.plan,
      reasoningResults: cognitionPlan.results,
      unresolvedQuestions: cognitionPlan.unresolvedQuestions,
      workerEffectsCanonical: false,
      operatingContextIsNotAuthority: true,
    });''')

Path("sentient/test/dynamic-cognition-plan-admission-v1.test.ts").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import { defaultDynamicCognitionPlanV1, parseDynamicCognitionPlanV1 } from "../src/application/dynamic-cognition.js";
import { boundedWorkerPlanV1 } from "../src/application/production-collaboration.js";

test("dynamic cognition revises criteria, subgoals, plan, topology, and results without replacing human intent", () => {
  const human = "Analyze the repository and return useful results.";
  const plan = parseDynamicCognitionPlanV1({
    humanIntent: "replacement",
    version: 2,
    interpretation: "Inspect evidence and revise as evidence arrives.",
    successCriteria: ["one", "two"],
    subgoals: ["inspect", "verify"],
    plan = ["inspect", "revise", "synthesize"],
    workers = [
      { id: "repo", kind: "analysis", mission: "inspect" },
      { id: "critic", kind: "critic", mission: "critique" },
     { id: "verify", kind: "verification", mission: "verify" },
    ],
    results: ["result one", "result two"],
    unresolvedQuestions: ["question"],
    cognitiveScope: ["github", "fly", "atlas"],
  }, human);
  assert.ok(plan);
  assert.equal(plan.humanIntent, human);
  assert.equal(plan.version, 2);
  assert.equal(plan.successCriteria.length, 2);
  assert.equal(plan.subgoals.length, 2);
  assert.equal(plan.plan.length, 3);
  assert.equal(plan.workers.length, 3);
  assert.equal(plan.results.length, 2);
});

test("dynamic topology admits zero, one, and bounded many descriptors", () => {
  assert.equal(boundedWorkerPlanV1({ request: "x", workerPlan: [] }).length, 0);
  assert.equal(boundedWorkerPlanV1({ request: "x", workerPlan: [{ id: "solo", kind: "critic", mission: "critique" }] }).length, 1);
  const many = boundedWorkerPlanV1({
    request: "x",
    workerPlan: Array.from({ length: 7 }, (_, index) => ({
      id: `w-${index}`,
      kind: index === 1 ? "verification" as const : "analysis" as const,
      mission: `mission-${index}`,
    })),
  });
  assert.equal(many.length, 4);
});

test("compatibility plan remains bounded when planning is unavailable", () => {
  const plan = defaultDynamicCognitionPlanV1("human request");
  assert.equal(plan.humanIntent, "human request");
  assert.deepEqual(plan.workers.map((worker) => worker.kind), ["analysis", "verification"]);
  assert.equal(plan.results.length, 0);
});
''')
print("mission-control plan admission patch applied")
