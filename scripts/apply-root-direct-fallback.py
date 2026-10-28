from pathlib import Path

mc = Path("src/application/production-mission-control.ts")
text = mc.read_text()

text = text.replace(
'''import type {
  SentientApplicationIdentity,
  SentientObjectiveInput,
} from "./contracts.js";
''',
'''import type {
  SentientApplicationIdentity,
  SentientObjectiveInput,
} from "./contracts.js";
import {
  executeSentientPhase1TurnV1,
  type Phase1AcceptancePolicyV1,
  type Phase1CognitionPort,
} from "../phase1/core-runtime.js";
''')

text = text.replace(
'''  readonly #spawnBackends: readonly SpawnExecutionBackendV1[];
  readonly #identity: SentientApplicationIdentity;
  readonly #collaboration: PostgresCollaborationStore;
''',
'''  readonly #spawnBackends: readonly SpawnExecutionBackendV1[];
  readonly #identity: SentientApplicationIdentity;
  readonly #rootCognition: Phase1CognitionPort | null;
  readonly #rootAcceptancePolicy: Phase1AcceptancePolicyV1 | null;
  readonly #collaboration: PostgresCollaborationStore;
''')

text = text.replace(
'''    spawnBackends: readonly SpawnExecutionBackendV1[];
    identity: SentientApplicationIdentity;
  }) {
''',
'''    spawnBackends: readonly SpawnExecutionBackendV1[];
    identity: SentientApplicationIdentity;
    rootCognition?: Phase1CognitionPort | null;
    rootAcceptancePolicy?: Phase1AcceptancePolicyV1 | null;
  }) {
''')

text = text.replace(
'''    this.#state = input.state;
    this.#spawnBackends = input.spawnBackends;
    this.#identity = input.identity;
    this.#collaboration = new PostgresCollaborationStore(this.#pool);
''',
'''    this.#state = input.state;
    this.#spawnBackends = input.spawnBackends;
    this.#identity = input.identity;
    this.#rootCognition = input.rootCognition ?? null;
    this.#rootAcceptancePolicy = input.rootAcceptancePolicy ?? null;
    this.#collaboration = new PostgresCollaborationStore(this.#pool);
''')

text = text.replace(
'''    const row = record(result);
    const converged = row.status === "CONVERGED";
    const evidenceRefs = strings(row.evidenceRefs);
''',
'''    const row = record(result);
    const collaborationStatus = typeof row.status === "string" ? row.status : null;
    const converged = collaborationStatus === "CONVERGED";
    const rootDirectContent =
      !converged && collaborationStatus === "UNAVAILABLE"
        ? await runRootDirectFallbackV1({
            input,
            root,
            cognition: this.#rootCognition,
            acceptancePolicy: this.#rootAcceptancePolicy,
          })
        : null;
    const succeeded = converged || rootDirectContent !== null;
    const evidenceRefs = strings(row.evidenceRefs);
''')

text = text.replace(
'''    const authoritativeContent =
      typeof row.authoritativeContent === "string" && row.authoritativeContent.trim()
        ? row.authoritativeContent.trim()
        : null;
''',
'''    const authoritativeContent =
      converged && typeof row.authoritativeContent === "string" && row.authoritativeContent.trim()
        ? row.authoritativeContent.trim()
        : rootDirectContent;
''')

text = text.replace(
'''      details: {
        status: converged ? "SUCCEEDED" : "NOT_CONVERGED",
        acceptedEvidenceCount: converged ? workers.length : 0,
      },
''',
'''      details: {
        status: succeeded ? "SUCCEEDED" : "NOT_CONVERGED",
        acceptedEvidenceCount: converged ? workers.length : 0,
        executionMode: converged
          ? "VERIFIED_COLLABORATION"
          : rootDirectContent !== null
            ? "ROOT_DIRECT_FALLBACK"
            : "NO_RESULT",
      },
''')

text = text.replace(
'''      status: converged ? "SUCCEEDED" : "NOT_CONVERGED",
      authorityOwner: "SENTIENT_RUNTIME",
      rootProjection,
      authoritativeResultRef:
        typeof row.authoritativeResultRef === "string" ? row.authoritativeResultRef : null,
''',
'''      status: succeeded ? "SUCCEEDED" : "NOT_CONVERGED",
      authorityOwner: "SENTIENT_RUNTIME",
      rootProjection,
      authoritativeResultRef:
        converged && typeof row.authoritativeResultRef === "string"
          ? row.authoritativeResultRef
          : rootDirectContent !== null
            ? `sentient-root-direct:${input.objectiveId}`
            : null,
''')

