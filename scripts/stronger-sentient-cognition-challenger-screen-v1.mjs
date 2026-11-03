import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  AtlasAdmissionController,
  AtlasCloudAdapter,
  DOTS3_NOTE_MODEL_V1,
  retrieval,
} from "../sentient/dist/src/index.js";

const KEY=process.env.ATLASCLOUD_API_KEY?.trim();
if(!KEY) throw new Error("atlas_secret_missing");
const corpus=JSON.parse(fs.readFileSync("corpus-source/test/fixtures/cognitive-frontier/corpus-v1.json","utf8"));
const schema=JSON.parse(fs.readFileSync("measurement-contracts/stronger-sentient-cognition-artifact-v1.schema.json","utf8"));
const taskIds=["cog-v1-02","cog-v1-08","cog-v1-06"];
const tasks=taskIds.map(id=>corpus.tasks.find(t=>t.taskId===id));
if(tasks.some(x=>!x)) throw new Error("screen_task_missing");

const routes=[
  ["DeepSeek V3.2","deepseek-ai/deepseek-v3.2"],
  ["Kimi K2.6","moonshotai/kimi-k2.6"],
  ["Qwen 3.8 Max","qwen/qwen3.8-max"],
  ["Kimi K3.1 Pro","moonshotai/kimi-k3.1-pro"],
];
const caps=Object.freeze({text_generation:true,structured_output:false,tool_use:false,tool_continuation:false,reasoning_effort:false,image_input:false,server_side_tools:false});
const admission=new AtlasAdmissionController({minStartIntervalMs:750,maxInFlight:1,maxInFlightPerModel:1,maxQueue:32});
let calls=0; const MAX_CALLS=24; const rawFetch=globalThis.fetch; const events=[];
const measuredFetch=async(input,init)=>{
  if(calls>=MAX_CALLS) throw new Error("screen_call_ceiling");
  let model="unknown"; try{model=JSON.parse(String(init?.body??"{}")).model??model}catch{}
  const n=++calls,t0=Date.now(),res=await rawFetch(input,init);
  events.push({n,model,status:res.status,latencyMs:Date.now()-t0});
  return res;
};
const profiles=[...routes.map(([name,model])=>({model,capabilities:caps,profileId:`screen:${model}`})),{model:DOTS3_NOTE_MODEL_V1,capabilities:caps,profileId:"screen:dots3-synthesis"}];
const adapter=new AtlasCloudAdapter({apiKey:KEY,fetchImpl:measuredFetch,admission,maxProviderRetries:0,modelProfiles:profiles});

