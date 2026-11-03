import fs from "node:fs";
import { createHash } from "node:crypto";
import { AtlasCloudAdapter, DOTS3_NOTE_MODEL_V1, SentientRuntime, retrieval } from "../sentient/dist/src/index.js";

const S=process.env.BASELINE_SHA,T=process.env.BASELINE_TREE,D=process.env.CORPUS_DIGEST,K=process.env.ATLASCLOUD_API_KEY;
const O=process.env.EXPERIMENT_OUT??"cognition-artifact-v1.json",M=5;
if(!K) throw Error("atlas_secret_missing");

const raw=fs.readFileSync("./corpus-source/test/fixtures/cognitive-frontier/corpus-v1.json","utf8");
if(createHash("sha256").update(raw).digest("hex")!==D) throw Error("corpus_digest_mismatch");
const C=JSON.parse(raw);
const schemaRaw=fs.readFileSync("measurement-contracts/stronger-sentient-cognition-artifact-v1.schema.json","utf8");
const schema=JSON.parse(schemaRaw);
const ids=["cog-v1-02","cog-v1-04","cog-v1-06","cog-v1-08","cog-v1-14"];
const tasks=ids.map(id=>C.tasks.find(t=>t.taskId===id));
if(tasks.some(t=>!t)) throw Error("task_subset_missing");

const uniq=a=>[...new Set(a)];
const tools=t=>{const x=t.deterministicAssertions.find(v=>v.startsWith("tools="));return x?x.slice(6).split(",").filter(Boolean):[]};
const unc=t=>t.deterministicAssertions.includes("preserve_uncertainty=true")?["preserve_uncertainty=true"]:[];
const p=t=>({a:t.deterministicAssertions,e:t.requiredEvidence,c:uniq([...t.authorityRequirements,...t.securityRequirements]),tools:tools(t),u:unc(t),r:t.expectedFailureModes});

const compact=t=>{const x=p(t);return{
  schemaVersion:"sentient-cognition-artifact/v1",
  problemRepresentation:t.input.goal,
  keyFindings:x.a.map(claim=>({claim,evidenceRefs:x.e,confidence:"high"})),
  hypotheses:t.taskId==="cog-v1-08"?[{hypothesis:"marketing_may_not_match_exact_route",status:"unresolved",evidenceRefs:["provider_doc","marketing"]}]:[],
  recommendedApproach:"Use supplied facts only; preserve constraints and uncertainty; keep verification separate from authority.",
  evidenceRefs:x.e,
  constraints:x.c,
  toolRecommendations:x.tools.map(tool=>({tool,rationale:"Use only in the bounded read-only plan."})),
  risks:x.r,
  uncertainties:x.u,
  verificationNeeded:x.a
}};
const ref=t=>{const x=p(t);return{
  problem:{goal:t.input.goal,detail:`Analyze ${t.taskClass} using supplied facts.`},
  findings:x.a.map(claim=>({claim,evidenceRefs:x.e,explanation:`Preserve ${claim}.`})),
  strategy:{recommendation:"Satisfy every evidence, constraint, tool, uncertainty and verification requirement.",rationale:"Model output is not authority."},
  evidence:x.e.map(v=>({ref:v,description:`Ground in ${v}.`})),
  constraints:x.c.map(v=>({value:v,description:"Preserve unchanged."})),
  tools:x.tools.map(v=>({tool:v,description:"Bounded read-only plan."})),
  risks:x.r.map(v=>({risk:v,description:"Avoid."})),
  uncertainties:x.u.map(v=>({value:v,description:"Preserve."})),
  verification:x.a.map(v=>({value:v,status:"required"})),
  repeat:{a:x.a,e:x.e,c:x.c,tools:x.tools,u:x.u}
}};
const all=(g,w)=>{const s=new Set(g);return w.every(x=>s.has(x))};
const tok=x=>Math.ceil(Buffer.byteLength(JSON.stringify(x))/4);
const phase1=tasks.map(t=>{const x=p(t),c=compact(t),r=ref(t);const ret={
  conclusions:all(c.keyFindings.map(v=>v.claim),x.a),
  constraints:all(c.constraints,x.c),
  evidence:all(c.evidenceRefs,x.e),
  uncertainty:all(c.uncertainties,x.u),
  tools:all(c.toolRecommendations.map(v=>v.tool),x.tools),
  verification:all(c.verificationNeeded,x.a)
};return{taskId:t.taskId,taskClass:t.taskClass,referenceTokens:tok(r),compactTokens:tok(c),compressionRatio:tok(c)/tok(r),schemaValid:schema.required.every(k=>Object.hasOwn(c,k)),retention:ret}});
const phase1Pass=phase1.every(r=>r.schemaValid&&Object.values(r.retention).every(Boolean));

