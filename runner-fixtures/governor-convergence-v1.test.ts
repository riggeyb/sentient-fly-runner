import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  APPLICATION_READINESS_TIMEOUT_MS,
  DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_TIMEOUT_MS,
  FlyDeploymentConvergenceFence,
  POST_TIMEOUT_RECONCILIATION_TIMEOUT_MS,
  expectedCandidateImageV2,
  machineAlreadyConfiguredForCandidate,
  machineConfigMatchesCandidate,
  parseMachineSnapshotV2,
  type FlyMachineSnapshotV2,
} from "../src/deployment-governor/convergence.js";
import type { HttpProbeEvidence } from "../src/deployment-governor/fly-exec.js";

process.env.SENTIENT_TARGET_DEPLOYMENT_FLY_TOKEN = "test-governor-token";

const SHA = "e".repeat(40);
const PREVIOUS_SHA = "a".repeat(40);
const TREE = "2".repeat(40);
const SKILLS = "b".repeat(40);
const DIGEST = `sha256:${"1".repeat(64)}`;
const PREVIOUS_DIGEST = `sha256:${"0".repeat(64)}`;
const CANDIDATE = { sha: SHA, tree: TREE, skillsSha: SKILLS, imageDigest: DIGEST };

function machine(input: {
  sha: string;
  state?: string;
  version: string;
  releaseId: string;
  releaseVersion: number;
  digest: string;
  processGroup?: string;
  platformVersion?: string;
}): FlyMachineSnapshotV2 {
  return parseMachineSnapshotV2([{
    id: "8469e7b243d558",
    state: input.state ?? "started",
    region: "iad",
    version: input.version,
    config: {
      image: `registry.fly.io/sentient-validation-runner:phase0-${input.sha}`,
      metadata: {
        fly_platform_version: input.platformVersion ?? "v2",
        fly_process_group: input.processGroup ?? "app",
        fly_release_id: input.releaseId,
        fly_release_version: input.releaseVersion,
      },
    },
    image_ref: {
      registry: "registry.fly.io",
      repository: "sentient-validation-runner",
      tag: `phase0-${input.sha}`,
      digest: input.digest,
    },
  }]);
}

const PREDECESSOR = machine({
  sha: PREVIOUS_SHA,
  version: "machine-v154",
  releaseId: "rel-old",
  releaseVersion: 154,
  digest: PREVIOUS_DIGEST,
});
const SUCCESSOR = machine({
  sha: SHA,
  version: "machine-v155",
  releaseId: "rel-new",
  releaseVersion: 155,
  digest: DIGEST,
});

function probe(ready = true): HttpProbeEvidence {
  return {
    statusCode: 200,
    error: null,
    body: {
      ready,
      identity: {
        source: { sha: SHA, tree: TREE },
        skills: { sha: SKILLS },
      },
    },
  };
}

test("Governor uses separate long control-plane and short application-readiness clocks", () => {
  assert.equal(DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_TIMEOUT_MS, 10 * 60_000);
  assert.equal(APPLICATION_READINESS_TIMEOUT_MS, 90_000);
  assert.equal(POST_TIMEOUT_RECONCILIATION_TIMEOUT_MS, 30_000);
  assert.ok(DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_TIMEOUT_MS > 6 * 60_000);
  assert.ok(DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_TIMEOUT_MS > APPLICATION_READINESS_TIMEOUT_MS);
});

test("image, digest, process-group, platform, version and release all fence convergence", () => {
  assert.equal(expectedCandidateImageV2(CANDIDATE), `registry.fly.io/sentient-validation-runner:phase0-${SHA}`);
  assert.equal(machineConfigMatchesCandidate(SUCCESSOR, CANDIDATE, PREDECESSOR), true);

  const wrongDigest = machine({
    sha: SHA, version: "machine-v155", releaseId: "rel-new", releaseVersion: 155,
    digest: `sha256:${"3".repeat(64)}`,
  });
  assert.equal(machineConfigMatchesCandidate(wrongDigest, CANDIDATE, PREDECESSOR), false);

  const wrongGroup = machine({
    sha: SHA, version: "machine-v155", releaseId: "rel-new", releaseVersion: 155,
    digest: DIGEST, processGroup: "other",
  });
  assert.equal(machineConfigMatchesCandidate(wrongGroup, CANDIDATE, PREDECESSOR), false);

  const wrongPlatform = machine({
    sha: SHA, version: "machine-v155", releaseId: "rel-new", releaseVersion: 155,
    digest: DIGEST, platformVersion: "v1",
  });
  assert.equal(machineConfigMatchesCandidate(wrongPlatform, CANDIDATE, PREDECESSOR), false);

  const staleVersion = machine({
    sha: SHA, version: "machine-v154", releaseId: "rel-new", releaseVersion: 155, digest: DIGEST,
  });
  assert.equal(machineConfigMatchesCandidate(staleVersion, CANDIDATE, PREDECESSOR), false);

  const staleRelease = machine({
    sha: SHA, version: "machine-v155", releaseId: "rel-old", releaseVersion: 155, digest: DIGEST,
  });
  assert.equal(machineConfigMatchesCandidate(staleRelease, CANDIDATE, PREDECESSOR), false);
});

