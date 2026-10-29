from pathlib import Path

p=Path("src/application/production-mission-control-synthesis.ts")
s=p.read_text()
def one(old,new,label):
    global s
    n=s.count(old)
    if n!=1: raise SystemExit(f"{label}: expected 1 match, got {n}")
    s=s.replace(old,new,1)

one(
'import type { SpawnExecutionBackendV1 } from "../spawn/execution-contracts.js";',
'''import type { SpawnExecutionBackendV1 } from "../spawn/execution-contracts.js";
import {
  objectiveAbortSignalV1,
  objectiveExecutionEnvelopeV1,
  remainingObjectiveMsV1,
} from "./objective-budget.js";''',
"budget import")

one(
'''  public override async run(input: SentientObjectiveInput): Promise<unknown> {
    const started = Date.now();
    const raw = await super.run(input);''',
'''  public override async run(input: SentientObjectiveInput): Promise<unknown> {
    const started = Date.now();
    const objectiveEnvelope = objectiveExecutionEnvelopeV1(input, started);
    const boundedInput = Object.freeze({
      ...input,
      deadline: new Date(objectiveEnvelope.absoluteDeadlineMs).toISOString(),
    });
    const raw = await super.run(boundedInput);''',
"shared deadline")

one(
'''    const synthesisBudgetMs = rootSynthesisBudgetMsV1(
      started,
      Date.now(),
      resultRef,
    );''',
'''    const synthesisBudgetMs = remainingObjectiveMsV1(objectiveEnvelope);'',
"remaining budget")

start=s.index("    const turn = await bounded(")
end_marker='      return raw;\n    }\n'
end=s.index(end_marker,start)+len(end_marker)
replacement='''    const signal = objectiveAbortSignalV1(objectiveEnvelope);
    const turn = await executeSentientPhase1TurnV1(
      {
        requestId: `root-synthesis:${input.objectiveId}`,
        sessionId: input.sessionId,
        taskId: input.objectiveId,
        userRequest: prompt,
      },
      {
        cognition: this.#synthesis,
        acceptancePolicy: this.#acceptance,
        invocationControl: {
          objectiveId: input.objectiveId,
          executionId: `root-synthesis:${input.objectiveId}`,
          absoluteDeadlineMs: objectiveEnvelope.absoluteDeadlineMs,
          ...(objectiveEnvelope.maxCostMicros === null
            ? {}
            : { maxCostMicros: objectiveEnvelope.maxCostMicros }),
          signal,
        },
      },
    );
'''
s=s[:start]+replacement+s[end:]

start=s.index("async function bounded<T>")
end=s.index("\nfunction acceptanceEvent(",start)
s=s[:start]+s[end+1:]
p.write_text(s)
print("synthesis stage-b patch applied")
