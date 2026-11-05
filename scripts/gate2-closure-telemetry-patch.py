from pathlib import Path
p=Path("gate2-closure-runtime.mjs")
s=p.read_text()
old='provider:"AtlasCloud",model:M,providerCalls:1,'
new='provider:"AtlasCloud",model:M,providerRequestId:result.providerRequestId??rawMeta.responseId??null,latencyMs:result.latencyMs,queueWaitMs:Number(result.metadata?.queueWaitMs??0),providerReportedCostUsd:typeof result.metadata?.observedCostUsd==="number"?result.metadata.observedCostUsd:null,providerCalls:1,'
if old not in s:
    raise SystemExit("telemetry_anchor_missing")
s=s.replace(old,new,1)
p.write_text(s)
print("GATE2_CLOSURE_TELEMETRY_PATCH=PASS")
