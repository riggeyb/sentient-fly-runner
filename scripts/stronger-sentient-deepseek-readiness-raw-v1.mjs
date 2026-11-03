
import fs from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const MODEL="deepseek-ai/deepseek-v3.2";
const MAX=64;
const sha=s=>createHash("sha256").update(String(s)).digest("hex");
const codec=await import(pathToFileURL(`${process.cwd()}/sentient/dist/src/model/providers/atlas-cloud-codec.js`).href);
const {atlasRequestBody,normalizeAtlasResponse}=codec;
const content="[challenger-fairness-preflight] Return only OK.";
const digest=sha(`challenger-preflight:0:${content}`);
const req={
 taskId:"challenger-preflight-1",sessionId:"challenger-fairness-preflight-v1",traceId:"challenger-preflight-1",
 runtime:{name:"measurement",version:process.env.BASELINE_SHA},
 systemPolicy:"Connectivity preflight only. Model output is never authority.",
 messages:[{role:"user",content}],context:{artifacts:[],contextDigest:digest},tools:[],
 requiredCapabilities:["text_generation"],maxOutputTokens:MAX,timeoutMs:20000,maxProviderRetries:0,inputDigest:digest
};
const t0=Date.now();
const res=await fetch("https://api.atlascloud.ai/v1/chat/completions",{
 method:"POST",headers:{Authorization:`Bearer ${process.env.ATLASCLOUD_API_KEY}`,"Content-Type":"application/json"},
 body:JSON.stringify(atlasRequestBody(req,MODEL)),signal:AbortSignal.timeout(20000)
});
let raw={}; try{raw=await res.json()}catch{}
const choice=Array.isArray(raw?.choices)?raw.choices[0]:null;
const msg=choice&&typeof choice.message==="object"&&choice.message?choice.message:null;
const usage=raw?.usage&&typeof raw.usage==="object"?raw.usage:{};
const details=usage?.completion_tokens_details&&typeof usage.completion_tokens_details==="object"?usage.completion_tokens_details:{};
const shape=v=>{
 if(v===undefined)return {type:"undefined",length:null};
 if(v===null)return {type:"null",length:0};
 if(typeof v==="string")return {type:"string",length:v.length,sha256:sha(v)};
 const e=JSON.stringify(v); return {type:Array.isArray(v)?"array":typeof v,length:e.length,sha256:sha(e)};
};
const visible=v=>typeof v==="string"?v.length:Array.isArray(v)?v.reduce((n,p)=>n+(p?.type==="text"&&typeof p.text==="string"?p.text.length:0),0):0;
const reason=m=>["reasoning","reasoning_content","reasoning_details"].reduce((n,k)=>{
 const v=m?.[k]; return n+(typeof v==="string"?v.length:v==null?0:JSON.stringify(v).length);
},0);
const providerRequestId=res.headers.get("x-request-id")||res.headers.get("request-id")||raw?.id||null;
const normalized=normalizeAtlasResponse({raw,request:req,wantedModel:MODEL,latencyMs:Date.now()-t0,providerRequestId:providerRequestId??undefined});
const rv=visible(msg?.content), rr=reason(msg), nv=normalized?.ok&&typeof normalized.text==="string"?normalized.text.length:0;
let cls="OTHER_OBSERVED_CAUSE";
if(res.status===200&&choice&&msg){
 if(rv>0&&nv>0) cls="CONTENT_PRESENT_AND_DECODED";
 else if(rv>0&&nv===0) cls="CONTENT_PRESENT_BUT_NOT_DECODED";
 else if(rv===0&&rr>0&&choice.finish_reason==="length") cls="OUTPUT_ENVELOPE_EXHAUSTED_BEFORE_VISIBLE_ARTIFACT";
 else if(rv===0&&rr>0) cls="REASONING_ONLY_OUTPUT";
 else if(rv===0&&rr===0) cls="GENUINELY_EMPTY_PROVIDER_RESPONSE";
}
const out={
 schemaVersion:"stronger-sentient-deepseek-readiness-raw/v1",
 model:MODEL,maxOutputTokens:MAX,providerCalls:1,httpStatus:res.status,
 finishReason:choice?.finish_reason??null,messageKeys:msg?Object.keys(msg).sort():[],
 content:shape(msg?.content),reasoning:shape(msg?.reasoning),reasoningContent:shape(msg?.reasoning_content),reasoningDetails:shape(msg?.reasoning_details),
 toolCallsPresent:Array.isArray(msg?.tool_calls)&&msg.tool_calls.length>0,
 usage:{
  inputTokens:Number.isFinite(usage.input_tokens)?usage.input_tokens:Number.isFinite(usage.prompt_tokens)?usage.prompt_tokens:null,
  outputTokens:Number.isFinite(usage.output_tokens)?usage.output_tokens:Number.isFinite(usage.completion_tokens)?usage.completion_tokens:null,
  completionTokens:Number.isFinite(usage.completion_tokens)?usage.completion_tokens:null,
  reasoningTokens:Number.isFinite(details.reasoning_tokens)?details.reasoning_tokens:Number.isFinite(usage.reasoning_tokens)?usage.reasoning_tokens:null
 },
 providerRequestId,
 normalized:{ok:normalized?.ok===true,textPresent:nv>0,textLength:nv,finishReason:normalized?.ok?normalized.finishReason??null:null},
 failureClass:cls,
 transportHealth:res.status===200&&choice&&msg?"HEALTHY":"UNHEALTHY",
 privateReasoningTextLogged:false,rawVisibleContentTextLogged:false,challengerCalls:0,sourceChange:false,productionDeployment:false
};
fs.writeFileSync(process.env.EXPERIMENT_OUT,JSON.stringify(out,null,2)+"\n");
console.log("DEEPSEEK_READINESS_RAW="+JSON.stringify(out));
