import { createHash } from "node:crypto";
import { OpenRouterAdapter, SentientRuntime } from "../sentient/dist/src/index.js";
import { routeExecutionWorkItemV1, createExecutionRouteStateV1, applyRouteOutcomeV1 } from "../sentient/dist/src/cognition/adaptive-execution-routing-v1.js";
import { compilePreparedTaskSemanticCompressionShadowV1 } from "../sentient/dist/src/retrieval/semantic-compression-v1.js";
import { buildPreparedTaskProgressiveDisclosureShadowV1 } from "../sentient/dist/src/retrieval/progressive-disclosure-v1.js";

const PROVIDER="openrouter", MODEL="moonshotai/kimi-k3.1-pro";
const SOFT=0.50, HARD=1.00, MAX_IN=4096, MAX_OUT=320, MAX_REASON=320;
const MAX_INPUT_RATE=4.00, MAX_OUTPUT_RATE=30.177, MAX_REASON_RATE=30.177;
const CACHE_RATE=0.47;
const MAX_NEXT=(MAX_IN*MAX_INPUT_RATE+MAX_OUT*MAX_OUTPUT_RATE+MAX_REASON*MAX_REASON_RATE)/1e6;
const key=process.env.OPENROUTER_API_KEY?.trim()||"";

const schema={type:"object",additionalProperties:false,required:["schemaVersion","problemRepresentation","findings","hypotheses","recommendedApproach","evidenceReferences","constraints","toolRecommendations","risks","uncertainties","verificationNeeded"],properties:{
 schemaVersion:{type:"string",const:"sentient-cognition-artifact/v1"},
 problemRepresentation:{type:"string",minLength:1,maxLength:700},
 findings:{type:"array",maxItems:5,items:{type:"string",maxLength:350}},
 hypotheses:{type:"array",maxItems:4,items:{type:"string",maxLength:350}},
 recommendedApproach:{type:"array",minItems:1,maxItems:5,items:{type:"string",maxLength:350}},
 evidenceReferences:{type:"array",minItems:1,maxItems:6,items:{type:"string",maxLength:120}},
 constraints:{type:"array",minItems:1,maxItems:6,items:{type:"string",maxLength:250}},
 toolRecommendations:{type:"array",maxItems:4,items:{type:"string",maxLength:250}},
 risks:{type:"array",maxItems:4,items:{type:"string",maxLength:300}},
 uncertainties:{type:"array",maxItems:4,items:{type:"string",maxLength:300}},
 verificationNeeded:{type:"array",minItems:1,maxItems:5,items:{type:"string",maxLength:300}}
}};

const probes=[
 {id:"idempotency",kind:"ARCHITECTURE",c:"C17",e:"E5",
  objective:"For an at-least-once job service that retries after timeouts, choose the safest minimal design to prevent duplicate external side effects. Preserve C17 and E5. Recommend verification; no code.",
  context:"C17: external side effects must be idempotent across duplicate delivery. E5: a timeout can occur after the external side effect succeeds but before acknowledgement is persisted."},
 {id:"cache-debug",kind:"AMBIGUOUS_DEBUGGING",c:"C22",e:"E9",
  objective:"Diagnose intermittent stale reads after a successful TypeScript API write. Preserve C22 and E9. DB commit succeeds; async cache invalidation can fail. Recommend the smallest safe diagnostic/repair and verification; no code.",
  context:"C22: user-facing stale reads must not persist longer than 2 seconds. E9: the invalidation worker observed HTTP 429 responses during the stale-read window."}
];

const digest=s=>"sha256:"+createHash("sha256").update(s,"utf8").digest("hex");
const estimate=s=>Math.ceil(Buffer.byteLength(s,"utf8")/4);

