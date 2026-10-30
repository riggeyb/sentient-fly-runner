from pathlib import Path


def replace_once(p: Path, old: str, new: str) -> None:
    s = p.read_text()
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"{p}: expected 1, got {n}: {old!r}")
    p.write_text(s.replace(old, new, 1))

p = Path("src/model/providers/atlas-hybrid-router.ts")
replace_once(p, "  fallbackReason: string | null;\n", "  fallbackReason: string | null;\n  failureReason: string | null;\n")
replace_once(p, "          fallbackReason,\n          rootAccepted: null,\n", "          fallbackReason,\n          failureReason: null,\n          rootAccepted: null,\n")
replace_once(p, "          fallbackReason,\n          rootAccepted: null,\n", "          fallbackReason,
          failureReason: null,\n          rootAccepted: null,\n")
replace_once(p, "          fallbackReason: signal.aborted ? \"timeout\" : safeReason(error),\n          rootAccepted: null,\n", "          fallbackReason,\n          failureReason: signal.aborted ? \"timeout\" : safeReason(error),\n          rootAccepted: null,\n")
replace_once(p, "        fallbackReason: fallbackReason ?? reason,\n        rootAccepted: null,\n", "        fallbackReason: fallbackReason ?? reason,
        failureReason: reason,\n        rootAccepted: null,\n")

p = Path("src/model/providers/atlas-hybrid-adapters.ts")
replace_once(p, "  const attemptSummary = telemetry\n    .map((item) => `${item.model}:${item.fallbackReason ?? \"unknown\"}`)", "  const attemptSummary = telemetry\n    .map((item) => `${item.model}:${item.failureReason ?? item.fallbackReason ?? \"unknown\"}`)")

t = Path("test/atlas-hybrid-router.test.ts")
s = t.read_text()
insert = r'''
test("telemetry distinguishes fallback trigger from current attempt failure", async () => {
  const x = fixture([res("rate limit", 429), res("provider down", 503)], "must-not-run");
  const result = await x.router.cognition({ systemPrompt: "s", userPrompt: "u" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.telemetry[0]?.failureReason, "rate_limit");
    assert.equal(result.telemetry[1]?.fallbackReason, "rate_limit");
    assert.equal(result.telemetry[1]?.failureReason, "provider_unavailable");
  }
});

'test("authority invariants and root timeout remain exact", () => {'
if marker not in s:
    raise SystemExit("test marker missing")
s = s.replace(marker, insert + "\n" + marker, 1)
t.write_text(s)
