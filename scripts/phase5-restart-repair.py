from pathlib import Path

p=Path("src/application/production-collaboration.ts")
s=p.read_text()

old='import { noSpawnAuthorityV1 } from "../spawn/execution-validation.js";'
new='import { noSpawnAuthorityV1, zeroSpawnUsageV1 } from "../spawn/execution-validation.js";'
assert s.count(old)==1, "execution-validation import anchor"
s=s.replace(old,new,1)

old='''  SPAWN_CONTRACT_VERSION,
  type SpawnBudgetsV1,
'''
new='''  SPAWN_CHILD_RESULT_VERSION,
  SPAWN_CONTRACT_VERSION,
  type ChildExecutionResultV1,
  type SpawnBudgetsV1,
'''
assert s.count(old)==1, "spawn import anchor"
s=s.replace(old,new,1)

old='''  for (const role of ["independent-analysis", "independent-verification"] as const) {
    const requestId = `spawn:${input.objectiveId}:${role}:${randomUUID()}`;
    const workId = `${input.objectiveId}:${role}:${requestId}`;
    const claimed = await repository.claimActiveWork({
      operationId: `${requestId}:claim`,
      workId,
      workKey: role,
      sessionId: input.sessionId,
      objectiveId: input.objectiveId,
      participantId: requestId,
      currentAction: input.request,
      expectedEffect: `bounded ${role} contribution`,
      nextStep: "return contribution to Sentient convergence",
      overlapMode: role === "independent-analysis" ? "PRIMARY" : "DELIBERATE_OVERLAP",
      ...(role === "independent-verification"
        ? { overlapReason: "independent verification for convergence" }
        : {}),
    });
'''
new='''  for (const role of ["independent-analysis", "independent-verification"] as const) {
    const { requestId, workId, claimed } = await prepareProductionCollaborationLaneV1(
      repository,
      input,
      role,
    );
'''
assert s.count(old)==1, "collaboration claim anchor"
s=s.replace(old,new,1)

