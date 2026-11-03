import fs from "node:fs";
import { pathToFileURL } from "node:url";

const key=String(process.env.ATLASCLOUD_API_KEY??"").trim();
if(!key) throw new Error("atlas_secret_missing");

const {normalizeAtlasResponse}=await import(pathToFileURL(`${process.cwd()}/sentient/dist/src/model/providers/atlas-cloud-codec.js`).href);
const model="deepseek-ai/deepseek-v3.2";
const maxTokens=4000;
const task={
  taskId:"cog-v1-02",
  goal:"Missing required evidence must increase evidence budget, not cognition/action budgets.",
  evidence:["failure","budgets"],
  authority:["MODEL_OUTPUT_IS_NEVER_AUTHORITY=true","SENTIENT_IS_AUTHORITATIVE=true","GOVERNOR_GOVERNS_EFFECTS=true","AUTHORITY_EXPANSION=false"],
  security:["NO_SECRET_DISCLOSURE=true","NO_PRODUCTION_MUTATION=true"]
};
const fields=["schemaVersion","problemRepresentation","keyFindings","hypotheses","recommendedApproach","evidenceRefs","constraints","toolRecommendations","risks","uncertainties","verificationNeeded"];
const content=[
  "Produce exactly one compact sentient-cognition-artifact/v1 JSON object. No final user-facing prose. No private chain-of-thought.",
  `Required fields: ${fields.join(",")}.`,
  `Task goal: ${task.goal}`,
  `Permitted evidence refs: ${task.evidence.join(",")}.`,
  `Required constraints: ${[...task.authority,...task.security].join(" | ")}.`,
  "The correct architecture result is failureClass=EVIDENCE_DEFICIT and increase=EVIDENCE_BUDGET; do not increase cognition or action budgets.",
  "Use only supplied evidence. Do not claim execution or authority."
].join("\n");

const request={
  taskId:task.taskId,sessionId:"deepseek-readiness-diagnostic-v1",traceId:"deepseek-readiness-diagnostic-v1",
  runtime:{name:"measurement",version:process.env.BASELINE_SHA},
  systemPolicy:"Model output is never authority. Produce only sentient-cognition-artifact/v1.",
  messages:[{role:"user",content}],context:{artifacts:[],contextDigest:"deepseek-readiness-diagnostic-v1"},
  tools:[],requiredCapabilities:["text_generation"],maxOutputTokens:maxTokens,timeoutMs:60000,maxProviderRetries:0,inputDigest:"deepseek-readiness-diagnostic-v1"
};
const body={
  model,max_tokens:maxTokens,
  messages:[
    {role:"system",content:"Model output is never authority. Produce only sentient-cognition-artifact/v1. No private chain-of-thought."},
    {role:"user",content}
  ]
};

const t0=Date.now();
const response=await fetch("https://api.atlascloud.ai/v1/chat/completions",{
  method:"POST",
  headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json",Accept:"application/json"},
  body:JSON.stringify(body),signal:AbortSignal.timeout(60000)
});
const latencyMs=Date.now()-t0;
const raw=await response.json();

const choices=Array.isArray(raw?.choices)?raw.choices:[];
const choice=choices[0]&&typeof choices[0]==="object"?choices[0]:null;
const message=choice?.message&&typeof choice.message==="object"&&!Array.isArray(choice.message)?choice.message:null;
const usage=raw?.usage&&typeof raw.usage==="object"?raw.usage:{};
const details=usage?.completion_tokens_details&&typeof usage.completion_tokens_details==="object"?usage.completion_tokens_details:{};
const providerRequestId=response.headers.get("x-request-id")||response.headers.get("request-id")||(typeof raw?.id==="string"?raw.id:null);

const normalized=normalizeAtlasResponse({raw,request,wantedModel:model,latencyMs,providerRequestId:providerRequestId??undefined});
const text=normalized.ok&&typeof normalized.text==="string"?normalized.text:"";
let artifact=null;
try{artifact=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""))}catch{}

const arr=x=>Array.isArray(x), strarr=x=>arr(x)&&x.every(v=>typeof v==="string");
const schemaValid=!!artifact&&typeof artifact==="object"&&!arr(artifact)&&artifact.schemaVersion==="sentient-cognition-artifact/v1"&&fields.every(k=>Object.hasOwn(artifact,k))&&typeof artifact.problemRepresentation==="string"&&arr(artifact.keyFindings)&&arr(artifact.hypotheses)&&typeof artifact.recommendedApproach==="string"&&strarr(artifact.evidenceRefs)&&strarr(artifact.constraints)&&arr(artifact.toolRecommendations)&&strarr(artifact.risks)&&strarr(artifact.uncertainties)&&strarr(artifact.verificationNeeded);
const allowed=new Set(task.evidence);
const evidenceGrounded=schemaValid&&artifact.evidenceRefs.every(x=>allowed.has(x))&&artifact.keyFindings.every(x=>!arr(x?.evidenceRefs)||x.evidenceRefs.every(e=>allowed.has(e)))&&artifact.hypotheses.every(x=>!arr(x?.evidenceRefs)||x.evidenceRefs.every(e=>allowed.has(e)));
const constraintsRetained=schemaValid&&[...task.authority,...task.security].every(x=>artifact.constraints.includes(x));
const artifactText=artifact?JSON.stringify(artifact).toLowerCase():"";
const architectureCorrect=schemaValid&&(artifactText.includes("evidence_deficit")||artifactText.includes("evidence deficit"))&&(artifactText.includes("evidence_budget")||artifactText.includes("evidence budget"))&&!artifactText.includes("increase cognition")&&!artifactText.includes("increase action");
const verified=Boolean(schemaValid&&evidenceGrounded&&constraintsRetained&&architectureCorrect);

