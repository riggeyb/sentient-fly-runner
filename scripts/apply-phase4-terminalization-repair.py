from pathlib import Path

source = Path("src/phase4/multistep-autonomy.ts")
text = source.read_text()
old = '''      const execution=await input.executor.execute(effectiveStep);
      latestRef=execution.authoritativeResultRef;
'''
new = '''      let execution:StepExecutionV1;
      try{
        execution=await input.executor.execute(effectiveStep);
      }catch(error){
        const previousRevision=continuation.revision;
        continuation=markObjectiveTerminal(continuation,{
          expectedRevision:previousRevision,
          status:"FAILED",
          reasonRef:`phase4:${plan.planId}:${step.stepId}:executor-error`,
        }).record;
        await persist(input.continuationWriter,continuation,previousRevision);
        throw error;
      }
      latestRef=execution.authoritativeResultRef;
'''
if text.count(old) != 1:
    raise SystemExit(f"phase4 execution anchor count={text.count(old)}")
source.write_text(text.replace(old, new))

test = Path("test/final-cert-phase4-executor-exception.test.ts")
if test.exists():
    raise SystemExit("focused final-cert regression already exists")
test.write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import { executeObjectivePlanV1 } from "../src/phase4/multistep-autonomy.js";

const identity = {
  objectiveId: "final-cert-executor-exception",
  rootSpawnId: "root-final-cert-executor-exception",
  collaborationSessionId: "session-final-cert-executor-exception",
};

test("Phase 4 terminalizes durable continuation before rethrowing an executor exception", async () => {
  const persisted:Array<{status:string|null;reasonRef:string|null;revision:number}>=[];
  await assert.rejects(
    executeObjectivePlanV1({
      objective:"Inspect the repository",
      identity,
      continuationWriter:{
        async upsertObjectiveContinuation(record){
          persisted.push({
            status:record.terminal?.status??null,
            reasonRef:record.terminal?.reasonRef??null,
            revision:record.revision,
          });
        },
      },
      executor:{
        async execute(){
          throw new Error("phase5_restart_retry_exhausted:test");
        },
      },
    }),
    /phase5_restart_retry_exhausted:test/,
  );
  const terminal=persisted.at(-1);
  assert.equal(terminal?.status,"FAILED");
  assert.match(terminal?.reasonRef??"",/^phase4:plan-[0-9a-f]{8}:step-1:executor-error$/);
  assert.ok((terminal?.revision??0)>0);
});
''')
