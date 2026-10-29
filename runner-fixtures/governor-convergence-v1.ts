import { execFile } from "node:child_process";
import { probeMatches, type HttpProbeEvidence } from "./fly-exec.js";
import {
  SENTIENT_TARGET_DEPLOYMENT_CREDENTIAL,
  SENTIENT_DEPLOYMENT_APP,
  type SentientCandidateDeploymentInput,
} from "./policy.js";

export const DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_TIMEOUT_MS = 10 * 60_000;
export const APPLICATION_READINESS_TIMEOUT_MS = 90_000;
export const POST_TIMEOUT_RECONCILIATION_TIMEOUT_MS = 30_000;
const POLL_MS = 2_000;
const DIGEST = /^sha256:[0-9a-f]{64}$/i;
const OUTPUT_LIMIT = 96 * 1024;

export interface FlyMachineStateV2 {
  machineCount: number;
  machineId: string | null;
  state: string | null;
  region: string | null;
  version: string | null;
  image: string | null;
  imageDigest: string | null;
  releaseId: string | null;
  releaseVersion: string | null;
  processGroup: string | null;
  platformVersion: string | null;
}

export interface FlyMachineSnapshotV2 {
  ok: boolean;
  reason: string | null;
  machineState: FlyMachineStateV2 | null;
}

export interface DeploymentConvergenceEvidence {
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

type CandidateFence = Pick<SentientCandidateDeploymentInput, "sha" | "imageDigest">;

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

