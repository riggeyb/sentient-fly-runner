from pathlib import Path

collab = Path("src/application/production-collaboration.ts")
s = collab.read_text()
old = '''export class ProductionCollaborationLeaseLiveErrorV1 extends Error {
  public constructor(
'''
new = '''export class ProductionCollaborationLeaseLiveErrorV1 extends Error {
  public readonly preserveContinuationForRetry = true as const;

  public constructor(
'''
if s.count(old) != 1:
    raise SystemExit(f"collaboration marker anchor count={s.count(old)}")
collab.write_text(s.replace(old, new))

phase4 = Path("src/phase4/multistep-autonomy.ts")
s = phase4.read_text()
old = '''      }catch(error){
        const previousRevision=continuation.revision;
'''
new = '''      }catch(error){
        if(preserveContinuationForRetry(error)) throw error;
        const previousRevision=continuation.revision;
'''
if s.count(old) != 1:
    raise SystemExit(f"phase4 catch anchor count={s.count(old)}")
s = s.replace(old, new)
anchor = '''function boundedAttempts(value:number|undefined):number{
'''
helper = '''function preserveContinuationForRetry(error:unknown):boolean{
  return error!==null
    && typeof error==="object"
    && (error as {preserveContinuationForRetry?:unknown}).preserveContinuationForRetry===true;
}

'''
if s.count(anchor) != 1:
    raise SystemExit(f"phase4 helper anchor count={s.count(anchor)}")
phase4.write_text(s.replace(anchor, helper + anchor))

test_file = Path("test/final-cert-phase5-lease-phase4-resume.test.ts")
if test_file.exists():
    raise SystemExit("new regression already exists")
test_file.write_text(r'''import assert from "node:assert/strict";
import test from "node:test";

import type { SentientApplicationResult, SentientObjectiveInput } from "../src/application/contracts.js";
import { ProductionCollaborationLeaseLiveErrorV1 } from "../src/application/production-collaboration.js";
import { runObjectiveWithInheritedPhase5LeaseRetryV1 } from "../src/fly/self-execution.js";
import { executeObjectivePlanV1 } from "../src/phase4/multistep-autonomy.js";
import type { ObjectiveContinuationRecordV1 } from "../src/state/objective-state-types.js";

test("inherited Phase5 lease retry preserves the dispatched Phase4 continuation and completes it after one bounded retry", async () => {
  const input: SentientObjectiveInput = {
    request: "recover inherited collaboration lease",
    objectiveId: "final-cert-phase5-lease-phase4",
    sessionId: "session-final-cert-phase5-lease-phase4",
    mode: "multi_step",
    privacy: "public_fixture",
  };
  let continuation: ObjectiveContinuationRecordV1 | undefined;
  let executorCalls = 0;
  const sleeps: number[] = [];

  const application = {
    async runObjective(): Promise<SentientApplicationResult> {
      const result = await executeObjectivePlanV1({
        objective: input.request,
        identity: {
          objectiveId: input.objectiveId,
          rootSpawnId: `root:${input.objectiveId}`,
          collaborationSessionId: input.sessionId,
        },
        continuationReader: {
          async getObjectiveContinuation() {
            return continuation === undefined ? undefined : structuredClone(continuation);
          },
        },
        continuationWriter: {
          async upsertObjectiveContinuation(record, expectedPreviousRevision) {
            if (continuation === undefined) assert.equal(expectedPreviousRevision, null);
            else assert.equal(expectedPreviousRevision, continuation.revision);
            continuation = structuredClone(record);
          },
        },
        executor: {
          async execute() {
            executorCalls += 1;
            if (executorCalls === 1) {
              throw new ProductionCollaborationLeaseLiveErrorV1(
                "independent-analysis",
                "stable-work-id",
                new Date(10_000).toISOString(),
              );
            }
            return {
              status: "VERIFIED" as const,
              evidenceId: "evidence:reconciled-retry",
              authoritativeResultRef: "result:reconciled-retry",
            };
          },
        },
      });
      return { httpStatus: 200, body: { mode: "multi_step", result } };
    },
  };

  const result = await runObjectiveWithInheritedPhase5LeaseRetryV1(application, input, {
    now: () => 0,
    async sleep(ms) { sleeps.push(ms); },
  });

  assert.equal(result.httpStatus, 200);
  assert.equal(executorCalls, 2);
  assert.deepEqual(sleeps, [10_250]);
  assert.equal(continuation?.terminal?.status, "COMPLETED");
  assert.equal(
    continuation?.evidenceDependencies.filter((dependency) => dependency.status === "SATISFIED").length,
    1,
  );
});
''')