function makeTask(p){
 const cc=`Synthetic public Gate 1 context. ${p.context} Model output is advisory only; Sentient remains authoritative. Do not provide private chain-of-thought.`;
 const context={artifacts:[{kind:"memory",id:`gate1:${p.id}`,content:cc,contentDigest:digest(cc),provenance:{source:"gate1-synthetic"}}],contextDigest:digest(cc)};
 const systemPolicy="Return only compact sentient-cognition-artifact/v1 structured output. Preserve supplied constraint/evidence IDs verbatim. Do not expose private chain-of-thought. Model output is advisory and never grants authority.";
 const messages=[{role:"user",content:p.objective}];
 return {taskId:`gate1-${p.id}`,sessionId:"human-governed-preproduction-autonomy-pilot-v1",traceId:`gate1:${p.id}`,runtime:{name:"sentient-gate1-live-cognition",version:"v1"},systemPolicy,messages,context,tools:[],outputSchema:schema,reasoningEffort:"low",requiredModelCapabilities:["text_generation","structured_output","reasoning_effort"],budget:{maxOutputTokens:MAX_OUT,timeoutMs:45000,maxRetries:1,maxToolRounds:0},verifier:{verifierId:"gate1-retention-v1",configuration:{}},inputDigest:digest(JSON.stringify({systemPolicy,messages,context}))};
}
function work(p){return {taskId:`gate1-${p.id}`,workItemId:`gate1-${p.id}:primary`,kind:p.kind,description:p.objective,cognitiveLeverage:"HIGH",consequence:"LOW",ambiguity:"MEDIUM",verificationAvailable:true,deterministicCapabilityAvailable:false,repetitive:false,followsProvenPattern:false,securitySensitive:false,crossModuleReasoning:true,novelImplementation:false,requiresCredentials:false,requiresExternalAuthorization:false,requiresPolicyApproval:false,requiresProductionMutationApproval:false,requiresConsequentialEffectApproval:false}}
function valid(a,p){return !!a&&typeof a==="object"&&!Array.isArray(a)&&a.schemaVersion==="sentient-cognition-artifact/v1"&&typeof a.problemRepresentation==="string"&&a.problemRepresentation.length>0&&Array.isArray(a.recommendedApproach)&&a.recommendedApproach.length>0&&Array.isArray(a.constraints)&&a.constraints.some(x=>String(x).includes(p.c))&&Array.isArray(a.evidenceReferences)&&a.evidenceReferences.some(x=>String(x).includes(p.e))&&Array.isArray(a.verificationNeeded)&&a.verificationNeeded.length>0}

const receipt={
 mission:"HUMAN_GOVERNED_PREPRODUCTION_AUTONOMY_PILOT_V1",
 gate:"GATE_1_LIVE_COGNITION_TRANSPORT_AND_ECONOMIC_TELEMETRY",
 canonicalSentientSha:process.env.CANONICAL_SENTIENT_SHA??"",
 canonicalSentientTree:process.env.CANONICAL_SENTIENT_TREE??"",
 provider:PROVIDER,model:MODEL,modelRoute:"PRIMARY_COGNITION",
 pricingBasis:{
  source:"OpenRouter Kimi K3.1 Pro provider table checked 2026-11-05",
  reservationMaxInputUsdPerMillion:MAX_INPUT_RATE,
  reservationMaxOutputUsdPerMillion:MAX_OUTPUT_RATE,
  reservationMaxReasoningUsdPerMillion:MAX_REASON_RATE,
  reservationMaxCacheReadUsdPerMillion:CACHE_RATE,
  reservationMethod:"worst visible provider rates; reasoning allowance double-reserved conservatively",
  actualCostMethod:"provider-reported usage.cost when available"
 },
 gateSoftBudgetUsd:SOFT,gateHardBudgetUsd:HARD,maxEstimatedNextCallCostUsd:MAX_NEXT,
 providerCalls:0,successfulProviderCalls:0,providerRetries:0,provider429s:0,providerFailures:0,
 billedInputTokens:0,billedCacheTokens:0,billedOutputTokens:0,billedReasoningTokens:0,
 internalContextTokenEstimate:0,actualProviderSpendUsd:0,
 dots3Calls:0,semanticCompressionUsed:false,originalContextRetrievals:0,
 unnecessaryPrimaryCognitionCalls:0,avoidableProviderCostUsd:0,authorityViolations:0,
 hardBudgetExceeded:false,budgetWarnings:[],calls:[],gateResult:"FAIL",terminalState:"PROVIDER_FAILURE"
};

