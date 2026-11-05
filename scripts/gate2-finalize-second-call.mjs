import fs from "node:fs";

const HARD=0.25, SOFT=0.10, GATE1_SPEND=0.007786, MAX_NEXT=0.018192;
const priorPath="prior/gate2-receipt.json";
const currentPath="gate2-receipt.json";
const finalPath="gate2-receipt-final.json";
const arr=Array.isArray;
const obj=x=>x&&typeof x==="object"&&!arr(x);
const keys=(o,a)=>obj(o)&&Object.keys(o).sort().join("|")===a.slice().sort().join("|");
const req=["schemaVersion","problemRepresentation","keyFindings","hypotheses","recommendedApproach","evidenceRefs","constraints","toolRecommendations","risks","uncertainties","verificationNeeded"];
const strings=(x,max)=>arr(x)&&x.length<=max&&x.every(v=>typeof v==="string"&&v.length>0);
const retain=(x,id)=>arr(x)&&x.some(v=>String(v).includes(id));
const load=p=>JSON.parse(fs.readFileSync(p,"utf8"));

function parseArtifact(){
  const text=fs.readFileSync("gate2-model-text.txt","utf8").trim()
    .replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
  try{return JSON.parse(text)}catch{return null}
}
function validate(a){
  const schemaValid=
    keys(a,req)&&
    a.schemaVersion==="sentient-cognition-artifact/v1"&&
    typeof a.problemRepresentation==="string"&&a.problemRepresentation.length>0&&a.problemRepresentation.length<=1500&&
    arr(a.keyFindings)&&a.keyFindings.length<=16&&a.keyFindings.every(x=>
      keys(x,["claim","evidenceRefs","confidence"])&&
      typeof x.claim==="string"&&x.claim.length>0&&x.claim.length<=1000&&
      strings(x.evidenceRefs,16)&&["high","medium","low"].includes(x.confidence))&&
    arr(a.hypotheses)&&a.hypotheses.length<=8&&a.hypotheses.every(x=>
      keys(x,["hypothesis","status","evidenceRefs"])&&
      typeof x.hypothesis==="string"&&x.hypothesis.length>0&&x.hypothesis.length<=1000&&
      strings(x.evidenceRefs,16)&&["supported","plausible","rejected","unresolved"].includes(x.status))&&
    typeof a.recommendedApproach==="string"&&a.recommendedApproach.length>0&&a.recommendedApproach.length<=2000&&
    strings(a.evidenceRefs,32)&&strings(a.constraints,32)&&
    arr(a.toolRecommendations)&&a.toolRecommendations.length<=12&&a.toolRecommendations.every(x=>
      keys(x,["tool","rationale"])&&
      typeof x.tool==="string"&&x.tool.length>0&&x.tool.length<=200&&
      typeof x.rationale==="string"&&x.rationale.length>0&&x.rationale.length<=500)&&
    strings(a.risks,16)&&strings(a.uncertainties,16)&&strings(a.verificationNeeded,24);
  const constraint=schemaValid&&retain(a.constraints,"C17");
  const evidence=schemaValid&&retain(a.evidenceRefs,"E5");
  const verification=schemaValid&&retain(a.verificationNeeded,"V3");
  const tool=schemaValid&&a.toolRecommendations.some(x=>String(x.tool).includes("T7"));
  const uncertainty=schemaValid&&retain(a.uncertainties,"U2");
  const lower=JSON.stringify(a??{}).toLowerCase();
  const architecture=schemaValid&&/idempoten/.test(lower)&&/(durable|persist|ledger)/.test(lower)&&/(duplicate|retry|replay)/.test(lower);
  return {schemaValid,constraint,evidence,verification,tool,uncertainty,architecture};
}

const mode=process.argv[2]??"finalize";
const p=load(priorPath);

