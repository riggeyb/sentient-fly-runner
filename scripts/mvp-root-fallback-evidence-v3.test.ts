import assert from "node:assert/strict";
import test from "node:test";

import { productionRootContext } from "../src/application/production-mission-control-context.js";
import {
  rootFallbackEvidenceV1,
  runRootDirectFallbackV1,
} from "../src/application/production-mission-control.js";
import type {
  Phase1AcceptancePolicyV1,
  Phase1CognitionPort,
} from "../src/phase1/core-runtime.js";

const objective = {
  request: "Inspect the current system and identify the highest-value safe improvement.",
  objectiveId: "fallback-evidence-test",
  sessionId: "session:fallback-evidence-test",
  mode: "collaborative" as const,
  privacy: "private" as const,
};

test("fallback evidence is restricted to verifier-unparseable deterministically verified analysis", () => {
  assert.deepEqual(
    rootFallbackEvidenceV1({
      status: "UNAVAILABLE",
      reason: "independent_verification_verdict_unparseable",
      deterministicallyVerifiedAnalysisContent: "verified analysis",
      deterministicallyVerifiedAnalysisEvidenceRefs: ["evidence:sha256:abc"],
    }),
    {
      content: "verified analysis",
      evidenceRefs: ["evidence:sha256:abc"],
    },
  );
  assert.equal(
    rootFallbackEvidenceV1({
      status: "CONFLICT",
      reason: "explicit_disagreement",
      deterministicallyVerifiedAnalysisContent: "must not pass",
      deterministicallyVerifiedAnalysisEvidenceRefs: ["evidence:x"],
    }),
    null,
  );
  assert.equal(
    rootFallbackEvidenceV1({
      status: "UNAVAILABLE",
      reason: "independent_verification_verdict_unparseable",
      deterministicallyVerifiedAnalysisContent: "missing refs",
      deterministicallyVerifiedAnalysisEvidenceRefs: [],
    }),
    null,
  );
});

test("Root fallback labels analysis as non-authoritative support and still requires acceptance", async () => {
  let prompt = "";
  const cognition: Phase1CognitionPort = {
    async run(input) {
      prompt = input.normalizedUserRequest;
      return {
        ok: true,
        provider: "test-local",
        model: "test-model",
        revision: "test-revision",
        text: "Use the smallest bounded repair.",
      };
    },
  };
  const acceptancePolicy: Phase1AcceptancePolicyV1 = {
    policyId: "fallback-evidence-test-policy",
    evaluate() {
      return { accepted: true, reason: "accepted" };
    },
  };
  const supportingEvidence = rootFallbackEvidenceV1({
    status: "UNAVAILABLE",
    reason: "independent_verification_verdict_unparseable",
    deterministicallyVerifiedAnalysisContent:
      "Inspect the verified analysis artifact.",
    deterministicallyVerifiedAnalysisEvidenceRefs: ["evidence:sha256:def"],
  });
  const content = await runRootDirectFallbackV1({
    input: objective,
    root: productionRootContext(objective),
    cognition,
    acceptancePolicy,
    supportingEvidence,
    timeoutMs: 1_000,
  });
  assert.ok(content);
  assert.match(prompt, /non-authoritative supporting evidence/i);
  assert.match(prompt, /not been independently semantically confirmed/i);
  assert.match(prompt, /Inspect the verified analysis artifact/);
});

test("Root fallback remains fail-closed when acceptance rejects supporting analysis", async () => {
  const cognition: Phase1CognitionPort = {
    async run() {
      return {
        ok: true,
        provider: "test-local",
        model: "test-model",
        revision: "test-revision",
        text: "Candidate response.",
      };
    },
  };
  const rejection: Phase1AcceptancePolicyV1 = {
    policyId: "fallback-evidence-reject-policy",
    evaluate() {
      return { accepted: false, reason: "reject" };
    },
  };
  const content = await runRootDirectFallbackV1({
    input: objective,
    root: productionRootContext(objective),
    cognition,
    acceptancePolicy: rejection,
    supportingEvidence: {
      content: "verified analysis",
      evidenceRefs: ["evidence:sha256:def"],
    },
    timeoutMs: 1_000,
  });
  assert.equal(content, null);
});
