import fs from "node:fs";
import { createHash } from "node:crypto";
import { AtlasCloudAdapter, DOTS3_NOTE_MODEL_V1, SentientRuntime, retrieval } from "../sentient/dist/src/index.js";

const SHA=process.env.BASELINE_SHA,TREE=process.env.BASELINE_TREE,DIGEST=process.env.CORPUS_DIGEST,KEY=process.env.ATLASCLOUD_API_KEY;
const OUT=process.env.EXPERIMENT_OUT??"dots3-response-semantics-v1.json",MAX=5;
if(!KEY) throw new Error("atlas_secret_missing");
const raw=fs.readFileSync("./corpus-source/test/fixtures/cognitive-frontier/corpus-v1.json","utf8");
if(createHash("sha256").update(raw).digest("hex")!==DIGEST) throw new Error("corpus_digest_mismatch");
const corpus=JSON.parse(raw),ids=["cog-v1-02","cog-v1-04","cog-v1-06","cog-v1-08","cog-v1-14"];
const tasks=ids.map(id=>corpus.tasks.find(t=>t.taskId===id));
if(tasks.some(t=>!t)) throw new Error("task_subset_missing");

const uniq=a=>[...new Set(a)];
const toolNames=t=>{const x=t.deterministicAssertions.find(v=>v.startsWith("tools="));return x?x.slice(6).split(",").filter(Boolean):[]};
const uncertainties=t=>t.deterministicAssertions.includes("preserve_uncertainty=true")?["preserve_uncertainty=true"]:[];
const compact=t=>({
  schemaVersion:"sentient-cognition-artifact/v1",
  problemRepresentation:t.input.goal,
  keyFindings:t.deterministicAssertions.map(claim=>({claim,evidenceRefs:t.requiredEvidence,confidence:"high"})),
  hypotheses:t.taskId==="cog-v1-08"?[{hypothesis:"marketing_may_not_match_exact_route",status:"unresolved",evidenceRefs:["provider_doc","marketing"]}]:[],
  recommendedApproach:"Use supplied facts only; preserve constraints and uncertainty; keep verification separate from authority.",
  evidenceRefs:t.requiredEvidence,
  constraints:uniq([...t.authorityRequirements,...t.securityRequirements]),
  toolRecommendations:toolNames(t).map(tool=>({tool,rationale:"Use only in the bounded read-only plan."})),
  risks:t.expectedFailureModes,
  uncertainties:uncertainties(t),
  verificationNeeded:t.deterministicAssertions
});
const digest=v=>createHash("sha256").update(v).digest("hex");
const fieldSummary=v=>{
  if(v===undefined) return {present:false};
  if(v===null) return {present:true,type:"null",length:0};
  if(typeof v==="string") return {present:true,type:"string",length:v.length,sha256:digest(v)};
  const s=JSON.stringify(v);
  return {present:true,type:Array.isArray(v)?"array":typeof v,length:s.length,sha256:digest(s)};
};
const safeProviderFields=m=>Object.fromEntries(Object.entries(m??{})
  .filter(([k])=>!["role","content","reasoning","reasoning_content","tool_calls"].includes(k))
  .map(([k,v])=>[k,fieldSummary(v)]));
