import assert from "node:assert/strict";
import test from "node:test";
import {
  ATLAS_HYBRID_OVERALL_TIMEOUT_MS_V1,
  AtlasHybridModelRouterV1,
  DEEPSEEK_COGNITION_TIMEOUT_MS_V1,
  DEEPSEEK_SYNTHESIS_FALLBACK_TIMEOUT_MS_V1,
  DEEPSEEK_V3_2_MODEL_V1,
  DOTS3_COGNITION_TIMEOUT_MS_V1,
  DOTS3_SYNTHESIS_TIMEOUT_MS_V1,
  LOCAL_HF_ATTEMPT_TIMEOUT_MS_V1,
  type AtlasCompletionClientV1,
} from "../src/model/providers/atlas-hybrid-router.js";
import type {
  AtlasCloudCompleteInputV1,
  AtlasCloudResultV1,
} from "../src/model/providers/atlas-cloud-client.js";
import {
  LocalHuggingFaceRuntimeV1,
  type LocalHfGenerateInputV1,
  type LocalHfGenerationV1,
  type LocalHfRunnerV1,
} from "../src/model/providers/huggingface.js";
import { ROOT_DIRECT_TIMEOUT_MS } from "../src/application/production-mission-control.js";

const DOTS = "dots-studio/dots-3-note-prev-free";

type AtlasStep =
  | { model: string; latencyMs: number; ok: true; text: string }
  | { model: string; latencyMs: number; ok: false; reason?: "timeout" | "provider_unavailable" };

class VirtualAtlas implements AtlasCompletionClientV1 {
  readonly calls: AtlasCloudCompleteInputV1[] = [];
  constructor(
    private readonly steps: AtlasStep[],
    private readonly advance: (ms: number) => void,
  ) {}
  async complete(input: AtlasCloudCompleteInputV1): Promise<AtlasCloudResultV1> {
    this.calls.push(input);
    const step = this.steps.shift();
    if (!step) throw new Error("unexpected_atlas_call");
    assert.equal(input.model, step.model);
    if (step.latencyMs > input.timeoutMs) {
      this.advance(input.timeoutMs);
      return {
        ok: false, provider: "atlascloud", model: input.model, reason: "timeout",
        message: "virtual_timeout", failoverEligible: true,
        latencyMs: input.timeoutMs, providerRequestId: null,
      };
    }
    this.advance(step.latencyMs);
    if (!step.ok) {
      return {
        ok: false, provider: "atlascloud", model: input.model,
        reason: step.reason ?? "provider_unavailable", message: "virtual_unavailable",
        failoverEligible: true, latencyMs: step.latencyMs, providerRequestId: null,
      };
    }
    const cognition = input.requireJsonObject === true;
    return {
      ok: true, provider: "atlascloud", model: input.model,
      text: cognition ? JSON.stringify({ answer: step.text }) : step.text,
      structuredOutput: cognition ? { answer: step.text } : null,
      structuredOutputValid: true,
      usage: {
        inputTokens: 10, cachedInputTokens: 2, outputTokens: 5,
        reasoningTokens: 3, totalTokens: 15,
      },
      latencyMs: step.latencyMs, finishReason: "stop",
      providerRequestId: `req-${this.calls.length}`, reportedCostUsd: null,
    };
  }
}

class VirtualLocal implements LocalHfRunnerV1 {
  calls = 0;
  constructor(
    private readonly advance: (ms: number) => void,
    private readonly latencyMs = 1_000,
    private readonly fail = false,
  ) {}
  async initialize(): Promise<void> {}
  async generate(_input: LocalHfGenerateInputV1): Promise<LocalHfGenerationV1> {
    this.calls += 1;
    this.advance(this.latencyMs);
    if (this.fail) throw new Error("local_unavailable");
    return { text: "local", inputTokens: 3, outputTokens: 2, totalTokens: 5 };
  }
}

function fixture(atlasSteps: AtlasStep[], localLatencyMs = 1_000, localFail = false) {
  let now = 0;
  const advance = (ms: number) => { now += ms; };
  const atlas = new VirtualAtlas([...atlasSteps], advance);
  const local = new VirtualLocal(advance, localLatencyMs, localFail);
  const router = new AtlasHybridModelRouterV1({
    atlasClient: atlas,
    dots3Model: DOTS,
    localRuntime: new LocalHuggingFaceRuntimeV1({ runner: local }),
    now: () => now,
  });
  return { router, atlas, local, now: () => now };
}

