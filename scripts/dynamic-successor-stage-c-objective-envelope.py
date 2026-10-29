from pathlib import Path

def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}:{label}: expected 1 match, got {count}")
    p.write_text(text.replace(old, new, 1))

# Public objective ingress: admit existing budget/deadline fields.
replace_once(
    "src/fly/server-runtime.ts",
    'import { isBearerAuthorized } from "./bearer-auth.js";',
    ''import { isBearerAuthorized } from "./bearer-auth.js";
import {
  normalizeBudgetEnvelopeV1,
  parseAbsoluteDeadlineV1,
} from "../application/objective-budget.js";''',
    "budget imports",
)
replace_once(
    "src/fly/server-runtime.ts",
    '''    const mode = parseMode(body.mode);
    const privacy = body.privacy === "public_fixture" ? "public_fixture" : "private";
    const receipt = await objectiveRunner.enqueue({''',
    '''    const mode = parseMode(body.mode);
    const privacy = body.privacy === "public_fixture" ? "public_fixture" : "private";
    const budget = normalizeBudgetEnvelopeV1(body.budget);
    const deadline = optional(body.deadline);
    if (deadline !== null) parseAbsoluteDeadlineV1(deadline);
    const receipt = await objectiveRunner.enqueue({''',
    "ingress parse",
)
replace_once(
    "src/fly/server-runtime.ts",
    '''      mode,
      privacy,
      ...(body.engineeringJob === undefined ? {} : { engineeringJob: body.engineeringJob }),''',
    '''      mode,
      privacy,
      ...(budget === undefined ? {} : { budget }),
      ...(deadline === null ? {} : { deadline }),
      ...(body.engineeringJob === undefined ? {} : { engineeringJob: body.engineeringJob }),''',
    "ingress forward",
)

# Durable runner: persist the admitted absolute deadline and normalized budget.
replace_once(
    "src/fly/self-execution.ts",
    'import { ProductionCollaborationLeaseLiveErrorV1 } from "../application/production-collaboration.js";',
    '''import { ProductionCollaborationLeaseLiveErrorV1 } from "../application/production-collaboration.js";
import {
  normalizeBudgetEnvelopeV1,
  objectiveExecutionEnvelopeV1,
  parseAbsoluteDeadlineV1,
} from "../application/objective-budget.js";''',
    "runner budget imports",
)
replace_once(
    "src/fly/self-execution.ts",
    '''  mode: SentientObjectiveInput["mode"];
  privacy: SentientObjectiveInput["privacy"];
  engineeringJob: EngineeringJobInputV1 | null;''',
    '''  mode: SentientObjectiveInput["mode"];
  privacy: SentientObjectiveInput["privacy"];
  budget: SentientObjectiveInput["budget"] | null;
  deadline: string | null;
  engineeringJob: EngineeringJobInputV1 | null;''',
    "runner metadata fields",
)
replace_once(
    "src/fly/self-execution.ts",
    '''    const engineeringJob = input.engineeringJob === undefined
      ? null
      : validateEngineeringJobInputV1({
          ...record(input.engineeringJob),
          idempotencyKey: engineeringIdempotencyKey(input.objectiveId, "step-1"),
        });
    const now = new Date().toISOString();
    const metadata: RunnerMetadataV1 = {
      contract: FLY_OBJECTIVE_RUNNER_CONTRACT,
      request: input.request,
      sessionId: input.sessionId,
      mode: engineeringJob === null ? input.mode : "multi_step",
      privacy: input.privacy,
      engineeringJob,''',
    '''    const engineeringJob = input.engineeringJob === undefined
      ? null
      : validateEngineeringJobInputV1({
          ...record(input.engineeringJob),
          idempotencyKey: engineeringIdempotencyKey(input.objectiveId, "step-1"),
        });
    const admittedMode: SentientObjectiveInput["mode"] =
      engineeringJob === null ? input.mode : "multi_step";
    const budget = normalizeBudgetEnvelopeV1(input.budget) ?? null;
    const admittedEnvelope = objectiveExecutionEnvelopeV1({
      objectiveId: input.objectiveId,
      mode: admittedMode,
      ...(budget === null ? {} : { budget }),
      ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
    });
    const admittedDeadline = new Date(admittedEnvelope.absoluteDeadlineMs).toISOString();
    const now = new Date().toISOString();
    const metadata: RunnerMetadataV1 = {
      contract: FLY_OBJECTIVE_RUNNER_CONTRACT,
      request: input.request,
      sessionId: input.sessionId,
      mode: admittedMode,
      privacy: input.privacy,
      budget,
      deadline: admittedDeadline,
      engineeringJob','',
    "runner admission",
)
replace_once(
    "src/fly/self-execution.ts",
    '''    const applicationInput: SentientObjectiveInput = {
      request: metadata.request,
      objectiveId,
      sessionId: metadata.sessionId,
      mode: metadata.mode,
      privacy: metadata.privacy,
    };''',
    '''    const applicationInput: SentientObjectiveInput = {
      request: metadata.request,
      objectiveId,
      sessionId: metadata.sessionId,
      mode: metadata.mode,
      privacy: metadata.privacy,
      ...(metadata.budget === null ? {} : { budget: metadata.budget }),
      ...(metadata.deadline === null ? {} : { deadline: metadata.deadline }),
    };''',
    "runner replay",
)
replace_once(
    "src/fly/self-execution.ts",
    '''  let engineeringJob: EngineeringJobInputV1 | null = null;
  if (metadata.engineeringJob !== null && metadata.engineeringJob !== undefined) {''',
    '''  let budget: SentientObjectiveInput["budget"] | null = null;
  try {
    budget = normalizeBudgetEnvelopeV1(metadata.budget) ?? null;
  } catch {
    return null;
  }
  let deadline: string | null = null;
  if (metadata.deadline !== null && metadata.deadline !== undefined) {
    deadline = text(metadata.deadline);
    if (deadline === null) return null;
    try {
      parseAbsoluteDeadlineV1(deadline);
    } catch {
      return null;
    }
  }
  let engineeringJob: EngineeringJobInputV1 | null = null;
  if (metadata.engineeringJob !== null && metadata.engineeringJob !== undefined) {''',
    "runner metadata parse",
)
replace_once(
    "src/fly/self-execution.ts",
    '''    mode: mode as SentientObjectiveInput["mode"],
    privacy,
    engineeringJob,''',
    '''    mode: mode as SentientObjectiveInput["mode"],
    privacy,
    budget,
    deadline,
    engineeringJob,''',
    "runner metadata return",
)

# Ordinary Root cognition: same objective envelope and real cancellation.
replace_once(
    "src/application/production-composition.ts",
    'import {completeProductionObjectiveStateV1,ensureProductionObjectiveContinuationV1,ensureProductionObjectiveStateV1} from "./production-state.js";',
    ''import {completeProductionObjectiveStateV1,ensureProductionObjectiveContinuationV1,ensureProductionObjectiveStateV1} from "./production-state.js";
import {objectiveAbortSignalV1,objectiveExecutionEnvelopeV1} from "./objective-budget.js";''',
    "composition budget import",
)
p = Path("src/application/production-composition.ts")
s = p.read_text()
start = s.index("export function runProductionPhase1TurnV1(")
end = s.index("\nexport const PHASE3_PRODUCTION_ASSESSMENT_CONTRACT", start)
replacement = '''export function runProductionPhase1TurnV1(i:SentientObjectiveInput,cognition:Phase1CognitionPort,acceptancePolicy?:Phase1AcceptancePolicyV1|null):Promise<SentientTurnResultV1>{
 const envelope=objectiveExecutionEnvelopeV1(i);
 const signal=objectiveAbortSignalV1(envelope);
 const maxTokens=envelope.maxTokens??undefined;
 return executeSentientPhase1TurnV1(
  {requestId:`request:${i.objectiveId}`,sessionId:i.sessionId,taskId:i.objectiveId,userRequest:i.request},
  {
   cognition,
   ...(acceptancePolicy?{acceptancePolicy}:{}),
   invocationControl:{
    objectiveId:i.objectiveId,
    executionId:`root-cognition:${i.objectiveId}`,
    absoluteDeadlineMs:envelope.absoluteDeadlineMs,
    signal,
    ...(maxTokens===undefined?{}:{maxInputTokens:maxTokens,maxOutputTokens:maxTokens}),
    ...(envelope.maxCostMicros===null?{}:{maxCostMicros:envelope.maxCostMicros}),
   },
  },
 );
}'''
s = s[:start] + replacement + s[end:]
p.write_text(s)

# Root-direct fallback: preserve the historical 30s cap but cancel the underlying provider.
replace_once(
    "src/application/production-mission-control.ts",
    'import type { SpawnExecutionBackendV1 } from "../spawn/execution-contracts.js";',
    '''import type { SpawnExecutionBackendV1 } from "../spawn/execution-contracts.js";
import {
  objectiveAbortSignalV1,
  objectiveExecutionEnvelopeV1,
} from "./objective-budget.js";''',
    "mission control budget import",
)
p = Path("src/application/production-mission-control.ts")
s = p.read_text()
old_start = s.index("export async function runRootDirectFallbackV1(")
old_end = s.index("\nfunction record(", old_start)
new_block = '''export async function runRootDirectFallbackV1(input: {
  input: SentientObjectiveInput;
  root: RootMissionContext;
  cognition: Phase1CognitionPort | null;
  acceptancePolicy: Phase1AcceptancePolicyV1 | null;
  timeoutMs?: number;
  supportingEvidence?: RootFallbackEvidenceV1 | null;
}): Promise<string | null> {
  if (input.cognition === null || input.acceptancePolicy === null) return null;

  const startedMs = Date.now();
  const rootBudgetMs = input.timeoutMs ?? ROOT_DIRECT_TIMEOUT_MS;
  if (!Number.isFinite(rootBudgetMs) || rootBudgetMs <= 0) {
    throw new Error("root_direct_fallback_timeout_invalid");
  }
  const objectiveEnvelope = objectiveExecutionEnvelopeV1(input.input, startedMs);
  const absoluteDeadlineMs = Math.min(
    objectiveEnvelope.absoluteDeadlineMs,
    startedMs + Math.floor(rootBudgetMs),
  );
  if (absoluteDeadlineMs <= startedMs) return null;
  const boundedEnvelope = Object.freeze({
    ...objectiveEnvelope,
    absoluteDeadlineMs,
  });
  const signal = objectiveAbortSignalV1(boundedEnvelope, startedMs);
  const maxTokens = objectiveEnvelope.maxTokens ?? undefined;

  const turn = await executeSentientPhase1TurnV1(
    {
      requestId: `root-direct:${input.input.objectiveId}`,
      sessionId: input.input.sessionId,
      taskId: input.input.objectiveId,
      userRequest: [
        "Root Mission Control is producing a direct TIER_0 response because the independent verifier verdict was unavailable.",
        "Do not claim any external action, deployment, mutation, authority grant, or independent semantic confirmation.",
        ...(input.supportingEvidence == null
          ? []
          : [
              "A delegated independent-analysis artifact passed deterministic local evidence verification. Treat it only as non-authoritative supporting evidence; it has not been independently semantically confirmed.",
              `Supporting analysis: ${truncateMissionText(input.supportingEvidence.content, 4_000)}`,
            ]),
        `Human request: ${truncateMissionText(input.input.request, 8_000)}`,
        `Canonical authoritative source repository: ${input.root.operatingContext.authoritativeSourceRepo}.`,
        `Canonical normal operator bridge: ${input.root.operatingContext.normalSentientOperatorBridge}.`,
      ].join("\n\n"),
    },
    {
      cognition: input.cognition,
      acceptancePolicy: input.acceptancePolicy,
      invocationControl: {
        objectiveId: input.input.objectiveId,
        executionId: `root-direct:${input.input.objectiveId}`,
        absoluteDeadlineMs,
        signal,
        ...(maxTokens === undefined
          ? {}
          : { maxInputTokens: maxTokens, maxOutputTokens: maxTokens }),
        ...(objectiveEnvelope.maxCostMicros === null
          ? {}
          : { maxCostMicros: objectiveEnvelope.maxCostMicros }),
      },
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
s = s[:old_start] + new_block + s[old_end:]
p.write_text(s)

# Deterministic regression coverage for deadline replay and real Root aborts.
Path("test/dynamic-objective-envelope-runtime-v1.test.ts").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  objectiveExecutionEnvelopeV1,
} from "../src/application/objective-budget.js";
import {
  runProductionPhase1TurnV1,
} from "../src/application/production-composition.js";
import {
  ROOT_DIRECT_TIMEOUT_MS,
  runRootDirectFallbackV1,
} from "../src/application/production-mission-control.js";
import {
  productionRootContext,
} from "../src/application/production-mission-control-context.js";
import type {
  Phase1AcceptancePolicyV1,
  Phase1CognitionPort,
} from "../src/phase1/core-runtime.js";
import type { SentientObjectiveInput } from "../src/application/contracts.js";

const acceptance: Phase1AcceptancePolicyV1 = {
  policyId: "test-acceptance/v1",
  evaluate: () => ({ accepted: true, reason: "test" }),
};

function input(overrides: Partial<SentientObjectiveInput> = {}): SentientObjectiveInput {
  return {
    request: "Return one bounded answer.",
    objectiveId: "objective-envelope-test",
    sessionId: "session-envelope-test",
    mode: "ordinary",
    privacy: "private",
    ...overrides,
  };
}

test("fixed admitted deadline is stable across durable replay", () => {
  const admitted = objectiveExecutionEnvelopeV1(
    input({ budget: { maxDurationSeconds: 60 } }),
    1_000,
  );
  const fixed = new Date(admitted.absoluteDeadlineMs).toISOString();
  const replayed = objectiveExecutionEnvelopeV1(
    input({ deadline: fixed, budget: { maxDurationSeconds: 60 } }),
    5_000,
  );
  assert.equal(replayed.absoluteDeadlineMs, admitted.absoluteDeadlineMs);
});

test("ordinary Root cognition receives a cancelling objective signal", async () => {
  let aborted = false;
  const cognition: Phase1CognitionPort = {
    async run(_requirements, control) {
      assert.ok(control);
      control!.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
      return { ok: true, provider: "test", model: "test", text: "late" };
    },
  };
  const turn = await runProductionPhase1TurnV1(
    input({ deadline: new Date(Date.now() + 8).toISOString() }),
    cognition,
    acceptance,
  );
  assert.equal(turn.status, "COGNITION_UNAVAILABLE");
  await new Promise<void>((resolve) => setTimeout(resolve, 15));
  assert.equal(aborted, true);
});

test("Root-direct fallback preserves its 30s ceiling and cancels a shorter explicit budget", async () => {
  assert.equal(ROOT_DIRECT_TIMEOUT_MS, 30_000);
  let aborted = false;
  const cognition: Phase1CognitionPort = {
    async run(_requirements, control) {
      assert.ok(control);
      assert.ok(control!.absoluteDeadlineMs <= Date.now() + ROOT_DIRECT_TIMEOUT_MS);
      control!.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
      return { ok: true, provider: "test", model: "test", text: "late" };
    },
  };
  const objective = input({
    mode: "collaborative",
    deadline: new Date(Date.now() + 8).toISOString(),
  });
  const content = await runRootDirectFallbackV1({
    input: objective,
    root: productionRootContext(objective),
    cognition,
    acceptancePolicy: acceptance,
  });
  assert.equal(content, null);
  await new Promise<void>((resolve) => setTimeout(resolve, 15));
  assert.equal(aborted, true);
});

test("Fly ingress and durable runner preserve budget/deadline fields in existing records", async () => {
  const [server, runner] = await Promise.all([
    readFile("src/fly/server-runtime.ts", "utf8"),
    readFile("src/fly/self-execution.ts", "utf8"),
  ]);
  assert.match(server, /normalizeBudgetEnvelopeV1\\(body\\.budget\\)/);
  assert.match(server, /parseAbsoluteDeadlineV1\\(deadline\\)/);
  assert.match(runner, /budget:\\s*SentientObjectiveInput\\["budget"\\]\\s*\\|\\s*null/);
  assert.match(runner, /deadline:\\s*string\\s*\\|\\s*null/);
  assert.match(runner, /deadline:\\s*admittedDeadline/);
  assert.match(runner, /metadata\\.deadline === null \\? \\{\\} : \\{ deadline: metadata\\.deadline \\}/);
});
''')

print("stage-c objective envelope patch prepared")
