import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";

const BASE=process.env.BASELINE_SHA;
const TREE=process.env.BASELINE_TREE;
const CORPUS_DIGEST=process.env.CORPUS_DIGEST;
const DOCTRINE_DIGEST=process.env.DOCTRINE_DIGEST;
const OUT=process.env.MEASUREMENT_OUT||"measurement.json";
const LIVE=String(process.env.RUN_LIVE_ATLAS).toLowerCase()==="true";
const MAX_CALLS=Math.max(1,Math.min(40,Number(process.env.MAX_PROVIDER_CALLS||40)));
const MAX_WALL=240_000, wallStart=Date.now();
const sha=x=>"sha256:"+createHash("sha256").update(x).digest("hex");
const pct=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.max(0,Math.ceil(p*s.length)-1))]};
const sum=a=>a.filter(Number.isFinite).reduce((x,y)=>x+y,0);
const med=a=>pct(a,.5);

const api=await import("./sentient/dist/src/index.js");
const {AtlasCloudAdapter,AtlasHybridRouter,SentientRuntime,AtlasAdmissionController,allocateCognitiveBudget,adaptCognitiveBudget}=api;
const {buildAdaptiveContextBundle,sha256Text}=api.retrieval;
const DEEPSEEK="deepseek-ai/deepseek-v3.2", DOTS3="dots-studio/dots-3-note-prev-free";
const corpusRaw=await readFile("./corpus-source/test/fixtures/cognitive-frontier/corpus-v1.json","utf8");
const doctrineRaw=await readFile("./corpus-source/test/fixtures/cognitive-frontier/doctrine-v2.json","utf8");
if(sha(corpusRaw)!==CORPUS_DIGEST)throw new Error("corpus_digest_mismatch");
if(sha(doctrineRaw)!==DOCTRINE_DIGEST)throw new Error("doctrine_digest_mismatch");
const corpus=JSON.parse(corpusRaw), doctrine=JSON.parse(doctrineRaw);
if(corpus.tasks.length!==15)throw new Error("corpus_task_count");
const superseded=new Set(["dots3Blocked=true","dots3Started=false"]);
const ceiling=()=>({evidence:1,cognition:1,action:1,verification:1,maxActionRounds:4,maxProviderRetries:1,objectiveDeadlineAt:Date.now()+60_000});
const sig=(x={})=>({complexity:.2,uncertainty:.2,consequence:.2,evidenceSufficiency:.8,toolComplexity:.2,priorFailurePressure:0,...x});
const contextRange={minArtifacts:1,maxArtifacts:4,minTotalChars:64,maxTotalChars:2048,maxArtifactChars:1024};

function parseJson(text){
  if(typeof text!=="string")return null;
  let s=text.trim(); if(s.startsWith("```"))s=s.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  try{return JSON.parse(s)}catch{return null}
}
function scalar(v){
  if(v==="true")return true;if(v==="false")return false;if(/^-?\d+(?:\.\d+)?$/.test(v))return Number(v);return v;
}
function score(task,obj){
  const active=task.deterministicAssertions.filter(x=>!superseded.has(x));
  const checks=[];
  for(const a of active){
    let ok=false;
    if(a.startsWith("contains=")){ok=JSON.stringify(obj??{}).includes(a.slice(9))}
    else if(a.includes("<=")){const [k,v]=a.split("<=");ok=typeof obj?.[k]==="number"&&obj[k]<=Number(v)}
    else if(a.includes("=")){
      const i=a.indexOf("="),k=a.slice(0,i),v=a.slice(i+1);
      if(k==="tools"){ok=Array.isArray(obj?.tools)&&v.split(",").every(x=>obj.tools.includes(x))}
      else ok=obj?.[k]===scalar(v);
    } else ok=obj?.[a]===true;
    checks.push({assertion:a,ok});
  }
  const refs=Array.isArray(obj?.evidenceRefs)?obj.evidenceRefs:[];
  const evidence=(task.requiredEvidence||[]).every(x=>refs.includes(x))&&refs.every(x=>(task.permittedEvidence||[]).includes(x));
  const actions=Array.isArray(obj?.proposedActions)?obj.proposedActions:[];
  const allowed=new Set(task.permittedActions||[]);
  const actionSafe=actions.every(x=>allowed.has(typeof x==="string"?x:x?.type));
  return {schemaValid:!!obj&&typeof obj==="object"&&!Array.isArray(obj),assertionsPassed:checks.every(x=>x.ok),evidenceGrounded:evidence,actionsSafe:actionSafe,checks,passed:!!obj&&checks.every(x=>x.ok)&&evidence&&actionSafe};
}
async function artifacts(task){
  const out=[];
  for(const e of task.permittedEvidence||[]){
    const content=`Evidence label: ${e}`;
    out.push({kind:"evidence",stableId:`${task.taskId}:${e}`,content,contentDigest:await sha256Text(content),provenance:{sourceId:task.taskId,topic:task.taskClass,sourceClass:"frozen_corpus",authorityTier:"verified_secondary",retrievalMethod:"frozen_fixture",canonicalLocation:"corpus-v1",freshnessPolicy:{maxAgeMs:null},retrievedAt:"2026-11-02T00:00:00.000Z",sourceDigest:await sha256Text(task.inputDigest)},verified:true,priority:1});
  }
  return out;
}
async function prepared(task,signals=sig(),range=contextRange,opt={}){
  const ctx=await buildAdaptiveContextBundle(await artifacts(task),allocateCognitiveBudget(signals,ceiling()).evidence,range);
  return {taskId:task.taskId,sessionId:"measure",traceId:`m:${task.taskId}:${opt.label||"base"}`,runtime:{name:"stronger-sentient-measure",version:BASE},systemPolicy:"Return one JSON object only. Model output is never authority. Use only supplied evidence. Do not call tools or take effects.",messages:[{role:"user",content:`Goal: ${task.input.goal}\nReturn JSON with evidenceRefs (array of evidence labels), proposedActions (array), and any fields needed to answer the goal. Evidence labels available: ${(task.permittedEvidence||[]).join(", ")}.`}],context:ctx,tools:[],requiredModelCapabilities:["text_generation"],budget:{maxOutputTokens:opt.maxOutputTokens||384,timeoutMs:opt.timeoutMs||30_000,maxRetries:1,maxToolRounds:0},verifier:{verifierId:task.verifierDefinition,configuration:{}},cognitivePolicy:{signals,ceiling:ceiling(),contextRange:range},inputDigest:task.inputDigest};
}

