from pathlib import Path

def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)

# convergence.ts starts from exact experimental file c4afaf...
p = Path("src/deployment-governor/convergence.ts")
s = p.read_text()
s = s.replace(
    'import { FixedSentientFlyControl, probeMatches, type HttpProbeEvidence } from "./fly-exec.js";',
    'import { probeMatches, type HttpProbeEvidence } from "./fly-exec.js";',
)
s = s.replace("DEPLOYMENT_CONVERGENCE_TIMEOUT_MS", "DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_TIMEOUT_MS")
s = s.replace(
    "const RECONCILIATION_TIMEOUT_MS = 30_000;",
    "export const POST_TIMEOUT_RECONCILIATION_TIMEOUT_MS = 30_000;",
)
s = one(s,
'''  releaseId: string | null;
  releaseVersion: string | null;
}''',
'''  releaseId: string | null;
  releaseVersion: string | null;
  processGroup: string | null;
  platformVersion: string | null;
}''', "machine interface")
s = one(s,
'''export interface DeploymentConvergenceEvidence {
  status: "CONVERGED" | "PENDING";
  reason: string | null;
  elapsedMs: number;
  machineState: FlyMachineStateV2 | null;
  runtimeIdentity: HttpProbeEvidence | null;
}

export class FlyDeploymentConvergenceFence {
  readonly #token = required(SENTIENT_TARGET_DEPLOYMENT_CREDENTIAL);
  public constructor(private readonly fly: FixedSentientFlyControl) {}
''',
'''export interface DeploymentConvergenceEvidence {
  status: "CONVERGED" | "PENDING";
  reason: string | null;
  elapsedMs: number;
  machineState: FlyMachineStateV2 | null;
  runtimeIdentity: HttpProbeEvidence | null;
}

export interface FlyReadinessProbeControlV1 {
  probe(path: "/healthz" | "/readyz"): Promise<HttpProbeEvidence>;
}

export interface FlyDeploymentConvergenceRuntimeV1 {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  snapshot?: () => Promise<FlyMachineSnapshotV2>;
}

export class FlyDeploymentConvergenceFence {
  readonly #token = required(SENTIENT_TARGET_DEPLOYMENT_CREDENTIAL);
  readonly #now: () => number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #snapshotOverride: (() => Promise<FlyMachineSnapshotV2>) | null;

  public constructor(
    private readonly fly: FlyReadinessProbeControlV1,
    runtime: FlyDeploymentConvergenceRuntimeV1 = {},
  ) {
    this.#now = runtime.now ?? Date.now;
    this.#sleep = runtime.sleep ?? sleep;
    this.#snapshotOverride = runtime.snapshot ?? null;
  }
''', "runtime injection")
s = one(s,
'''  public async snapshot(): Promise<FlyMachineSnapshotV2> {
    const list = await runFlyctl(''',
'''  public async snapshot(): Promise<FlyMachineSnapshotV2> {
    if (this.#snapshotOverride !== null) return await this.#snapshotOverride();
    const list = await runFlyctl(''', "snapshot override")

start = s.index("  public async wait(\n")
end = s.index("  public async reconcileReady(\n", start)
new_wait = '''  public async wait(
    candidate: SentientCandidateDeploymentInput,
    baseline: FlyMachineSnapshotV2 | null,
    timeoutMs: number = DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_TIMEOUT_MS,
  ): Promise<DeploymentConvergenceEvidence> {
    const started = this.#now();
    const deadline = started + timeoutMs;
    let current = await this.snapshot();
    while (!machineConfigMatchesCandidate(current, candidate, baseline) && this.#now() < deadline) {
      await this.#sleep(Math.min(POLL_MS, Math.max(0, deadline - this.#now())));
      current = await this.snapshot();
    }
    return machineConfigMatchesCandidate(current, candidate, baseline)
      ? {
          status: "CONVERGED",
          reason: null,
          elapsedMs: this.#now() - started,
          machineState: current.machineState,
          runtimeIdentity: null,
        }
      : pending(started, this.#now(), current, machineFailure(current, candidate, baseline), null);
  }

'''
s = s[:start] + new_wait + s[end:]
s = s.replace("Date.now() + RECONCILIATION_TIMEOUT_MS", "this.#now() + POST_TIMEOUT_RECONCILIATION_TIMEOUT_MS")
s = s.replace("Date.now() < deadline", "this.#now() < deadline")
s = s.replace("await sleep(POLL_MS);", "await this.#sleep(POLL_MS);")

