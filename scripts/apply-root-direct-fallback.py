from pathlib import Path

mission = Path("src/application/production-mission-control.ts")
text = mission.read_text()

constant_anchor = """export const ACCEPTED_OPERATING_CONTEXT_DIGEST =
  "sha256:ef32887bbc1736dce2ed5a73a90a628160edede479bd686ce47cdf0f7507e209" as const;
"""
if "ROOT_DIRECT_TIMEOUT_MS" not in text:
    if constant_anchor not in text:
        raise SystemExit("operating_context_constant_anchor_not_found")
    text = text.replace(
        constant_anchor,
        constant_anchor + "\nexport const ROOT_DIRECT_TIMEOUT_MS = 30_000 as const;\n",
        1,
    )

start = text.index("export async function runRootDirectFallbackV1(")
end = text.index("\nfunction record(", start)

replacement = r"""export async function runRootDirectFallbackV1(input: {
  input: SentientObjectiveInput;
  root: RootMissionContext;
  cognition: Phase1CognitionPort | null;
  acceptancePolicy: Phase1AcceptancePolicyV1 | null;
  timeoutMs?: number;
}): Promise<string | null> {
  if (input.cognition === null || input.acceptancePolicy === null) return null;

  const turn = await withRootDirectTimeoutV1(
    executeSentientPhase1TurnV1(
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
    ),
    input.timeoutMs ?? ROOT_DIRECT_TIMEOUT_MS,
  );
  if (turn === null) return null;

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

async function withRootDirectTimeoutV1<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("root_direct_fallback_timeout_invalid");
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
"""

mission.write_text(text[:start] + replacement + text[end:])

test_path = Path("test/root-direct-fallback.test.ts")
test = test_path.read_text()
addition = r"""
test("Root direct fallback returns unavailable within a bounded deadline when cognition stalls", async () => {
  const stalled: Phase1CognitionPort = {
    async run() {
      return await new Promise<never>(() => undefined);
    },
  };

  const content = await Promise.race([
    runRootDirectFallbackV1({
      input: objective,
      root: productionRootContext(objective),
      cognition: stalled,
      acceptancePolicy: accept,
      timeoutMs: 5,
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("root_direct_stall_test_exceeded_bound")), 250);
    }),
  ]);

  assert.equal(content, null);
});
"""
if "returns unavailable within a bounded deadline when cognition stalls" not in test:
    test_path.write_text(test.rstrip() + "\n\n" + addition.lstrip())
