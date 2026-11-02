import { writeFile, readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import {
  allocateCognitiveBudget,
  adaptCognitiveBudget,
} from "./sentient/dist/src/model/cognitive-policy.js";
import { AtlasAdmissionController } from "./sentient/dist/src/model/providers/atlas-admission-controller.js";
import {
  AtlasCloudAdapter,
  DEEPSEEK_V3_2_MODEL_V1,
  DOTS3_NOTE_MODEL_V1,
} from "./sentient/dist/src/model/providers/atlas-cloud-client.js";
import { AtlasHybridRouter } from "./sentient/dist/src/model/providers/atlas-hybrid-router.js";
import { SentientRuntime } from "./sentient/dist/src/runtime/sentient-runtime.js";
import { buildAdaptiveContextBundle } from "./sentient/dist/src/retrieval/context-builder.js";
import { sha256Text } from "./sentient/dist/src/retrieval/digest.js";

const OUT = process.env.MEASUREMENT_OUT ?? "stronger-sentient-measurement.json";
const MAX_CALLS = Math.max(1, Math.min(40, Number(process.env.MAX_PROVIDER_CALLS ?? 24)));
const percentile = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a,b)=>a-b);
  return s[Math.min(s.length-1, Math.max(0, Math.ceil(p*s.length)-1))];
};
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const ceiling = {
  evidence:1,cognition:1,action:1,verification:1,
  maxActionRounds:4,maxProviderRetries:1,
  objectiveDeadlineAt: Date.now()+15*60_000,
};
const sig = (o={}) => ({
  complexity:.5,uncertainty:.5,consequence:.5,evidenceSufficiency:.5,
  toolComplexity:.5,priorFailurePressure:0,...o
});
const signalCases = {
  neutral:sig(),
  uncertainty_low:sig({uncertainty:.2}),
  uncertainty_high:sig({uncertainty:.9}),
  complexity_low:sig({complexity:.2}),
  complexity_high:sig({complexity:.9}),
  consequence_low:sig({consequence:.2}),
  consequence_high:sig({consequence:.9}),
  tool_low:sig({toolComplexity:.2}),
  tool_high:sig({toolComplexity:.9}),
  evidence_low:sig({evidenceSufficiency:.1}),
  evidence_high:sig({evidenceSufficiency:.9}),
};
const allocations=Object.fromEntries(Object.entries(signalCases).map(([k,v])=>[k,allocateCognitiveBudget(v,ceiling)]));
const failureClasses=["evidence_deficit","inference_deficit","action_deficit","schema_deficit","verification_deficit","provider_failure","deadline_pressure","policy_rejection","unknown"];
const failureAdaptation=Object.fromEntries(failureClasses.map(x=>[x,adaptCognitiveBudget(allocations.neutral,x,ceiling)]));

async function contextMeasurements(){
  const range={minArtifacts:1,maxArtifacts:6,minTotalChars:120,maxTotalChars:1200,maxArtifactChars:300};
  const candidates=[];
  for(let i=0;i<6;i++){
    const content=`evidence-${i} `+"x".repeat(90+i*10);
    candidates.push({
      kind:"evidence",stableId:`e-${i}`,content,contentDigest:await sha256Text(content),
      provenance:{
        sourceId:`s-${i}`,topic:"measurement",sourceClass:"fixture",
        authorityTier:"verified_secondary",retrievalMethod:"fixture",
        canonicalLocation:`fixture://${i}`,freshnessPolicy:{maxAgeMs:null},
        retrievedAt:"2026-11-02T00:00:00.000Z",sourceDigest:await sha256Text(`source-${i}`)
      },verified:true,priority:10-i
    });
  }
  const out={};
  for(const e of [.2,.5,.8]){
    const b=await buildAdaptiveContextBundle(candidates,e,range);
    out[String(e)]={bounds:b.bounds,artifactCount:b.artifacts.length,totalChars:b.artifacts.reduce((n,a)=>n+a.content.length,0),omitted:b.omitted.length,contextDigest:b.contextDigest};
  }
  return out;
}