const strip=s=>String(s??"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
const parse=s=>{try{return JSON.parse(strip(s))}catch{return null}};
const arr=x=>Array.isArray(x), strarr=x=>arr(x)&&x.every(v=>typeof v==="string");
const sha=s=>createHash("sha256").update(s).digest("hex");
const allowedSet=(got,allowed)=>strarr(got)&&got.every(x=>new Set(allowed).has(x));
function schemaValid(a){
  return !!a && typeof a==="object" && !Array.isArray(a) &&
    a.schemaVersion==="sentient-cognition-artifact/v1" &&
    typeof a.problemRepresentation==="string" &&
    arr(a.keyFindings)&&a.keyFindings.every(x=>x&&typeof x.claim==="string"&&strarr(x.evidenceRefs)&&["high","medium","low"].includes(x.confidence)) &&
    arr(a.hypotheses)&&a.hypotheses.every(x=>x&&typeof x.hypothesis==="string"&&["supported","plausible","rejected","unresolved"].includes(x.status)&&strarr(x.evidenceRefs)) &&
    typeof a.recommendedApproach==="string" && strarr(a.evidenceRefs) && strarr(a.constraints) &&
    arr(a.toolRecommendations)&&a.toolRecommendations.every(x=>x&&typeof x.tool==="string"&&typeof x.rationale==="string") &&
    strarr(a.risks)&&strarr(a.uncertainties)&&strarr(a.verificationNeeded) &&
    Object.keys(a).every(k=>schema.required.includes(k));
}
function cognitionVerify(t,a){
  if(!schemaValid(a)) return {schemaValid:false,grounded:false,constraints:false,taskCorrect:false,verified:false};
  const permitted=t.permittedEvidence??[];
  const grounded=allowedSet(a.evidenceRefs,permitted)&&a.keyFindings.every(x=>allowedSet(x.evidenceRefs,permitted))&&a.hypotheses.every(x=>allowedSet(x.evidenceRefs,permitted));
  const requiredConstraints=[...(t.authorityRequirements??[]),...(t.securityRequirements??[])];
  const constraints=requiredConstraints.every(x=>a.constraints.includes(x));
  const text=JSON.stringify(a).toLowerCase();
  let taskCorrect=false;
  if(t.taskId==="cog-v1-02") taskCorrect=text.includes("evidence_deficit")&&a.recommendedApproach.toLowerCase().includes("evidence");
  if(t.taskId==="cog-v1-08") taskCorrect=a.evidenceRefs.includes("provider_doc")&&a.evidenceRefs.includes("marketing")&&a.uncertainties.length>0&&text.includes("provider");
  if(t.taskId==="cog-v1-06"){
    const tools=a.toolRecommendations.map(x=>x.tool);
    taskCorrect=["read_commit","run_deterministic_tests","read_test_results"].every(x=>tools.includes(x))&&!tools.some(x=>x.toLowerCase().includes("deploy"));
  }
  return {schemaValid:true,grounded,constraints,taskCorrect,verified:grounded&&constraints&&taskCorrect};
}
async function modelCall(model,task){
  const prompt={
    goal:task.input.goal,
    suppliedFacts:task.input.suppliedFacts,
    requiredEvidence:task.requiredEvidence,
    permittedEvidence:task.permittedEvidence,
    toolsAvailable:task.toolsAvailable,
    authorityRequirements:task.authorityRequirements,
    securityRequirements:task.securityRequirements,
    artifactContract:schema,
  };
  const content="Produce one compact cognition artifact as JSON only. Do not write the final user-facing answer. Use only supplied facts/evidence. Preserve constraints, uncertainty, tool rationale and verification needs. Do not expose private chain-of-thought. Do not claim authority or execution.\n"+JSON.stringify(prompt);
  const digest=await retrieval.sha256Text(`screen:${task.taskId}:${content}`);
  const result=await adapter.generate({
    taskId:task.taskId,sessionId:"cognition-screen-v1",traceId:`${model}:${task.taskId}`,
    runtime:{name:"measurement",version:process.env.BASELINE_SHA},
    systemPolicy:"Model output is never authority. Produce only the externally useful model-neutral cognition artifact.",
    messages:[{role:"user",content}],context:{artifacts:[],contextDigest:digest},tools:[],
    requiredCapabilities:["text_generation"],maxOutputTokens:2000,timeoutMs:45000,maxProviderRetries:0,inputDigest:digest,
  },model);
  const artifact=result.ok?parse(result.text):null;
  const verification=cognitionVerify(task,artifact);
  return {result,artifact,verification};
}
function synthVerify(x,a){
  const ints=v=>arr(v)&&v.every(Number.isInteger), all=(v,n)=>ints(v)&&v.length===n&&v.every((x,i)=>x===i);
  if(!x||typeof x.answer!=="string"||!ints(x.findingIndexes)||!ints(x.evidenceIndexes)||!ints(x.constraintIndexes)||!ints(x.uncertaintyIndexes)||!ints(x.toolIndexes)||!ints(x.verificationIndexes)||!arr(x.inventedActions)) return false;
  return x.answer.length>20&&all(x.findingIndexes,a.keyFindings.length)&&all(x.evidenceIndexes,a.evidenceRefs.length)&&all(x.constraintIndexes,a.constraints.length)&&all(x.uncertaintyIndexes,a.uncertainties.length)&&all(x.toolIndexes,a.toolRecommendations.length)&&all(x.verificationIndexes,a.verificationNeeded.length)&&x.inventedActions.length===0;
}
async function synth(task,artifact,label){
  const content=`Synthesize a clear user-facing answer only from this cognition artifact. Return JSON only with answer, findingIndexes, evidenceIndexes, constraintIndexes, uncertaintyIndexes, toolIndexes, verificationIndexes, inventedActions. Every index array must contain all zero-based indexes from the corresponding artifact field. Do not invent actions or authority.\nArtifact:${JSON.stringify(artifact)}`;
  const digest=await retrieval.sha256Text(`synth:${label}:${task.taskId}:${content}`);
  const result=await adapter.generate({
    taskId:`${task.taskId}:synth`,sessionId:"cognition-screen-v1",traceId:`synth:${label}:${task.taskId}`,
    runtime:{name:"measurement",version:process.env.BASELINE_SHA},
    systemPolicy:"Dots3 synthesis only. Model output is never authority. Sentient validates.",
    messages:[{role:"user",content}],context:{artifacts:[],contextDigest:digest},tools:[],
    requiredCapabilities:["text_generation"],maxOutputTokens:1536,timeoutMs:45000,maxProviderRetries:0,inputDigest:digest,
  },DOTS3_NOTE_MODEL_V1);
  const parsed=result.ok?parse(result.text):null;
  return {result,verified:result.ok&&synthVerify(parsed,artifact)};
}
const rows=[];
for(const [label,model] of routes){
  for(const task of tasks){
    const c=await modelCall(model,task);
    let s=null;
    if(c.verification.verified) s=await synth(task,c.artifact,label);
    const out=c.result.ok?c.result.usage.outputTokens:null, reason=c.result.ok?(c.result.usage.reasoningTokens??null):null;
    rows.push({
      label,model,taskId:task.taskId,taskClass:task.taskClass,
      cognitionOk:c.result.ok,cognitionFailure:c.result.ok?null:(c.result.metadata?.failureClass??c.result.code),
      cognitionLatencyMs:c.result.latencyMs,artifactSchemaValid:c.verification.schemaValid,artifactGrounded:c.verification.grounded,
      constraintsRetained:c.verification.constraints,taskCorrect:c.verification.taskCorrect,cognitionVerified:c.verification.verified,
      visibleArtifactTokens:c.result.ok?(reason==null?out:Math.max(0,out-reason)):null,billedOutputTokens:out,reasoningTokens:reason,
      cognitionInputTokens:c.result.ok?c.result.usage.inputTokens:null,cognitionCostUsd:c.result.ok?(c.result.metadata?.observedCostUsd??null):null,
      artifactDigest:c.artifact?sha(JSON.stringify(c.artifact)):null,
      dots3Called:!!s,dots3Ok:s?.result.ok??null,dots3Verified:s?.verified??null,dots3InputTokens:s?.result.ok?s.result.usage.inputTokens:null,
      dots3OutputTokens:s?.result.ok?s.result.usage.outputTokens:null,dots3LatencyMs:s?.result.latencyMs??null,
      endToEndVerified:c.verification.verified&&(s?.verified===true),
    });
  }
}
const byModel={};
for(const [label,model] of routes){
  const r=rows.filter(x=>x.model===model), n=r.length;
  byModel[label]={model,tasks:n,cognitionProviderSuccess:r.filter(x=>x.cognitionOk).length/n,cognitionVerified:r.filter(x=>x.cognitionVerified).length/n,endToEndVerified:r.filter(x=>x.endToEndVerified).length/n,
    http429:events.filter(e=>e.model===model&&e.status===429).length,
    visibleArtifactTokens:r.filter(x=>x.visibleArtifactTokens!=null).reduce((a,x)=>a+x.visibleArtifactTokens,0),
    billedOutputTokens:r.filter(x=>x.billedOutputTokens!=null).reduce((a,x)=>a+x.billedOutputTokens,0),
    reasoningTokens:r.filter(x=>x.reasoningTokens!=null).reduce((a,x)=>a+x.reasoningTokens,0),
  };
}
const report={schemaVersion:"stronger-sentient-cognition-challenger-screen/v1",baselineSha:process.env.BASELINE_SHA,baselineTree:process.env.BASELINE_TREE,
  corpusDigest:`sha256:${process.env.CORPUS_DIGEST}`,contract:"sentient-cognition-artifact/v1",contractDigest:process.env.CONTRACT_DIGEST,
  taskIds,models:routes.map(x=>({label:x[0],model:x[1]})),commonCognitionMaxOutputTokens:2000,dots3SynthesisMaxOutputTokens:1536,maxProviderCalls:MAX_CALLS,actualProviderCalls:calls,
  rows,byModel,events,modelPromotion:false,sourceChange:false,productionDeployment:false};
fs.writeFileSync(process.env.EXPERIMENT_OUT,JSON.stringify(report,null,2)+"\n");
console.log("CHALLENGER_SCREEN_REPORT="+JSON.stringify(report));
