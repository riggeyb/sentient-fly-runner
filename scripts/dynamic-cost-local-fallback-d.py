from pathlib import Path
Path("sentient/test/spawn-cost-hard-stop-fallback-v1.test.ts").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import { AtlasHybridSpawnExecutionBackendV1 } from "../src/model/providers/atlas-hybrid-adapters.js";
import { LocalHuggingFaceSpawnExecutionBackendV1 } from "../src/spawn/backends/huggingface.js";
import { inspectSpawnTargetEligibilityV1 } from "../src/spawn/selection.js";

test("cloud hybrid does not advertise unenforceable hard spend control", async () => {
  const [target] = await new AtlasHybridSpawnExecutionBackendV1(null as never).describe();
  assert.equal(target?.hardLimitEnforcement.costMicros, false);
});

test("zero-cost local backend honors a positive inherited cost ceiling", async () => {
  const runtime = {
    async initialize() {},
    async close() {},
    async complete() {
      return {
        text: "local result",
        inputTokens: 2,
        outputTokens: 2,
        totalTokens: 4,
        provider: "huggingface-local",
        model: "onnx-community/SmolLM2-135M-Instruct-ONNX",
        revision: "b8a5c0f183b78c55955a5364f610c36668b5e681",
        outputSha256: "sha256:test",
        latencyMs: 1,
      };
    },
  };
  const backend = new LocalHuggingFaceSpawnExecutionBackendV1(runtime as never);
  const [target] = await backend.describe();
  assert.ok(target);
  const result = await backend.execute({
    identity: { executionId: "e", role: "analysis" } as never,
    taskPackage: {
      objective: "x",
      context: { artifacts: [] },
      operatingContext: {},
      operatingContextDigest: "d",
      effectiveGrant: {
        budgets: {
          maxInputTokens: 64,
          maxOutputTokens: 32,
          maxTotalTokens: 96,
          maxCostMicros: 25_000,
          maxRuntimeMs: 1_000,
          maxToolRounds: 0,
          maxToolActions: 0,
        },
      },
    } as never,
    target,
    signal: new AbortController().signal,
  });
  assert.equal(result.status, "succeeded");
  assert.equal(result.costMicros, 0);
});

test("local target remains eligible when local-process is one allowed handling mode", async () => {
  const [target] = await new LocalHuggingFaceSpawnExecutionBackendV1({} as never).describe();
  assert.ok(target);
  const inspected = inspectSpawnTargetEligibilityV1({
    budgets: {
      maxInputTokens: 1,
      maxOutputTokens: 1,
      maxTotalTokens: 2,
      maxCostMicros: 1,
      maxRuntimeMs: 1,
      maxToolRounds: 0,
      maxToolActions: 0,
    },
    targetPolicy: {
      requiredCapabilities: ["objective.cognition"],
      qualityRequirements: [],
      costRequirements: [],
      privacyRequirements: ["private"],
    },
    privacyPolicy: {
      classification: "private",
      allowedDataHandlingModes: ["atlascloud-openai-compatible", "local-process"],
    },
  } as never, {
    targetConstraints: {
      targets: { allowed: [], denied: [] },
      backends: { allowed: [], denied: [] },
      providers: { allowed: [], denied: [] },
      models: { allowed: [], denied: [] },
      preferenceOrder: [],
    },
  } as never, target);
  assert.equal(inspected.eligible, true);
});
''')
