from pathlib import Path

ROOT = Path("sentient")

def read(rel):
    return (ROOT / rel).read_text()

def write(rel, text):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)

def replace_once(rel, old, new):
    p = ROOT / rel
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{rel}: expected 1 occurrence, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))

write("src/model/model-invocation-envelope.ts", r'''export const MODEL_INVOCATION_ENVELOPE_V1 = "sentient-model-invocation-envelope/v1" as const;

export interface ModelInvocationEnvelopeV1 {
  contractVersion: typeof MODEL_INVOCATION_ENVELOPE_V1;
  objectiveId: string;
  executionId: string;
  parentExecutionId: string | null;
  workerId: string | null;
  model: string | null;
  role: string;
  absoluteDeadlineMs: number;
  maxWallTimeMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostMicros: number;
  signal: AbortSignal;
}

export interface ModelInvocationEnvelopeInputV1 {
  objectiveId: string;
  executionId: string;
  parentExecutionId?: string | null;
  workerId?: string | null;
  model?: string | null;
  role: string;
  absoluteDeadlineMs: number;
  maxWallTimeMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostMicros: number;
  signal?: AbortSignal;
  parent?: ModelInvocationEnvelopeV1 | null;
  nowMs?: number;
}

export type BoundedModelInvocationResultV1<T> =
  | { status: "completed"; value: T }
  | { status: "aborted"; reason: "deadline_exceeded" | "cancelled" };

export function createModelInvocationEnvelopeV1(
  input: ModelInvocationEnvelopeInputV1,
): ModelInvocationEnvelopeV1 {
  const now = input.nowMs ?? Date.now();
  const parent = input.parent ?? null;
  const absoluteDeadlineMs = parent === null
    ? finitePositive(input.absoluteDeadlineMs, "absoluteDeadlineMs")
    : Math.min(
        finitePositive(input.absoluteDeadlineMs, "absoluteDeadlineMs"),
        parent.absoluteDeadlineMs,
      );
  const remainingMs = Math.max(0, absoluteDeadlineMs - now);
  const parentRemainingMs = parent === null
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, parent.absoluteDeadlineMs - now);
  const maxWallTimeMs = Math.min(
    finitePositive(input.maxWallTimeMs, "maxWallTimeMs"),
    remainingMs,
    parentRemainingMs,
    parent?.maxWallTimeMs ?? Number.MAX_SAFE_INTEGER,
  );
  const maxInputTokens = Math.min(
    integerNonNegative(input.maxInputTokens, "maxInputTokens"),
    parent?.maxInputTokens ?? Number.MAX_SAFE_INTEGER,
  );
  const maxOutputTokens = Math.min(
    integerNonNegative(input.maxOutputTokens, "maxOutputTokens"),
    parent?.maxOutputTokens ?? Number.MAX_SAFE_INTEGER,
  );
  const maxCostMicros = Math.min(
    integerNonNegative(input.maxCostMicros, "maxCostMicros"),
    parent?.maxCostMicros ?? Number.MAX_SAFE_INTEGER,
  );
  const timeoutSignal = AbortSignal.timeout(Math.max(1, maxWallTimeMs));
  const signals = [
    ...(parent === null ? [] : [parent.signal]),
    ...(input.signal === undefined ? [] : [input.signal]),
    timeoutSignal,
  ];
  return Object.freeze({
    contractVersion: MODEL_INVOCATION_ENVELOPE_V1,
    objectiveId: required(input.objectiveId, "objectiveId"),
    executionId: required(input.executionId, "executionId"),
    parentExecutionId: input.parentExecutionId ?? parent?.executionId ?? null,
    workerId: input.workerId ?? null,
    model: input.model ?? null,
    role: required(input.role, "role"),
    absoluteDeadlineMs,
    maxWallTimeMs,
    maxInputTokens,
    maxOutputTokens,
    maxCostMicros,
    signal: signals.length === 1 ? signals[0]! : AbortSignal.any(signals),
  });
}

export function modelInvocationRemainingMsV1(
  envelope: ModelInvocationEnvelopeV1,
  nowMs = Date.now(),
): number {
  if (envelope.signal.aborted) return 0;
  return Math.max(0, Math.min(
    envelope.maxWallTimeMs,
    envelope.absoluteDeadlineMs - nowMs,
  ));
}

export function modelInvocationIsLiveV1(
  envelope: ModelInvocationEnvelopeV1,
  nowMs = Date.now(),
): boolean {
  return !envelope.signal.aborted && modelInvocationRemainingMsV1(envelope, nowMs) > 0;
}

export async function runBoundedModelInvocationV1<T>(
  envelope: ModelInvocationEnvelopeV1,
  operation: (signal: AbortSignal) => Promise<T>,
  now: () => number = Date.now,
): Promise<BoundedModelInvocationResultV1<T>> {
  if (!modelInvocationIsLiveV1(envelope, now()) {
    return { status: "aborted", reason: "deadline_exceeded" };
  }
  const aborted = new Promise<BoundedModelInvocationResultV1<T>>((resolve) => {
    const finish = () => resolve({
      status: "aborted",
      reason: now() >= envelope.absoluteDeadlineMs ? "deadline_exceeded" : "cancelled",
    });
    if (envelope.signal.aborted) finish();
    else envelope.signal.addEventListener("abort", finish, { once: true });
  });
  const completed = operation(envelope.signal).then((value): BoundedModelInvocationResultV1<T> =>
    modelInvocationIsLiveV1(envelope, now())
      ? { status: "completed", value }
      : { status: "aborted", reason: "deadline_exceeded" }
  );
  return await Promise.race([completed, aborted]);
}

function finitePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name}_must_be_positive`);
  return Math.floor(value);
}
function integerNonNegative(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}_must_be_non_negative_integer`);
  return value;
}
function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name}_required`);
  return normalized;
}
''')