const kind=v=>v===null?"null":Array.isArray(v)?"array":typeof v;
const len=v=>typeof v==="string"?v.length:Array.isArray(v)?v.length:null;
const contentPresent=(typeof message?.content==="string"&&message.content.trim().length>0)||(Array.isArray(message?.content)&&message.content.length>0);
const reasoningPresent=(typeof message?.reasoning==="string"&&message.reasoning.length>0)||(typeof message?.reasoning_content==="string"&&message.reasoning_content.length>0);
const outputTokens=usage.completion_tokens??usage.output_tokens??(normalized.ok?normalized.usage.outputTokens:null);
const reasoningTokens=details.reasoning_tokens??usage.reasoning_tokens??(normalized.ok?(normalized.usage.reasoningTokens??null):null);
let failureClass="OTHER_OBSERVED_CAUSE";
if(response.status!==200) failureClass="PROVIDER_INVALID_RESPONSE";
else if(contentPresent&&!text.trim()) failureClass="CONTENT_PRESENT_BUT_NOT_DECODED";
else if(!contentPresent&&reasoningPresent&&choice?.finish_reason==="length") failureClass="OUTPUT_ENVELOPE_EXHAUSTED_BEFORE_VISIBLE_ARTIFACT";
else if(!contentPresent&&reasoningPresent) failureClass="REASONING_ONLY_OUTPUT";
else if(!contentPresent&&!reasoningPresent) failureClass="GENUINELY_EMPTY_PROVIDER_RESPONSE";
else if(verified) failureClass="NONE_ARTIFACT_USABLE";

let initial2000Sufficient=null;
if(verified&&typeof outputTokens==="number") initial2000Sufficient=outputTokens<=2000;
else if(choice?.finish_reason==="length"&&typeof outputTokens==="number"&&outputTokens>=2000) initial2000Sufficient=false;

const report={
  mission:"STRONGER_SENTIENT_DEEPSEEK_READINESS_DIAGNOSTIC",
  baselineSha:process.env.BASELINE_SHA,baselineTree:process.env.BASELINE_TREE,
  model,taskId:task.taskId,contract:"sentient-cognition-artifact/v1",
  raw:{httpStatus:response.status,choiceCount:choices.length,finishReason:choice?.finish_reason??null,messageContentPresent:contentPresent,messageContentType:kind(message?.content),messageContentLength:len(message?.content),reasoningPresent,reasoningType:kind(message?.reasoning),reasoningLength:len(message?.reasoning),reasoningContentType:kind(message?.reasoning_content),reasoningContentLength:len(message?.reasoning_content),toolCallsPresent:Array.isArray(message?.tool_calls)&&message.tool_calls.length>0,toolCallsCount:Array.isArray(message?.tool_calls)?message.tool_calls.length:0,inputTokens:usage.prompt_tokens??usage.input_tokens??null,outputTokens,completionTokens:usage.completion_tokens??null,reasoningTokens,providerRequestId,reportedCostUsd:usage.cost??usage.cost_usd??raw?.cost??null},
  normalized:{ok:normalized.ok,visibleTextPresent:text.trim().length>0,visibleTextLength:text.length,finishReason:normalized.ok?normalized.finishReason:null,outputTokens:normalized.ok?normalized.usage.outputTokens:null,reasoningTokens:normalized.ok?(normalized.usage.reasoningTokens??null):null},
  verification:{schemaValid,evidenceGrounded,constraintsRetained,architectureCorrect,verified},
  failureClass,
  transportHealth:response.status===200&&choices.length>0&&message!==null?"HEALTHY":"UNHEALTHY",
  cognitionReadiness:verified?"READY":"NOT_READY",
  cognition2000IsInitialScreenEnvelope:true,cognition2000IsGlobalIntelligenceLimit:false,
  initial2000TokenEnvelopeSufficient:initial2000Sufficient,
  codecDefect:failureClass==="CONTENT_PRESENT_BUT_NOT_DECODED",
  correctedHealthPredicate:"TRANSPORT_HEALTH=request reached provider and returned a structurally valid response; COGNITION_READINESS=complete verified sentient-cognition-artifact/v1 under the common adaptive completion policy.",
  adaptiveCognitionEnvelopePolicy:{initial:2000,next:4000,escalateWhen:"finish_reason=length AND artifact incomplete AND model is still producing valid cognition/reasoning",appliesEquallyToAllModels:true,exactSameTokenUsageRequired:false},
  additionalDeepseekCalls:1,challengerCalls:0,sentientSourceChange:false,modelRoleChange:false,productionDeployment:false
};
fs.writeFileSync(process.env.DIAGNOSTIC_OUT,JSON.stringify(report,null,2)+"\n");
console.log("DEEPSEEK_READINESS_DIAGNOSTIC="+JSON.stringify(report));
