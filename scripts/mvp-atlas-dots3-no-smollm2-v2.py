from pathlib import Path
import re

def counted_replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    s = p.read_text()
    n = s.count(old)
    if n != count:
        raise SystemExit(f"{path}: expected {count} copies, found {n}: {old!r}")
    p.write_text(s.replace(old, new))

p = Path("src/model/providers/atlas-hybrid-router.ts")
s = p.read_text()
needle = '        { kind: "local" as const, model: LOCAL_HF_MODEL_V1, maxOutput: input.maxOutputTokens ?? 1_024, timeoutMs: LOCAL_HF_ATTEMPT_TIMEOUT_MS_V1 },\n'
if s.count(needle) != 2:
    raise SystemExit(f"router local step count={s.count(needle)}")
p.write_text(s.replace(needle, ""))

counted_replace(
    "src/fly/production-runtime.ts",
    'import { LocalHuggingFaceSpawnExecutionBackendV1 } from "../spawn/backends/huggingface.js";\n',
    "",
)
counted_replace(
    "src/fly/production-runtime.ts",
    '    new LocalHuggingFaceSpawnExecutionBackendV1(localHfRuntime),\n',
    "",
)

counted_replace(
    "src/application/production-collaboration.ts",
    'allowed: [ATLAS_HYBRID_SPAWN_BACKEND_ID_V1, HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1],',
    'allowed: [ATLAS_HYBRID_SPAWN_BACKEND_ID_V1],',
)
counted_replace(
    "src/application/production-collaboration.ts",
    'allowed: [ATLAS_HYBRID_PROVIDER_ID_V1, LOCAL_HF_PROVIDER_V1],',
    'allowed: [ATLAS_HYBRID_PROVIDER_ID_V1],',
)
counted_replace(
    "src/application/production-collaboration.ts",
    'allowed: [ATLAS_HYBRID_ROUTE_MODEL_ID_V1, LOCAL_HF_MODEL_V1],',
    'allowed: [ATLAS_HYBRID_ROUTE_MODEL_ID_V1],',
)
counted_replace(
    "src/application/production-collaboration.ts",
    '      `${HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1}:${LOCAL_HF_MODEL_V1}@${LOCAL_HF_MODEL_REVISION_V1}`,\n',
    "",
)

tp = Path("test/atlas-hybrid-router.test.ts")
t = tp.read_text()

cognition = '''test("cognition routes DeepSeek -> Dots3 and stops without local fallback", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });

  const primary = fixture([res('{"answer":"deep"}')]);
  const p = await primary.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(p.ok && p.model === DEEPSEEK_V3_2_MODEL_V1 && p.text === "deep", true);
  assert.equal(primary.calls.length, 1);
  assert.equal(primary.calls[0]?.body.model, DEEPSEEK_V3_2_MODEL_V1);
  assert.equal(primary.runner.calls, 0);

  const dots = fixture([res("retry", 503), res('{"answer":"dots"}')]);
  const d = await dots.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(d.ok && d.model === DOTS && d.text === "dots", true);
  assert.equal(dots.calls.length, 2);
  assert.equal(dots.runner.calls, 0);

  const terminal = fixture([res("down", 503), res("bad-json")], "must not run");
  const f = await terminal.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(f.ok, false);
  assert.equal(terminal.runner.calls, 0);
  if (!f.ok) {
    assert.equal(f.reason, "terminal_unavailable");
    assert.deepEqual(f.telemetry.map((v) => v.attemptNumber), [1, 2]);
    assert.deepEqual(f.telemetry.map((v) => v.model), [DEEPSEEK_V3_2_MODEL_V1, DOTS]);
  }
});

'''
t, n = re.subn(
    r'test\("cognition routes DeepSeek -> Dots3 -> Local HF with finite attempts",[\s\S]*?(?=test\("synthesis routes)',
    cognition, t, count=1,
)
if n != 1:
    raise SystemExit(f"cognition test replacement count={n}")

