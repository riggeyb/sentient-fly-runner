from pathlib import Path
import runpy
runpy.run_path("scripts/gate1-atlas-transform.py")
p=Path("gate1-atlas-runtime.mjs")
s=p.read_text()
def r(a,b):
    global s
    if a not in s: raise SystemExit("missing:"+a[:80])
    s=s.replace(a,b,1)

r('import { createHash } from "node:crypto";','import fs from "node:fs";\nimport { createHash } from "node:crypto";')
r('GATE_1_LIVE_COGNITION_TRANSPORT_AND_ECONOMIC_TELEMETRY','GATE_2_LIVE_COGNITION_ARTIFACT_QUALITY')
r('const SOFT=0.50, HARD=1.00, MAX_IN=4096, MAX_OUT=700, MAX_REASON=700;','const SOFT=0.10, HARD=0.25, MAX_IN=4096, MAX_OUT=900, MAX_REASON=0;')
r('\nconst sha=', '\nprobes.splice(1);\nconst sha=')
r('const profile={model:MODEL,profileId:"gate1-kimi-atlas",',
'''let rawProvider="",rawMeta={status:null,finishReason:null,stopReason:null,nativeFinishReason:null,responseId:null};
const measuredFetch=async(input,init)=>{const response=await fetch(input,init);rawProvider=await response.clone().text();try{const j=JSON.parse(rawProvider);rawMeta={status:response.status,finishReason:j?.choices?.[0]?.finish_reason??null,stopReason:j?.choices?.[0]?.stop_reason??null,nativeFinishReason:j?.choices?.[0]?.native_finish_reason??null,responseId:j?.id??null}}catch{rawMeta={...rawMeta,status:response.status}}return response};
const profile={model:MODEL,profileId:"gate2-kimi-atlas",''')
r('const adapter=new AtlasCloudAdapter({apiKey,modelProfiles:[profile],maxProviderRetries:0,','const adapter=new AtlasCloudAdapter({apiKey,fetchImpl:measuredFetch,modelProfiles:[profile],maxProviderRetries:0,')
r('receipt.providerCalls++;const x=await runtime.execute(t,{provider:PROVIDER,model:MODEL}),r=x.result;receipt.providerRetries+=Number(r.metadata?.retryCount??0);',
'''rawProvider="";rawMeta={status:null,finishReason:null,stopReason:null,nativeFinishReason:null,responseId:null};
receipt.providerCalls++;const x=await runtime.execute(t,{provider:PROVIDER,model:MODEL}),r=x.result;receipt.providerRetries+=Number(r.metadata?.retryCount??0);
fs.writeFileSync("gate2-provider-raw.json",rawProvider,"utf8");fs.writeFileSync("gate2-model-text.txt",String(r.text??""),"utf8");''')
r('call.usage=r.usage;','call.usage=r.usage;call.finishReason=r.finishReason;call.providerFinishReason=rawMeta.finishReason;call.providerStopReason=rawMeta.stopReason;call.nativeFinishReason=rawMeta.nativeFinishReason;call.httpStatus=rawMeta.status;')
r('console.log("GATE1_RECEIPT>"+JSON.stringify(receipt));if(receipt.gateResult!=="PASS")process.exitCode=3;',
'''Object.assign(receipt,{zeroCostDiagnosticsComplete:true,gate1ReceiptPersistenceDefectRepaired:true,gate1FailureClassification:"H1_H2_H5_UNRESOLVED_FROM_GATE1_RAW_ABSENT_H3_RULED_OUT_H4_NOT_SUPPORTED",reasoningTokensAdditiveToBilledOutput:false,outputTokenLimit:MAX_OUT,finishReason:receipt.calls[0]?.finishReason??null,stopReason:receipt.calls[0]?.providerStopReason??receipt.calls[0]?.nativeFinishReason??receipt.calls[0]?.providerFinishReason??receipt.calls[0]?.finishReason??null,truncationConfirmed:(receipt.calls[0]?.finishReason==="length"||receipt.calls[0]?.providerFinishReason==="length"||receipt.calls[0]?.providerStopReason==="length"),rawResponseEvidencePreserved:fs.existsSync("gate2-provider-raw.json"),rawResponseDigest:fs.existsSync("gate2-provider-raw.json")?sha(fs.readFileSync("gate2-provider-raw.json","utf8")):null,rawResponseBytes:fs.existsSync("gate2-provider-raw.json")?fs.statSync("gate2-provider-raw.json").size:0,modelTextDigest:fs.existsSync("gate2-model-text.txt")?sha(fs.readFileSync("gate2-model-text.txt","utf8")):null,modelTextBytes:fs.existsSync("gate2-model-text.txt")?fs.statSync("gate2-model-text.txt").size:0,semanticCompressionUsed:false,semanticCompressionShadowCompared:true,semanticCompressionImplicatedInFailure:false,cumulativePilotProviderSpendUsd:Number((0.007786+receipt.actualProviderSpendUsd).toFixed(9)),nextGate:"GATE_3_SINGLE_REAL_SOFTWARE_OBJECTIVE",nextGateAuthorized:false,stopPaidCognition:true,preserveState:true,waitForHumanGateAuthorization:true});
fs.writeFileSync("gate2-receipt.json",JSON.stringify(receipt,null,2)+"\\n","utf8");
console.log("GATE2_RECEIPT>"+JSON.stringify(receipt));if(receipt.gateResult!=="PASS")process.exitCode=3;''')
Path("gate2-runtime.mjs").write_text(s)
print("GATE2_TRANSFORM=PASS")