async function admissionBurst({count=8,mixed=false,opMs=100}){
  const c=new AtlasAdmissionController();
  const starts=[],waits=[]; let active=0,maxActive=0;
  const base=performance.now();
  await Promise.all(Array.from({length:count},(_,i)=>c.run({
    model:mixed&&i%2?DOTS3_NOTE_MODEL_V1:DEEPSEEK_V3_2_MODEL_V1,
    deadlineAt:Date.now()+30_000
  },async()=>{
    active++;maxActive=Math.max(maxActive,active);starts.push(performance.now()-base);
    await new Promise(r=>setTimeout(r,opMs));active--;return i;
  }).then(r=>waits.push(r.queueWaitMs))));
  const spacing=starts.slice(1).map((v,i)=>v-starts[i]);
  return {count,mixed,opMs,maxActive,startSpacingP50Ms:percentile(spacing,.5),startSpacingP95Ms:percentile(spacing,.95),minStartSpacingMs:spacing.length?Math.min(...spacing):null,queueWaitP50Ms:percentile(waits,.5),queueWaitP95Ms:percentile(waits,.95),queueWaitMeanMs:mean(waits)};
}

async function admissionEdges(){
  const c=new AtlasAdmissionController({minStartIntervalMs:750,maxInFlight:1,maxInFlightPerModel:1,maxQueue:2});
  const ac=new AbortController();ac.abort();let cancelled=false,deadline=false;
  try{await c.run({model:"m",deadlineAt:Date.now()+1000,signal:ac.signal},async()=>1);}catch(e){cancelled=e?.code==="cancelled";}
  try{await c.run({model:"m",deadlineAt:Date.now()-1},async()=>1);}catch(e){deadline=e?.code==="deadline_exceeded";}
  return {cancelled,deadline};
}

function schemaFor(id){
  const m={
    "cog-v1-02":{failureClass:{type:"string"},increase:{type:"string"}},
    "cog-v1-03":{primaryModel:{type:"string"},sourceBound:{type:"boolean"}},
    "cog-v1-04":{recommendedClass:{type:"string"}},
    "cog-v1-07":{requestAccepted:{type:"boolean"},effectStatus:{type:"string"}},
    "cog-v1-08":{preferredEvidence:{type:"string"},preserveUncertainty:{type:"boolean"}},
    "cog-v1-09":{modelAuthority:{type:"boolean"},sentientAuthority:{type:"boolean"},governorEffects:{type:"boolean"},productionDeployment:{type:"boolean"}},
    "cog-v1-10":{effectStatus:{type:"string"},needsExperiment:{type:"boolean"}},
    "cog-v1-11":{bounded:{type:"boolean"},jitter:{type:"boolean"},bypassAdmission:{type:"boolean"},maxRetries:{type:"number"}},
    "cog-v1-14":{selfApproval:{type:"boolean"},allRequiredChecks:{type:"boolean"}},
    "cog-v1-15":{authorized:{type:"boolean"},requiresGovernor:{type:"boolean"}},
  };
  const props={...(m[id]??{}),evidenceUsed:{type:"array",items:{type:"string"}}};
  return {type:"object",properties:props,required:Object.keys(props),additionalProperties:false};
}
function verifyTask(task,obj){
  if(!obj||typeof obj!=="object")return{schema:false,task:false,evidence:false};
  const used=Array.isArray(obj.evidenceUsed)?obj.evidenceUsed:[];
  const perm=new Set(task.permittedEvidence??[]);
  const evidence=(task.requiredEvidence??[]).every(x=>used.includes(x))&&used.every(x=>perm.has(x));
  let ok=true,eq=(k,v)=>{ok=ok&&obj[k]===v;};
  switch(task.taskId){
    case"cog-v1-02":eq("failureClass","EVIDENCE_DEFICIT");eq("increase","EVIDENCE_BUDGET");break;
    case"cog-v1-03":eq("primaryModel",DEEPSEEK_V3_2_MODEL_V1);eq("sourceBound",true);break;
    case"cog-v1-04":eq("recommendedClass","AtlasAdmissionController");break;
    case"cog-v1-07":eq("requestAccepted",true);eq("effectStatus","NOT_TESTED");break;
    case"cog-v1-08":eq("preferredEvidence","provider_doc");eq("preserveUncertainty",true);break;
    case"cog-v1-09":eq("modelAuthority",false);eq("sentientAuthority",true);eq("governorEffects",true);eq("productionDeployment",false);break;
    case"cog-v1-10":eq("effectStatus","INCONCLUSIVE");eq("needsExperiment",true);break;
    case"cog-v1-11":eq("bounded",true);eq("jitter",true);eq("bypassAdmission",false);ok=ok&&typeof obj.maxRetries==="number"&&obj.maxRetries<=2;break;
    case"cog-v1-14":eq("selfApproval",false);eq("allRequiredChecks",true);break;
    case"cog-v1-15":eq("authorized",false);eq("requiresGovernor",true);break;
    default:return{schema:true,task:null,evidence;}
  }
  return{schema:true,task:ok,evidence};
}

