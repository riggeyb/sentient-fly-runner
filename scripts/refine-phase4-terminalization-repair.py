from pathlib import Path

source = Path("src/phase4/multistep-autonomy.ts")
text = source.read_text()
old = '''      }catch(error){
        const previousRevision=continuation.revision;
        continuation=markObjectiveTerminal(continuation,{
          expectedRevision:previousRevision,
          status:"FAILED",
          reasonRef:`phase4:${plan.planId}:${step.stepId}:executor-error`,
        }).record;
        await persist(input.continuationWriter,continuation,previousRevision);
        throw error;
      }
'''
new = '''      }catch(error){
        const message=error instanceof Error?error.message:String(error);
        if(message.startsWith("phase5_restart_retry_exhausted:")){
          const previousRevision=continuation.revision;
          continuation=markObjectiveTerminal(continuation,{
            expectedRevision:previousRevision,
            status:"FAILED",
            reasonRef:`phase4:${plan.planId}:${step.stepId}:executor-error`,
          }).record;
          await persist(input.continuationWriter,continuation,previousRevision);
        }
        throw error;
      }
'''
if text.count(old) != 1:
    raise SystemExit(f"phase4 guarded-catch anchor count={text.count(old)}")
source.write_text(text.replace(old, new))

test = Path("test/final-cert-phase4-executor-exception.test.ts")
text = test.read_text()
text = text.replace(
    'test("Phase 4 terminalizes durable continuation before rethrowing an executor exception"',
    'test("Phase 4 terminalizes durable continuation before rethrowing bounded Phase5 exhaustion"',
)
addition = r'''

test("Phase 4 preserves a nonterminal continuation for transient executor interruption", async () => {
  const persisted:Array<{status:string|null;reasonRef:string|null;revision:number}>=[];
  await assert.rejects(
    executeObjectivePlanV1({
      objective:"Inspect the repository",
      identity:{...identity,objectiveId:"final-cert-transient-executor-interruption"},
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
          throw new Error("restart_transport_interrupted:test");
        },
      },
    }),
    /restart_transport_interrupted:test/,
  );
  assert.ok(persisted.length>=3);
  assert.equal(persisted.some(item=>item.status!==null),false);
});
'''
if "transient executor interruption" in text:
    raise SystemExit("transient regression already present")
test.write_text(text + addition)
