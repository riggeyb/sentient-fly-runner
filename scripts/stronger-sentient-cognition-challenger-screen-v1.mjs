import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  AtlasAdmissionController,
  AtlasCloudAdapter,
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
const caps=Object.freeze({
  text_generation:true,structured_output:false,tool_use:false,tool_continuation:false,
  reasoning_effort:false,image_input:false,server_side_tools:false
});
const INITIAL=2000, ESCALATE_TO=4000, VISIBLE_ARTIFACT_MAX=2000;
const MAX_INITIAL_ARMS=12, MAX_PROVIDER_CALLS=24;
const admission=new AtlasAdmissionController({minStartIntervalMs=750,maxInFlight:1,maxInFlightPerModel:1,maxQueue:32});
let calls=0;
const rawFetch=globalThis.fetch;
const events=[];
const measuredFetch=async(input,init)=>{
  if(calls>=MAX_PROVIDER_CALLS) throw new Error("screen_call_ceiling");
  let model="unknown";
  try{model=JSON.parse(String(init?.body??"{}")).model??model}catch{}
  const n=++calls,t0=Date.now(),res=await rawFetch(input,init);
  events.push({n,model,status:res.status,latencyMs:Date.now()-t0});
  return res;
};
const profiles=routes.map(([,model])=>({model,capabilities:caps,profileId:`screen:${model}`}));
const adapter=new AtlasCloudAdapter({apiKey:KEY,fetchImpl:measuredFetch,admission,maxProviderRetries:0,modelProfiles:profiles});

const strip=s=>String(s??"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
const parse=s=>{try{return JSON.parse(strip(s))}catch{return null}};
const arr=x=>Array.isArray(x), strarr=x=>arr(x)&&x.every(v=>typeof v==="string");
const sha=s=>createHash("sha256").update(q).digest("hex");
const allowedSet=(got,allowed)=>strarr(got)&&got.every(x=>new Set(allowed).has(x));
const visibleEstimate=text=>Math.ceil(Buffer.byteLength(String(text??""),"utf8")/4);

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
  if(!schemaValid(a)) return {schemaValid:false,grounded:false,constraints:false,architectureCorrect:false,taskCorrect:false,verified:false};
  const permitted=t.permittedEvidence??[];
  const grounded=allowedSet(a.evidenceRefs,permitted)&&a.keyFindings.every(x=>allowedSet(x.evidenceRefs,permitted))&&a.hypotheses.every(x=>allowedSet(x.evidenceRefs,permitted));
  const requiredConstraints=[...(t.authorityRequirements??[]),...(t.securityRequirements??[])];
  const constraints=requiredConstraints.every(x=>a.constraints.includes(x));
  const text=JSON.stringify(a).toLowerCase();
  let taskCorrect=false,architectureCorrect=false;
  if(t.taskId==="cog-v1-02"){
    taskCorrect=text.includes("evidence_deficit")&&a.recommendedApproach.toLowerCase().includes("evidence");
    architectureCorrect=taskCorrect&&text.includes("structur");
  }
  if(t.taskId==="cog-v1-08"){
    taskCorrect=a.evidenceRefs.includes("provider_doc")&&a.evidenceRefs.includes("marketing")&&a.uncertainties.length>0&&text.includes("provider");
    architectureCorrect=taskCorrect;
  }
  if(t.taskId==="cog-v1-06"){
    const tools=a.toolRecommendations.map(x=>x.tool);
    taskCorrect=["read_commit","run_deterministic_tests","read_test_results"].every(x=>tools.includes(x))&&!tools.some(x=>x.toLowerCase().includes("deploy"));
    architectureCorrect=taskCorrect;
  }
  return {schemaValid:true,grounded,constraints,architectureCorrect,taskCorrect,verified:grounded&&constraints&&taskCorrect};
}

function qualityDimensions(task,a,v,escalated,finalVerified){
  if(!a) return {
    problemUnderstanding:false,architecture:false,planning:false,evidenceInterpretation:false,
    codingReasoning:task.taskId==="cog-v1-06"?false:null,toolStrategy:false,uncertainty:false,
    verificationStrategy:false,recoveryAbility:escalated?false:null
  };
  const tools=arr(a.toolRecommendations)?a.toolRecommendations:[];
  return {
    problemUnderstanding:typeof a.problemRepresentation==="string"&&a.problemRepresentation.trim().length>0,
    architecture:v.architectureCorrect===true,
    planning:typeof a.recommendedApproach==="string"&&a.recommendedApproach.trim().length>0,
    evidenceInterpretation:v.grounded===true,
    codingReasoning:task.taskId==="cog-v1-06"?v.taskCorrect===true:null,
    toolStrategy:tools.every(x=>x&&typeof x.tool==="string"&&typeof x.rationale==="string"&&x.rationale.trim().length>0),
    uncertainty:arr(a.uncertainties)&&a.uncertainties.length>0,
    verificationStrategy:arr(a.verificationNeeded)&&a.verificationNeeded.length>0,
    recoveryAbility:escalated?finalVerified===true:null,
  };
}

