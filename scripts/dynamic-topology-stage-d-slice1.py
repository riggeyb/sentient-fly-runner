from pathlib import Path
p=Path("sentient/src/application/production-collaboration.ts")
s=p.read_text()
def one(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit(f"anchor count {n}: {a[:80]!r}")
 s=s.replace(a,b,1)

one('import type { PostgresSpawnObjectiveRepository } from "../objective-continuation/postgres-spawn-repository.js";',
    'import type { PostgresSpawnObjectiveRepository } from "../objective-continuation/postgres-spawn-repository.js";\nimport type { DynamicWorkerRequestV1 } from "./dynamic-cognition.js";')
one('  privacy: "public_fixture" | "private";\n}', '  privacy: "public_fixture" | "private";\n  workerPlan?: readonly DynamicWorkerRequestV1[];\n}')
one('    public readonly role: "independent-analysis" | "independent-verification",','    public readonly role: string,')
one('    for (const role of ["independent-analysis", "independent-verification"] as const) {',
'''    const workerPlan = boundedWorkerPlanV1(input);
    for (const worker of workerPlan) {
      const role = `independent-${worker.kind}:${worker.id}`;''')
one('''          role === "independent-verification"
            ? verificationObjective(input.request, contributions[0]?.result.output ?? null)
            : undefined,''',
'''          worker.kind === "verification"
            ? verificationObjective(input.request, contributions[0]?.result.output ?? null)
            : worker.mission,''')
one('''        role === "independent-verification"
          ? productionVerificationDispositionV1(outcome.result.output)
          : "SUPPORT";
      if (role === "independent-verification") {''',
'''        worker.kind === "verification"
          ? productionVerificationDispositionV1(outcome.result.output)
          : "SUPPORT";
      if (worker.kind === "verification") {''')
s=s.replace('  role: "independent-analysis" | "independent-verification",','  role: string,')
one('''    overlapMode: role === "independent-analysis" ? "PRIMARY" : "DELIBERATE_OVERLAP",
    ...(role === "independent-verification"
      ? { overlapReason: "independent verification for convergence" }
      : {}),''',
'''    overlapMode: role.startsWith("independent-verification:") ? "DELIBERATE_OVERLAP" : "PRIMARY",
    ...(role.startsWith("independent-verification:")
      ? { overlapReason: "independent verification for convergence" }
      : {}),''')
s=s.replace('role === "independent-verification"', 'role.startsWith("independent-verification:")')
insert='function objectRecord(value: unknown): Record<string, unknown> {'
helper='''export function boundedWorkerPlanV1(
  input: Pick<ProductionCollaborationInputV1, "request" | "workerPlan">,
): readonly DynamicWorkerRequestV1[] {
  const requested = input.workerPlan ?? [
    { id: "analysis", kind: "analysis" as const, mission: input.request },
    { id: "verification", kind: "verification" as const, mission: input.request },
  ];
  return Object.freeze(requested.slice(0, 4).map((worker, index) => Object.freeze({
    id: worker.id.trim().replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || `worker-${index + 1}`,
    kind: worker.kind,
    mission: worker.mission.trim().slice(0, 2_000) || input.request.slice(0, 2_000),
  })));
}

'''
one(insert,helper+insert)
p.write_text(s)

p=Path("sentient/src/spawn/backends/huggingface.ts")
s=p.read_text()
old='  if (role === "independent-verification") {'
if s.count(old)==1: s=s.replace(old,'  if (role.startsWith("independent-verification")) {',1)
elif 'role.startsWith("independent-verification")' not in s: raise SystemExit("HF role anchor missing")
p.write_text(s)
print("dynamic topology patch applied")