const rawEvents=[];
let calls=0;
const fetchCapture=async(...args)=>{
  if(calls>=MAX) throw new Error("call_ceiling");
  const n=++calls,res=await fetch(...args),clone=res.clone();
  let body=null; try{body=await clone.json()}catch{}
  const choice=Array.isArray(body?.choices)?body.choices[0]:null,msg=choice?.message??null,u=body?.usage??{};
  rawEvents.push({
    n,httpStatus:res.status,choiceCount:Array.isArray(body?.choices)?body.choices.length:0,
    finishReason:choice?.finish_reason??null,
    messageContent:msg?.content??null,
    messageContentType:msg?.content===null?"null":Array.isArray(msg?.content)?"array":typeof msg?.content,
    messageReasoning:fieldSummary(msg?.reasoning),
    messageReasoningContent:fieldSummary(msg?.reasoning_content),
    toolCallsPresent:Array.isArray(msg?.tool_calls)&&msg.tool_calls.length>0,
    toolCallCount:Array.isArray(msg?.tool_calls)?msg.tool_calls.length:0,
    providerSpecificMessageFields:safeProviderFields(msg),
    usage:{
      prompt_tokens:u.prompt_tokens??null,completion_tokens:u.completion_tokens??null,total_tokens:u.total_tokens??null,
      reasoning_tokens:u.reasoning_tokens??u.completion_tokens_details?.reasoning_tokens??null,
      completion_tokens_details:u.completion_tokens_details??null
    }
  });
  return res;
};
const adapter=new AtlasCloudAdapter({
  apiKey:KEY,fetchImpl:fetchCapture,maxProviderRetries:0,
  modelProfiles:[{model:DOTS3_NOTE_MODEL_V1,capabilities:{text_generation:true,structured_output:false,tool_use:false,tool_continuation:false,reasoning_effort:false,image_input:false,server_side_tools:false},profileId:"dots3-response-semantics-v1"}]
});
const runtime=new SentientRuntime({adapters:[adapter]});
const rows=[];
for(const t of tasks){
  const art=compact(t);
  const instructions=[
    `Goal: ${t.input.goal}`,
    `Cognition artifact: ${JSON.stringify(art)}`,
    "Write a concise, clear user-facing answer in ordinary prose, ideally no more than 350 words.",
    "Preserve findings, constraints, uncertainty, evidence references, tool recommendations, and verification needs.",
    "Do not claim actions were performed. Do not add authority, evidence, certainty, or facts. No private chain-of-thought."
  ].join("\n");
  const q={taskId:t.taskId,sessionId:"dots3-semantics-v1",traceId:t.taskId,runtime:{name:"measurement",version:SHA},
    systemPolicy:"Dots3 synthesis only. Model output is never authority. Sentient is authoritative. Governor governs effects. Return user-facing prose only.",
    messages:[{role:"user",content:instructions}],context:{artifacts:[],contextDigest:await retrieval.sha256Text(`ctx:${t.taskId}`)},tools:[],
    requiredModelCapabilities:["text_generation"],budget:{maxOutputTokens:1536,timeoutMs:30000,maxRetries:0,maxToolRounds:0},
    verifier:{verifierId:t.verifierDefinition,configuration:{}},inputDigest:await retrieval.sha256Text(instructions)};
  const ex=await runtime.execute(q,{provider:"atlascloud",model:DOTS3_NOTE_MODEL_V1}),r=ex.result,rawEvent=rawEvents.at(-1);
  const text=r.ok?String(r.text??""):"";
  const rawContentPresent=typeof rawEvent?.messageContent==="string"?rawEvent.messageContent.length>0:
    Array.isArray(rawEvent?.messageContent)?rawEvent.messageContent.length>0:false;
  const reasoningPresent=(rawEvent?.messageReasoning?.length??0)>0||(rawEvent?.messageReasoningContent?.length??0)>0;
  let failureClass;
  if(!r.ok) failureClass="PROVIDER_INVALID_RESPONSE";
  else if(rawContentPresent&&text.length>0) failureClass="CONTENT_PRESENT_AND_DECODED";
  else if(rawContentPresent&&text.length===0) failureClass="CONTENT_PRESENT_BUT_NOT_DECODED";
  else if(reasoningPresent) failureClass="REASONING_ONLY_NO_VISIBLE_CONTENT";
  else if(rawEvent?.finishReason==="length"||(rawEvent?.usage?.completion_tokens??0)>=1536) failureClass="OUTPUT_TRUNCATED_BEFORE_VISIBLE_CONTENT";
  else failureClass="OTHER_OBSERVED_FAILURE";
  rows.push({
    taskId:t.taskId,raw:rawEvent,
    normalized:{ok:r.ok,text:text,visibleChars:text.length,finishReason:r.ok?r.finishReason:null,
      inputTokens:r.ok?r.usage.inputTokens:null,outputTokens:r.ok?r.usage.outputTokens:null,
      reasoningTokens:r.ok?r.usage.reasoningTokens??null:null,toolCallCount:r.ok?r.toolCalls.length:null},
    failureClass
  });
}
const report={mission:"STRONGER_SENTIENT_COGNITION_INTERFACE_AND_COST_CONTROL",dataset:"dots3-raw-response-semantics-v1",
  baselineSha:SHA,baselineTree:TREE,contract:"sentient-cognition-artifact/v1",taskIds:ids,maxOutputTokens:1536,
  providerCalls:calls,rows,sourceChange:false,measurementRunnerChange:true,productionDeployment:false};
fs.writeFileSync(OUT,JSON.stringify(report,null,2)+"\n");
console.log(`DOTS3_RESPONSE_SEMANTICS=${JSON.stringify(report)}`);