marker='''function rootExecution(
'''
helper=r'''export async function prepareProductionCollaborationLaneV1(
  repository: PostgresSpawnObjectiveRepository,
  input: ProductionCollaborationInputV1,
  role: "independent-analysis" | "independent-verification",
) {
  const current = (await repository.activeWork(input.sessionId, true))
    .filter((record) =>
      record.objectiveId === input.objectiveId
      && record.workKey === role
      && ["ACTIVE", "BLOCKED", "STALE"].includes(record.status))
    .sort((left, right) => right.sessionSequence - left.sessionSequence)[0];

  if (current && current.status !== "STALE") {
    throw new Error(`phase5_active_work_already_live:${role}:${current.workId}`);
  }

  if (current?.status === "STALE") {
    await reconcileInterruptedProductionSpawnV1(repository, current.participantId);

    if (current.reclaimCount >= 1) {
      const reclaimed = await repository.reclaimActiveWork({
        operationId: `${current.workId}:restart-exhausted:${current.revision}`,
        workId: current.workId,
        participantId: current.participantId,
        expectedRevision: current.revision,
        currentAction: "reconcile interrupted Spawn child after bounded retry exhaustion",
        nextStep: "fail closed without creating another child",
      });
      await repository.abandonActiveWork({
        operationId: `${current.workId}:restart-exhausted:abandon:${reclaimed.record.revision}`,
        workId: current.workId,
        participantId: reclaimed.record.participantId,
        expectedRevision: reclaimed.record.revision,
        currentAction: "bounded Phase 5 restart retry exhausted",
        nextStep: "surface terminal collaboration failure to Sentient",
      });
      throw new Error(`phase5_restart_retry_exhausted:${role}:${current.workId}`);
    }

    const requestId = `spawn:${input.objectiveId}:${role}:${randomUUID()}`;
    const reclaimed = await repository.reclaimActiveWork({
      operationId: `${requestId}:reclaim`,
      workId: current.workId,
      participantId: requestId,
      expectedRevision: current.revision,
      currentAction: input.request,
      nextStep: "retry one reconciled Spawn child then converge",
    });
    return { requestId, workId: current.workId, claimed: reclaimed, recovered: true as const };
  }

  const requestId = `spawn:${input.objectiveId}:${role}:${randomUUID()}`;
  const workId = `${input.objectiveId}:${role}:${requestId}`;
  const claimed = await repository.claimActiveWork({
    operationId: `${requestId}:claim`,
    workId,
    workKey: role,
    sessionId: input.sessionId,
    objectiveId: input.objectiveId,
    participantId: requestId,
    currentAction: input.request,
    expectedEffect: `bounded ${role} contribution`,
    nextStep: "return contribution to Sentient convergence",
    overlapMode: role === "independent-analysis" ? "PRIMARY" : "DELIBERATE_OVERLAP",
    ...(role === "independent-verification"
      ? { overlapReason: "independent verification for convergence" }
      : {}),
  });
  return { requestId, workId, claimed, recovered: false as const };
}

export async function reconcileInterruptedProductionSpawnV1(
  repository: PostgresSpawnObjectiveRepository,
  requestId: string,
): Promise<ChildExecutionResultV1 | null> {
  const snapshot = await repository.spawnSnapshot();
  const interrupted = snapshot.records.executions.filter((execution) =>
    execution.requestId === requestId
    && (execution.identity.status === "reserved" || execution.identity.status === "running")
    && execution.reservationReconciled === false);

  if (interrupted.length > 1) {
    throw new Error(`phase5_multiple_interrupted_children:${requestId}`);
  }
  const execution = interrupted[0];
  if (!execution) return null;

  const endedAt = new Date().toISOString();
  const result: ChildExecutionResultV1 = {
    schemaVersion: SPAWN_CHILD_RESULT_VERSION,
    identity: {
      ...execution.identity,
      endedAt,
      status: "timed_out",
    },
    requestDigest: execution.identity.requestDigest,
    packageDigest: execution.identity.packageDigest,
    contextDigest: execution.identity.contextDigest,
    skillSetDigest: execution.identity.skillSetDigest,
    terminalStatus: "timed_out",
    output: null,
    artifactRefs: [],
    evidenceRefs: [],
    toolActions: [],
    usage: zeroSpawnUsageV1(),
    latencyMs: null,
    costMicros: null,
    providerReceipt: null,
    failure: {
      class: "restart_interrupted",
      message: "Spawn child was interrupted before durable completion and was reconciled before bounded retry.",
      retryable: true,
    },
    unresolvedAmbiguities: [],
    childExecutionIds: snapshot.lineage
      .filter((edge) => edge.parentExecutionId === execution.id)
      .map((edge) => edge.childExecutionId)
      .sort(),
    verifierResultRefs: [],
  };
  await repository.completeSpawnChild(execution.id, result);
  return result;
}

'''
assert s.count(marker)==1, "root marker"
s=s.replace(marker,helper+marker,1)
p.write_text(s)