replace_once(
    "src/application/contracts.ts",
    'import type { SpawnExecutionBackendV1 } from "../spawn/execution-contracts.js";',
    'import type { SpawnExecutionBackendV1, SpawnBudgetsV1 } from "../spawn/execution-contracts.js";'
)
replace_once(
    "src/application/contracts.ts",
    '''export interface SentientObjectiveInput {
  request: string;
  objectiveId: string;
  sessionId: string;
  mode: ObjectiveMode;
  privacy: "public_fixture" | "private";
}''',
    '''export interface SentientObjectiveInput {
  request: string;
  objectiveId: string;
  sessionId: string;
  mode: ObjectiveMode;
  privacy: "public_fixture" | "private";
  budget?: SpawnBudgetsV1;
  absoluteDeadline?: string;
}'''
)
replace_once(
    "src/application/contracts.ts",
    '''export function validateObjectiveInput(input: SentientObjectiveInput): void {
  required(input.request, "request");
  required(input.objectiveId, "objectiveId");
  required(input.sessionId, "sessionId");
}''',
    '''export function validateObjectiveInput(input: SentientObjectiveInput): void {
  required(input.request, "request");
  required(input.objectiveId, "objectiveId");
  required(input.sessionId, "sessionId");
  if (input.absoluteDeadline !== undefined && !Number.isFinite(Date.parse(input.absoluteDeadline))) {
    throw new Error("absoluteDeadline_invalid");
  }
  if (input.budget !== undefined) validateObjectiveBudgetV1(input.budget);
}

export function validateObjectiveBudgetV1(budget: SpawnBudgetsV1): void {
  if (budget.currency !== "USD") throw new Error("objective_budget_currency_must_be_USD");
  for (const [name, value] of Object.entries(budget)) {
    if (name === "currency") continue;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`objective_budget_${name}_must_be_non_negative_integer`);
    }
  }
  if (budget.maxRuntimeMs <= 0) throw new Error("objective_budget_maxRuntimeMs_must_be_positive");
}'''
)

