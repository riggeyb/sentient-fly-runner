from pathlib import Path
p=Path("sentient/src/application/production-collaboration.ts")
s=p.read_text()
def one(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit(f"collaboration anchor count {n}: {a[:80]!r}")
 s=s.replace(a,b,1)

one('import type { DynamicWorkerRequestV1 } from "./dynamic-cognition.js";', '''import {
  defaultDynamicCognitionPlanV1,
  parseDynamicCognitionPlanV1,
  type DynamicCognitionPlanV1,
  type DynamicWorkerRequestV1,
} from "./dynamic-cognition.js";''')

anchor='''export async function runProductionCollaborationV1(
  repository: PostgresSpawnObjectiveRepository,
  input: ProductionCollaborationInputV1,
  identity: ProductionCollaborationIdentityV1,
  backends: readonly SpawnExecutionBackendV1[],
): Promise<unknown> {'''
helper='''export async function proposeProductionCognitionPlanV1(
  repository: PostgresSpawnObjectiveRepository,
  input: ProductionCollaborationInputV1,
  identity: ProductionCollaborationIdentityV1,
  backends: readonly SpawnExecutionBackendV1[],
): Promise<DynamicCognitionPlanV1> {
  await ensureProductionSpawnRootV1(repository, input, identity);
  const role = "root-planning";
  const { requestId, workId, claimed } = await prepareProductionCollaborationLaneV1(repository, input, role);
  const outcome = await runSpawnSentientV1(
    {
      repository,
      policy: spawnPolicy(input),
      backends,
      verifier: deterministicVerifier(),
      sentientCode: { sha: identity.sourceSha, version: identity.applicationVersion },
      now: () => new Date().toISOString(),
    },
    {
      request: spawnRequest(input, role, requestId, dynamicPlanningObjectiveV1(input.request)),
      resolvedSkills: [],
      contextCandidates: [],
      contextBounds: { maxArtifacts: 4, maxTotalChars: 16_000, maxArtifactChars: 8_000 },
    },
  );
  if (outcome.status === "completed" && outcome.result && outcome.verification?.outcome === "accept") {
    await repository.completeActiveWork({
      operationId: `${requestId}:complete`,
      workId,
      participantId: requestId,
      expectedRevision: claimed.record.revision,
      currentAction: "Bounded root planning completed",
      nextStep: "admit a non-authoritative cognition plan through existing Spawn policy",
    });
    const parsed = parseDynamicCognitionPlanV1(outcome.result.output, input.request);
    if (parsed !== null) return parsed;
  } else {
    await repository.abandonActiveWork({
      operationId: `${requestId}:abandon`,
      workId,
      participantId: requestId,
      expectedRevision: claimed.record.revision,
      currentAction: "Bounded root planning unavailable",
      nextStep: "use the compatibility cognition plan without expanding budget or authority",
    });
  }
  return defaultDynamicCognitionPlanV1(input.request);
}

function dynamicPlanningObjectiveV1(humanIntent: string): string {
  return [
    "Propose a bounded non-authoritative cognition plan for the human request.",
    "Return one JSON object only, with fields: version, interpretation, successCriteria, subgoals, plan, workers, results, unresolvedQuestions, cognitiveScope.",
    "workers may contain zero, one, or several objects with id, kind (analysis|verification|critic), and mission.",
    "The plan may revise its interpretation, success criteria, subgoals, approach, worker topology, evidence needs, deliverables, and internal result set.",
    "Do not grant authority, tools, effects, budget, or deadlines. Do not replace the human request.",
    `Human request: ${humanIntent.slice(0, 8_000)}`,
  ].join("\\n");
}

'''+anchor
one(anchor,helper)
one('''    maxOutputTokens: role.startsWith("independent-verification:") ? 8 : 32,
    maxTotalTokens: 5_120,
    maxCostMicros: 25_000,
    currency: "USD",
    maxRuntimeMs: 60_000,''','''    maxOutputTokens: role === "root-planning"
      ? 512
      : role.startsWith("independent-verification:")
        ? 8
        : 32,
    maxTotalTokens: role === "root-planning" ? 4_608 : 5_120,
    maxCostMicros: 25_000,
    currency: "USD",
    maxRuntimeMs: role === "root-planning" ? 45_000 : 60_000,''')
p.write_text(s)
print("collaboration plan helper patch applied")