  public async snapshot(): Promise<FlyMachineSnapshotV2> {
    if (this.#snapshotOverride !== null) return await this.#snapshotOverride();

    const list = await run(
      ["machines", "list", "--app", SENTIENT_DEPLOYMENT_APP, "--json"],
      this.#token,
    );
    if (!list.ok) return bad("target_machine_inventory_unavailable");

    const listed = parseMachineSnapshotV2(parse(list.out));
    const id = listed.machineState?.machineId ?? null;
    if (!listed.ok || id === null) return listed;

    const status = await run(
      ["machine", "status", id, "--app", SENTIENT_DEPLOYMENT_APP, "--display-config"],
      this.#token,
    );
    if (!status.ok) {
      return { ...listed, ok: false, reason: "target_machine_config_unavailable" };
    }
    const config = parseConfig(status.out);
    if (config === null) {
      return { ...listed, ok: false, reason: "target_machine_config_unparseable" };
    }
    return mergeStatus(listed, config);
  }

  public async wait(
    candidate: SentientCandidateDeploymentInput,
    baseline: FlyMachineSnapshotV2 | null,
    timeoutMs = DEPLOYMENT_CONTROL_PLANE_CONVERGENCE_TIMEOUT_MS,
  ): Promise<DeploymentConvergenceEvidence> {
    const started = this.#now();
    const deadline = started + timeoutMs;
    let current = await this.snapshot();

    while (!machineConfigMatchesCandidate(current, candidate, baseline) && this.#now() < deadline) {
      await this.#sleep(Math.min(POLL_MS, Math.max(0, deadline - this.#now())));
      current = await this.snapshot();
    }

    if (!machineConfigMatchesCandidate(current, candidate, baseline)) {
      return pending(
        started,
        this.#now(),
        current,
        machineFailure(current, candidate, baseline),
      );
    }

    return {
      status: "CONVERGED",
      reason: null,
      elapsedMs: this.#now() - started,
      machineState: current.machineState,
      runtimeIdentity: null,
    };
  }

  public async reconcileReady(
    candidate: SentientCandidateDeploymentInput,
    timeoutMs = POST_TIMEOUT_RECONCILIATION_TIMEOUT_MS,
  ): Promise<{ readyz: HttpProbeEvidence; machine: FlyMachineSnapshotV2 }> {
    const machine = await this.snapshot();
    if (!machineAlreadyConfiguredForCandidate(machine, candidate)) {
      return { readyz: await this.fly.probe("/readyz"), machine };
    }

    const deadline = this.#now() + timeoutMs;
    let readyz = await this.fly.probe("/readyz");
    while (!probeMatches(readyz, candidate, true) && this.#now() < deadline) {
      await this.#sleep(Math.min(POLL_MS, Math.max(0, deadline - this.#now())));
      readyz = await this.fly.probe("/readyz");
    }
    return { readyz, machine };
  }
}

export function expectedCandidateImageV2(candidate: Pick<SentientCandidateDeploymentInput, "sha">): string {
  return `registry.fly.io/${SENTIENT_DEPLOYMENT_APP}:phase0-${candidate.sha.toLowerCase()}`;
}

export function parseMachineSnapshotV2(value: unknown): FlyMachineSnapshotV2 {
  const root = record(value);
  const machines = Array.isArray(value)
    ? value
    : Array.isArray(root.machines)
      ? root.machines
      : [];

  if (machines.length !== 1) {
    return {
      ok: false,
      reason: `target_machine_count_not_one:${machines.length}`,
      machineState: empty(machines.length),
    };
  }

  const machine = record(machines[0]);
  const config = record(machine.config);
  const imageRef = record(machine.image_ref ?? machine.imageRef);
  const metadata = record(config.metadata);
  return {
    ok: true,
    reason: null,
    machineState: {
      machineCount: 1,
      machineId: text(machine.id ?? machine.ID),
      state: text(machine.state ?? machine.State),
      region: text(machine.region ?? machine.Region),
      version: text(machine.version ?? machine.Version),
      image: image(config, machine, imageRef),
      imageDigest: text(imageRef.digest),
      releaseId: text(metadata.fly_release_id ?? metadata.flyReleaseId),
      releaseVersion: scalar(metadata.fly_release_version ?? metadata.flyReleaseVersion),
      processGroup: text(metadata.fly_process_group ?? metadata.flyProcessGroup),
      platformVersion: text(metadata.fly_platform_version ?? metadata.flyPlatformVersion),
    },
  };
}

export function machineConfigMatchesCandidate(
  snapshot: FlyMachineSnapshotV2,
  candidate: CandidateFence,
  baseline: FlyMachineSnapshotV2 | null,
): boolean {
  const current = snapshot.ok ? snapshot.machineState : null;
  if (!complete(current)) return false;
  if (current.image.toLowerCase() !== expectedCandidateImageV2(candidate).toLowerCase()) return false;
  if (current.processGroup !== "app" || current.platformVersion !== "v2") return false;
  if (
    candidate.imageDigest !== undefined
    && current.imageDigest.toLowerCase() !== candidate.imageDigest.toLowerCase()
  ) return false;

  const previous = baseline?.machineState ?? null;
  if (
    previous === null
    || previous.image?.toLowerCase() === expectedCandidateImageV2(candidate).toLowerCase()
  ) return true;

  if (!complete(previous)) return false;
  return current.version !== previous.version
    && current.releaseId !== previous.releaseId
    && releaseVersionAdvanced(previous.releaseVersion, current.releaseVersion)
    && current.imageDigest.toLowerCase() !== previous.imageDigest.toLowerCase();
}

export function machineAlreadyConfiguredForCandidate(
  snapshot: FlyMachineSnapshotV2,
  candidate: CandidateFence,
): boolean {
  return machineConfigMatchesCandidate(snapshot, candidate, null);
}

function mergeStatus(listed: FlyMachineSnapshotV2, value: unknown): FlyMachineSnapshotV2 {
  const current = listed.machineState;
  if (current === null) return listed;

  const outer = record(value);
  const configCandidate = record(outer.config);
  const config = Object.keys(configCandidate).length > 0 ? configCandidate : outer;
  const imageRef = record(outer.image_ref ?? outer.imageRef);
  const metadata = record(config.metadata);

  return {
    ok: true,
    reason: null,
    machineState: {
      ...current,
      version: text(outer.version ?? outer.Version) ?? current.version,
      image: image(config, outer, imageRef) ?? current.image,
      imageDigest: text(imageRef.digest) ?? current.imageDigest,
      releaseId:
        text(metadata.fly_release_id ?? metadata.flyReleaseId)
        ?? current.releaseId,
      releaseVersion:
        scalar(metadata.fly_release_version ?? metadata.flyReleaseVersion)
        ?? current.releaseVersion,
      processGroup:
        text(metadata.fly_process_group ?? metadata.flyProcessGroup)
        ?? current.processGroup,
      platformVersion:
        text(metadata.fly_platform_version ?? metadata.flyPlatformVersion)
        ?? current.platformVersion,
    },
  };
}

function machineFailure(
  snapshot: FlyMachineSnapshotV2,
  candidate: CandidateFence,
  baseline: FlyMachineSnapshotV2 | null,
): string {
  if (!snapshot.ok) return snapshot.reason ?? "machine_snapshot_unavailable";
  const current = snapshot.machineState;
  if (current === null) return "machine_snapshot_unavailable";

  const expected = expectedCandidateImageV2(candidate).toLowerCase();
  if (current.image?.toLowerCase() !== expected) {
    return `machine_image_not_converged:${current.image ?? "unknown"}`;
  }
  if (current.processGroup !== "app") {
    return `machine_process_group_not_converged:${current.processGroup ?? "unknown"}`;
  }
  if (current.platformVersion !== "v2") {
    return `machine_platform_version_not_converged:${current.platformVersion ?? "unknown"}`;
  }
  if (current.imageDigest === null) return "machine_image_digest_unavailable";
  if (!DIGEST.test(current.imageDigest)) return `machine_image_digest_invalid:${current.imageDigest}`;
  if (
    candidate.imageDigest !== undefined
    && current.imageDigest.toLowerCase() !== candidate.imageDigest.toLowerCase()
  ) return `machine_image_digest_not_expected:${current.imageDigest}`;
  if (current.version === null) return "machine_version_unavailable";
  if (current.releaseId === null) return "machine_release_id_unavailable";
  if (current.releaseVersion === null) return "machine_release_version_unavailable";

  const previous = baseline?.machineState ?? null;
  if (previous !== null && previous.image?.toLowerCase() !== expected) {
    if (!complete(previous)) return "baseline_machine_identity_incomplete";
    if (current.version === previous.version) return `machine_version_not_advanced:${current.version}`;
    if (current.releaseId === previous.releaseId) return `machine_release_not_advanced:${current.releaseId}`;
    if (!releaseVersionAdvanced(previous.releaseVersion, current.releaseVersion)) {
      return `machine_release_version_not_advanced:${current.releaseVersion}`;
    }
    if (current.imageDigest.toLowerCase() === previous.imageDigest.toLowerCase()) {
      return `machine_image_digest_not_advanced:${current.imageDigest}`;
    }
  }
  return "machine_configuration_not_converged";
}

function image(
  config: Record<string, unknown>,
  outer: Record<string, unknown>,
  ref: Record<string, unknown>,
): string | null {
  const direct = text(config.image ?? outer.image);
  if (direct) return direct;
  const registry = text(ref.registry);
  const repository = text(ref.repository);
  const tag = text(ref.tag);
  return registry && repository && tag ? `${registry}/${repository}:${tag}` : null;
}

function complete(state: FlyMachineStateV2 | null): state is FlyMachineStateV2 & {
  image: string;
  imageDigest: string;
  version: string;
  releaseId: string;
  releaseVersion: string;
  processGroup: string;
  platformVersion: string;
} {
  return state !== null
    && state.image !== null
    && state.imageDigest !== null
    && DIGEST.test(state.imageDigest)
    && state.version !== null
    && state.releaseId !== null
    && state.releaseVersion !== null
    && state.processGroup !== null
    && state.platformVersion !== null;
}

function releaseVersionAdvanced(previous: string, current: string): boolean {
  if (/^[0-9]+$/.test(previous) && /^[0-9]+$/.test(current)) {
    return Number.parseInt(current, 10) > Number.parseInt(previous, 10);
  }
  return current !== previous;
}

function pending(
  started: number,
  now: number,
  snapshot: FlyMachineSnapshotV2,
  reason: string,
): DeploymentConvergenceEvidence {
  return {
    status: "PENDING",
    reason,
    elapsedMs: now - started,
    machineState: snapshot.machineState,
    runtimeIdentity: null,
  };
}

function run(args: readonly string[], token: string): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(
      "flyctl",
      [...args],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          TMPDIR: process.env.TMPDIR ?? "",
          FLY_API_TOKEN: token,
          FLY_NO_UPDATE_CHECK: "1",
          NO_COLOR: "1",
        },
        timeout: 20_000,
        maxBuffer: OUTPUT_LIMIT,
        shell: false,
      },
      (error, stdout) => {
        resolve({
          ok: error === null,
          out: redact(String(stdout ?? ""), token).slice(0, OUTPUT_LIMIT),
        });
      },
    );
  });
}

function bad(reason: string): FlyMachineSnapshotV2 {
  return { ok: false, reason, machineState: null };
}

function empty(machineCount: number): FlyMachineStateV2 {
  return {
    machineCount,
    machineId: null,
    state: null,
    region: null,
    version: null,
    image: null,
    imageDigest: null,
    releaseId: null,
    releaseVersion: null,
    processGroup: null,
    platformVersion: null,
  };
}

function parseConfig(value: string): unknown | null {
  const direct = parse(value);
  if (direct !== null) return direct;
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  return start >= 0 && end > start ? parse(value.slice(start, end + 1)) : null;
}

function parse(value: string): unknown | null {
  try {
    return value.trim() ? JSON.parse(value) as unknown : null;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scalar(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_required`);
  return value;
}

function redact(value: string, secret: string): string {
  return secret ? value.split(secret).join("[REDACTED]") : value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