replace_once(
    "src/phase1/core-runtime.ts",
    'import type { ModelResult } from "../model/types.js";',
    '''import type { ModelResult } from "../model/types.js";
import {
  modelInvocationIsLiveV1,
  runBoundedModelInvocationV1,
  type ModelInvocationEnvelopeV1,
} from "../model/model-invocation-envelope.js";'''
)
replace_once(
    "src/phase1/core-runtime.ts",
    '''export interface Phase1CognitionPort {
  run(requirements: TaskRequirementsV1): Promise<ModelResult | unknown>;
}''',
    '''export interface Phase1CognitionPort {
  run(
    requirements: TaskRequirementsV1,
    invocation?: ModelInvocationEnvelopeV1,
  ): Promise<ModelResult | unknown>;
}'''
)
replace_once(
    "src/phase1/core-runtime.ts",
    '''  options: {
    cognition?: Phase1CognitionPort | undefined;
    acceptancePolicy?: Phase1AcceptancePolicyV1 | undefined;
  } = {},''',
    '''  options: {
    cognition?: Phase1CognitionPort | undefined;
    acceptancePolicy?: Phase1AcceptancePolicyV1 | undefined;
    invocation?: ModelInvocationEnvelopeV1 | undefined;
  } = {},'''
)
replace_once(
    "src/phase1/core-runtime.ts",
    '''  let rawCandidate: unknown;
  try {
    rawCandidate = await options.cognition.run(requirements);
  } catch {
    return result(requirements, "COGNITION_UNAVAILABLE", null, { kind: "NONE", accepted: false });
  }
  const candidate = subordinateResult(rawCandidate);''',
    '''  let rawCandidate: unknown;
  try {
    if (options.invocation !== undefined) {
      const bounded = await runBoundedModelInvocationV1(
        options.invocation,
        async () => await options.cognition!.run(requirements, options.invocation),
      );
      if (bounded.status !== "completed" || !modelInvocationIsLiveV1(options.invocation)) {
        return result(requirements, "COGNITION_UNAVAILABLE", null, {
          kind: "MODEL_RESULT",
          accepted: false,
          rejectionReason: "late_model_output_rejected",
        });
      }
      rawCandidate = bounded.value;
    } else {
      rawCandidate = await options.cognition.run(requirements);
    }
  } catch {
    return result(requirements, "COGNITION_UNAVAILABLE", null, { kind: "NONE", accepted: false });
  }
  const candidate = subordinateResult(rawCandidate);'''
)

replace_once(
    "src/model/providers/atlas-hybrid-adapters.ts",
    'import type { JsonObject, JsonValue } from "../types.js";',
    '''import type { JsonObject, JsonValue } from "../types.js";
import {
  modelInvocationIsLiveV1,
  modelInvocationRemainingMsV1,
  type ModelInvocationEnvelopeV1,
} from "../model-invocation-envelope.js";'''
)
replace_once(
    "src/model/providers/atlas-hybrid-adapters.ts",
    '''  public async run(requirements: TaskRequirementsV1): Promise<unknown> {
    const result = this.#stage === "synthesis"
      ? await this.#router.synthesis({
          systemPrompt: "Synthesize only from supplied accepted and verified context. Never invent effects or authority.",
          userPrompt: requirements.normalizedUserRequest,
          maxInputTokens: 8_192,
          maxOutputTokens: 1_024,
        })
      : await this.#router.cognition({
          systemPrompt: "Analyze intent, decompose tasks, plan, and propose a bounded candidate answer.",
          userPrompt: requirements.normalizedUserRequest,
          maxInputTokens: 4_096,
          maxOutputTokens: 384,
        });''',
    '''  public async run(
    requirements: TaskRequirementsV1,
    invocation?: ModelInvocationEnvelopeV1,
  ): Promise<unknown> {
    if (invocation !== undefined && !modelInvocationIsLiveV1(invocation)) {
      return {
        ok: false,
        provider: "sentient-hybrid",
        model: "asymmetric-atlas-local-v1",
        code: "provider_error",
        message: "invocation_deadline_exhausted",
        retryable: false,
        latencyMs: 0,
        metadata: { modelOutputIsAuthority: false, terminalUnavailable: true },
      };
    }
    const remainingMs = invocation === undefined
      ? undefined
      : Math.max(1, modelInvocationRemainingMsV1(invocation));
    const common = invocation === undefined
      ? {}
      : {
          maxCostMicros: invocation.maxCostMicros,
          timeoutMs: Math.min(28_000, remainingMs!),
          signal: invocation.signal,
        };
    const result = this.#stage === "synthesis"
      ? await this.#router.synthesis({
          systemPrompt: "Synthesize only from supplied accepted and verified context. Never invent effects or authority.",
          userPrompt: requirements.normalizedUserRequest,
          maxInputTokens: Math.min(invocation?.maxInputTokens ?? 8_192, 8_192),
          maxOutputTokens: Math.min(invocation?.maxOutputTokens ?? 1_024, 1_024),
          ...common,
        })
      : await this.#router.cognition({
          systemPrompt: "Analyze intent, decompose tasks, plan, and propose a bounded candidate answer.",
          userPrompt: requirements.normalizedUserRequest,
          maxInputTokens: Math.min(invocation?.maxInputTokens ?? 4_096, 4_096),
          maxOutputTokens: Math.min(invocation?.maxOutputTokens ?? 384, 384),
          ...common,
        });'''
)

