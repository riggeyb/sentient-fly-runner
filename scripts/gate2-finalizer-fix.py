from pathlib import Path
p=Path("scripts/gate2-finalize-second-call.mjs")
s=p.read_text()
for bad in ("p[k]==?0","finishReasonCaptured:!!c.finishReasonlrawResponseEvidencePreserved"):
    if bad in s:
        raise SystemExit("stale corrupted finalizer token remains: "+bad)
required=[
    'const total=k=>Number(p[k]??0)+Number(c[k]??0);',
    'finishReasonCaptured:!!c.finishReason,',
    'rawResponseEvidencePreserved:c.rawResponseEvidencePreserved===true,',
    'c.secondCallProviderSpendUsd??c.actualProviderSpendUsd??0',
    'economicTelemetryComplete:'
]
for anchor in required:
    if anchor not in s:
        raise SystemExit("missing corrected finalizer anchor: "+anchor)
print("GATE2_FINALIZER_FIX=PASS_ALREADY_CORRECT")