function structurallyRelevant(text,artifact,reasoningTokens){
  if(artifact&&typeof artifact==="object") return true;
  const s=String(text??"");
  if(/problemRepresentation|keyFindings|recommendedApproach|verificationNeeded/.test(s)) return true;
  return typeof reasoningTokens==="number"&&reasoningTokens>0;
}

function classifyAttempt({result,event,verification}){
  if(!result.ok){
    const status=event?.status??result.metadata?.httpStatus??null;
    return status===429?"RATE_LIMITED":"TRANSPORT_FAILURE";
  }
  if(result.finishReason==="length"&&!verification.verified) return "OUTPUT_ENVELOPE_EXHAUSTED";
  if(!verification.schemaValid) return "CONTRACT_INVALID";
  if(!verification.verified) return "CONTRACT_VALID_TASK_FAILED";
  return "VERIFIED_COGNITIVE_ARTIFACT";
}

function promptFor(task){
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
  return "Produce one compact cognition artifact as JSON only. Do not write final user-facing prose. Use only supplied facts/evidence. Preserve problem representation, conclusions, alternatives, constraints, uncertainty, tool rationale, risks, and verification needs. Do not expose private chain-of-thought. Do not claim authority or execution.\n"+JSON.stringify(prompt);
}

async function attempt(model,task,content,digest,cap,attemptNumber){
  const eventStart=events.length;
  const result=await adapter.generate({
    taskId:task.taskId,sessionId:"cognition-screen-v2",traceId:`${model}:${task.taskId}:cap-${cap}`,
    runtime:{name:"measurement",version:process.env.BASELINE_SHA},
    systemPolicy:"Model output is never authority. Produce only the externally useful model-neutral cognition artifact.",
    messages:[{role:"user",content}],context:{artifacts:[],contextDigest:digest},tools:[],
    requiredCapabilities:["text_generation"],maxOutputTokens:cap,timeoutMs:60000,maxProviderRetries:0,inputDigest:digest,
  },model);
  const event=events[eventStart]??null;
  const text=result.ok?String(result.text??""):"";
  const artifact=result.ok?parse(text):null;
  const verification=cognitionVerify(task,artifact);
  const reasoningTokens=result.ok?(result.usage.reasoningTokens??null):null;
  const relevant=result.ok&&structurallyRelevant(text,artifact,reasoningTokens);
  const escalationEligible=result.ok&&result.finishReason==="length"&&!verification.verified&&relevant&&cap===INITIAL;
  return {
    result,artifact,verification,
    row:{
      attempt:attemptNumber,providerCompletionMaxTokens:cap,
      httpStatus:event?.status??(result.ok?200:(result.metadata?.httpStatus??null)),
      finishReason:result.ok?(result.finishReason??null):null,
      inputTokens:result.ok?(result.usage.inputTokens??null):null,
      providerOutputTokens:result.ok?(result.usage.outputTokens??null):null,
      visibleArtifactTokens:result.ok?visibleEstimate(text):0,
      visibleArtifactTokenMeasurement:"ceil_utf8_bytes_div_4_NOT_TOKENIZER_EXACT",
      reasoningTokens,
      latencyMs:result.latencyMs??event?.latencyMs??null,
      actualCostUsd:result.ok?(result.metadata?.observedCostUsd??null):null,
      providerRequestId:result.providerRequestId??null,
      schemaValid:verification.schemaValid,
      evidenceGrounded:verification.grounded,
      constraintsRetained:verification.constraints,
      architectureCorrect:verification.architectureCorrect,
      taskVerified:verification.verified,
      structurallyRelevant:relevant,
      escalationEligible,
      classification:classifyAttempt({result,event,verification}),
      artifactDigest:artifact?sha(JSON.stringify(artifact)):null,
    }
  };
}

async function runArm(label,model,task){
  const content=promptFor(task);
  const digest=await retrieval.sha256Text(`screen-v2:${task.taskId}:${content}`);
  const attempts=[];
  let first=await attempt(model,task,content,digest,INITIAL,1);
  attempts.push(first.row);
  let final=first;
  if(first.row.escalationEligible){
    final=await attempt(model,task,content,digest,ESCALATE_TO,2);
    attempts.push(final.row);
  }
  const q=qualityDimensions(task,final.artifact,final.verification,attempts.length>1,final.verification.verified);
  return {
    label,model,taskId:task.taskId,taskClass:task.taskClass,
    attempts,
    finalClassification:final.row.classification,
    cognitionVerified:final.verification.verified,
    schemaValid:final.verification.schemaValid,
    evidenceGrounded:final.verification.grounded,
    constraintsRetained:final.verification.constraints,
    architectureCorrect:final.verification.architectureCorrect,
    taskVerified:final.verification.verified,
    quality:q,
    finalArtifactDigest:final.artifact?sha(JSON.stringify(final.artifact)):null,
  };
}

