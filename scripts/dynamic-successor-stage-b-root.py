from pathlib import Path

p = Path("src/application/production-mission-control.ts")
s = p.read_text()

def one(old: str, new: str, label: str) -> None:
    global s
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected 1 match, got {n}")
    s = s.replace(old, new, 1)

one(
'import type { SpawnExecutionBackendV1 } from "../spawn/execution-contracts.js";',
'''import type { SpawnExecutionBackendV1 } from "../spawn/execution-contracts.js";
import {
  objectiveAbortSignalV1,
  objectiveExecutionEnvelopeV1,
  remainingObjectiveMsV1,
  type ObjectiveExecutionEnvelopeV1,
} from "./objective-budget.js";''',
"budget import")

one(
'''  public async run(input: SentientObjectiveInput): Promise<unknown> {
    this.#ready();
    const root = productionRootContext(input);''',
'''  public async run(input: SentientObjectiveInput): Promise<unknown> {
    this.#ready();
    const objectiveEnvelope = objectiveExecutionEnvelopeV1(input);
    const root = productionRootContext(input);''',
"run envelope")

one(
'''            acceptancePolicy: this.#rootAcceptancePolicy,
            supportingEvidence: fallbackEvidence,
          })''',
'''            acceptancePolicy: this.#rootAcceptancePolicy,
            supportingEvidence: fallbackEvidence,
            objectiveEnvelope,
          })''',
"fallback envelope")

one(
'''  timeoutMs?: number;
  supportingEvidence?: RootFallbackEvidenceV1 | null;
}): Promise<string | null> {''',
'''  timeoutMs?: number;
  supportingEvidence?: RootFallbackEvidenceV1 | null;
  objectiveEnvelope?: ObjectiveExecutionEnvelopeV1;
}): Promise<string | null> {''',
"fallback field")

start = s.index("  const turn = await withRootDirectTimeoutV1(")
end_marker = "  if (turn === null) return null;\n"
end = s.index(end_marker, start) + len(end_marker)
replacement = '''  const envelope = input.objectiveEnvelope ?? objectiveExecutionEnvelopeV1(input.input);
  const remainingMs = remainingObjectiveMsV1(envelope);
  if (remainingMs <= 0) return null;
  const requestedCapMs = input.timeoutMs ?? remainingMs;
  if (!Number.isFinite(requestedCapMs) || requestedCapMs <= 0) {
    throw new Error("root_direct_fallback_timeout_invalid");
  }
  const absoluteDeadlineMs = Math.min(
    envelope.absoluteDeadlineMs,
    Date.now() + Math.floor(requestedCapMs),
  );
  if (absoluteDeadlineMs <= Date.now()) return null;
  const signal = objectiveAbortSignalV1({ absoluteDeadlineMs });

  const turn = await executeSentientPhase1TurnV1(
    {
      requestId: `root-direct:${input.input.objectiveId}`,
      sessionId: input.input.sessionId,
      taskId: input.input.objectiveId,
      userRequest: [
        "Root Mission Control is producing a direct TIER_0 response because the independent verifier verdict was unavailable.",
        "Do not claim any external action, deployment, mutation, authority grant, or independent semantic confirmation.",
        ...(input.supportingEvidence == null
          ? []
          : [
              "A delegated independent-analysis artifact passed deterministic local evidence verification. Treat it only as non-authoritative supporting evidence; it has not been independently semantically confirmed.",
              `Supporting analysis: ${truncateMissionText(input.supportingEvidence.content, 4_000)}`,
            ]),
        `Human request: ${truncateMissionText(input.input.request, 8_000)}`,
        `Canonical authoritative source repository: ${input.root.operatingContext.authoritativeSourceRepo}.`,
        `Canonical normal operator bridge: ${input.root.operatingContext.normalSentientOperatorBridge}.`,
      ].join("\\n\\n"),
    },
    {
      cognition: input.cognition,
      acceptancePolicy: input.acceptancePolicy,
      invocationControl: {
        objectiveId: input.input.objectiveId,
        executionId: `root-direct:${input.input.objectiveId}`,
        absoluteDeadlineMs,
        ...(envelope.maxCostMicros === null ? {} : { maxCostMicros: envelope.maxCostMicros }),
        signal,
      },
    },
  );
'''
s = s[:start] + replacement + s[end:]

helper_start = s.index("async function withRootDirectTimeoutV1")
helper_end = s.index("\nfunction record(", helper_start)
s = s[:helper_start] + s[helper_end+1:]

p.write_text(s)
print("root stage-b patch applied")