test("fast deployment converges before any HTTP readiness probe", async () => {
  let now = 0;
  let probes = 0;
  const fence = new FlyDeploymentConvergenceFence(
    { async probe() { probes += 1; return probe(); } },
    {
      now: () => now,
      sleep: async (ms) => { now += ms; },
      snapshot: async () => SUCCESSOR,
    },
  );
  const evidence = await fence.wait(CANDIDATE, PREDECESSOR);
  assert.equal(evidence.status, "CONVERGED");
  assert.equal(evidence.elapsedMs, 0);
  assert.equal(evidence.runtimeIdentity, null);
  assert.equal(probes, 0);
});

test("slow six-minute-plus image preparation does not consume application readiness clock", async () => {
  let now = 0;
  let probes = 0;
  const fence = new FlyDeploymentConvergenceFence(
    { async probe() { probes += 1; return probe(); } },
    {
      now: () => now,
      sleep: async (ms) => { now += ms; },
      snapshot: async () => now < 385_000 ? PREDECESSOR : SUCCESSOR,
    },
  );
  const evidence = await fence.wait(CANDIDATE, PREDECESSOR);
  assert.equal(evidence.status, "CONVERGED");
  assert.ok(evidence.elapsedMs >= 385_000);
  assert.ok(evidence.elapsedMs < DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_TIMEOUT_MS);
  assert.equal(probes, 0);
});

test("control-plane never converges: bounded distinct convergence failure evidence", async () => {
  let now = 0;
  const fence = new FlyDeploymentConvergenceFence(
    { async probe() { throw new Error("readiness_must_not_start"); } },
    {
      now: () => now,
      sleep: async (ms) => { now += ms; },
      snapshot: async () => PREDECESSOR,
    },
  );
  const evidence = await fence.wait(CANDIDATE, PREDECESSOR, 10_000);
  assert.equal(evidence.status, "PENDING");
  assert.equal(evidence.elapsedMs, 10_000);
  assert.match(evidence.reason ?? "", /^machine_image_not_converged:/);
});

test("autostopped exact Machine is started only by readiness HTTP probe, never by Machine mutation", async () => {
  let now = 0;
  let calls = 0;
  const stopped = machine({
    sha: SHA,
    state: "stopped",
    version: "machine-v155",
    releaseId: "rel-new",
    releaseVersion: 155,
    digest: DIGEST,
  });
  const fence = new FlyDeploymentConvergenceFence(
    {
      async probe(path) {
        assert.equal(path, "/readyz");
        calls += 1;
        return calls === 1 ? { statusCode: 503, body: null, error: null } : probe(true);
      },
    },
    {
      now: () => now,
      sleep: async (ms) => { now += ms; },
      snapshot: async () => stopped,
    },
  );
  assert.equal(machineAlreadyConfiguredForCandidate(stopped, CANDIDATE), true);
  const reconciled = await fence.reconcileReady(CANDIDATE, 10_000);
  assert.equal(reconciled.machine.machineState?.state, "stopped");
  assert.equal(reconciled.readyz.statusCode, 200);
  assert.equal(calls, 2);
  assert.equal(now, 2_000);
});

test("Governor source begins readiness only after Machine fence and post-timeout re-reads Machine", async () => {
  const source = await readFile("src/deployment-governor/deployment.ts", "utf8");
  const deployIndex = source.indexOf("const deployed = await fly.deploy(");
  const convergenceIndex = source.indexOf("const convergence = await fence.wait(", deployIndex);
  const readinessIndex = source.indexOf("let readyz = await fly.waitReady(candidate, APPLICATION_READINESS_TIMEOUT_MS);", convergenceIndex);
  const postTimeoutIndex = source.indexOf("const postTimeoutMachine = ready ? null : await fence.snapshot();", readinessIndex);

  assert.ok(deployIndex >= 0);
  assert.ok(convergenceIndex > deployIndex);
  assert.ok(readinessIndex > convergenceIndex);
  assert.ok(postTimeoutIndex > readinessIndex);
  assert.match(source, /DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_FAILED/);
  assert.match(source, /DEPLOYMENT_CONVERGENCE_PENDING/);
  assert.match(source, /APPLICATION_READINESS_FAILED/);
  assert.match(source, /machineAlreadyConfiguredForCandidate\(initialMachine, candidate\)/);
  assert.match(source, /no_fly_deploy_executed/);
});

test("optional digest contract is backward-safe while exact digest is enforced when supplied", async () => {
  const { exactCandidate } = await import("../src/deployment-governor/policy.js");
  const legacy = exactCandidate({ sha: SHA, tree: TREE, skillsSha: SKILLS });
  assert.equal(legacy.imageDigest, undefined);
  const pinned = exactCandidate(CANDIDATE);
  assert.equal(pinned.imageDigest, DIGEST);
  assert.throws(
    () => exactCandidate({ sha: SHA, tree: TREE, skillsSha: SKILLS, imageDigest: "sha256:not-a-digest" }),
    /imageDigest_must_be_exact_sha256/,
  );
});