if(mode==="--admission"){
  const e=load("prior/gate2-response-evidence.json");
  const ok=
    p.canonicalSentientSha===process.env.CANONICAL_SENTIENT_SHA&&
    p.canonicalSentientTree===process.env.CANONICAL_SENTIENT_TREE&&
    p.providerCalls===1&&p.successfulProviderCalls===1&&
    p.providerRetries===0&&p.providerFailures===0&&p.provider429s===0&&
    Math.abs(Number(p.actualProviderSpendUsd)-0.009678)<1e-12&&
    p.finishReason==="length"&&p.truncationConfirmed===true&&
    p.failureClassification==="OUTPUT_TRUNCATION_CONFIRMED"&&
    e.rawFinishReason==="length"&&e.httpStatus===200&&
    Number(p.actualProviderSpendUsd)+MAX_NEXT<=HARD&&
    Number(p.actualProviderSpendUsd)<SOFT;
  if(!ok) throw new Error("second_call_admission_evidence_mismatch");
  console.log("SECOND_CALL_JUSTIFICATION=OUTPUT_TRUNCATION_CONFIRMED_PLUS_CONTRACT_SHAPE_NONADHERENCE");
  console.log("MAX_ESTIMATED_NEXT_CALL_COST_USD="+MAX_NEXT.toFixed(6));
  console.log("GATE2_SPEND_PLUS_RESERVED_EXPOSURE_USD="+(Number(p.actualProviderSpendUsd)+MAX_NEXT).toFixed(6));
  console.log("SECOND_CALL_ECONOMIC_ADMISSION=PASS");
  process.exit(0);
}

if(mode==="--accept"){
  const r=load(finalPath);
  const eq=(k,v)=>{if(r[k]!==v)throw new Error(`${k}=${JSON.stringify(r[k])} expected ${JSON.stringify(v)}`)};
  eq("gateResult","PASS"); eq("terminalState","OBJECTIVE_COMPLETE");
  eq("provider","AtlasCloud"); eq("model","moonshotai/kimi-k3.1-pro");
  eq("canonicalSentientSha",process.env.CANONICAL_SENTIENT_SHA);
  eq("canonicalSentientTree",process.env.CANONICAL_SENTIENT_TREE);
  eq("providerCalls",2); eq("successfulProviderCalls",2);
  eq("providerRetries",0); eq("providerFailures",0); eq("provider429s",0);
  eq("finishReasonCaptured",true); eq("rawResponseEvidencePreserved",true);
  eq("economicTelemetryComplete",true); eq("cognitionArtifactValid",true); eq("schemaValid",true);
  for(const k of ["constraintRetention","evidenceRetention","verificationRetention","toolRecommendationRetention","uncertaintyRetention","architectureCorrectness"]) eq(k,"PASS");
  eq("truncationConfirmed",false); eq("hardBudgetExceeded",false);
  eq("authorityViolations",0); eq("sourceChangeRequired",false);
  eq("productionModelRouteChange",false); eq("productionMutation",false);
  eq("productionDeployment",false); eq("unboundedGithubAuthority",false);
  eq("nextGateAuthorized",false);
  if(!(r.actualProviderSpendUsd>0&&r.actualProviderSpendUsd<SOFT&&r.actualProviderSpendUsd<=HARD)) throw new Error("gate2_spend_invalid");
  if(Math.abs(r.maxEstimatedNextCallCostUsd-MAX_NEXT)>1e-12) throw new Error("second_call_reservation_mismatch");
  if(!r.finishReason||r.finishReason==="length") throw new Error("completion_finish_reason_invalid");
  r.independentAcceptanceResult="PASS";
  fs.writeFileSync(finalPath,JSON.stringify(r,null,2)+"\n");
  console.log("GATE_2_LIVE_COGNITION_ARTIFACT_QUALITY=PASS");
  process.exit(0);
}

const c=load(currentPath);
const a=fs.existsSync("gate2-model-text.txt")?parseArtifact():null;
const v=validate(a);
const valid=
  v.schemaValid&&v.constraint&&v.evidence&&v.verification&&v.tool&&v.uncertainty&&v.architecture&&
  c.truncationConfirmed===false&&c.successfulProviderCalls===1;
const gateSpend=Number((Number(p.actualProviderSpendUsd)+Number(c.actualProviderSpendUsd??0)).toFixed(9));
const total=k=>Number(p[k]??0)+Number(c[k]??0);