synthesis = '''test("synthesis routes Dots3 -> DeepSeek and stops without local fallback", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });

  const dots = fixture([res('{"answer":"dots"}')]);
  const d = await dots.router.synthesis({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(d.ok && d.model === DOTS && d.text === "dots", true);

  const deep = fixture([res("down", 503), res('{"answer":"deep"}')]);
  const p = await deep.router.synthesis({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(p.ok && p.model === DEEPSEEK_V3_2_MODEL_V1 && p.text === "deep", true);
  assert.equal(deep.runner.calls, 0);

  const terminal = fixture([res("down", 503), res("down", 503)], "must not run");
  const l = await terminal.router.synthesis({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(l.ok, false);
  assert.equal(terminal.runner.calls, 0);
  if (!l.ok) assert.deepEqual(l.telemetry.map((v) => v.attemptNumber), [1, 2]);
});

'''
t, n = re.subn(
    r'test\("synthesis routes Dots3 -> DeepSeek -> Local HF",[\s\S]*?(?=test\("authentication does not fail over)',
    synthesis, t, count=1,
)
if n != 1:
    raise SystemExit(f"synthesis test replacement count={n}")

auth = '''test("authentication does not fail over; Atlas unavailable is terminal", async () => {
  const auth = fixture([res("unauthorized", 401)]);
  const denied = await auth.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(denied.ok, false);
  assert.equal(auth.calls.length, 1);
  assert.equal(auth.runner.calls, 0);

  const runner = new LocalRunner("must not run");
  const router = new AtlasHybridModelRouterV1({
    atlasClient: null,
    dots3Model: null,
    localRuntime: new LocalHuggingFaceRuntimeV1({ runner }),
  });
  const unavailable = await router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(unavailable.ok, false);
  assert.equal(runner.calls, 0);
});

test("DeepSeek cost ceiling rejection falls through to free Dots3 without local execution", async () => {
  const overBudget = new Response(JSON.stringify({
    choices: [{ message: { content: '{"answer":"paid"}' }, finish_reason: "stop" }],
    usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
    cost_usd: 0.026,
  }), { status: 200, headers: { "content-type": "application/json" } });
  const x = fixture([overBudget, res('{"answer":"dots-free"}')], "must not run");
  const result = await x.router.cognition({
    systemPrompt: "s",
    userPrompt: "u",
    maxCostMicros: 25_000,
  });
  assert.equal(result.ok && result.model === DOTS && result.text === "dots-free", true);
  assert.equal(x.runner.calls, 0);
  if (result.ok) {
    assert.equal(result.telemetry[0]?.fallbackReason, "cost_budget_rejected");
    assert.equal(result.telemetry.at(-1)?.model, DOTS);
  }
});

'''
t, n = re.subn(
    r'test\("authentication does not fail over; Atlas unavailable permits local cognition",[\s\S]*?(?=test\("authority invariants)',
    auth, t, count=1,
)
if n != 1:
    raise SystemExit(f"auth test replacement count={n}")

tp.write_text(t)

router = Path("src/model/providers/atlas-hybrid-router.ts").read_text()
if 'kind: "local" as const' in router:
    raise SystemExit("local hybrid step remains")
runtime = Path("src/fly/production-runtime.ts").read_text()
if "new LocalHuggingFaceSpawnExecutionBackendV1" in runtime:
    raise SystemExit("standalone local Spawn backend remains")
pc = Path("src/application/production-collaboration.ts").read_text()
block = pc.split("function targets() {", 1)[1].split("export function objectiveSpawnBudgetsV1", 1)[0]
for forbidden in ("HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1", "LOCAL_HF_PROVIDER_V1", "LOCAL_HF_MODEL_V1"):
    if forbidden in block:
        raise SystemExit(f"production target still contains {forbidden}")

print("bounded patch prepared")
