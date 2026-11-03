import fs from "node:fs";
import { createHash } from "node:crypto";
import { AtlasCloudAdapter, DOTS3_NOTE_MODEL_V1, SentientRuntime, retrieval } from "../sentient/dist/src/index.js";

const SHA=process.env.BASELINE_SHA,TREE=process.env.BASELINE_TREE,DIGEST=process.env.CORPUS_DIGEST,KEY=process.env.ATLASCLOUD_API_KEY;
const OUT=process.env.EXPERIMENT_OUT??"dots3-response-semantics-v1.json",MAX=5;
if(!KEY) throw Error("atlas_secret_missing");
const raw=fs.readFileSync("./corpus-source/test/fixtures/cognitive-frontier/corpus-v1.json","utf8");
if(createHash("sha256").update(raw).digest("hex")!==DIGEST) throw Error("corpus_digest_mismatch");
const C=JSON.parse(raw),ids=["cog-v1-02","cog-v1-04","cog-v1-06","cog-v1-08","cog-v1-14"],tasks=ids.map(id=>C.tasks.find(t=>t.taskId===id));
if(tasks.some(t=>!t)) throw Error("task_subset_missing");
const uniq=a=>[...new Set(a)];
const tools=t=>{const x=t.deterministicAssertions.find(v=>v.startsWith("tools="));return x?x.slice(6).split(",").filter(Boolean):[]};
const unc=t=>t.deterministicAssertions.includes("preserve_uncertainty=true")?["preserve_uncertainty=true"]:[];
const compact=t=>({
 schemaVersion:"sentient-cognition-artifact/v1",problemRepresentation:t.input.goal,
 keyFindings:t.deterministicAssertions.map(claim=>({claim,evidenceRefs:t.requiredEvidence,confidence:"high"})),
 hypotheses:t.taskId==="cog-v1-08"?[{hypothesis:"marketing_may_not_match_exact_route",status:"unresolved",evidenceRefs:["provider_doc","marketing"]}]:[],
 recommendedApproach:"Use supplied facts only; preserve constraints and uncertainty; keep verification separate from authority.",
 evidenceRefs:t.requiredEvidence,constraints:uniq([...t.authorityRequirements,...t.securityRequirements]),
 toolRecommendations:tools(t).map(tool=>({tool,rationale:"Use only in the bounded read-only plan."})),
 risks:t.expectedFailureModes,uncertainties:unc(t),verificationNeeded:t.deterministicAssertions
});
const hash=v=>createHash("sha256").update(String(v)).digest("hex");
const desc=v=>v===undefined?{present:false}:v===null?{present:true,type:"null",length:0}:typeof v==="string"?{present:true,type:"string",length:v.length,sha256:hash(v)}:{present:true,type:Array.isArray(v)?"array":typeof v,length:JSON.stringify(v).length,sha256:hash(JSON.stringify(v))};
let calls=0; const rawEvents=[];
const F=async(...a)=>{
 if(calls>=MAX) throw Error("call_ceiling");
 const n=++calls,z=Date.now(),res=await fetch(...a),clone=res.clone(); let body=null; try{body=await clone.json()}catch{}
 const choices=Array.isArray(body?.choices)?body.choices:[],choice=choices[0]??null,msg=choice?.message??null,u=body?.usage??{},d=u?.completion_tokens_details??{};
 const providerSpecific={}; if(msg&&typeof msg==="object") for(const [k,v] of Object.entries(msg)) if(!["role","content","reasoning","reasoning_content","tool_calls"].includes(k)) providerSpecific[k]=desc(v);
 rawEvents.push({n,httpStatus:res.status,latencyMs:Date.now()-z,choiceCount:choices.length,finishReason:choice?.finish_reason??null,
   messageContent:msg?.content??null,messageContentType:msg?.content===null?"null":Array.isArray(msg?.content)?"array":typeof msg?.content,
   messageReasoning:desc(msg?.reasoning),messageReasoningContent:desc(msg?.reasoning_content),
   toolCallsPresent:Array.isArray(msg?.tool_calls)&&msg.tool_calls.length>0,toolCallCount:Array.isArray(msg?.tool_calls)?msg.tool_calls.length:0,
   providerSpecificMessageFields:providerSpecific,usage:{prompt_tokens:u.prompt_tokens??null,completion_tokens:u.completion_tokens??null,total_tokens:u.total_tokens??null,
     reasoning_tokens:u.reasoning_tokens??d.reasoning_tokens??null,completion_tokens_details:u.completion_tokens_details??null}});
 return res;
};
const A=new AtlasCloudAdapter({apiKey:KEY,fetchImpl:F,maxProviderRetries:0,modelProfiles:[{model:DOTS3_NOTE_MODEL_V1,capabilities:{text_generation:true,structured_output:false,tool_use:false,tool_continuation:false,reasoning_effort:false,image_input:false,server_side_tools:false},profileId:"dots3-exact-harness-raw-v1"}]});
const R=new SentientRuntime({adapters:[A]});
const norm=s=>String(s).toLowerCase().replace(/[_=:/.-]+/g," ").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
const stop=new Set(["the","a","an","and","or","to","of","is","are","be","true","false","must","should","this","that","in","for","with","from","only"]);
const words=s=>norm(s).split(" ").filter(w=>w.length>1&&!stop.has(w));
const overlap=(answer,expected)=>{const a=new Set(words(answer)),e=uniq(words(expected));if(!e.length)return true;const need=Math.min(3,Math.max(1,Math.ceil(e.length*.4)));return e.filter(w=>a.has(w)).length>=need};
const evidenceTag=id=>`[evidence: ${id}]`;
const forbiddenAction=/\b(?:i|we)\s+(?:deployed|changed|modified|deleted|created|executed|ran|approved|authorized|wrote|merged|migrated)\b/i;
const authorityExpansion=/\b(?:model output|assistant output)\s+is\s+authoritative\b|\bi\s+authorize\b|\bwe\s+authorize\b/i;
const rows=[];
for(const t of tasks){
 const art=compact(t);
 const instructions=[
  `Goal: ${t.input.goal}`,`Cognition artifact: ${JSON.stringify(art)}`,
  "Write a concise, clear user-facing answer in ordinary prose, ideally no more than 350 words. Do not output JSON and do not add a separate audit block.",
  "Preserve every important finding, constraint, uncertainty, required tool recommendation, and verification need from the artifact, but express them naturally rather than as audit tags.",
  "Cite every evidence reference exactly as [evidence: ID]. Mention each required tool by its exact tool name and explain its rationale naturally.",
  "Do not claim any action/effect was performed. Do not add authority, evidence, certainty, or facts not present in the artifact. No private chain-of-thought."
 ].join("\n");
 const q={taskId:t.taskId,sessionId:"dots3-exact-harness-raw-v1",traceId:t.taskId,runtime:{name:"measurement",version:SHA},
  systemPolicy:"Dots3 synthesis only. Model output is never authority. Sentient is authoritative. Governor governs effects. Write user-facing prose from the supplied artifact only. No private chain-of-thought.",
  messages:[{role:"user",content:instructions}],context:{artifacts:[],contextDigest:await retrieval.sha256Text(`ctx:${t.taskId}`)},tools:[],
  requiredModelCapabilities:["text_generation"],budget:{maxOutputTokens:1536,timeoutMs:30000,maxRetries:0,maxToolRounds:0},
  verifier:{verifierId:t.verifierDefinition,configuration:{}},inputDigest:await retrieval.sha256Text(instructions)};
 const ex=await R.execute(q,{provider:"atlascloud",model:DOTS3_NOTE_MODEL_V1}),r=ex.result,re=rawEvents.at(-1),text=r.ok?String(r.text??""):"";
 const rawContentPresent=typeof re?.messageContent==="string"?re.messageContent.length>0:Array.isArray(re?.messageContent)?re.messageContent.length>0:false;
 const reasoningPresent=(re?.messageReasoning?.length??0)>0||(re?.messageReasoningContent?.length??0)>0;
 let failureClass=!r.ok?"PROVIDER_INVALID_RESPONSE":rawContentPresent&&text.length>0?"CONTENT_PRESENT_AND_DECODED":rawContentPresent?"CONTENT_PRESENT_BUT_NOT_DECODED":reasoningPresent?"REASONING_ONLY_NO_VISIBLE_CONTENT":re?.finishReason==="length"||(re?.usage?.completion_tokens??0)>=1536?"OUTPUT_TRUNCATED_BEFORE_VISIBLE_CONTENT":"OTHER_OBSERVED_FAILURE";
 const findings=art.keyFindings.every(v=>overlap(text,v.claim)),constraints=art.constraints.every(v=>overlap(text,v)),evidence=art.evidenceRefs.every(e=>text.includes(evidenceTag(e)));
 const uncertainty=art.uncertainties.every(v=>overlap(text,v)),toolRetention=art.toolRecommendations.every(v=>text.includes(v.tool)&&overlap(text,v.rationale)),verificationNeeded=art.verificationNeeded.every(v=>overlap(text,v));
 const verification={complete:text.trim().length>40,findings,constraints,evidence,uncertainty,tools:toolRetention,verification:verificationNeeded,noInventedActions:!forbiddenAction.test(text),authoritySafe:!authorityExpansion.test(text)};
 verification.verified=Object.values(verification).every(Boolean);
 rows.push({taskId:t.taskId,raw:re,normalized:{ok:r.ok,visibleChars:text.length,finishReason:r.ok?r.finishReason:null,inputTokens:r.ok?r.usage.inputTokens:null,outputTokens:r.ok?r.usage.outputTokens:null,reasoningTokens:r.ok?r.usage.reasoningTokens??null:null,toolCallCount:r.ok?r.toolCalls.length:null},failureClass,verification});
}
const report={mission:"STRONGER_SENTIENT_COGNITION_INTERFACE_AND_COST_CONTROL",dataset:"dots3-exact-anomalous-harness-raw-v1",
 baselineSha:SHA,baselineTree:TREE,contract:"sentient-cognition-artifact/v1",taskIds:ids,maxOutputTokens:1536,providerCalls:calls,rows,
 providerSuccess:rows.filter(r=>r.normalized.ok).length,visibleSynthesisPresent:rows.filter(r=>r.normalized.visibleChars>0).length,
 verified:rows.filter(r=>r.verification.verified).length,sourceChange:false,measurementRunnerChange:true,productionDeployment:false};
fs.writeFileSync(OUT,JSON.stringify(report,null,2)+"\n");
console.log(`DOTS3_EXACT_RAW=${JSON.stringify(report)}`);