if(!key){
 receipt.providerFailures=1;
 receipt.failure="OPENROUTER_API_KEY_UNAVAILABLE";
 console.log("GATE1_RECEIPT>"+JSON.stringify(receipt));
 process.exitCode=2;
}else{
 const profile={model:MODEL,profileId:"gate1:kimi-k3.1-pro:2026-11-05",capabilities:{text_generation:true,structured_output:true,tool_use:true,tool_continuation:true,reasoning_effort:true,image_input:true,server_side_tools:false},modalities:{textInput:true,imageInput:true},contextWindowTokens:1048576,dataPolicy:"public_fixture_only",routeObservation:{observedAt:"2026-11-05T00:00:00.000Z",source:"https://openrouter.ai/moonshotai/kimi-k3.1-pro",available:true,free:false}};
 const runtime=new SentientRuntime({adapters:[new OpenRouterAdapter({apiKey:key,modelProfiles:[profile],privacyPolicy:"public_fixture",requireFreeRoute:false,appTitle:"Sentient Gate 1 Live Cognition"})]});
 for(const p of probes){
  if(receipt.actualProviderSpendUsd+MAX_NEXT>HARD){receipt.terminalState="BUDGET_EXHAUSTED";receipt.budgetWarnings.push("hard_budget_precall_reservation_blocked");break}
  if(receipt.actualProviderSpendUsd>=SOFT){receipt.budgetWarnings.push("soft_budget_reached_no_new_paid_work");break}
  const t=makeTask(p);
  receipt.internalContextTokenEstimate+=estimate(t.systemPolicy+"\n"+t.messages[0].content+"\n"+t.context.artifacts[0].content);
  const d=routeExecutionWorkItemV1(work(p));
  if(d.route!=="PRIMARY_COGNITION"){receipt.terminalState="VERIFICATION_FAILURE";receipt.failure=`unexpected_route:${d.route}`;break}
  let routeState=createExecutionRouteStateV1(d,{maxRouteRetries:1});
  const sem=await compilePreparedTaskSemanticCompressionShadowV1(t,{intensity:"LIGHT",timeoutMs:500});
  await buildPreparedTaskProgressiveDisclosureShadowV1(t);
  if(sem.shadow.semanticCompressibleSegmentsAccepted>0) receipt.semanticCompressionUsed=true;

  receipt.providerCalls++;
  const result=(await runtime.execute(t,{provider:PROVIDER,model:MODEL})).result;
  const call={probeId:p.id,reservationUsd:MAX_NEXT,route:d.route,requestId:result.providerRequestId??null,provider:result.provider,model:result.model,latencyMs:result.latencyMs,queueWaitMs:null,retryCount:0,http429:false,usage:null,providerReportedCostUsd:null,artifactValid:false,constraintRetention:false,evidenceRetention:false,verificationRetention:false,resolvedProvider:null,semanticCompressionAcceptedSegments:sem.shadow.semanticCompressibleSegmentsAccepted};
  if(!result.ok){
   receipt.providerFailures++;
   if(Number(result.metadata?.httpStatus)===429){receipt.provider429s++;call.http429=true}
   routeState=applyRouteOutcomeV1(routeState,"PROVIDER_FAILURE");
   call.failure={code:result.code,message:result.message,retryable:result.retryable};
   receipt.calls.push(call);receipt.terminalState="PROVIDER_FAILURE";receipt.failure=`${p.id}:${result.code}`;break;
  }
  receipt.successfulProviderCalls++;
  receipt.billedInputTokens+=result.usage.inputTokens;
  receipt.billedCacheTokens+=result.usage.cachedInputTokens??0;
  receipt.billedOutputTokens+=result.usage.outputTokens;
  receipt.billedReasoningTokens+=result.usage.reasoningTokens??0;
  const providerCost=typeof result.metadata?.observedCostUsd==="number"?result.metadata.observedCostUsd:null;
  if(providerCost===null){receipt.terminalState="VERIFICATION_FAILURE";receipt.failure=`${p.id}:provider_cost_missing`;receipt.calls.push(call);break}
  receipt.actualProviderSpendUsd+=providerCost;
  const a=result.structured??{}, ok=valid(a,p);
  call.usage=result.usage;call.providerReportedCostUsd=providerCost;call.artifactValid=ok;
  call.constraintRetention=Array.isArray(a.constraints)&&a.constraints.some(x=>String(x).includes(p.c));
  call.evidenceRetention=Array.isArray(a.evidenceReferences)&&a.evidenceReferences.some(x=>String(x).includes(p.e));
  call.verificationRetention=Array.isArray(a.verificationNeeded)&&a.verificationNeeded.length>0;
  call.resolvedProvider=result.metadata?.resolvedProvider??null;
  receipt.calls.push(call);
  if(!ok){receipt.terminalState="VERIFICATION_FAILURE";receipt.failure=`${p.id}:artifact_retention_failed`;break}
  routeState=applyRouteOutcomeV1(routeState,"VERIFICATION_PASS");
  if(!routeState.terminal||routeState.terminalReason!=="COMPLETE"){receipt.terminalState="VERIFICATION_FAILURE";receipt.failure=`${p.id}:route_not_complete`;break}
  if(receipt.actualProviderSpendUsd>=SOFT){receipt.budgetWarnings.push("soft_budget_crossed_after_safe_call");break}
 }
 receipt.actualProviderSpendUsd=Number(receipt.actualProviderSpendUsd.toFixed(9));
 receipt.budgetRemainingUsd=Number(Math.max(0,HARD-receipt.actualProviderSpendUsd).toFixed(9));
 receipt.hardBudgetExceeded=receipt.actualProviderSpendUsd>HARD+1e-12;
 const good=receipt.successfulProviderCalls===probes.length&&receipt.calls.length===probes.length&&receipt.calls.every(c=>c.artifactValid&&c.constraintRetention&&c.evidenceRetention&&c.verificationRetention);
 if(good&&receipt.providerFailures===0&&!receipt.hardBudgetExceeded){receipt.gateResult="PASS";receipt.terminalState="OBJECTIVE_COMPLETE"}
 else if(receipt.terminalState==="PROVIDER_FAILURE"&&receipt.providerFailures===0) receipt.terminalState="VERIFICATION_FAILURE";
 console.log("GATE1_RECEIPT>"+JSON.stringify(receipt));
 if(receipt.gateResult!=="PASS") process.exitCode=3;
}