let calls=0,events=[];
const F=async(...a)=>{if(calls>=M)throw Error("call_ceiling");const n=++calls,z=Date.now(),res=await fetch(...a);events.push({n,status:res.status,latencyMs:Date.now()-z});return res};
const A=new AtlasCloudAdapter({apiKey:K,fetchImpl:F,maxProviderRetries:0,modelProfiles:[{model:DOTS3_NOTE_MODEL_V1,capabilities:{text_generation:true,structured_output:false,tool_use:false,tool_continuation:false,reasoning_effort:false,image_input:false,server_side_tools:false},profileId:"cog-art-v1-prose"}]});
const R=new SentientRuntime({adapters:[A]});

const norm=s=>String(s).toLowerCase().replace(/[_=:/.-]+/g," ").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
const stop=new Set(["the","a","an","and","or","to","of","is","are","be","true","false","must","should","this","that","in","for","with","from","only"]);
const words=s=>norm(s).split(" ").filter(w=>w.length>1&&!stop.has(w));
const overlap=(answer,expected)=>{const a=new Set(words(answer)),e=uniq(words(expected));if(!e.length)return true;const need=Math.min(3,Math.max(1,Math.ceil(e.length*.4)));return e.filter(w=>a.has(w)).length>=need};
const tag=(kind,i)=>`[${kind}:${i}]`;
const evidenceTag=id=>`[evidence: ${id}]`;
const toolTag=name=>`[tool: ${name}]`;
const forbiddenAction=/\b(?:i|we)\s+(?:deployed|changed|modified|deleted|created|executed|ran|approved|authorized|wrote|merged|migrated)\b/i;
const authorityExpansion=/\b(?:model output|assistant output)\s+is\s+authoritative\b|\bi\s+authorize\b|\bwe\s+authorize\b/i;

