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
replace_once(
    "src/fly/server-runtime.ts",
    'import { isBearerAuthorized } from "./bearer-auth.js";',
    '''import { isBearerAuthorized } from "./bearer-auth.js";
import type { SpawnBudgetsV1 } from "../spawn/request-contracts.js";'''
)
replace_once(
    "src/fly/server-runtime.ts",
    '''    const privacy = body.privacy === "public_fixture" ? "public_fixture" : "private";
    const receipt = await objectiveRunner.enqueue({
      request,
      objectiveId,
      sessionId,
      mode,
      privacy,
      ...(body.engineeringJob === undefined ? {} : { engineeringJob: body.engineeringJob }),''',
    '''    const privacy = body.privacy === "public_fixture" ? "public_fixture" : "private";
    const budget = body.budget === undefined ? undefined : objectiveBudget(body.budget);
    const absoluteDeadline = body.absoluteDeadline === undefined
      ? undefined
      : text(body.absoluteDeadline, "absoluteDeadline");
    const receipt = await objectiveRunner.enqueue({
      request,
      objectiveId,
      sessionId,
      mode,
      privacy,
      ...(budget === undefined ? {} : { budget }),
      ...(absoluteDeadline === undefined ? {} : { absoluteDeadline }),
      ...(body.engineeringJob === undefined ? {} : { engineeringJob: body.engineeringJob }),'''
)
replace_once(
    "src/fly/server-runtime.ts",
    '''function secret(name: string): string {''',
    '''function objectiveBudget(value: unknown): SpawnBudgetsV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("budget_must_be_object");
  }
  const row = value as Record<string, unknown>;
  const exact = [
    "maxInputTokens","maxOutputTokens","maxTotalTokens","maxCostMicros","currency",
    "maxRuntimeMs","maxToolRounds","maxToolActions","maxChildExecutions","maxRecursionDepth",
  ];
  if (Object.keys(row).some((key) => !exact.includes(key))) throw new Error("budget_has_unknown_fields");
  const integer = (name: string) => {
    const n = row[name];
    if (!Number.isSafeInteger(n) || Number(n) < 0) throw new Error(`budget_${name}_invalid`);
    return Number(n);
  };
  if (row.currency !== "USD") throw new Error("budget_currency_must_be_USD");
  const budget: SpawnBudgetsV1 = {
    maxInputTokens: integer("maxInputTokens"),
    maxOutputTokens: integer("maxOutputTokens"),
    maxTotalTokens: integer("maxTotalTokens"),
    maxCostMicros: integer("maxCostMicros"),
    currency: "USD",
    maxRuntimeMs: integer("maxRuntimeMs"),
    maxToolRounds: integer("maxToolRounds"),
    maxToolActions: integer("maxToolActions"),
    maxChildExecutions: integer("maxChildExecutions"),
    maxRecursionDepth: integer("maxRecursionDepth"),
  };
  if (budget.maxRuntimeMs <= 0) throw new Error("budget_maxRuntimeMs_must_be_positive");
  return budget;
}

function secret(name: string): string {'''
)

replace_once(
    "src/fly/self-execution.ts",
    '''  privacy: SentientObjectiveInput["privacy"];
  engineeringJob: EngineeringJobInputV1 | null;''',
    '''  privacy: SentientObjectiveInput["privacy"];
  budget: SentientObjectiveInput["budget"] | null;
  absoluteDeadline: string | null;
  engineeringJob: EngineeringJobInputV1 | null;'''
)
replace_once(
    "src/fly/self-execution.ts",
    '''      privacy: input.privacy,
      engineeringJob,''',
    '''      privacy: input.privacy,
      budget: input.budget === undefined ? null : structuredClone(input.budget),
      absoluteDeadline: input.absoluteDeadline ?? null,
      engineeringJob,'''
)
replace_once(
    "src/fly/self-execution.ts",
    '''      mode: metadata.mode,
      privacy: metadata.privacy,
    };''',
    '''      mode: metadata.mode,
      privacy: metadata.privacy,
      ...(metadata.budget === null ? {} : { budget: structuredClone(metadata.budget) }),
      ...(metadata.absoluteDeadline === null ? {} : { absoluteDeadline: metadata.absoluteDeadline }),
    };'''
)
replace_once(
    "src/fly/self-execution.ts",
    '''  return {
    contract: FLY_OBJECTIVE_RUNNER_CONTRACT,
    request,
    sessionId,
    mode: mode as SentientObjectiveInput["mode"],
    privacy,
    engineeringJob,''',
    '''  const budget = parseObjectiveBudget(metadata.budget);
  const absoluteDeadline = text(metadata.absoluteDeadline);
  if (metadata.budget !== null && metadata.budget !== undefined && budget === null) return null;
  if (absoluteDeadline !== null && !Number.isFinite(Date.parse(absoluteDeadline))) return null;
  return {
    contract: FLY_OBJECTIVE_RUNNER_CONTRACT,
    request,
    sessionId,
    mode: mode as SentientObjectiveInput["mode"],
    privacy,
    budget,
    absoluteDeadline,
    engineeringJob,'''
)
replace_once(
    "src/fly/self-execution.ts",
    '''function engineeringResult(value: unknown): "PASS" | "FAIL" | "NOT_RUN" {''',
    '''function parseObjectiveBudget(value: unknown): SentientObjectiveInput["budget"] | null {
  if (value === null || value === undefined) return null;
  const row = record(value);
  const names = [
    "maxInputTokens","maxOutputTokens","maxTotalTokens","maxCostMicros",
    "maxRuntimeMs","maxToolRounds","maxToolActions","maxChildExecutions","maxRecursionDepth",
  ] as const;
  if (row.currency !== "USD") return null;
  for (const name of names) {
    if (!Number.isSafeInteger(row[name]) || Number(row[name]) < 0) return null;
  }
  if (Number(row.maxRuntimeMs) <= 0) return null;
  return {
    maxInputTokens: Number(row.maxInputTokens),
    maxOutputTokens: Number(row.maxOutputTokens),
    maxTotalTokens: Number(row.maxTotalTokens),
    maxCostMicros: Number(row.maxCostMicros),
    currency: "USD",
    maxRuntimeMs: Number(row.maxRuntimeMs),
    maxToolRounds: Number(row.maxToolRounds),
    maxToolActions: Number(row.maxToolActions),
    maxChildExecutions: Number(row.maxChildExecutions),
    maxRecursionDepth: Number(row.maxRecursionDepth),
  };
}

function engineeringResult(value: unknown): "PASS" | "FAIL" | "NOT_RUN" {'''
)