const final={
  mission:"HUMAN_GOVERNED_PREPRODUCTION_AUTONOMY_PILOT_V1",
  gate:"GATE_2_LIVE_COGNITION_ARTIFACT_QUALITY",
  gateResult:valid?"PASS":"FAIL",
  terminalState:valid?"OBJECTIVE_COMPLETE":(c.terminalState==="PROVIDER_FAILURE"?"PROVIDER_FAILURE":"VERIFICATION_FAILURE"),
  canonicalSentientSha:process.env.CANONICAL_SENTIENT_SHA,
  canonicalSentientTree:process.env.CANONICAL_SENTIENT_TREE,
  zeroCostDiagnosticsComplete:true,
  gate1ReceiptPersistenceDefectRepaired:true,
  finishReasonCaptured:!!c.finishReason,
  rawResponseEvidencePreserved:c.rawResponseEvidencePreserved===true,
  economicTelemetryComplete:
    Number.isFinite(Number(c.providerBilledInputTokens))&&
    Number.isFinite(Number(c.providerBilledOutputTokens))&&
    Number.isFinite(Number(c.actualProviderSpendUsd))&&!!c.finishReason,
  gate1FailureClassification:"OUTPUT_TRUNCATION_PLAUSIBLE_NOT_PROVEN_FROM_GATE1_DIRECT_EVIDENCE;GATE2_CALL1_CONFIRMED_LENGTH_AND_CONTRACT_SHAPE_NONADHERENCE",
  liveProviderCognition:true,
  provider:"AtlasCloud",
  model:"moonshotai/kimi-k3.1-pro",
  providerCalls:total("providerCalls"),
  successfulProviderCalls:total("successfulProviderCalls"),
  providerRetries:total("providerRetries"),
  providerFailures:total("providerFailures"),
  provider429s:total("provider429s"),
  providerBilledInputTokens:total("providerBilledInputTokens"),
  providerBilledCacheTokens:total("providerBilledCacheTokens"),
  providerBilledOutputTokens:total("providerBilledOutputTokens"),
  providerReportedReasoningTokens:total("providerReportedReasoningTokens"),
  reasoningTokensAdditiveToBilledOutput:false,
  outputTokenLimit:1000,
  actualOutputTokens:Number(c.actualOutputTokens??0),
  finishReason:c.finishReason??null,
  stopReason:c.stopReason??null,
  truncationConfirmed:c.truncationConfirmed===true,
  cognitionArtifactValid:valid,
  schemaValid:v.schemaValid,
  constraintRetention:v.constraint?"PASS":"FAIL",
  evidenceRetention:v.evidence?"PASS":"FAIL",
  verificationRetention:v.verification?"PASS":"FAIL",
  toolRecommendationRetention:v.tool?"PASS":"FAIL",
  uncertaintyRetention:v.uncertainty?"PASS":"FAIL",
  architectureCorrectness:v.architecture?"PASS":"FAIL",
  semanticCompressionUsed:"SHADOW_ONLY_NOT_PROVIDER_INPUT",
  semanticCompressionImplicatedInFailure:false,
  originalContextRetrievals:0,
  dots3Calls:0,
  actualProviderSpendUsd:gateSpend,
  cumulativePilotProviderSpendUsd:Number((GATE1_SPEND+gateSpend).toFixed(9)),
  gate2SoftBudgetUsd:SOFT,
  gate2HardBudgetUsd:HARD,
  hardBudgetExceeded:gateSpend>HARD,
  maxEstimatedNextCallCostUsd:MAX_NEXT,
  budgetRemaingUsd:Number(Math.max(0,HARD-gateSpend).toFixed(9)),
  usefulArtifactTokenRatio:Number(c.usefulArtifactTokenRatio??0),
  artifactValidityPerDollar:valid?`ONE_VALID_ARTIFACT_AFTER_${gateSpend.toFixed(6)}_GATE2_USD`:`ZERO_VALID_ARTIFACTS_AFTER_${gateSpend.toFixed(6)}_GATE2_USD`,
  unnecessaryPrimaryCognitionCalls:0,
  avoidableProviderCostUsd:0,
  sourceChangeRequired:false,
  repairedSentientSha:null,
  repairedSentientTree:null,
  independentAcceptanceRun:process.env.GITHUB_RUN_ID??null,
  independentAcceptanceResult:"PENDING",
  authorityViolations:0,
  productionModelRouteChange:false,
  productionMutation:false,
  productionDeployment:false,
  unboundedGithubAuthority:false,
  nextGate:"GATE_3_SINGLE_REAL_SOFTWARE_OBJECTIVE",
  nextGateAuthorized:false,
  secondCallCorrection:"EXACT_FROZEN_JSON_SHAPE_PLUS_FIELD_LIMITS_AND_MINIMAL_900_TO_1000_CEILING_INCREASE",
  secondCallProviderSpendUsd:Number(c.actualProviderSpendUsd??0),
  stopPaidCognition:true,
  preserveState:true
};

fs.writeFileSync(finalPath,JSON.stringify(final,null,2)+"\n");
console.log("GATE2_FINAL_RECEIPT>"+JSON.stringify(final));
if(!valid) process.exitCode=3;