s = one(s,
'''      releaseId: text(metadata.fly_release_id ?? metadata.flyReleaseId),
      releaseVersion: scalar(metadata.fly_release_version ?? metadata.flyReleaseVersion),
    },''',
'''      releaseId: text(metadata.fly_release_id ?? metadata.flyReleaseId),
      releaseVersion: scalar(metadata.fly_release_version ?? metadata.flyReleaseVersion),
      processGroup: text(metadata.fly_process_group ?? metadata.flyProcessGroup),
      platformVersion: text(metadata.fly_platform_version ?? metadata.flyPlatformVersion),
    },''', "snapshot metadata")
s = one(s,
'''      releaseVersion:
        scalar(metadata.fly_release_version ?? metadata.flyReleaseVersion)
          ?? current.releaseVersion,
    },''',
'''      releaseVersion:
        scalar(metadata.fly_release_version ?? metadata.flyReleaseVersion)
          ?? current.releaseVersion,
      processGroup:
        text(metadata.fly_process_group ?? metadata.flyProcessGroup)
          ?? current.processGroup,
      platformVersion:
        text(metadata.fly_platform_version ?? metadata.flyPlatformVersion)
          ?? current.platformVersion,
    },''', "merged metadata")
s = s.replace(
    'candidate: Pick<SentientCandidateDeploymentInput, "sha">,\n  baseline:',
    'candidate: Pick<SentientCandidateDeploymentInput, "sha" | "imageDigest">,\n  baseline:',
)
s = s.replace(
    'candidate: Pick<SentientCandidateDeploymentInput, "sha">,\n): boolean {',
    'candidate: Pick<SentientCandidateDeploymentInput, "sha" | "imageDigest">,\n): boolean {',
)
s = one(s,
'''  if (current.image?.toLowerCase() !== expected.toLowerCase()) return false;
  if (''',
'''  if (current.image?.toLowerCase() !== expected.toLowerCase()) return false;
  if (current.processGroup !== "app" || current.platformVersion !== "v2") return false;
  if (
    candidate.imageDigest !== undefined
    && current.imageDigest?.toLowerCase() !== candidate.imageDigest.toLowerCase()
  ) return false;
  if (''', "match fences")
s = one(s,
'''    && current.releaseId !== null
    && current.releaseVersion !== null;
}''',
'''    && current.releaseId !== null
    && current.releaseVersion !== null
    && current.processGroup !== null
    && current.platformVersion !== null;
}''', "complete metadata")
s = one(s,
'''  if (current.image?.toLowerCase() !== expected.toLowerCase()) {
    return `machine_image_not_converged:${current.image ?? "unknown"}`;
  }
  if (current.imageDigest === null)''',
'''  if (current.image?.toLowerCase() !== expected.toLowerCase()) {
    return `machine_image_not_converged:${current.image ?? "unknown"}`;
  }
  if (current.processGroup !== "app") {
    return `machine_process_group_not_converged:${current.processGroup ?? "unknown"}`;
  }
  if (current.platformVersion !== "v2") {
    return `machine_platform_version_not_converged:${current.platformVersion ?? "unknown"}`;
  }
  if (current.imageDigest === null)''', "failure metadata")
s = one(s,
'''  if (!DIGEST.test(current.imageDigest)) return `machine_image_digest_invalid:${current.imageDigest}`;
  if (current.version === null)''',
'''  if (!DIGEST.test(current.imageDigest)) return `machine_image_digest_invalid:${current.imageDigest}`;
  if (
    candidate.imageDigest !== undefined
    && current.imageDigest.toLowerCase() !== candidate.imageDigest.toLowerCase()
  ) return `machine_image_digest_not_expected:${current.imageDigest}`;
  if (current.version === null)''', "failure digest")
s = one(s,
'''    releaseId: null,
    releaseVersion: null,
  };''',
'''    releaseId: null,
    releaseVersion: null,
    processGroup: null,
    platformVersion: null,
  };''', "empty metadata")
s = s.replace(
'''function pending(
  started: number,
  snapshot: FlyMachineSnapshotV2,
  reason: string,
  runtimeIdentity: HttpProbeEvidence | null,
): DeploymentConvergenceEvidence {
  return {
    status: "PENDING",
    reason,
    elapsedMs: Date.now() - started,''',
'''function pending(
  started: number,
  now: number,
  snapshot: FlyMachineSnapshotV2,
  reason: string,
  runtimeIdentity: HttpProbeEvidence | null,
): DeploymentConvergenceEvidence {
  return {
    status: "PENDING",
    reason,
    elapsedMs: now - started,''')