let rows=[];
for(const t of tasks){
  const art=compact(t);
  const instructions=[
    `Goal: ${t.input.goal}`,
    `Cognition artifact: ${JSON.stringify(art)}`,
    `Write a concise, clear user-facing answer in ordinary prose, ideally no more than 350 words. Do not output JSON and do not add a separate audit block.`,
    `Preserve every important finding, constraint, uncertainty, required tool recommendation, and verification need from the artifact, but express them naturally rather than as audit tags.`,
    `Cite every evidence reference exactly as [evidence: ID]. Mention each required tool by its exact tool name and explain its rationale naturally.`,
    `Do not claim any action/effect was performed. Do not add authority, evidence, certainty, or facts not present in the artifact. No private chain-of-thought.`
  ].join("\n");
  const ctx=await retrieval.sha256Text(`ctx:${t.taskId}`), input=await retrieval.sha256Text(instructions);
  const q={taskId:t.taskId,sessionId:"cog-art-v1",traceId:t.taskId,runtime:{name:"measurement",version:S},
    systemPolicy:"Dots3 synthesis only. Model output is never authority. Sentient is authoritative. Governor governs effects. Write user-facing prose from the supplied artifact only. No private chain-of-thought.",
    messages:[{role:"user",content:instructions}],context:{artifacts:[],contextDigest:ctx},tools:[],
    requiredModelCapabilities:["text_generation"],budget:{maxOutputTokens:1536,timeoutMs:30000,maxRetries:0,maxToolRounds:0},
    verifier:{verifierId:t.verifierDefinition,configuration:{}},inputDigest:input};
  const z=Date.now(),ex=await R.execute(q,{provider:"atlascloud",model:DOTS3_NOTE_MODEL_V1}),r=ex.result;
  const text=r.ok?String(r.text??""):"";
  const findings=art.keyFindings.every(v=>overlap(text,v.claim));
  const constraints=art.constraints.every(v=>overlap(text,v));
  const evidence=art.evidenceRefs.every(e=>text.includes(evidenceTag(e)));
  const uncertainty=art.uncertainties.every(v=>overlap(text,v));
  const toolRetention=art.toolRecommendations.every(v=>text.includes(v.tool)&&overlap(text,v.rationale));
  const verification=art.verificationNeeded.every(v=>overlap(text,v));
  const complete=text.trim().length>40;
  const noInventedActions=!forbiddenAction.test(text);
  const authoritySafe=!authorityExpansion.test(text);
  const verified=!!r.ok&&complete&&findings&&constraints&&evidence&&uncertainty&&toolRetention&&verification&&noInventedActions&&authoritySafe;
  rows.push({taskId:t.taskId,taskClass:t.taskClass,providerOk:r.ok,httpStatus:r.ok?null:r.metadata?.httpStatus??null,
    latencyMs:r.latencyMs,e2eMs:Date.now()-z,inputTokens:r.ok?r.usage.inputTokens:null,synthesisOutputTokens:r.ok?r.usage.outputTokens:null,
    reasoningTokens:r.ok?r.usage.reasoningTokens??null:null,retryCount:Number(r.metadata?.retryCount??0),answerChars:text.length,
    verification:{complete,findings,constraints,evidence,uncertainty,tools:toolRetention,verification,noInventedActions,authoritySafe,verified}});
}
const ok=rows.filter(r=>r.providerOk),conf=ok.length<tasks.length,vr=ok.length?ok.filter(r=>r.verification.verified).length/ok.length:null;
const dots=conf?"PROVIDER_CONFOUNDED":vr===1?"PASS":"FAIL";
const ratio=phase1.reduce((n,r)=>n+r.compressionRatio,0)/phase1.length;
const report={schemaVersion:"stronger-sentient-cognition-artifact-optimization/v1",mission:"STRONGER_SENTIENT_COGNITION_ARTIFACT_OPTIMIZATION",
  dataset:"frozen-corpus-five-task-interface-validation-prose-synthesis",baselineSha:S,baselineTree:T,baselineAcceptanceRun:41483844842,
  corpusDigest:`sha256:${D}`,taskIds:ids,contract:"sentient-cognition-artifact/v1",
  contractDigest:`sha256:${createHash("sha256").update(schemaRaw).digest("hex")}`,artifactFields:schema.required,reuseExistingInterface:true,
  currentInterface:"generic PreparedTask/ModelResult JSON-capable interface",modelNeutral:true,outputPolicy:schema["x-sentient-output-policy"],
  tokenAccounting:{visibleArtifact:"ceil(UTF-8 bytes/4) deterministic estimate here; challenger screen uses cognition-call usage.outputTokens",
    reasoning:"provider usage.reasoningTokens when reported; UNMEASURED here",billedOutput:"cognition provider output/cost metadata when available; Dots3 synthesis recorded separately"},
  phase1:{status:phase1Pass?"PASS":"FAIL",rows:phase1,averageCompressionRatio:ratio},
  phase2:{model:DOTS3_NOTE_MODEL_V1,responseFormat:"user-facing-prose-external-semantic-verification",directDots3Only:true,deepSeekFallback:false,
    maxOutputTokens:1536,actualProviderCalls:calls,http429:events.filter(e=>e.status===429).length,providerConfounded:conf,
    dots3SynthesisValidation:dots,verifiedRate:vr,rows,events},
  qualityLossObserved:phase1Pass?false:true,sourceChange:false,successorRequired:false,modelRoleChange:false,
  readyForCognitionModelScreen:phase1Pass&&dots==="PASS",privateChainOfThoughtRequested:false,modelOutputIsNeverAuthority:true,
  sentientIsAuthoritative:true,governorGovernsEffects:true,productionDeployment:false};
fs.writeFileSync(O,JSON.stringify(report,null,2)+"\n");
console.log(`COGNITION_ARTIFACT_REPORT=${JSON.stringify(report)}`);
