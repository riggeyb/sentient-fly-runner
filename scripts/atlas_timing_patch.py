from pathlib import Path

p=Path("src/model/providers/atlas-hybrid-router.ts")
s=p.read_text()
def one(a,b):
    global s
    if s.count(a)!=1: raise SystemExit(f"contract changed: {a[:60]!r} count={s.count(a)}")
    s=s.replace(a,b,1)

one("""import type {
  AtlasCloudClientV1,
  AtlasCloudFailureReasonV1,
  AtlasCloudUsageV1,
} from "./atlas-cloud-client.js";""",
"""import type {
  AtlasCloudCompleteInputV1,
  AtlasCloudFailureReasonV1,
  AtlasCloudResultV1,
  AtlasCloudUsageV1,
} from "./atlas-cloud-client.js";""")
one("""export const ATLAS_HYBRID_OVERALL_TIMEOUT_MS_V1 = 28_000 as const;
export const ATLAS_CLOUD_ATTEMPT_TIMEOUT_MS_V1 = 8_000 as const;
export const LOCAL_HF_ATTEMPT_TIMEOUT_MS_V1 = 10_000 as const;""",
"""export const ATLAS_HYBRID_OVERALL_TIMEOUT_MS_V1 = 28_000 as const;
export const DEEPSEEK_COGNITION_TIMEOUT_MS_V1 = 12_000 as const;
export const DOTS3_COGNITION_TIMEOUT_MS_V1 = 9_000 as const;
export const DOTS3_SYNTHESIS_TIMEOUT_MS_V1 = 10_000 as const;
export const DEEPSEEK_SYNTHESIS_FALLBACK_TIMEOUT_MS_V1 = 11_000 as const;
export const LOCAL_HF_ATTEMPT_TIMEOUT_MS_V1 = 6_000 as const;""")
one("export type HybridTelemetrySinkV1 = (telemetry: HybridModelTelemetryV1) => void;\n",
"""export type HybridTelemetrySinkV1 = (telemetry: HybridModelTelemetryV1) => void;

export interface AtlasCompletionClientV1 {
  complete(input: AtlasCloudCompleteInputV1): Promise<AtlasCloudResultV1>;
}
""")
one("readonly #atlas: AtlasCloudClientV1 | null;",
    "readonly #atlas: AtlasCompletionClientV1 | null;\n  readonly #now: () => number;")
one("atlasClient?: AtlasCloudClientV1 | null;",
    "atlasClient?: AtlasCompletionClientV1 | null;\n    now?: (() => number) | undefined;")
one("this.#atlas = input.atlasClient ?? null;",
    "this.#atlas = input.atlasClient ?? null;\n    this.#now = input.now ?? Date.now;")
one("""{ kind: "atlas" as const, model: DEEPSEEK_V3_2_MODEL_V1, maxOutput: DEEPSEEK_COGNITION_MAX_OUTPUT_TOKENS_V1 },
        { kind: "atlas" as const, model: this.#dots3Model, maxOutput: DOTS3_COGNITION_MAX_OUTPUT_TOKENS_V1 },
        { kind: "local" as const, model: LOCAL_HF_MODEL_V1, maxOutput: input.maxOutputTokens ?? 1_024 },""",
"""{ kind: "atlas" as const, model: DEEPSEEK_V3_2_MODEL_V1, maxOutput: DEEPSEEK_COGNITION_MAX_OUTPUT_TOKENS_V1, timeoutMs: DEEPSEEK_COGNITION_TIMEOUT_MS_V1 },
        { kind: "atlas" as const, model: this.#dots3Model, maxOutput: DOTS3_COGNITION_MAX_OUTPUT_TOKENS_V1, timeoutMs: DOTS3_COGNITION_TIMEOUT_MS_V1 },
        { kind: "local" as const, model: LOCAL_HF_MODEL_V1, maxOutput: input.maxOutputTokens ?? 1_024, timeoutMs: LOCAL_HF_ATTEMPT_TIMEOUT_MS_V1 },""")
one("""{ kind: "atlas" as const, model: this.#dots3Model, maxOutput: DOTS3_SYNTHESIS_MAX_OUTPUT_TOKENS_V1 },
        {
          kind: "atlas" as const,
          model: DEEPSEEK_V3_2_MODEL_V1,
          maxOutput: DEEPSEEK_SYNTHESIS_FALLBACK_MAX_OUTPUT_TOKENS_V1,
          telemetryStage: "synthesis_fallback" as const,
        },
        { kind: "local" as const, model: LOCAL_HF_MODEL_V1, maxOutput: input.maxOutputTokens ?? 1_024 },""",
"""{ kind: "atlas" as const, model: this.#dots3Model, maxOutput: DOTS3_SYNTHESIS_MAX_OUTPUT_TOKENS_V1, timeoutMs: DOTS3_SYNTHESIS_TIMEOUT_MS_V1 },
        {
          kind: "atlas" as const,
          model: DEEPSEEK_V3_2_MODEL_V1,
          maxOutput: DEEPSEEK_SYNTHESIS_FALLBACK_MAX_OUTPUT_TOKENS_V1,
          timeoutMs: DEEPSEEK_SYNTHESIS_FALLBACK_TIMEOUT_MS_V1,
          telemetryStage: "synthesis_fallback" as const,
        },
        { kind: "local" as const, model: LOCAL_HF_MODEL_V1, maxOutput: input.maxOutputTokens ?? 1_024, timeoutMs: LOCAL_HF_ATTEMPT_TIMEOUT_MS_V1 },""")
one("maxOutput: number;\n      telemetryStage?: HybridModelStageV1;",
    "maxOutput: number;\n      timeoutMs: number;\n      telemetryStage?: HybridModelStageV1;")
one("const started = Date.now();","const started = this.#now();")
one("if (Date.now() - started >= overall) break;","if (this.#now() - started >= overall) break;")
one("timeoutMs: Math.min(ATLAS_CLOUD_ATTEMPT_TIMEOUT_MS_V1, remaining),",
    "timeoutMs: Math.min(step.timeoutMs, remaining),")
one("const localStarted = Date.now();","const localStarted = this.#now();")
one("const timeout = Math.min(LOCAL_HF_ATTEMPT_TIMEOUT_MS_V1, remaining);",
    "const timeout = Math.min(step.timeoutMs, remaining);")
one("latencyMs: Date.now() - localStarted,","latencyMs: this.#now() - localStarted,")
if s.count("const remaining = Math.max(1, overall - (Date.now() - started));") != 2:
    raise SystemExit("remaining budget contract changed")
s=s.replace("const remaining = Math.max(1, overall - (Date.now() - started));",
            "const remaining = Math.max(1, overall - (this.#now() - started));")
if "ATLAS_CLOUD_ATTEMPT_TIMEOUT_MS_V1" in s: raise SystemExit("generic Atlas timeout remains")
p.write_text(s)
Path("test/atlas-hybrid-timeout-policy.test.ts").write_text(
    Path("runner-fixtures/atlas-hybrid-timeout-policy.test.ts").read_text()
)
