from pathlib import Path

def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

replace_once(
    "src/application/production-collaboration.ts",
    'maxOutputTokens: role === "independent-verification" ? 8 : 64,',
    'maxOutputTokens: role === "independent-verification" ? 8 : 32,',
)

replace_once(
    "test/job2-production-convergence.test.ts",
    'assert.match(collaboration, /maxOutputTokens:\\s*role === "independent-verification" \\? 8 : 64/);',
    'assert.match(collaboration, /maxOutputTokens:\\s*role === "independent-verification" \\? 8 : 32/);',
)

replace_once(
    "src/application/production-mission-control.ts",
    'import { missionControlRecords } from "sentient-orchestrator/mission-control-coordination";',
    '''import {
  missionControlRecords,
  type MissionControlRecord,
} from "sentient-orchestrator/mission-control-coordination";''',
)

replace_once(
    "src/application/production-mission-control.ts",
    '''    }

    const collaborationInput: ProductionCollaborationInputV1 = {''',
    '''    }

    const persistedCompletion = persistedRootCompletionV1(
      missionControlRecords(await this.#coordination.history(sessionId)),
      root.workerId,
    );
    if (persistedCompletion !== null) {
      const rootProjection = await this.#project(root, sessionId);
      return Object.freeze({
        contractVersion: PRODUCTION_MISSION_CONTROL_CONTRACT,
        objectiveId: input.objectiveId,
        status: persistedCompletion.status,
        authorityOwner: "SENTIENT_RUNTIME",
        rootProjection,
        authoritativeResultRef: persistedCompletion.authoritativeResultRef,
        authoritativeContent: persistedCompletion.authoritativeContent,
        workerEffectsCanonical: false,
        operatingContextIsNotAuthority: true,
      });
    }

    const collaborationInput: ProductionCollaborationInputV1 = {''',
)

replace_once(
    "src/application/production-mission-control.ts",
    '''    const authoritativeContent =
      converged && typeof row.authoritativeContent === "string" && row.authoritativeContent.trim()
        ? row.authoritativeContent.trim()
        : rootDirectContent;

    await publishMissionEvent({''',
    '''    const authoritativeContent =
      converged && typeof row.authoritativeContent === "string" && row.authoritativeContent.trim()
        ? row.authoritativeContent.trim()
        : rootDirectContent;
    const authoritativeResultRef =
      converged && typeof row.authoritativeResultRef === "string"
        ? row.authoritativeResultRef
        : rootDirectContent !== null
          ? `sentient-root-direct:${input.objectiveId}`
          : null;

    await publishMissionEvent({''',
)

replace_once(
    "src/application/production-mission-control.ts",
    '''        executionMode: converged
          ? "VERIFIED_COLLABORATION"
          : rootDirectContent !== null
            ? "ROOT_DIRECT_FALLBACK"
            : "NO_RESULT",
      },''',
    '''        executionMode: converged
          ? "VERIFIED_COLLABORATION"
          : rootDirectContent !== null
            ? "ROOT_DIRECT_FALLBACK"
            : "NO_RESULT",
        ...(authoritativeResultRef !== null ? { authoritativeResultRef } : {}),
      },''',
)

replace_once(
    "src/application/production-mission-control.ts",
    '''      authoritativeResultRef:
        converged && typeof row.authoritativeResultRef === "string"
          ? row.authoritativeResultRef
          : rootDirectContent !== null
            ? `sentient-root-direct:${input.objectiveId}`
            : null,
      authoritativeContent,''',
    '''      authoritativeResultRef,
      authoritativeContent,''',
)

helper = r'''export interface PersistedRootCompletionV1 {
  status: "SUCCEEDED" | "NOT_CONVERGED";
  authoritativeContent: string;
  authoritativeResultRef: string | null;
  acceptedEvidenceCount: number;
  executionMode: "VERIFIED_COLLABORATION" | "ROOT_DIRECT_FALLBACK" | "NO_RESULT";
}

export function persistedRootCompletionV1(
  records: readonly MissionControlRecord[],
  rootWorkerId: string,
): PersistedRootCompletionV1 | null {
  const record = [...records].reverse().find((candidate) =>
    candidate.event.type === "ORCHESTRATOR_COMPLETE"
    && candidate.event.workerId === rootWorkerId
    && candidate.senderRole === "INTEGRATOR");
  if (!record) return null;

  const details = record.event.details ?? {};
  const status = details.status;
  const acceptedEvidenceCount = details.acceptedEvidenceCount;
  const executionMode = details.executionMode;
  if (status !== "SUCCEEDED" && status !== "NOT_CONVERGED") {
    throw new Error("persisted_root_completion_status_invalid");
  }
  if (
    executionMode !== "VERIFIED_COLLABORATION"
    && executionMode !== "ROOT_DIRECT_FALLBACK"
    && executionMode !== "NO_RESULT"
  ) {
    throw new Error("persisted_root_completion_execution_mode_invalid");
  }
  if (
    typeof acceptedEvidenceCount !== "number"
    || !Number.isSafeInteger(acceptedEvidenceCount)
    || acceptedEvidenceCount < 0
  ) {
    throw new Error("persisted_root_completion_evidence_count_invalid");
  }
  if (
    (status === "SUCCEEDED" && executionMode === "NO_RESULT")
    || (status === "NOT_CONVERGED" && executionMode !== "NO_RESULT")
  ) {
    throw new Error("persisted_root_completion_status_mode_mismatch");
  }

  const authoritativeContent = record.event.summary.trim();
  if (!authoritativeContent) {
    throw new Error("persisted_root_completion_content_missing");
  }
  const explicitRef =
    typeof details.authoritativeResultRef === "string"
    && details.authoritativeResultRef.trim()
      ? details.authoritativeResultRef.trim()
      : null;
  const authoritativeResultRef =
    explicitRef
    ?? (executionMode === "ROOT_DIRECT_FALLBACK"
      ? `sentient-root-direct:${record.event.objectiveId}`
      : null);

  return Object.freeze({
    status,
    authoritativeContent,
    authoritativeResultRef,
    acceptedEvidenceCount,
    executionMode,
  });
}

''
replace_once(
    "src/application/production-mission-control.ts",
    "export interface RootFallbackEvidenceV1 {\n",
    helper + "export interface RootFallbackEvidenceV1 {\n",
)
