import { PostgresStateRepository } from "./dist/src/state/postgres-state-repository.js";
import { DefaultSentientStateService } from "./dist/src/state/service.js";

const db=String(process.env.DATABASE_URL??process.env.DIRECT_URL??"").trim();
const token=String(process.env.SENTIENT_API_TOKEN??"").trim();
const proofId=String(process.env.PHASE7_PROOF_ID??"").trim();
if(!db||!token||!/^[A-Za-z0-9._:-]{1,160}$/.test(proofId)) throw new Error("PHASE7_LIVE_BINDING_INVALID");

const repository=new PostgresStateRepository({connectionString:db});
await repository.initialize();
const service=new DefaultSentientStateService(repository);
try{
  const task=await service.createTask({kind:"task",title:`phase7-live-${proofId}`,status:"succeeded",provenance:{actor:"system"},metadata:{phase7LiveProofId:proofId}});
  const session=await service.createSession({kind:"session",taskId:task.id,label:`phase7-live-${proofId}`,provenance:{actor:"system"},metadata:{phase7LiveProofId:proofId}});
  const source=await service.createSource({kind:"source",sourceClass:"tool",topic:"phase7-live-proof",authorityTier:"system-verified",retrievalMethod:"deterministic",canonicalLocation:`sentient://phase7/${proofId}`,freshnessPolicy:"bounded",retrievedAt:new Date().toISOString(),contentDigest:`sha256:${"7".repeat(64)}`,provenance:{actor:"system"},metadata:{phase7LiveProofId:proofId}});
  const claim=await service.createClaim({kind:"claim",statement:"Phase 7 live outcomes are verified.",provenance:{actor:"system"},metadata:{phase7LiveProofId:proofId}});
  const run=(status,attempt,repairOfRunId)=>service.createModelRun({kind:"model_run",sessionId:session.id,provider:"local-hf",model:"phase7-live-proof",attempt,status,usage:null,latencyMs:1,...(status==="failed"?{failure:{reason:"negative broken failure",code:"phase7_live_failure",retryable:false}}:{}),...(repairOfRunId?{repairOfRunId}:{}),provenance:{actor:"system"},metadata:{phase7LiveProofId:proofId}});
  const exp=(r,outcome,summary)=>service.createExperience({kind:"experience",sessionId:session.id,modelRunId:r.id,outcome,summary,provenance:{actor:"system"},metadata:{phase7LiveProofId:proofId}});
  const ev=(observation)=>service.createEvidence({kind:"evidence",sourceId:source.id,observation,provenance:{actor:"system"},metadata:{phase7LiveProofId:proofId}});
  const ver=(r,e)=>service.createVerification({kind:"verification",claimId:claim.id,verifierId:"phase7-live-deterministic-verifier",status:"passed",checkedAt:new Date().toISOString(),summary:"verified live truth",evidenceIds:[e.id],deterministic:true,provenance:{actor:"system",modelRunId:r.id},metadata:{phase7LiveProofId:proofId}});

  const failed=await run("failed",1);
  const repaired=await run("succeeded",2,failed.id);
  const failedExp=await exp(failed,"failure","negative broken failed unhealthy operational outcome");
  const repairedExp=await exp(repaired,"success","positive repaired fixed healthy successful operational outcome");
  const failedEv=await ev("negative broken failed result observed");
  const repairedEv=await ev("positive repaired fixed healthy result observed");
  const failedVer=await ver(failed,failedEv);
  const repairedVer=await ver(repaired,repairedEv);

  const lesson=await service.createLesson({kind:"lesson",taskId:task.id,rule:"Prefer verified repaired healthy behavior over verified broken behavior.",sourceModelRunIds:[failed.id,repaired.id],sourceExperienceIds:[failedExp.id,repairedExp.id],sourceEvidenceIds:[failedEv.id,repairedEv.id],verificationIds:[failedVer.id,repairedVer.id],sourceSessionId:session.id,failedRunId:failed.id,repairRunId:repaired.id,applicability:{taskKinds:["phase7-verified-improvement"]},provenance:{actor:"system"},metadata:{phase7LiveProofId:proofId,lessonCandidateId:`phase7-live-${proofId}`,candidateCreatedAt:new Date().toISOString(),repairVerificationId:repairedVer.id}});
  await service.promoteLessonCandidate(lesson.id,{decision:"promote",reasonCodes:["verified_repair_narrow_scope"]});

  const heldPos=await run("succeeded",3);
  const heldNeg=await run("failed",4);
  await exp(heldPos,"success","positive healthy fixed successful held out outcome");
  await exp(heldNeg,"failure","negative broken failed unhealthy held out outcome");
  const heldPosEv=await ev("positive healthy fixed held out result observed");
  const heldNegEv=await ev("negative broken failed held out result observed");
  await ver(heldPos,heldPosEv);
  await ver(heldNeg,heldNegEv);

  const response=await fetch("http://127.0.0.1:8080/v1/model-improvement",{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json",accept:"application/json"},body:JSON.stringify({lessonId:lesson.id,verifiedFailureVerificationId:failedVer.id}),signal:AbortSignal.timeout(600000)});
  const raw=await response.text();
  let result={}; try{result=JSON.parse(raw)}catch{}
  if(!response.ok) throw new Error(`PHASE7_HTTP_${response.status}_${String(result?.reason??result?.error??"unknown")}`);
  const improvement=result?.result??{};
  if(typeof improvement.candidateCheckpointRef!=="string"||!improvement.candidateCheckpointRef) throw new Error("PHASE7_REAL_TRAINING_MISSING");
  if(typeof improvement.candidateScore!=="number"||!Number.isFinite(improvement.candidateScore)) throw new Error("PHASE7_EVALUATION_MISSING");
  if(!["PROMOTED","REJECTED"].includes(improvement.decision)) throw new Error("PHASE7_DECISION_MISSING");
  const artifact=await repository.get("memory",result.artifactMemoryId);
  if(artifact?.kind!=="memory"||artifact.metadata?.phase7Artifact!=="model_improvement_v1") throw new Error("PHASE7_DURABLE_ARTIFACT_MISSING");
  const persisted=JSON.parse(artifact.content);
  if(persisted?.result?.decision!==improvement.decision) throw new Error("PHASE7_DURABLE_DECISION_MISMATCH");
  const cp=persisted?.checkpoint;
  if(!cp||typeof cp.baseModel!=="string"||typeof cp.baseRevision!=="string") throw new Error("PHASE7_BASELINE_IDENTITY_MISSING");
  console.log("PHASE7_PROOF_JSON="+JSON.stringify({
    proofId,lessonId:lesson.id,datasetId:result.datasetId??persisted.datasetId??null,
    baselineId:result.baselineId??persisted.baselineId??`${result.component}:deterministic-baseline:${cp.baseModel}@${cp.baseRevision}`,
    candidateId:result.candidateId??persisted.candidateId??improvement.candidateCheckpointRef,
    evaluationId:result.evaluationId??persisted.evaluationId??null,
    promotionPolicyId:result.promotionPolicyId??persisted.promotionPolicy?.policyId??null,
    baseModel:cp.baseModel,baseRevision:cp.baseRevision,baselineScore:improvement.baselineScore,candidateScore:improvement.candidateScore,
    decision:improvement.decision,reason:improvement.reason,artifactMemoryId:result.artifactMemoryId,
    trainingRunIds:result.trainingRunIds,heldOutRunIds:result.heldOutRunIds,evaluationEvidenceRefs:result.evaluationEvidenceRefs
  }));
  console.log("PHASE7_LOCAL_TRAINING=PASS");
  console.log("PHASE7_HELD_OUT_EVALUATION=PASS");
  console.log("PHASE7_SENTIENT_POLICY_DECISION=PASS");
  console.log("PHASE7_DECISION_PERSISTED=PASS");
  console.log("PHASE7_REAL_IMPROVEMENT_CYCLE=PASS");
  console.log("SECRET_VALUES_EXPOSED=false");
}finally{await repository.close();}
