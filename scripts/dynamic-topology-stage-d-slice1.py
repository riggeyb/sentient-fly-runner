from pathlib import Path

p = Path("sentient/src/application/production-collaboration.ts")
s = p.read_text()

def once(old, new):
    global s
    c=s.count(old)
    if c!=1: raise SystemExit(f"expected 1 match, got {c}: {old[:120]!r}")
    s=s.replace(old,new,1)

once(
'import type { PostgresSpawnObjectiveRepository } from "../objective-continuation/postgres-spawn-repository.js";',
'import type { PostgresSpawnObjectiveRepository } from "../objective-continuation/postgres-spawn-repository.js";\nimport type { DynamicWorkerRequestV1 } from "./dynamic-cognition.js";',
)
once(
'''export interface ProductionCollaborationInputV1 {
  request: string;
  objectiveId: string;
  sessionId: string;
  privacy: "public_fixture" | "private";
}''',
'''export interface ProductionCollaborationInputV1 {
  request: string;
  objectiveId: string;
  sessionId: string;
  privacy: "public_fixture" | "private";
  workerPlan?: readonly DynamicWorkerRequestV1[];
}''',
)
once(
'''    for (const role of ["independent-analysis", "independent-verification"] as const) {''',
'''    const workerPlan = input.workerPlan ?? [
      { id: "analysis", kind: "analysis" as const, mission: input.request },
      { id: "verification", kind: "verification" as const, mission: input.request },
    ];
    for (const [workerIndex, worker] of workerPlan.slice(0, 4).entries()) {
      const safeId = worker.id.trim().replace(/[^A-Za-z0-9_.:-]+/g, "-").slice(0, 64) || `worker-${workerIndex + 1}`;
      const role = `independent-${worker.kind}:${safeId}`;''',
)
once(
'''          request: spawnRequest(input, role, requestId, role === "independent-verification"
            ? verificationObjective(input.request, analysis?.result.output ?? null)
            : input.request),''',
'''          request: spawnRequest(input, role, requestId, worker.kind === "verification"
            ? verificationObjective(input.request, analysis?.result.output ?? null)
            : worker.mission),''',
)
once(
'''        const sentientDisposition =
          role === "independent-verification"
            ? productionVerificationDispositionV1(outcome.result.output)
            : "SUPPORT";
        if (role === "independent-verification") verificationDisposition = sentientDisposition;''',
'''        const sentientDisposition =
          worker.kind === "verification"
            ? productionVerificationDispositionV1(outcome.result.output)
            : "SUPPORT";
        if (worker.kind === "verification") verificationDisposition = sentientDisposition;''',
)
s=s.replace('role: "independent-analysis" | "independent-verification",','role: string,')
once(
'''    overlapMode: role === "independent-analysis" ? "PRIMARY" : "DELIBERATE_OVERLAP",
    ...(role === "independent-verification"
      ? { overlapReason: "independent verification for convergence" }
      : {}),''',
'''    overlapMode: role.startsWith("independent-verification:") ? "DELIBERATE_OVERLAP" : "PRIMARY",
    ...(role.startsWith("independent-verification:")
      ? { overlapReason: "independent verification for convergence" }
      : {}),''',
)
s=s.replace('role === "independent-analysis"', '!role.startsWith("independent-verification:")')
if 'independent-${worker.kind}' not in s: raise SystemExit("dynamic role patch missing")
p.write_text(s)

p = Path("sentient/src/spawn/backends/huggingface.ts")
s = p.read_text()
old='''  if (role === "independent-verification") {'''
if s.count(old)!=1: raise SystemExit("local HF verifier role target missing")
s=s.replace(old,'''  if (role.startsWith("independent-verification")) {''',1)
p.write_text(s)
print("dynamic topology slice 1 applied")
