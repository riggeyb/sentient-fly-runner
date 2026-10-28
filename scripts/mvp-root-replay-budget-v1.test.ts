import assert from "node:assert/strict";
import test from "node:test";

import {
  persistedRootCompletionV1,
} from "../src/application/production-mission-control.js";
import type {
  MissionControlRecord,
} from "sentient-orchestrator/mission-control-coordination";

function completion(input: {
  senderRole?: "INTEGRATOR" | "PROPOSER" | "VERIFIER";
  status?: "SUCCEEDED" | "NOT_CONVERGED";
  acceptedEvidenceCount?: number;
  executionMode?: "VERIFIED_COLLABORATION" | "ROOT_DIRECT_FALLBACK" | "NO_RESULT";
  authoritativeResultRef?: string;
  summary?: string;
} = {}): MissionControlRecord {
  return {
    messageId: "message-1",
    sequence: 1,
    createdAt: "2026-10-28T00:00:00.000Z",
    senderParticipantId: "participant-1",
    senderRole: input.senderRole ?? "INTEGRATOR",
    event: {
      type: "ORCHESTRATOR_COMPLETE",
      objectiveId: "objective-replay",
      workerId: "root:objective-replay",
      summary: input.summary ?? "Persisted Root answer.",
      details: {
        status: input.status ?? "SUCCEEDED",
        acceptedEvidenceCount: input.acceptedEvidenceCount ?? 1,
        executionMode: input.executionMode ?? "ROOT_DIRECT_FALLBACK",
        ...(input.authoritativeResultRef === undefined
          ? {}
          : { authoritativeResultRef: input.authoritativeResultRef }),
      },
    },
  };
}

test("replay preserves the first durable Root completion exactly", () => {
  assert.deepEqual(
    persistedRootCompletionV1(
      [
        completion({
          acceptedEvidenceCount: 1,
          authoritativeResultRef: "sentient-root-direct:objective-replay",
          summary: "First durable Root answer.",
        }),
      ],
      "root:objective-replay",
    ),
    {
      status: "SUCCEEDED",
      authoritativeContent: "First durable Root answer.",
      authoritativeResultRef: "sentient-root-direct:objective-replay",
      acceptedEvidenceCount: 1,
      executionMode: "ROOT_DIRECT_FALLBACK",
    },
  );
});

test("historical Root-direct replay derives only its deterministic result ref and invents no evidence", () => {
  assert.deepEqual(
    persistedRootCompletionV1(
      [
        completion({
          acceptedEvidenceCount: 0,
          summary: "Historical Root answer.",
        }),
      ],
      "root:objective-replay",
    ),
    {
      status: "SUCCEEDED",
      authoritativeContent: "Historical Root answer.",
      authoritativeResultRef: "sentient-root-direct:objective-replay",
      acceptedEvidenceCount: 0,
      executionMode: "ROOT_DIRECT_FALLBACK",
    },
  );
});

test("replay ignores non-Root completion and fails closed on inconsistent terminal metadata", () => {
  assert.equal(
    persistedRootCompletionV1(
      [completion({ senderRole: "PROPOSER" })],
      "root:objective-replay",
    ),
    null,
  );

  assert.throws(
    () => persistedRootCompletionV1(
      [
        completion({
          status: "SUCCEEDED",
          executionMode: "NO_RESULT",
          acceptedEvidenceCount: 0,
          summary: "Invalid success.",
        }),
      ],
      "root:objective-replay",
    ),
    /persisted_root_completion_status_mode_mismatch/,
  );
});
