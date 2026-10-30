from pathlib import Path

def replace_once(p: Path, old: str, new: str, label: str) -> None:
    s = p.read_text()
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected 1, got {n}")
    p.write_text(s.replace(old, new, 1))

p = Path("src/model/providers/atlas-hybrid-router.ts")
replace_once(
    p,
    '  fallbackReason: string | null;\n',
    '  fallbackReason: string | null;\n  failureReason: string | null;\n',
    "telemetry interface",
)
replace_once(
    p,
    '          fallbackReason,\n          rootAccepted: null,\n',
    '          fallbackReason,\n          failureReason: null,\n          rootAccepted: null,\n',
    "local success telemetry",
)
replace_once(
    p,
    '          fallbackReason: signal.aborted ? "timeout" : safeReason(error),\n          rootAccepted: null,\n',
    '          fallbackReason,\n          failureReason: signal.aborted ? "timeout" : safeReason(error),\n          rootAccepted: null,\n',
    "local failure telemetry",
)
replace_once(
    p,
    '    fallbackReason,\n    rootAccepted: null,\n',
    '    fallbackReason,\n    failureReason: null,\n    rootAccepted: null,\n',
    "atlas success telemetry",
)
replace_once(
    p,
    '    fallbackReason: fallbackReason ?? reason,\n    rootAccepted: null,\n',
    '    fallbackReason: fallbackReason ?? reason,\n    failureReason: reason,\n    rootAccepted: null,\n',
    "atlas failure telemetry",
)

p = Path("src/model/providers/atlas-hybrid-adapters.ts")
replace_once(
    p,
    '  const attemptSummary = telemetry\n    .map((item) => `${item.model}:${item.fallbackReason ?? "unknown"}`)\n',
    '  const attemptSummary = telemetry\n    .map((item) => `${item.model}:${item.failureReason ?? item.fallbackReason ?? "unknown"}`)\n',
    "failure summary",
)

p = Path("test/atlas-hybrid-router.test.ts")
s = p.read_text()
marker = 'test("authority invariants and root timeout remain exact", () => {'
if s.count(marker) != 1:
    raise SystemExit("test insertion marker mismatch")
insert = '''test("telemetry distinguishes fallback trigger from current attempt failure", async () => {
  const x = fixture([res("rate limit", 429), res("provider down", 503)], "must-not-run");
  const result = await x.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.telemetry[0]?.failureReason, "rate_limit");
    assert.equal(result.telemetry[1]?.fallbackReason, "rate_limit");
    assert.equal(result.telemetry[1]?.failureReason, "provider_unavailable");
  }
});

'''
p.write_text(s.replace(marker, insert + marker, 1))
