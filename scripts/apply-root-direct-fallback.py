from pathlib import Path

mission = Path("src/application/production-mission-control.ts")
text = mission.read_text()
start = text.index("export async function runRootDirectFallbackV1(")
end = text.index("\nfunction record(", start)

replacement = r'''export async function runRootDirectFallbackV1(input: {
  input: SentientObjectiveInput;
  root: RootMissionContext;
  cognition: Phase1CognitionPort | null;
  acceptancePolicy: Phase1AcceptancePolicyV1 | null;
  timeoutMs?: number;
}): Promise<string | null> {
  if (input.cognition === null || input.acceptancePolicy === null) return null;

  let turn;
  try {
    turn = await withRootDirectTimeoutV1(
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
      input.timeoutMs ?? 30_000,
    );
  } catch (error) {
    return deterministicRootDirectFallbackV1(input.input, input.root, message(error));
  }

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

async function withRootDirectTimeoutV1<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("root_direct_fallback_timeout_invalid");
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("root_direct_fallback_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function deterministicRootDirectFallbackV1(
  input: SentientObjectiveInput,
  root: RootMissionContext,
  reason: string,
): string {
  return [
    "Root Mission Control completed a bounded TIER_0 response because optional Root cognition was unavailable within the bounded execution window.",
    "No external action, deployment, mutation, authority grant, or verified child evidence is claimed.",
    `Human request: ${truncateMissionText(input.request, 2_000)}`,
    `Canonical authoritative source repository: ${root.operatingContext.authoritativeSourceRepo}.`,
    `Canonical normal operator bridge: ${root.operatingContext.normalSentientOperatorBridge}.`,
    "Highest-value safe next improvement: inspect the most recent objective evidence and repair the smallest verified user-facing defect through the normal governed operator bridge.",
    `Fallback reason: ${truncateMissionText(reason, 240)}.`,
  ].join("\n\n");
}
'''
mission.write_text(text[:start] + replacement + text[end:])

test_path = Path("test/root-direct-fallback.test.ts")
test = test_path.read_text()
addition = r'''
test("Root direct fallback terminalizes with trusted context when cognition stalls", async () => {
  const stalled: Phase1CognitionPort = {
    async run() {
      return await new Promise<never>(() => undefined);
    },
  };
  const content = await runRootDirectFallbackV1({
    input: objective,
    root: productionRootContext(objective),
    cognition: stalled,
    acceptancePolicy: accept,
    timeoutMs: 5,
  });

  assert.ok(content);
  assert.match(content, /bounded TIER_0 response/i);
  assert.match(content, /No external action, deployment, mutation, authority grant/i);
  assert.match(content, /riggeyb\/sentient/);
  assert.match(content, /riggeyb\/sentient-fly-runner/);
});
'''
if "terminalizes with trusted context when cognition stalls" not in test:
    test_path.write_text(test.rstrip() + "\n\n" + addition.lstrip()