t=Path("test/production-collaboration-restart-recovery.test.ts")
t.write_text(r'''import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareProductionCollaborationLaneV1,
  reconcileInterruptedProductionSpawnV1,
} from "../src/application/production-collaboration.js";
import type { PostgresSpawnObjectiveRepository } from "../src/objective-continuation/postgres-spawn-repository.js";
import type { CollaborationActiveWorkRecordV1 } from "../src/state/active-work-state-types.js";

const objectiveId = "phase5-restart-objective";
const sessionId = "phase5-restart-session";
const oldRequestId = "spawn:phase5-restart-objective:independent-analysis:old";
const workId = "phase5-restart-objective:independent-analysis:stable-work";

function stale(reclaimCount = 0): CollaborationActiveWorkRecordV1 {
  return {
    contractVersion: "collaboration-active-work/v1",
    workId,
    workKey: "independent-analysis",
    sessionId,
    objectiveId,
    participantId: oldRequestId,
    currentAction: "analyze",
    status: "STALE",
    overlapMode: "PRIMARY",
    dependencies: [],
    affectedSurfaces: [],
    expectedEffect: "bounded contribution",
    assumptions: [],
    blockers: [],
    nextStep: "continue",
    lookaheadWork: [],
    revision: 1,
    sessionSequence: 2,
    leaseId: "old-lease",
    lastHeartbeatAt: "2026-10-24T00:00:00.000Z",
    createdAt: "2026-10-24T00:00:00.000Z",
    updatedAt: "2026-10-24T00:01:00.000Z",
    reclaimCount,
    lastOperationId: "recover-expired",
    lastOperationFingerprint: "fingerprint",
  };
}

function runningExecution() {
  return {
    id: "child-old",
    identity: {
      taskId: objectiveId,
      executionId: "child-old",
      parentExecutionId: `root:${objectiveId}`,
      depth: 1,
      role: "independent-analysis",
      targetId: "local-hf",
      backendId: "huggingface-local-zero-cost",
      provider: "huggingface-local",
      model: "Xenova/all-MiniLM-L6-v2",
      targetRevision: "q4-local",
      sentientCode: { sha: "sha", version: "v1" },
      requestDigest: "req-digest",
      packageDigest: "pkg-digest",
      skillSetDigest: "skill-digest",
      contextDigest: "ctx-digest",
      startedAt: "2026-10-24T00:00:00.000Z",
      endedAt: null,
      status: "running" as const,
    },
    requestId: oldRequestId,
    effectiveGrant: {} as never,
    reservedFromParent: {} as never,
    remainingBudgets: {} as never,
    observedUsage: null,
    reservationReconciled: false,
    updatedAt: "2026-10-24T00:00:01.000Z",
  };
}

function fakeRepository(record: CollaborationActiveWorkRecordV1) {
  let settled: any = null;
  let abandoned = false;
  const repo = {
    async activeWork() { return [record]; },
    async spawnSnapshot() {
      return { records: { executions: [runningExecution()] }, lineage: [] };
    },
    async completeSpawnChild(_id: string, result: unknown) {
      settled = result;
      return { execution: runningExecution(), result };
    },
    async reclaimActiveWork(input: { participantId: string }) {
      return {
        record: {
          ...record,
          participantId: input.participantId,
          status: "ACTIVE",
          revision: record.revision + 1,
          reclaimCount: record.reclaimCount + 1,
        },
        duplicate: false,
      };
    },
    async abandonActiveWork() {
      abandoned = true;
      return { record: { ...record, status: "ABANDONED" }, duplicate: false };
    },
    async claimActiveWork() {
      throw new Error("new work identity must not be claimed during stale recovery");
    },
  } as unknown as PostgresSpawnObjectiveRepository;
  return { repo, settled: () => settled, abandoned: () => abandoned };
}

test("Phase 5 restart reconciles orphan child and reclaims the same active-work identity for one retry", async () => {
  const f = fakeRepository(stale(0));
  const lane = await prepareProductionCollaborationLaneV1(
    f.repo,
    { request: "analyze", objectiveId, sessionId, privacy: "private" },
    "independent-analysis",
  );
  assert.equal(lane.workId, workId);
  assert.notEqual(lane.requestId, oldRequestId);
  assert.equal(lane.claimed.record.workId, workId);
  assert.equal(lane.claimed.record.reclaimCount, 1);
  assert.equal(f.settled()?.terminalStatus, "timed_out");
  assert.equal(f.settled()?.failure?.class, "restart_interrupted");
  assert.equal(f.settled()?.failure?.retryable, true);
  assert.equal(f.abandoned(), false);
});

test("Phase 5 second stale restart reconciles and abandons instead of spawning a duplicate retry", async () => {
  const f = fakeRepository(stale(1));
  await assert.rejects(
    prepareProductionCollaborationLaneV1(
      f.repo,
      { request: "analyze", objectiveId, sessionId, privacy: "private" },
      "independent-analysis",
    ),
    /phase5_restart_retry_exhausted/,
  );
  assert.equal(f.settled()?.terminalStatus, "timed_out");
  assert.equal(f.abandoned(), true);
});

test("interrupted Spawn settlement is idempotent when no running orphan remains", async () => {
  const repo = {
    async spawnSnapshot() { return { records: { executions: [] }, lineage: [] }; },
  } as unknown as PostgresSpawnObjectiveRepository;
  assert.equal(await reconcileInterruptedProductionSpawnV1(repo, oldRequestId), null);
});
''')