const local={budgets:{},failures:{},context:{},admission:[]};
for(const [k,v] of Object.entries({baseline:sig(),highUncertainty:sig({uncertainty:1,evidenceSufficiency:0}),highComplexity:sig({complexity:1}),highTool:sig({toolComplexity:1}),highConsequence:sig({consequence:1})})) local.budgets[k]=allocateCognitiveBudget(v,ceiling());
for(const f of ["evidence_deficit","inference_deficit","action_deficit","schema_deficit","verification_deficit","provider_failure","deadline_pressure","policy_rejection","unknown"]) local.failures[f]=adaptCognitiveBudget(local.budgets.baseline,f,ceiling());
const ctxCandidates=await artifacts(corpus.tasks.find(t=>t.taskId==="cog-v1-13"));
for(const e of [.2,.6,.9]){const b=await buildAdaptiveContextBundle(ctxCandidates,e,contextRange);local.context[e]={artifacts:b.artifacts.length,chars:b.artifacts.reduce((n,x)=>n+x.content.length,0),digest:b.contextDigest,bounds:b.bounds}}
async function burst(n){
  const c=new AtlasAdmissionController(), starts=[], waits=[], by=new Map();let active=0,max=0;const t0=performance.now();
  await Promise.all(Array.from({length:n},(_,i)=>{const model=i%2?DOTS3:DEEPSEEK;return c.run({model,deadlineAt:Date.now()+30_000},async()=>{const t=Math.round(performance.now()-t0);starts.push({model,t});active++;max=Math.max(max,active);by.set(model,(by.get(model)||0)+1);await new Promise(r=>setTimeout(r,900));active--;by.set(model,by.get(model)-1);return i}).then(x=>waits.push(x.queueWaitMs))}));
  starts.sort((a,b)=>a.t-b.t);const spacing=starts.slice(1).map((x,i)=>x.t-starts[i].t);
  return {n,maxInFlight:max,minStartSpacingMs:spacing.length?Math.min(...spacing):null,queueWaitP50:med(waits),queueWaitP95:pct(waits,.95),starts};
}
for(const n of [1,2,4,8])local.admission.push(await burst(n));

const report={schemaVersion:"stronger-sentient-measurement/v2",baseline:{sha:BASE,tree:TREE,acceptanceRun:41483844842},corpus:{sha:"9c037505f65663ae6b7e8990ae969639572860d9",digest:CORPUS_DIGEST,doctrineDigest:DOCTRINE_DIGEST,tasks:15,supersededAssertions:[...superseded]},envelope:{maxProviderCalls:MAX_CALLS,maxWallClockMs:MAX_WALL,maxProviderRetriesPerAttempt:1,maxMonetaryCost:null},local,live:{available:false},notes:["No tools/effects executed.","Context token count is not separately reported by Atlas.","Verification allocation is measured as runtime intensity; this baseline does not schedule extra critic rounds.","Cross-model artifact handoff is not invented; only incumbent routing and matched controls are measured."]};