const rows=[];
let initialArms=0;
for(const [label,model] of routes){
  for(const task of tasks){
    if(++initialArms>MAX_INITIAL_ARMS) throw new Error("initial_arm_ceiling");
    rows.push(await runArm(label,model,task));
  }
}

const qualityKeys=["problemUnderstanding","architecture","planning","evidenceInterpretation","codingReasoning","toolStrategy","uncertainty","verificationStrategy","recoveryAbility"];
const byModel={};
for(const [label,model] of routes){
  const r=rows.filter(x=>x.model===model);
  const attempts=r.flatMap(x=>x.attempts);
  const verified=r.filter(x=>x.cognitionVerified).length;
  const costValues=attempts.map(a=>a.actualCostUsd).filter(v=>typeof v==="number");
  const totalCost=costValues.length?costValues.reduce((a,b)=>a+b,0):null;
  const quality={};
  for(const k of qualityKeys){
    const vals=r.map(x=>x.quality[k]).filter(v=>typeof v==="boolean");
    quality[k]={passed:vals.filter(Boolean).length,measured:vals.length};
  }
  byModel[label]={
    model,
    tasks:r.length,
    verifiedArtifacts:verified,
    verificationRate:verified/r.length,
    classifications:Object.fromEntries(["TRANSPORT_FAILURE","RATE_LIMITED","OUTPUT_ENVELOPE_EXHAUSTED","CONTRACT_INVALID","CONTRACT_VALID_TASK_FAILED","VERIFIED_COGNITIVE_ARTIFACT"].map(k=>[k,r.filter(x=>x.finalClassification===k).length])),
    quality,
    efficiency:{
      providerAttempts:attempts.length,
      http200:attempts.filter(a=>a.httpStatus===200).length,
      http429:attempts.filter(a=>a.httpStatus===429).length,
      inputTokens:attempts.reduce((a,x)=>a+(x.inputTokens??0),0),
      providerOutputTokens:attempts.reduce((a,x)=>a+(x.providerOutputTokens??0),0),
      visibleArtifactTokens:attempts.reduce((a,x)=>a+(x.visibleArtifactTokens??0),0),
      reasoningTokensReported:attempts.filter(x=>typeof x.reasoningTokens==="number").reduce((a,x)=>a+x.reasoningTokens,0),
      reasoningTokenCoverage:attempts.filter(x=>typeof x.reasoningTokens==="number").length,
      latencyMsTotal:attempts.reduce((a,x)=>a+(x.latencyMs??0),0),
      actualCostUsd:totalCost,
      costPerVerifiedCognitionArtifact:totalCost!=null&&verified>0?totalCost/verified:null,
    }
  };
}

const report={
  schemaVersion:"stronger-sentient-cognition-challenger-screen/v2",
  baselineSha:process.env.BASELINE_SHA,
  baselineTree:process.env.BASELINE_TREE,
  corpusDigest:`sha256:${process.env.CORPUS_DIGEST}`,
  contract:"sentient-cognition-artifact/v1",
  contractDigest:process.env.CONTRACT_DIGEST,
  measurementIntegrityRequired:true,
  incumbentCognitionSuccessRequired:false,
  completionPolicy:{
    initial:INITIAL,
    escalateTo:ESCALATE_TO,
    escalateOnlyIf:"finish_reason=length AND artifact_incomplete AND cognition_structurally_relevant",
    doNotEscalateIf:"finish_reason=stop AND artifact_quality_poor",
    sameForEveryModel:true,
    exactSameTokenUsageRequired:false,
  },
  taskIds,
  models:routes.map(([label,model])=>({label,model})),
  maximumInitialTaskArms:MAX_INITIAL_ARMS,
  actualInitialTaskArms:initialArms,
  maximumProviderCalls:MAX_PROVIDER_CALLS,
  actualProviderCalls:calls,
  dots3Called:false,
  dots3Thinking:false,
  dots3Role:"OPTIONAL_SYNTHESIS_PRESENTATION",
  dots3MandatoryForMachineExecution:false,
  qualityAndEfficiencySeparate:true,
  rows,
  byModel,
  events,
  priorChallengerDataClass:"EXPLORATORY_PRE_FAIRNESS_SCREEN_DATA_NOT_PROMOTION_EVIDENCE",
  modelPromotion:false,
  sourceChange:false,
  productionDeployment:false,
};
fs.writeFileSync(process.env.EXPERIMENT_OUT,JSON.stringify(report,null,2)+"\n");
console.log("CHALLENGER_SCREEN_REPORT="+JSON.stringify(report));