async function live(report){
  const key=process.env.ATLAS_CLOUD_API_KEY||process.env.ATLAS_API_KEY||process.env.ATLASCLOUD_API_KEY;
  if(!key){report.live={available:false,reason:"no_existing_atlas_secret_available_in_runner"};return;}
  let calls=0,c429=0;const starts=[];
  const boundedFetch=async(...args)=>{
    if(calls>=MAX_CALLS)throw new Error("measurement_provider_call_ceiling");
    calls++;starts.push(performance.now());const r=await fetch(...args);if(r.status===429)c429++;return r;
  };
  const caps={text_generation:true,structured_output:true,tool_use:false,tool_continuation:false,reasoning_effort:false,image_input:false,server_side_tools:false};
  const adapter=new AtlasCloudAdapter({
    apiKey:key,fetchImpl:boundedFetch,maxProviderRetries:1,
    modelProfiles:[
      {model:DEEPSEEK_V3_2_MODEL_V1,capabilities:caps,profileId:"measurement-deepseek"},
      {model:DOTS3_NOTE_MODEL_V1,capabilities:caps,profileId:"measurement-dots3"}
    ]
  });
  const runtime=new SentientRuntime({adapters:[adapter]});
  const router=new AtlasHybridRouter();
  const corpus=JSON.parse(await readFile("./corpus-source/test/fixtures/cognitive-frontier/corpus-v1.json","utf8"));
  const chosen=corpus.tasks.filter(t=>["cog-v1-02","cog-v1-03","cog-v1-04","cog-v1-07","cog-v1-08","cog-v1-09","cog-v1-10","cog-v1-11","cog-v1-14","cog-v1-15"].includes(t.taskId));
  const rows=[],waits=[],lats=[];let retries=0,fallbacks=0,input=0,output=0,reasoning=0,reasoningReported=0,cost=0,costReported=0;
  const makePrepared=async task=>{
    const arts=[];
    for(const ev of task.permittedEvidence){
      const content=`Evidence label: ${ev}`;
      arts.push({kind:"evidence",stableId:`e:${ev}`,content,contentDigest:await sha256Text(content),provenance:{sourceId:`c:${task.taskId}`,topic:task.taskClass,sourceClass:"frozen_corpus",authorityTier:"verified_secondary",retrievalMethod:"frozen_fixture",canonicalLocation:"corpus-v1",freshnessPolicy:{maxAgeMs:null},retrievedAt:"2026-11-02T00:00:00.000Z",sourceDigest:await sha256Text(task.inputDigest)},verified:true,priority:1});
    }
    const ctx=await buildAdaptiveContextBundle(arts,.6,{minArtifacts:1,maxArtifacts:8,minTotalChars:64,maxTotalChars:2048,maxArtifactChars:512});
    return{
      taskId:task.taskId,sessionId:"measurement",traceId:`m-${task.taskId}`,runtime:{name:"measurement",version:process.env.BASELINE_SHA},
      systemPolicy:"Return only JSON matching the schema. Use only supplied evidence. Model output is never authority.",
      messages:[{role:"user",content:`Goal: ${task.input.goal}\nReturn evidenceUsed listing only supplied evidence labels you relied on.`}],
      context:ctx,tools:[],outputSchema:schemaFor(task.taskId),requiredModelCapabilities:["text_generation","structured_output"],
      budget:{maxOutputTokens:256,timeoutMs:45_000,maxRetries:1,maxToolRounds:0},
      verifier:{verifierId:task.verifierDefinition,configuration:{}},
      cognitivePolicy:{signals:sig(),ceiling:{...ceiling,maxActionRounds:0,objectiveDeadlineAt:Date.now()+60_000},contextRange:{minArtifacts:1,maxArtifacts:8,minTotalChars:64,maxTotalChars:2048,maxArtifactChars:512}},
      inputDigest:task.inputDigest
    };
  };
  const ingest=exec=>{
    for(const a of exec.attempts){
      const r=a.result;if(r?.metadata?.queueWaitMs!=null)waits.push(Number(r.metadata.queueWaitMs));if(r?.latencyMs!=null)lats.push(Number(r.latencyMs));
      retries+=Number(r?.metadata?.retryCount??0);
      if(r?.ok){input+=r.usage.inputTokens;output+=r.usage.outputTokens;if(r.usage.reasoningTokens!=null){reasoning+=r.usage.reasoningTokens;reasoningReported++;}if(r.metadata?.observedCostUsd!=null){cost+=Number(r.metadata.observedCostUsd);costReported++;}}
    }
    fallbacks+=Math.max(0,exec.attempts.length-1);
  };
  // Preserve both incumbent role paths.
  for(const stage of["cognition","synthesis"]){
    if(calls>=MAX_CALLS-1)break;
    const t=chosen.find(x=>x.taskId==="cog-v1-09"),p=await makePrepared(t),e=await runtime.executeAdaptive(p,router,stage);ingest(e);
    rows.push({taskId:`probe-${stage}`,stage,model:e.final.target.model,ok:e.final.result.ok,attempts:e.attempts.length});
  }
  for(const task of chosen){
    if(calls>=MAX_CALLS-1)break;
    const p=await makePrepared(task),e=await runtime.executeAdaptive(p,router,"cognition");ingest(e);
    const f=e.final.result,v=f.ok?verifyTask(task,f.structured):{schema:false,task:false,evidence:false};
    rows.push({taskId:task.taskId,stage:"cognition",model:e.final.target.model,ok:f.ok,attempts:e.attempts.length,verification:v,queueWaitMs:f.metadata?.queueWaitMs??null,latencyMs:f.latencyMs,retryCount:f.metadata?.retryCount??0,requestId:f.providerRequestId??null,costUsd:f.metadata?.observedCostUsd??null});
  }
  const spacing=starts.slice(1).map((v,i)=>v-starts[i]);
  const measured=rows.filter(r=>r.verification);
  report.live={available:true,providerCalls:calls,atlas429Rate:calls?c429/calls:0,retryRate:calls?retries/calls:0,fallbackRate:measured.length?fallbacks/measured.length:0,queueWaitP50Ms:percentile(waits,.5),queueWaitP95Ms:percentile(waits,.95),providerLatencyP50Ms:percentile(lats,.5),providerLatencyP95Ms:percentile(lats,.95),minHttpStartSpacingMs:spacing.length?Math.min(...spacing):null,inputTokens:input,outputTokens:output,reasoningTokens:reasoningReported?reasoning:null,costUsd:costReported?cost:null,verifiedTaskSuccess:measured.length?measured.filter(r=>r.verification.schema&&r.verification.task&&r.verification.evidence).length/measured.length:null,evidenceGrounding:measured.length?measured.filter(r=>r.verification.evidence).length/measured.length:null,schemaValidity:measured.length?measured.filter(r=>r.verification.schema).length/measured.length:null,rows};
}

const report={schemaVersion:"stronger-sentient-measurement/v1",baseline:{sha:process.env.BASELINE_SHA,tree:process.env.BASELINE_TREE,corpusDigest:`sha256:${process.env.CORPUS_DIGEST}`},generatedAt:new Date().toISOString(),local:{allocations,failureAdaptation,context:await contextMeasurements(),admission:{singleModel8:await admissionBurst({count:8,mixed:false,opMs:100}),mixedModels8:await admissionBurst({count:8,mixed:true,opMs:1200}),edges:await admissionEdges()}},live:{available:false,reason:"live_disabled"}};
if(String(process.env.RUN_LIVE_ATLAS).toLowerCase()==="true")await live(report);
await writeFile(OUT,JSON.stringify(report,null,2));
console.log(`LIVE_ATLAS_MEASUREMENT=${report.live.available?"AVAILABLE":"UNAVAILABLE"}`);
console.log(`MEASUREMENT_OUT=${OUT}`);