s = s.replace("pending(started, current,", "pending(started, this.#now(), current,")
p.write_text(s)

# policy.ts: optional exact digest, backward safe
p = Path("src/deployment-governor/policy.ts")
s = p.read_text()
s = one(s, 'const SHA1 = /^[0-9a-f]{40}$/;', 'const SHA1 = /^[0-9a-f]{40}$/;\nconst SHA256 = /^sha256:[0-9a-f]{64}$/;', "digest regex")
s = one(s,
'''export interface SentientCandidateDeploymentInput {
  sha: string;
  tree: string;
  skillsSha: string;
}''',
'''export interface SentientCandidateDeploymentInput {
  sha: string;
  tree: string;
  skillsSha: string;
  imageDigest?: string;
}''', "candidate digest")
s = one(s,
'''  return Object.freeze({
    sha: exact(input.sha, "sha"),
    tree: exact(input.tree, "tree"),
    skillsSha,
  });''',
'''  const imageDigest = input.imageDigest?.trim().toLowerCase();
  if (imageDigest !== undefined && !SHA256.test(imageDigest)) {
    throw new Error("imageDigest_must_be_exact_sha256");
  }
  return Object.freeze({
    sha: exact(input.sha, "sha"),
    tree: exact(input.tree, "tree"),
    skillsSha,
    ...(imageDigest === undefined ? {} : { imageDigest }),
  });''', "exact digest")
p.write_text(s)

# server-main.ts
p = Path("src/deployment-governor/server-main.ts")
s = p.read_text()
s = one(s, 'exactKeys(body,["sha","tree","skillsSha"]);', 'exactKeys(body,["sha","tree","skillsSha","imageDigest"]);', "server keys")
s = one(s,
'''    sha:text(body.sha,"sha"),tree:text(body.tree,"tree"),skillsSha:text(body.skillsSha,"skillsSha")
   },correlationId(req));''',
'''    sha:text(body.sha,"sha"),tree:text(body.tree,"tree"),skillsSha:text(body.skillsSha,"skillsSha"),
    ...(body.imageDigest===undefined?{}:{imageDigest:text(body.imageDigest,"imageDigest")})
   },correlationId(req));''', "server digest")
p.write_text(s)

# fly-exec.ts
p = Path("src/deployment-governor/fly-exec.ts")
s = p.read_text()
s = one(s,
'''    const imageRef =
      `registry.fly.io/${SENTIENT_DEPLOYMENT_APP}:phase0-${candidate.sha}`;''',
'''    const imageTag =
      `registry.fly.io/${SENTIENT_DEPLOYMENT_APP}:phase0-${candidate.sha}`;
    const imageRef = candidate.imageDigest === undefined
      ? imageTag
      : `registry.fly.io/${SENTIENT_DEPLOYMENT_APP}@${candidate.imageDigest}`;''', "deploy digest")
s = one(s,
'''  public async waitReady(candidate: SentientCandidateDeploymentInput): Promise<HttpProbeEvidence> {
    const deadline = Date.now() + 90_000;''',
'''  public async waitReady(
    candidate: SentientCandidateDeploymentInput,
    timeoutMs = 90_000,
  ): Promise<HttpProbeEvidence> {
    const deadline = Date.now() + timeoutMs;''', "readiness timeout")
p.write_text(s)

# deployment.ts starts from exact experimental file c4afaf...
p = Path("src/deployment-governor/deployment.ts")
s = p.read_text()
s = one(s,
'''  FlyDeploymentConvergenceFence,
  machineAlreadyConfiguredForCandidate,''',
'''  APPLICATION_READINESS_TIMEOUT_MS,
  FlyDeploymentConvergenceFence,
  machineAlreadyConfiguredForCandidate,''', "deployment import timeout")
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
s = s.replace('"DEPLOYMENT_CONVERGENCE_PENDING" : "RESOURCE_ENVELOPE_VIOLATION"', '"DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_FAILED" : "RESOURCE_ENVELOPE_VIOLATION"', 1)
s = s.replace("await fly.waitReady(candidate);", "await fly.waitReady(candidate, APPLICATION_READINESS_TIMEOUT_MS);")
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
s = one(s, old, new, "post-timeout classification")
start = s.find("function convergedNow(")
if start >= 0:
    end = s.index("\nfunction withResourceEnvelope(", start)
    s = s[:start] + s[end+1:]
p.write_text(s)
