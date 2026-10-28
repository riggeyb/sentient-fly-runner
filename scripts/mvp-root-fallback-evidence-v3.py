from pathlib import Path

def one(path, old, new):
    p = Path(path)
    s = p.read_text()
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"{path}: expected one anchor, found {n}: {old[:80]!r}")
    p.write_text(s.replace(old, new, 1))

c = "src/application/production-collaboration.ts"
one(c,
'''    const verifierUnavailable =
      contributions.length >= 2 && verificationDisposition === "UNAVAILABLE";
''',
'''    const verifierUnavailable =
      contributions.length >= 2 && verificationDisposition === "UNAVAILABLE";
    const verifiedAnalysis =
      verifierUnavailable && contributions[0]?.verification.outcome === "accept"
        ? contributions[0]
        : null;
    const deterministicallyVerifiedAnalysisContent =
      verifiedAnalysis !== null
      && typeof verifiedAnalysis.result.output === "string"
      && verifiedAnalysis.result.output.trim()
        ? verififiedAnalysis.result.output.trim()
        : null;
    const deterministicallyVerifiedAnalysisEvidenceRefs =
      verifiedAnalysis === null
        ? []
        : [...verifiedAnalysis.verification.evidenceRefs];
''')
one(c,
'''          spawnEpisodes: Object.freeze(episodes),
''',
'''          deterministicallyVerifiedAnalysisContent,
          deterministicallyVerifiedAnalysisEvidenceRefs: Object.freeze(
            deterministicallyVerifiedAnalysisEvidenceRefs,
          ),
          spawnEpisodes: Object.freeze(episodes),
''')

m = "src/application/production-mission-control.ts"
one(m,
'''    const converged = collaborationStatus === "CONVERGED";
''',
'''    const converged = collaborationStatus === "CONVERGED";
    const fallbackEvidence = rootFallbackEvidenceV1(row);
''')
one(m,
'''            acceptancePolicy: this.#rootAcceptancePolicy,
''',
'''            acceptancePolicy: this.#rootAcceptancePolicy,
            supportingEvidence: fallbackEvidence,
''')
one(m,
'''    const evidenceRefs = strings(row.evidenceRefs);
''',
'''    const evidenceRefs = strings(row.evidenceRefs);
    const fallbackAcceptedEvidence =
      rootDirectContent !== null && fallbackEvidence !== null;
''')
one(m,
'''      await publishWorkerEvidence({
''',
'''      const acceptedForRoot =
        converged || (fallbackAcceptedEvidence && i === 0);
      await publishWorkerEvidence({
''')
one(m, '''        verified: converged,
''', '''        verified: acceptedForRoot,
''')
one(m, '''      if (converged) {
''', '''      if (acceptedForRoot) {
''')
one(m,
'''            reason: "verified_spawn_contribution",
''',
'''            reason: converged
              ? "verified_spawn_contribution"
              : "verified_spawn_analysis_supporting_root_fallback",
''')
one(m,
'''            sourceRef: evidenceRefs[i] ?? "spawn-result",
''',
'''            sourceRef: converged
              ? evidenceRefs[i] ?? "spawn-result"
              : fallbackEvidence!.evidenceRefs[0] ??? "spawn-result",
''')
one(m,
'''        acceptedEvidenceCount: converged ? workers.length : 0,
''',
'''        acceptedEvidenceCount: converged
          ? workers.length
          : fallbackAcceptedEvidence
            ? 1
            : 0,
''')

old_sig = '''export async function runRootDirectFallbackV1(input: {
  input: SentientObjectiveInput;
  root: RootMissionContext;
  cognition: Phase1CognitionPort | null;
  acceptancePolicy: Phase1AcceptancePolicyV1 | null;
  timeoutMs?: number;
}): Promise<string | null> {
'''
new_sig = '''export interface RootFallbackEvidenceV1 {
  content: string;
  evidenceRefs: readonly string[];
}

export function rootFallbackEvidenceV1(value: unknown): RootFallbackEvidenceV1 | null {
  const row = record(value);
  if (
    row.status !== "UNAVAILABLE"
    || row.reason !== "independent_verification_verdict_unparseable"
  ) return null;
  const content =
    typeof row.deterministicallyVerifiedAnalysisContent === "string"
      ? row.deterministicallyVerifiedAnalysisContent.trim()
      : "";
  const evidenceRefs = strings(
    row.deterministicallyVerifiedAnalysisEvidenceRefs,
  ).map((ref) => ref.trim()).filter(Boolean);
  if (!content || evidenceRefs.length === 0) return null;
  return Object.freeze({
    content,
    evidenceRefs: Object.freeze(evidenceRefs),
  });
}

export async function runRootDirectFallbackV1(input: {
  input: SentientObjectiveInput;
  root: RootMissionContext;
  cognition: Phase1CognitionPort | null;
  acceptancePolicy: Phase1AcceptancePolicyV1 | null;
  timeoutMs?: number;
  supportingEvidence?: RootFallbackEvidenceV1 | null;
}): Promise<string | null> {
'''
one(m, old_sig, new_sig)

one(m,
'''          "Root Mission Control is producing a direct TIER_0 response because optional delegated evidence was unavailable.",
          "Do not claim any external action, deployment, mutation, authority grant, or verified child evidence.",
          `Human request: ${truncateMissionText(input.input.request, 8_000)}`,
''',
'''          "Root Mission Control is producing a direct TIER_0 response because the independent verifier verdict was unavailable.",
          "Do not claim any external action, deployment, mutation, authority grant, or independent semantic confirmation.",
          ...(input.supportingEvidence == null
            ? []
            : [
                "A delegated independent-analysis artifact passed deterministic local evidence verification. Treat it only as non-authoritative supporting evidence; it has not been independently semantically confirmed.",
                `Supporting analysis: ${truncateMissionText(input.supportingEvidence.content, 4_000)}`,
              ]),
          `Human request: ${truncateMissionText(input.input.request, 8_000)}`,
''')
