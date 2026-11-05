from pathlib import Path
p=Path("scripts/gate2-finalize-second-call.mjs")
s=p.read_text()
pairs={
'const total=(k)=>Number(p[k]==?0)+Number(c[k]??0);':'const total=(k)=>Number(p[k]??0)+Number(c[k]??0);',
'finishReasonCaptured:!!c.finishReasonlrawResponseEvidencePreserved:c.rawResponseEvidencePreserved===true,':'finishReasonCaptured:!!c.finishReason,rawResponseEvidencePreserved:c.rawResponseEvidencePreserved===true,',
'const gateSpend=Number(Number(p.actualProviderSpendUsd)+Number(c.actualProviderSpendUsd??0)).toFixed(9));':'const gateSpend=Number(Number(p.actualProviderSpendUsd)+Number(c.secondCallProviderSpendUsd??c.actualProviderSpendUsd??0)).toFixed(9));',
'secondCallProviderSpendUsd:Number(c.actualProviderSpendUsd??0),':'secondCallProviderSpendUsd:Number(c.secondCallProviderSpendUsd??c.actualProviderSpendUsd??0),'
}
for a,b in pairs.items():
    if a not in s: raise SystemExit("missing finalizer anchor: "+a[:50])
    s=s.replace(a,b,1)
p.write_text(s)
print("GATE2_FINALIZER_FIX=PASS")
