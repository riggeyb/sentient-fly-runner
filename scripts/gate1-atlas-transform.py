from pathlib import Path
import re
s=Path("scripts/gate1-live-cognition.mjs").read_text()
def r(a,b):
 global s
 if a not in s: raise SystemExit("missing:"+a[:60])
 s=s.replace(a,b)
r("OpenRouterAdapter, SentientRuntime","AtlasCloudAdapter, SentientRuntime")
r('PROVIDER="openrouter"','PROVIDER="atlascloud"')
r("MAX_OUT=320, MAX_REASON=320","MAX_OUT=700, MAX_REASON=700")
s,n=re.subn(r'const apiKey=process\.env\.OPENROUTER_API_KEY.*?\|\|"";','const apiKey=process.env.ATLASCLOUD_API_KEY?.trim()||"";',s,count=1)
if n!=1: raise SystemExit("api_key_anchor")
r('tools:[],outputSchema:artifactSchema,reasoningEffort:"low",requiredModelCapabilities:["text_generation","structured_output","reasoning_effort"],budget:{maxOutputTokens:MAX_OUT,timeoutMs:45000,maxRetries:1,maxToolRounds:0}',
  'tools:[],requiredModelCapabilities:["text_generation"],budget:{maxOutputTokens:MAX_OUT,timeoutMs:60000,maxRetries:0,maxToolRounds:0}')
r('content:p.objective}', 'content:p.objective+"\\nReturn JSON only with exactly these fields: schemaVersion, problemRepresentation, keyFindings, hypotheses, recommendedApproach, evidenceRefs, constraints, toolRecommendations, risks, uncertainties, verificationNeeded. recommendedApproach is a string. keyFindings items have claim,evidenceRefs,confidence. hypotheses items have hypothesis,status,evidenceRefs. toolRecommendations items have tool,rationale. Preserve "+p.c+" and "+p.e+" verbatim."}')
nv='function valid(a,p){let k=["schemaVersion","problemRepresentation","keyFindings","hypotheses","recommendedApproach","evidenceRefs","constraints","toolRecommendations","risks","uncertainties","verificationNeeded"];return!!a&&typeof a==="object"&&!Array.isArray(a)&&Object.keys(a).sort().join("|")===k.sort().join("|")&&a.schemaVersion==="sentient-cognition-artifact/v1"&&typeof a.problemRepresentation==="string"&&Array.isArray(a.keyFindings)&&Array.isArray(a.hypotheses)&&typeof a.recommendedApproach==="string"&&Array.isArray(a.evidenceRefs)&&a.evidenceRefs.some(x=>String(x).includes(p.e))&&Array.isArray(a.constraints)&&a.constraints.some(x=>String(x).includes(p.c))&&Array.isArray(a.toolRecommendations)&&Array.isArray(a.risks)&&Array.isArray(a.uncertainties)&&Array.isArray(a.verificationNeeded)&&a.verificationNeeded.length>0}\nfunction calc'
s,n=re.subn(r'function valid\(a,p\)\{.*?\}\nfunction calc',nv,s,count=1,flags=re.S)
if n!=1: raise SystemExit("validator_anchor")
na='const profile={model:MODEL,profileId:"gate1:kimi-atlas",capabilities:{text_generation:true,structured_output:false,tool_use:false,tool_continuation:false,reasoning_effort:false,image_input:false,server_side_tools:false},observation:{observedAt:"2026-11-05T00:00:00.000Z",source:"AtlasCloud"}};\nconst adapter=new AtlasCloudAdapter({apiKey,modelProfiles:[profile],maxProviderRetries:0,admissionPolicy:{minStartIntervalMs:750,maxInFlight:1,maxInFlightPerModel:1,maxQueue:4}}), runtime=new SentientRuntime({adapters:[adapter]});'
s,n=re.subn(r'const profile=.*?const adapter=.*?runtime=new SentientRuntime\(\{adapters:\[adapter\]\}\);',na,s,count=1,flags=re.S)
if n!=1: raise SystemExit("adapter_anchor")
r("queueWaitMs:null,retryCount:0","queueWaitMs:Number(r.metadata?.queueWaitMs??0),retryCount:Number(r.metadata?.retryCount??0)")
r("const a=r.structured??{}, ok=valid(a,p);",'let a={};try{a=JSON.parse(String(r.text??"").trim().replace(/^```(?:json)?\\s*/i,"").replace(/\\s*```$/,""))}catch{} const ok=valid(a,p);')
r("a.evidenceReferences","a.evidenceRefs")
r('receipt.providerCalls++;const x=await runtime.execute(t,{provider:PROVIDER,model:MODEL}),r=x.result;','receipt.providerCalls++;const x=await runtime.execute(t,{provider:PROVIDER,model:MODEL}),r=x.result;receipt.providerRetries+=Number(r.metadata?.retryCount??0);')
r('"../sentient/','"./sentient/')
Path("gate1-atlas-runtime.mjs").write_text(s)
print("ATLAS_GATE1_TRANSFORM=PASS")
