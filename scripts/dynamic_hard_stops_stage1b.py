from pathlib import Path

ROOT = Path("sentient")

def replace_once(rel: str, old: str, new: str) -> None:
    path = ROOT / rel
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{rel}: expected one occurrence, found {count}: {old[:100]!r}")
    path.write_text(text.replace(old, new, 1))

phase1 = ROOT / "src/phase1/core-runtime.ts"
text = phase1.read_text()
count = text.count("MODEL_RESULT_")
if count <= 0:
    raise SystemExit("phase1 MODEL_RESULT_ repair target missing")
phase1.write_text(text.replace("MODEL_RESULT_", "MODEL_RESULT"))

replace_once(
    "src/application/contracts.ts",
    'import type { SpawnExecutionBackendV1 } from "../spawn/execution-contracts.js";',
    '''import type { SpawnExecutionBackendV1 } from "../spawn/execution-contracts.js";
import type { SpawnBudgetsV1 } from "../spawn/request-contracts.js";''',
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
}''',
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
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new Error(`objective_budget_${name}_must_be_non_negative_integer`);
    }
  }
  if (budget.maxRuntimeMs <= 0) throw new Error("objective_budget_maxRuntimeMs_must_be_positive");
}''',
)

replace_once(
    "src/model/providers/atlas-hybrid-adapters.ts",
    'import type { JsonObject, JsonValue } from "../types.js";',
    '''import type { JsonObject, JsonValue } from "../types.js";
import {
  modelInvocationIsLiveV1,
  modelInvocationRemainingMsV1,
  type ModelInvocationEnvelopeV1,
} from "../model-invocation-envelope.js";''',
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
    invocation?: ModelInvocationEnvelopeV1 | undefined,
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
        metadata: {
          modelOutputIsAuthority: false,
          terminalUnavailable: true,
        },
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
        });''',
)

print("stage1b applied")
