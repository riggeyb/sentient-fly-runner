from pathlib import Path
import re

def must_replace(s: str, old: str, new: str, label: str) -> str:
    n = s.count(old)
    print(label, n)
    if n != 1:
        raise SystemExit(f"{label}: expected 1, got {n}")
    return s.replace(old, new)

p = Path("src/model/providers/atlas-hybrid-router.ts")
lines = p.read_text().splitlines(keepends=True)
out = [ln for ln in lines if '{ kind: "local" as const' not in ln]
n = len(lines) - len(out)
print("router_local_steps_removed", n)
if n != 2:
    raise SystemExit("expected exactly two local hybrid plan rows")
p.write_text("".join(out))

p = Path("src/fly/production-runtime.ts")
lines = p.read_text().splitlines(keepends=True)
tokens = (
    "import { LocalHuggingFaceSpawnExecutionBackendV1 }",
    "new LocalHuggingFaceSpawnExecutionBackendV1(localHfRuntime)",
)
out = [ln for ln in lines if not any(t in ln for t in tokens)]
n = len(lines) - len(out)
print("runtime_local_spawn_lines_removed", n)
if n != 2:
    raise SystemExit("expected local Spawn import plus registration")
p.write_text("".join(out))

p = Path("src/application/production-collaboration.ts")
s = p.read_text()
s = must_replace(
    s,
    "[ATLAS_HYBRID_SPAWN_BACKEND_ID_V1, HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1]",
    "[ATLAS_HYBRID_SPAWN_BACKEND_ID_V1]",
    "backend_allowed",
)
s = must_replace(
    s,
    "[ATLAS_HYBRID_PROVIDER_ID_V1, LOCAL_HF_PROVIDER_V1]",
    "[ATLAS_HYBRID_PROVIDER_ID_V1]",
    "provider_allowed",
)
s = must_replace(
    s,
    "[ATLAS_HYBRID_ROUTE_MODEL_ID_V1, LOCAL_HF_MODEL_V1]",
    "[ATLAS_HYBRID_ROUTE_MODEL_ID_V1]",
    "model_allowed",
)
lines = s.splitlines(keepends=True)
out = []
removed_pref = 0
for ln in lines:
    if "`${HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1}:" in ln:
        removed_pref += 1
        continue
    out.append(ln)
print("local_preference_removed", removed_pref)
if removed_pref != 1:
    raise SystemExit("expected one local preference row")
p.write_text("".join(out))

p = Path("test/atlas-hybrid-router.test.ts")
t = p.read_text()

cognition = r'''test("cognition routes DeepSeek -> Dots3 and stops without local fallback", async () => {
  const dots = fixture([res("down", 503), res('{"answer":"dots"}')], "must-not-run");
  const result = await dots.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(result.ok && result.model === DOTS && result.text === "dots", true);
  assert.equal(dots.runner.calls, 0);

  const terminal = fixture([res("down", 503), res("bad-json")], "must-not-run");
  const failed = await terminal.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(failed.ok, false);
  assert.equal(terminal.runner.calls, 0);
  if (!failed.ok) {
    assert.equal(failed.reason, "terminal_unavailable");
    assert.deepEqual(failed.telemetry.map((v) => v.model), [DEEPSEEK_V3_2_MODEL_V1, DOTS]);
  }
});

'''
t, n = re.subn(
    r'test\("cognition routes DeepSeek -> Dots3 -> Local HF with finite attempts",[\s\S]*?(?=test\("synthesis routes)',
    cognition, t, count=1
)
print("cognition_test_replaced", n)
if n != 1:
    raise SystemExit("cognition test section mismatch")

synthesis = r'''test("synthesis routes Dots3 -> DeepSeek and stops without local fallback", async () => {
  const deep = fixture([res("down", 503), res("deep final")], "must-not-run");
  const result = await deep.router.synthesis({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(result.ok && result.model === DEEPSEEK_V3_2_MODEL_V1 && result.text === "deep final", true);
  assert.equal(deep.runner.calls, 0);

  const terminal = fixture([res("down", 503), res("down", 503)], "must-not-run");
  const failed = await terminal.router.synthesis({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(failed.ok, false);
  assert.equal(terminal.runner.calls, 0);
  if (!failed.ok) assert.deepEqual(failed.telemetry.map((v) => v.attemptNumber), [1, 2]);
});

'''
t, n = re.subn(
    r'test\("synthesis routes Dots3 -> DeepSeek -> Local HF",[\s\S]*?(?=test\("authentication does not fail over)',
    synthesis, t, count=1
)
print("synthesis_test_replaced", n)
if n != 1:
    raise SystemExit("synthesis test section mismatch")

auth_cost = r'''test("Atlas unavailable is terminal; local runtime is not executed", async () => {
  const auth = fixture([res("unauthorized", 401)]);
  const denied = await auth.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(denied.ok, false);
  assert.equal(auth.runner.calls, 0);

  const runner = new LocalRunner("must-not-run");
  const router = new AtlasHybridModelRouterV1({
    atlasClient: null,
    dots3Model: null,
    localRuntime: new LocalHuggingFaceRuntimeV1({ runner }),
  });
  const unavailable = await router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(unavailable.ok, false);
  assert.equal(runner.calls, 0);
});

test("DeepSeek cost ceiling rejection falls through to free Dots3", async () => {
  const overBudget = new Response(JSON.stringify({
    choices: [{ message: { content: '{"answer":"paid"}' }, finish_reason: "stop" }],
    usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
    cost_usd: 0.026,
  }), { status: 200, headers: { "content-type": "application/json" } });
  const x = fixture([overBudget, res('{"answer":"dots-free"}')], "must-not-run");
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
    auth_cost, t, count=1
)
print("auth_cost_test_replaced", n)
if n != 1:
    raise SystemExit("auth test section mismatch")
p.write_text(t)

router = Path("src/model/providers/atlas-hybrid-router.ts").read_text()
runtime = Path("src/fly/production-runtime.ts").read_text()
collab = Path("src/application/production-collaboration.ts").read_text()
target = collab.split("function targets() {", 1)[1].split("export function objectiveSpawnBudgetsV1", 1)[0]
assert 'kind: "local" as const' not in router
assert "new LocalHuggingFaceSpawnExecutionBackendV1" not in runtime
for forbidden in ("HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1", "LOCAL_HF_PROVIDER_V1", "LOCAL_HF_MODEL_V1"):
    assert forbidden not in target
print("PATCH_READY")