test("stage-aware budgets preserve root and hybrid bounds", () => {
  assert.equal(DEEPSEEK_COGNITION_TIMEOUT_MS_V1, 12_000);
  assert.equal(DOTS3_COGNITION_TIMEOUT_MS_V1, 9_000);
  assert.equal(DOTS3_SYNTHESIS_TIMEOUT_MS_V1, 10_000);
  assert.equal(DEEPSEEK_SYNTHESIS_FALLBACK_TIMEOUT_MS_V1, 11_000);
  assert.equal(LOCAL_HF_ATTEMPT_TIMEOUT_MS_V1, 6_000);
  assert.equal(ATLAS_HYBRID_OVERALL_TIMEOUT_MS_V1, 28_000);
  assert.equal(ROOT_DIRECT_TIMEOUT_MS, 30_000);
  assert.ok(ATLAS_HYBRID_OVERALL_TIMEOUT_MS_V1 < ROOT_DIRECT_TIMEOUT_MS);
});

test("DeepSeek 9377ms cognition succeeds without unnecessary fallback", async () => {
  const x = fixture([
    { model: DEEPSEEK_V3_2_MODEL_V1, latencyMs: 9_377, ok: true, text: "deep-normal" },
  ]);
  const result = await x.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(result.ok && result.model === DEEPSEEEK_V3_2_MODEL_V1 && result.text === "deep-normal", true);
  assert.equal(x.atlas.calls.length, 1);
  assert.equal(x.atlas.calls[0]?.timeoutMs, DEEPSEEEK_COGNITION_TIMEOUT_MS_V1);
  assert.equal(x.local.calls, 0);
  assert.equal(x.now(), 9_377);
});

test("deepSeek over bound falls back to Dots3 within cognition budget", async () => {
  const x = fixture([
    { model: DEEPSEEEK_V3_2_MODEL_V1, latencyMs: 15_000, ok: true, text: "too-late" },
    { model: DOTS,  latencyMs: 4_500, ok: true, text: "dots-normal" },
  ]);
  const result = await x.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(result.ok && result.model === DOTS && result.text === "dots-normal", true);
  assert.deepEqual(x.atlas.calls.map((c) => c.timeoutMs), [12_000, 9_000]);
  assert.equal(x.now(), 16_500);
  assert.equal(x.local.calls, 0);
});

test("DeepSeek + Dots3 timeout leaves bounded remaining budget for Local HF", async () => {
  const x = fixture([
    { model: DEEPSEEEK_V3_2_MODEL_V1, latencyMs: 20_000, ok: true, text: "late-deep" },
   { model: DOTS,  latencyMs: 20_000, ok: true, text: "late-dots" },
  ], 1_500);
  const result = await x.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(result.ok && result.provider === "huggingface-local", true);
  assert.deepEqual(x.atlas.calls.map((c) => c.timeoutMs), [12_000, 9_000]);
  assert.equal(x.local.calls, 1);
  assert.equal(x.now(), 22_500);
  assert.ok(x.now() < ATLAS_HYBRID_OVERALL_TIMEOUT_MS_V1);
});

test("all cognition providers unavailable terminates within root bound", async () => {
  const x = fixture([
    { model: DEEPSEEEK_V3_2_MODEL_V1, latencyMs: 20_000, ok: true, text: "late-deep" },
   { model: DOTS,  latencyMs: 20_000, ok: true, text: "late-dots" },
  ], 6_000, true);
  const result = await x.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "terminal_unavailable");
  assert.equal(x.local.calls, 1);
  assert.equal(x.now(), 27_000);
  assert.ok(x.now() <= ATLAS_HYBRID_OVERALL_TIMEOUT_MS_V1);
  assert.ok(x.now() < ROOT_DIRECT_TIMEOUT_MS);
});

test("synthesis preserves Dots3 -> DeepSeek -> Local order with asymmetric budgets", async () => {
  const x = fixture([
   { model: DOTS,  latencyMs: 20_000, ok: true, text: "late-dots" },
   { model: DEEPSEEEK_V3_2_MODEL_V1, latencyMs: 5_000, ok: true, text: "deep-synthesis" },
  ]);
  const result = await x.router.synthesis({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(result.ok && result.model === DEEPSEEEK_V3_2_MODEL_V1 && result.text === "deep-synthesis", true);
  assert.deepEqual(x.atlas.calls.map((c) => [c.model, c.timeoutMs]), [
    [DOTS, DOTS3_SYNTHESIS_TIMEOUT_MS_V1],
    [DEEPSEEK_V3_2_MODEL_V1, DEEPSEEK_SYNTHESIS_FALLBACK_TIMEOUT_MS_V1],
  ]);
  assert.equal(result.ok ? result.telemetry.at(-1)?.stage : null, "synthesis_fallback");
});