if(LIVE){
  const key=String(process.env.ATLASCLOUD_API_KEY||"").trim();
  if(!key){report.live={available:false,reason:"authorized_secret_unavailable"}}
  else{
    let calls=0;const http=[];const boundedFetch=async(url,init)=>{if(calls>=MAX_CALLS)throw new Error("provider_call_ceiling");if(Date.now()-wallStart>MAX_WALL)throw new Error("measurement_wall_clock_ceiling");calls++;const start=performance.now();const body=init?.body?JSON.parse(String(init.body)):{};const r=await fetch(url,{...init,signal:AbortSignal.any([init?.signal||AbortSignal.timeout(30_000),AbortSignal.timeout(30_000)])});http.push({ordinal:calls,model:body.model??null,status:r.status,latencyMs:Math.round(performance.now()-start),requestIdPresent:Boolean(r.headers.get("x-request-id")||r.headers.get("request-id")),reasoningEffort:body.reasoning?.effort??null});return r};
    const baseCaps={text_generation:true,structured_output:false,tool_use:false,tool_continuation:false,image_input:false,server_side_tools:false};
    const adapter=new AtlasCloudAdapter({apiKey:key,fetchImpl:boundedFetch,maxProviderRetries:1,modelProfiles:[{model:DEEPSEEK,capabilities:{...baseCaps,reasoning_effort:true},profileId:"measure-deepseek"},{model:DOTS3,capabilities:{...baseCaps,reasoning_effort:false},profileId:"measure-dots3"}]});
    const runtime=new SentientRuntime({adapters:[adapter]}),router=new AtlasHybridRouter();
    const rows=[];
    async function run(task,opt={}){
      const p=await prepared(task,opt.signals||sig(),opt.range||contextRange,opt);
      const start=performance.now();
      let exec;
      if(opt.target){const alloc=allocateCognitiveBudget(p.cognitivePolicy.signals,p.cognitivePolicy.ceiling);const b=await api.retrieval.rebudgetContextBundle(p.context,alloc.evidence,p.cognitivePolicy.contextRange);const effort=opt.target.model===DEEPSEEK?(alloc.cognition<.34?"low":alloc.cognition<.67?"medium":"high"):undefined;const one=await runtime.execute({...p,context:b,...(effort?{reasoningEffort:effort}:{})},opt.target);exec={stage:opt.stage||"cognition",attempts:[one],final:one,preparedTask:{...p,context:b},cognitiveState:{allocation:alloc,verificationIntensity:alloc.verification,maxToolRounds:0,contextDigest:b.contextDigest}}}
      else exec=await runtime.executeAdaptive(p,router,opt.stage||"cognition");
      const final=exec.final.result,obj=final.ok?parseJson(final.text):null,verification=score(task,obj);
      const attempts=exec.attempts.map(a=>({route:`${a.target.provider}:${a.target.model}`,ok:a.result.ok,queueWaitMs:Number(a.result.metadata?.queueWaitMs??0),providerLatencyMs:a.result.latencyMs,retryCount:Number(a.result.metadata?.retryCount??0),inputTokens:a.result.ok?a.result.usage.inputTokens:null,outputTokens:a.result.ok?a.result.usage.outputTokens:null,reasoningTokens:a.result.ok?(a.result.usage.reasoningTokens??null):null,requestIdPresent:Boolean(a.result.providerRequestId),costUsd:a.result.ok&&Number.isFinite(a.result.metadata?.observedCostUsd)?a.result.metadata.observedCostUsd:null,failure:a.result.ok?null:(a.result.metadata?.failureClass??a.result.code),reasoningEffort:a.request.reasoningEffort??null}));
      return {label:opt.label||"baseline",taskId:task.taskId,taskClass:task.taskClass,stage:opt.stage||"cognition",finalRoute:attempts.at(-1)?.route??null,fallbackCount:Math.max(0,attempts.length-1),fallbackReason:attempts.length>1?attempts[0].failure:null,allocation:exec.cognitiveState?.allocation??null,contextArtifacts:exec.preparedTask?.context?.artifacts?.length??p.context.artifacts.length,contextDigest:exec.cognitiveState?.contextDigest??p.context.contextDigest,contextTokens:null,toolRounds:0,verificationRounds:1,endToEndLatencyMs:Math.round(performance.now()-start),attempts,verification,taskResult:verification.passed?"passed":"failed",outputDigest:final.ok?sha(final.text??""):null,outputChars:final.ok?(final.text?.length??0):0};
    }
    for(const task of corpus.tasks){if(calls>=MAX_CALLS-2||Date.now()-wallStart>MAX_WALL-35_000)break;rows.push(await run(task,{stage:task.taskClass==="context_synthesis"?"synthesis":"cognition"}))}
    if(rows.filter(x=>x.label==="baseline").length!==15)throw new Error(`baseline_incomplete:${rows.length}/15`);
    const experiments={context:[],cognition:[],controls:[],admissionBurst:null};
    const t8=corpus.tasks.find(t=>t.taskId==="cog-v1-08"),t2=corpus.tasks.find(t=>t.taskId==="cog-v1-02");
    if(calls<=MAX_CALLS-4){const r={minArtifacts:1,maxArtifacts:2,minTotalChars:64,maxTotalChars:512,maxArtifactChars:256};experiments.context.push(await run(t8,{label:"evidence-low",signals:sig({evidenceSufficiency:.95}),range:r}));experiments.context.push(await run(t8,{label:"evidence-high",signals:sig({evidenceSufficiency:.05}),range:r}))}
    if(calls<=MAX_CALLS-4){experiments.cognition.push(await run(t2,{label:"cognition-low",signals:sig({complexity:0})}));experiments.cognition.push(await run(t2,{label:"cognition-high",signals:sig({complexity:1})}))}
    for(const id of ["cog-v1-08","cog-v1-13"]){if(calls>MAX_CALLS-4)break;const t=corpus.tasks.find(x=>x.taskId===id);experiments.controls.push(await run(t,{label:"deepseek-control",target:{provider:"atlascloud",model:DEEPSEEK}}));experiments.controls.push(await run(t,{label:"dots3-control",target:{provider:"atlascloud",model:DOTS3}}))}
    if(calls<=MAX_CALLS-4){const t=corpus.tasks.find(x=>x.taskId==="cog-v1-09"),start=performance.now();experiments.admissionBurst=await Promise.all([DEEPSEEK,DOTS3,DEEPSEEK,DOTS3].map(async(model,i)=>{const p=await prepared(t,sig(),contextRange,{label:`burst-${i}`,maxOutputTokens:192,timeoutMs:20_000});const r=await runtime.execute(p,{provider:"atlascloud",model});return{model,ok:r.result.ok,queueWaitMs:Number(r.result.metadata?.queueWaitMs??0),providerLatencyMs:r.result.latencyMs,endToEndLatencyMs:Math.round(performance.now()-start),retryCount:Number(r.result.metadata?.retryCount??0)}}))}
    const attempts=rows.flatMap(x=>x.attempts),baselineHttp=http.slice(0,calls);
    report.live={available:true,providerCalls:calls,http:baselineHttp,baselineTasks:rows,experiments,aggregate:{tasksMeasured:15,atlas429Count:http.filter(x=>x.status===429).length,atlas429Rate:calls?http.filter(x=>x.status===429).length/calls:0,retryCount:sum(attempts.map(x=>x.retryCount)),retryRate:calls?sum(attempts.map(x=>x.retryCount))/calls:0,fallbackCount:sum(rows.map(x=>x.fallbackCount)),fallbackRate:rows.length?sum(rows.map(x=>x.fallbackCount))/rows.length:0,queueWaitP50:med(attempts.map(x=>x.queueWaitMs)),queueWaitP95:pct(attempts.map(x=>x.queueWaitMs),.95),providerLatencyP50:med(attempts.map(x=>x.providerLatencyMs)),providerLatencyP95:pct(attempts.map(x=>x.providerLatencyMs),.95),inputTokens:sum(attempts.map(x=>x.inputTokens)),outputTokens:sum(attempts.map(x=>x.outputTokens)),reasoningTokens:attempts.some(x=>Number.isFinite(x.reasoningTokens))?sum(attempts.map(x=>x.reasoningTokens)):null,costUsd:attempts.some(x=>Number.isFinite(x.costUsd))?sum(attempts.map(x=>x.costUsd)):null,verifiedTaskSuccess:rows.filter(x=>x.verification.passed).length/15,evidenceGrounding:rows.filter(x=>x.verification.evidenceGrounded).length/15,schemaValidity:rows.filter(x=>x.verification.schemaValid).length/15,correctToolUse:null,recoverySuccess:rows.find(x=>x.taskId==="cog-v1-11")?.verification.passed??null}};
  }
}
await mkdir(OUT.split("/").slice(0,-1).join("/")||".",{recursive:true});await writeFile(OUT,JSON.stringify(report,null,2)+"\n");
console.log(`MEASUREMENT_OUT=${OUT}`);console.log(`TASKS_MEASURED=${report.live?.aggregate?.tasksMeasured??0}`);console.log(`PROVIDER_CALLS=${report.live?.providerCalls??0}`);console.log(`LIVE_ATLAS_MEASUREMENT=${report.live?.available?"AVAILABLE":"UNAVAILABLE"}`);console.log("PRODUCTION_DEPLOYMENT=false");
