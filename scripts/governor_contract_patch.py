from pathlib import Path
import re

def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)

# policy.ts
p = Path("src/deployment-governor/policy.ts")
s = p.read_text()
s = one(s, "const SHA1 = /^[0-9a-f]{40}$/;", 'const SHA1 = /^[0-9a-f]{40}$/;\nconst SHA256 = /^sha256:[0-9a-f]{64}$/;', "policy digest regex")
s = one(s, '''export interface SentientCandidateDeploymentInput {
  sha: string;
  tree: string;
  skillsSha: string;
}''', '''export interface SentientCandidateDeploymentInput {
  sha: string;
  tree: string;
  skillsSha: string;
  imageDigest?: string;
}''', "policy input digest")
s = one(s, '''  return Object.freeze({
    sha: exact(input.sha, "sha"),
    tree: exact(input.tree, "tree"),
    skillsSha,
  });''', '''  const imageDigest = input.imageDigest?.trim().toLowerCase();
  if (imageDigest !== undefined && !SHA256.test(imageDigest)) {
    throw new Error("imageDigest_must_be_exact_sha256");
  }
  return Object.freeze({
    sha: exact(input.sha, "sha"),
    tree: exact(input.tree, "tree"),
    skillsSha,
    ...(imageDigest === undefined ? {} : { imageDigest }),
  });''', "policy exact digest")
p.write_text(s)

# server-main.ts
p = Path("src/deployment-governor/server-main.ts")
s = p.read_text()
s = one(s, 'exactKeys(body,["sha","tree","skillsSha"]);', 'exactKeys(body,["sha","tree","skillsSha","imageDigest"]);', "server allowed digest")
s = one(s, '''   const evidence=await governor.deploySentientCandidate({
    sha:text(body.sha,"sha"),tree:text(body.tree,"tree"),skillsSha:text(body.skillsSha,"skillsSha")
   },correlationId(req));''', '''   const evidence=await governor.deploySentientCandidate({
    sha:text(body.sha,"sha"),tree:text(body.tree,"tree"),skillsSha:text(body.skillsSha,"skillsSha"),
    ...(body.imageDigest===undefined?{}:{imageDigest:text(body.imageDigest,"imageDigest")})
   },correlationId(req));''', "server digest field")
p.write_text(s)

# fly-exec.ts
p = Path("src/deployment-governor/fly-exec.ts")
s = p.read_text()
s = one(s, '''    const imageRef =
      `registry.fly.io/${SENTIENT_DEPLOYMENT_APP}:phase0-${candidate.sha}`;''', '''    const imageTag =
      `registry.fly.io/${SENTIENT_DEPLOYMENT_APP}:phase0-${candidate.sha}`;
    const imageRef = candidate.imageDigest === undefined
      ? imageTag
      : `registry.fly.io/${SENTIENT_DEPLOYMENT_APP}@${candidate.imageDigest}`;''', "fly digest image ref")
s = one(s, '''  public async waitReady(candidate: SentientCandidateDeploymentInput): Promise<HttpProbeEvidence> {
    const deadline = Date.now() + 90_000;''', '''  public async waitReady(
    candidate: SentientCandidateDeploymentInput,
    timeoutMs = 90_000,
  ): Promise<HttpProbeEvidence> {
    const deadline = Date.now() + timeoutMs;''', "fly readiness timeout")
p.write_text(s)

# deployment.ts starts from exact reviewed c4af fixture.
p = Path("src/deployment-governor/deployment.ts")
s = p.read_text()
s = one(s, '''import {
  FlyDeploymentConvergenceFence,''', '''import {
  APPLICATION_READINESS_TIMEOUT_MS,
  FlyDeploymentConvergenceFence,''', "deployment timeout import")
s = s.replace("  probeMatches,\n", "")
start = s.index("      const initialMachine = await fence.snapshot();")
end = s.index("      const decision = await this.ledger.acquire", start)
replacement = '''      const initialMachine = await fence.snapshot();

      if (machineAlreadyConfiguredForCandidate(initialMachine, candidate)) {
        return this.reconcileConfiguredCandidate(
          fly,
          fence,
          resources,
          candidate,
          initialMachine,
        );
      }

'''
s = s[:start] + replacement + s[end:]
s = one(
    s,
    'post.ok ? "DEPLOYMENT_CONVERGENCE_PENDING" : "RESOURCE_ENVELOPE_VIOLATION",',
    'post.ok ? "DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_FAILED" : "RESOURCE_ENVELOPE_VIOLATION",',
    "control-plane classification",
)
s = s.replace(
    "await fly.waitReady(candidate);",
    "await fly.waitReady(candidate, APPLICATION_READINESS_TIMEOUT_MS);",
)
old = '''        const ready = post.ok
          && observed.READYZ_FAILURE === null
          && observed.DEPLOYED_SHA === candidate.sha
          && observed.DEPLOYED_TREE === candidate.tree;
        await lease.complete(
          !post.ok
            ? "RESOURCE_ENVELOPE_VIOLATION"
            : ready
              ? "SUCCEEDED"
              : "APPLICATION_READINESS_FAILED",
        );'''
new = '''        const ready = post.ok
          && observed.READYZ_FAILURE === null
          && observed.DEPLOYED_SHA === candidate.sha
          && observed.DEPLOYED_TREE === candidate.tree;
        const postTimeoutMachine = ready ? null : await fence.snapshot();
        const convergencePending = !ready
          && post.ok
          && postTimeoutMachine !== null
          && machineAlreadyConfiguredForCandidate(postTimeoutMachine, candidate);
        await lease.complete(
          !post.ok
            ? "RESOURCE_ENVELOPE_VIOLATION"
            : ready
              ? "SUCCEEDED"
              : convergencePending
                ? "DEPLOYMENT_CONVERGENCE_PENDING"
                : "APPLICATION_READINESS_FAILED",
        );'''
s = one(s, old, new, "post-timeout reconciliation")
s = re.sub(
    r'\nfunction convergedNow\(\n(?:.|\n)*?\n\}\n\nfunction withResourceEnvelope\(',
    '\nfunction withResourceEnvelope(',
    s,
    count=1,
)
p.write_text(s)
