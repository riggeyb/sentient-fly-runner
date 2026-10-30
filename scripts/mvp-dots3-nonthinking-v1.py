from pathlib import Path

def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    s = p.read_text()
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected 1, got {n}")
    p.write_text(s.replace(old, new, 1))

replace_once(
    "src/model/providers/atlas-cloud-client.ts",
    "  maxCostMicros?: number;\n",
    "  maxCostMicros?: number;\n  enableThinking?: boolean;\n",
    "client interface",
)
replace_once(
    "src/model/providers/atlas-cloud-client.ts",
    "          temperature: 0,\n",
    "          temperature: 0,\n          ...(input.enableThinking === undefined ? {} : { enable_thinking: input.enableThinking }),\n",
    "client request flag",
)

replace_once(
    "src/model/providers/atlas-hybrid-router.ts",
    '{ kind: "atlas" as const, model: this.#dots3Model, maxOutput: DOTS3_COGNITION_MAX_OUTPUT_TOKENS_V1, timeoutMs: DOTS3_COGNITION_TIMEOUT_MS_V1 },\n',
    '{ kind: "atlas" as const, model: this.#dots3Model, maxOutput: DOTS3_COGNITION_MAX_OUTPUT_TOKENS_V1, timeoutMs: DOTS3_COGNITION_TIMEOUT_MS_V1, enableThinking: false },\n',
    "Dots3 cognition",
)
replace_once(
    "src/model/providers/atlas-hybrid-router.ts",
    '{ kind: "atlas" as const, model: this.#dots3Model, maxOutput: DOTS3_SYNTHESIS_MAX_OUTPUT_TOKENS_V1, timeoutMs: DOTS3_SYNTHESIS_TIMEOUT_MS_V1 },\n',
    '{ kind: "atlas" as const, model: this.#dots3Model, maxOutput: DOTS3_SYNTHESIS_MAX_OUTPUT_TOKENS_V1, timeoutMs: DOTS3_SYNTHESIS_TIMEOUT_MS_V1, enableThinking: false },\n',
    "Dots3 synthesis",
)
replace_once(
    "src/model/providers/atlas-hybrid-router.ts",
    "      telemetryStage?: HybridModelStageV1;\n",
    "      telemetryStage?: HybridModelStageV1;\n      enableThinking?: boolean;\n",
    "plan type",
)
replace_once(
    "src/model/providers/atlas-hybrid-router.ts",
    "          ...(input.maxCostMicros === undefined ? {} : { maxCostMicros: input.maxCostMicros }),\n          requireJsonObject: defaultStage === \"cognition\",\n",
    "          ...(input.maxCostMicros === undefined ? {} : { maxCostMicros: input.maxCostMicros }),\n          ...(step.enableThinking === undefined ? {} : { enableThinking: step.enableThinking }),\n          requireJsonObject: defaultStage === \"cognition\",\n",
    "router forwards flag",
)

test = r'''import assert from "node:assert/strict";
import test from "node:test";
import { AtlasCloudClientV1 } from "../src/model/providers/atlas-cloud-client.js";
import { AtlasHybridModelRouterV1 } from "../src/model/providers/atlas-hybrid-router.js";
import {
  LocalHuggingFaceRuntimeV1,
  type LocalHfGenerateInputV1,
  type LocalHfGenerationV1,
  type LocalHfRunnerV1,
} from "../src/model/providers/huggingface.js";

class NeverLocal implements LocalHfRunnerV1 {
  async initialize(): Promise<void> {}
  async generate(_input: LocalHfGenerateInputV1): Promise<LocalHfGenerationV1> {
    throw new Error("local_must_not_run");
  }
}

function response(content: string, status = 200): Response {
  const body = status >= 400
    ? { error: { message: content } }
    : {
        choices: [{ message: { content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
      };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fixture(steps: Response[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    bodies.push(parsed);
    const next = steps.shift();
    if (!next) throw new Error("unexpected_fetch");
    return next;
  }) as typeof fetch;
  const client = new AtlasCloudClientV1({ apiKey: "secret", fetchImpl });
  const router = new AtlasHybridModelRouterV1( {
    atlasClient: client,
    dots3Model: "test/dots3",
    localRuntime: new LocalHuggingFaceRuntimeV1({ runner: new NeverLocal() }),
  });
  return { router, bodies };
}

test("Dots3 cognition fallback disables thinking while DeepSeek request remains unchanged", async () => {
  const x = fixture([response("rate limit", 429), response('{"answer":"dots"}')]);
  const result = await x.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(result.ok, true);
  assert.equal(x.bodies.length, 2);
  assert.equal(Object.hasOwn(x.bodies[0]!, "enable_thinking"), false);
  assert.equal(x.bodies[1]?.enable_thinking, false);
});

test("Dots3 synthesis primary disables thinking", async () => {
  const x = fixture([response("dots final")]);
  const result = await x.router.synthesis({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(result.ok, true);
  assert.equal(x.bodies.length, 1);
  assert.equal(x.bodies[0]?.enable_thinking, false);
});
'''
Path("test/atlas-dots3-nonthinking.test.ts").write_text(test)
print("PATCH_READY")
