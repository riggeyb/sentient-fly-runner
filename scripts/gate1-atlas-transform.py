from pathlib import Path
import re
p=Path("scripts/gate1-live-cognition.mjs")
s=p.read_text()
def rep(old,new):
    global s
    if old not in s: raise SystemExit("missing_transform_anchor:"+old[:80])
    s=s.replace(old,new)
rep('import { OpenRouterAdapter, SentientRuntime }','import { AtlasCloudAdapter, SentientRuntime }')
rep('const MODEL="moonshotai/kimi-k3.1-pro", PROVIDER="openrouter";','const MODEL="moonshotai/kimi-k3.1-pro", PROVIDER="atlascloud";')
rep('MAX_OUT=320, MAX_REASON=320','MAX_OUT=700, MAX_REASON=700')
s=re.sub(r'const apiKey=process\\.env\\.OPENROUTER_API_KEY.*?\\|\\|"";',
         'const apiKey=process.env.ATLASCLOUD_API_KEY?.trim()||"";',s,count=1)
s,n=re.subn(r'\\nconst artifactSchema=\\{.*?\\};\\n\\nconst probes=', '\\nconst probes=',s,count=1,flags=re.S)
if n!=1: raise SystemExit("artifact_schema_anchor_missing")
rep('tools:[],outputSchema:artifactSchema,reasoningEffort:"low",requiredModelCapabilities:["text_generation","structured_output","reasoning_effort"],budget:{maxOutputTokens:MAX_OUT,timeoutMs:45000,maxRetries:1,maxToolRounds:0}',
    'tools:[],requiredModelCapabilities:["text_generation"],budget:{maxOutputTokens:MAX_OUT,timeoutMs:60000,maxRetries:0,maxToolRounds:0}')
rep('const messages=[{role:"user",content:p.objective}], dm=JSON.stringify({systemPolicy,messages,context});',
    'const messages=[{role:"user",content:p.objective+"\\nReturn JSON only with fields exactly: schemaVersion, problemRepresentation, keyFindings, hypotheses, recommendedApproach, evidenceRefs, constraints, toolRecommendations, risks, uncertainties, verificationNeeded. keyFindings and hypotheses are arrays; recommendedApproach is a string. Preserve "+p.c+" and "+p.e+" verbatim."}], dm=JSON.stringify({systemPolicy,messages,context});')
valid_repl='function valid(a,p){return!!a&&typeof a==="object"&&!Array.isArray(a)&&a.schemaVersion==="sentient-cognition-artifact/v1"&&typeof a.problemRepresentation==="string"&&a.problemRepresentation.length>0&&Array.isArray(a.keyFindings)&&Array.isArray(a.hypotheses)&&typeof a.recommendedApproach==="string"&&a.recommendedApproach.length>0&&Array.isArray(a.constraints)&&a.constraints.some(x=>String(x).includes(p.c))&&Array.isArray(a.evidenceRefs)&&a.evidenceRefs.some(x=>String(x).includes(p.e))&&Array.isArray(a.toolRecommendations)&&Array.isArray(a.risks)&&Array.isArray(a.uncertainties)&&Array.isArray(a.verificationNeeded)&&a.verificationNeeded.length>0}\\nfunction calc'
s,n=re.subn(r'function valid\\(a,p\\)\\{.*?\\}\\nfunction calc',valid_repl,s,count=1,flags=re.S)
if n!=1: raise SystemExit("validator_anchor_missing")
adapter_repl='const profile={model:MODEL,profileId:"gate1:kimi-k3.1-pro:atlascloud",capabilities:{text_generation:true,structured_output:false,tool_use:false,tool_continuation:false,reasoning_effort:false,image_input:false,server_side_tools:false},observation:{observedAt:"2026-11-05T00:00:00.000Z",source:"AtlasCloud public Kimi K3.1 Pro page"}};\\nconst adapter=new AtlasCloudAdapter({apiKey,modelProfiles:[profile],maxProviderRetries:0,admissionPolicy:{minStartIntervalMs:750,maxInFlight:1,maxInFlightPerModel:1,maxQueue:4}}), runtime=new SentientRuntime({adapters:[adapter]});'
s,n=re.subn(r'const profile=.*?const adapter=.*?runtime=new SentientRuntime\\(\\{adapters:\\[adapter\\]\\}\\);',adapter_repl,s,count=1,flags=re.S)
if n!=1: raise SystemExit("adapter_anchor_missing")
rep('queueWaitMs:null,retryCount:0','queueWaitMs:Number(r.metadata?.queueWaitMs??0),retryCount:Number(r.metadata?.retryCount??0)')
rep('const a=r.structured??{}, ok=valid(a,p);',
    'let a={};try{a=JSON.parse(String(r.text??"").trim().replace(/^```(?:json)?\\\\s*/i,"").replace(/\\\\s*```$/,""))}catch{} const ok=valid(a,p);')
rep('a.evidenceReferences','a.evidenceRefs')
rep('source:"OpenRouter Kimi K3.1 Pro public model page, checked 2026-11-05"',
    'source:"AtlasCloud Kimi K3.1 Pro public pricing page, checked 2026-11-05"')
rep('receipt.providerCalls++;const x=await runtime.execute(t,{provider:PROVIDER,model:MODEL}),r=x.result;',
    'receipt.providerCalls++;const x=await runtime.execute(t,{provider:PROVIDER,model:MODEL}),r=x.result;receipt.providerRetries+=Number(r.metadata?.retryCount??0);')
p=Path("gate1-atlas-runtime.mjs")
p.write_text(s)
print("ATLAS_GATE1_TRANSFORM=PASS")