marker = '''function record(value: unknown): Record<string, unknown> {
'''
helper = r'''export async function runRootDirectFallbackV1(input: {
  input: SentientObjectiveInput;
  root: RootMissionContext;
  cognition: Phase1CognitionPort | null;
  acceptancePolicy: Phase1AcceptancePolicyV1 | null;
}): Promise<string | null> {
  if (input.cognition === null || input.acceptancePolicy === null) return null;

  const turn = await executeSentientPhase1TurnV1(
    {
      requestId: `root-direct:${input.input.objectiveId}`,
      sessionId: input.input.sessionId,
      taskId: input.input.objectiveId,
      userRequest: [
        "Root Mission Control is producing a direct TIER_0 response because optional delegated evidence was unavailable.",
        "Do not claim any external action, deployment, mutation, authority grant, or verified child evidence.",
        `Human request: ${truncateMissionText(input.input.request, 8_000)}`,
        `Canonical authoritative source repository: ${input.root.operatingContext.authoritativeSourceRepo}.`,
        `Canonical normal operator bridge: ${input.root.operatingContext.normalSentientOperatorBridge}.`,
      ].join("\n\n"),
    },
    {
      cognition: input.cognition,
      acceptancePolicy: input.acceptancePolicy,
    },
  );

  const content =
    turn.status === "RESPONDED" && typeof turn.authoritativeContent === "string"
      ? turn.authoritativeContent.trim()
      : "";
  if (!content) return null;

  return [
    content,
    `Canonical operating context: authoritative source repository ${input.root.operatingContext.authoritativeSourceRepo}; normal operator bridge ${input.root.operatingContext.normalSentientOperatorBridge}.`,
  ].join("\n\n");
}

'''
assert marker in text
text = text.replace(marker, helper + marker)
mc.write_text(text)

runtime = Path("src/fly/production-runtime.ts")
r = runtime.read_text()
old = '''    : new ProductionMissionControlV1({ databaseUrl, state, spawnBackends, identity });
'''
new = '''    : new ProductionMissionControlV1({
        databaseUrl,
        state,
        spawnBackends,
        identity,
        rootCognition: cognition,
        rootAcceptancePolicy: phase1AcceptancePolicy,
      });
'''
assert old in r
runtime.write_text(r.replace(old, new))

test = Path("test/root-direct-fallback.test.ts")
test.write_text(r'''import assert from "node:assert/strict";
import test from "node:test";

import { productionRootContext } from "../src/application/production-mission-control-context.js";
import { runRootDirectFallbackV1 } from "../src/application/production-mission-control.js";
import type {
  Phase1AcceptancePolicyV1,
  Phase1CognitionPort,
} from "../src/phase1/core-runtime.js";

const objective = {
  request: "Inspect the current system and identify the highest-value safe improvement.",
  objectiveId: "root-direct-fallback-test",
  sessionId: "session:root-direct-fallback-test",
  mode: "collaborative" as const,
  privacy: "private" as const,
};

const cognition: Phase1CognitionPort = {
  async run() {
    return {
      ok: true,
      provider: "test-local",
      model: "test-model",
      revision: "test-revision",
      text: "Prioritize the smallest verified repair that restores the user-facing objective path.",
    };
  },
};

const accept: Phase1AcceptancePolicyV1 = {
  policyId: "root-direct-fallback-test-policy",
  evaluate() {
    return { accepted: true, reason: "bounded test proposal accepted" };
  },
};

test("Root direct fallback uses accepted cognition and canonical operating context", async () => {
  const content = await runRootDirectFallbackV1({
    input: objective,
    root: productionRootContext(objective),
    cognition: cognition,
    acceptancePolicy: accept,
  });

  assert.ok(content);
  assert.match(content, /smallest verified repair/i);
  assert.match(content, /riggeyb\/sentient/);
  assert.match(content, /riggeyb\/sentient-fly-runner/);
});

test("Root direct fallback remains fail-closed when acceptance rejects", async () => {
  const reject: Phase1AcceptancePolicyV1 = {
    policyId: "root-direct-fallback-reject-policy",
    evaluate() {
      return { accepted: false, reason: "reject for test" };
    },
  };
  const content = await runRootDirectFallbackV1( {
    input: objective,
    root: productionRootContext(objective),
    cognition,
    acceptancePolicy: reject,
  });
  assert.equal(content, null);
});

test("Root direct fallback requires an explicitly wired cognition and acceptance policy", async () => {
  const root = productionRootContext(objective);
  assert.equal(await runRootDirectFallbackV1({
    input: objective,
    root,
    cognition: null,
    acceptancePolicy: accept,
  }), null);
  assert.equal(await runRootDirectFallbackV1({
    input: objective,
    root,
    cognition,
    acceptancePolicy: null,
  }), null);
});
