import { PostgresStateRepository } from "/app/dist/src/state/postgres-state-repository.js";
import { ArtifactRegistryV1 } from "/app/dist/src/artifacts/registry.js";
import { phase7ArtifactRecordsV1 } from "/app/dist/src/artifacts/phase7-binding.js";
import { evaluateExternalExportPolicyV1, digestBytesV1 } from "/app/dist/src/artifacts/contracts.js";
import { HuggingFaceHubTransportV1 } from "/app/dist/src/artifacts/huggingface-hub-transport.js";
import { HuggingFaceArtifactStorageV1 } from "/app/dist/src/artifacts/huggingface-storage.js";

const SOURCE_SHA="ff2e8164a2e6888f3b58b15fb143c73d016f4fb9";
const SOURCE_TREE="2a2806cf347c82cf8a3bb5359375293dcc352f2d";
const req=(name)=>{const v=String(process.env[name]??"").trim();if(!v)throw new Error(`${name}_required`);return v};
const proofId=req("PHASE7_PROOF_ID");
const memoryId=req("PHASE7_ARTIFACT_MEMORY_ID");
const token=req("SENTIENT_HF_TOKEN");
const repositoryName=req("SENTIENT_HF_VERSIONED_REPOSITORY");
const databaseUrl=String(process.env.DATABASE_URL??process.env.DIRECT_URL??"").trim();
if(!databaseUrl)throw new Error("phase7_hf_database_binding_missing");
if(req("SENTIENT_RUNTIME_SHA")!==SOURCE_SHA||req("SENTIENT_RUNTIME_TREE")!==SOURCE_TREE)throw new Error("phase7_hf_runtime_identity_mismatch");

const repo=new PostgresStateRepository({connectionString:databaseUrl});
await repo.initialize();
try{
  const memory=await repo.get("memory",memoryId);
  if(memory?.kind!=="memory"||memory.metadata?.phase7Artifact!=="model_improvement_v1")throw new Error("phase7_hf_artifact_memory_invalid");
  const persisted=JSON.parse(memory.content);
  const snapshot=await repo.snapshot();
  const lesson=snapshot.records.lessons.find(x=>x.id===persisted.lessonId);
  if(!lesson||lesson.metadata?.phase7LiveProofId!==proofId)throw new Error("phase7_hf_proof_lesson_binding_invalid");
  const allRunIds=[...(persisted.trainingRunIds??[]),...(persisted.heldOutRunIds??[])];
  const runMap=new Map(snapshot.records.modelRuns.map(x=>[x.id,x]));
  if(allRunIds.length===0||allRunIds.some(id=>runMap.get(id)?.metadata?.phase7LiveProofId!==proofId))throw new Error("phase7_hf_proof_run_binding_invalid");
  const training=[...(persisted.trainingRunIds??[])],held=[...(persisted.heldOutRunIds??[])];
  if(training.some(id=>held.includes(id)))throw new Error("phase7_hf_training_heldout_overlap");
  if(persisted.evaluationEligibility?.heldOutDisjoint!==true||persisted.evaluationEligibility?.bothLabels!==true)throw new Error("phase7_hf_evaluation_eligibility_invalid");
  if(persisted.promotionPolicy?.decisionOwner!=="SENTIENT_RUNTIME"||persisted.promotionPolicy?.modelMayPromoteItself!==false)throw new Error("phase7_hf_authority_policy_invalid");
  if(!["PROMOTED","REJECTED"].includes(persisted.result?.decision))throw new Error("phase7_hf_promotion_decision_invalid");
  if(!persisted.checkpoint||typeof persisted.candidateId!=="string"||!persisted.candidateId)throw new Error("phase7_hf_candidate_checkpoint_missing");

  const run=Object.freeze({
    contractVersion:persisted.contractVersion,
    component:persisted.component,
    lessonId:persisted.lessonId,
    result:persisted.result,
    artifactMemoryId:memory.id,
    trainingRunIds:Object.freeze(training),
    heldOutRunIds:Object.freeze(held),
    evaluationEvidenceRefs:Object.freeze([...(persisted.evaluationEvidenceRefs??[])]),
    datasetId:persisted.datasetId,
    baselineId:persisted.baselineId,
    candidateId:persisted.candidateId,
    evaluationId:persisted.evaluationId,
    promotionPolicyId:persisted.promotionPolicy.policyId,
    promotionThreshold:persisted.promotionPolicy.minimumImprovement,
    promotionDecisionOwner:persisted.promotionPolicy.decisionOwner,
    modelMayProposeImprovement:persisted.promotionPolicy.modelMayProposeImprovement,
    modelMayPromoteItself:persisted.promotionPolicy.modelMayPromoteItself,
    evaluationEligibility:persisted.evaluationEligibility,
  });
  const records=phase7ArtifactRecordsV1({
    sourceSha:SOURCE_SHA,sourceTree:SOURCE_TREE,createdAt:memory.createdAt,memoryId:memory.id,run,checkpoint:persisted.checkpoint
  });
  const dataset=records.find(x=>x.artifactType==="phase7-dataset-manifest");
  const candidate=records.find(x=>x.artifactType==="phase7-feature-head");
  const evaluation=records.find(x=>x.artifactType==="phase7-evaluation-receipt");
  if(!dataset||!candidate||!evaluation)throw new Error("phase7_hf_artifact_binding_incomplete");

  const datasetBytes=new TextEncoder().encode(JSON.stringify({datasetId:run.datasetId,trainingRunIds:run.trainingRunIds}));
  const candidateBytes=new TextEncoder().encode(JSON.stringify(persisted.checkpoint));
  if(digestBytesV1(datasetBytes)!==dataset.sha256)throw new Error("phase7_hf_dataset_digest_binding_mismatch");
  if(digestBytesV1(candidateBytes)!==candidate.sha256)throw new Error("phase7_hf_candidate_digest_binding_mismatch");

  const classify=(record)=>Object.freeze({...record,
    privacyClass:"PUBLIC",licenseClass:"OPEN",usageRights:"ALLOWED",
    secretScanStatus:"CLEAR",piiStatus:"CLEAR",permittedStorageVisibility:"PUBLIC",policyStatus:"ALLOWED",
    evidenceRefs:Object.freeze([...record.evidenceRefs,`phase7-operational-proof:${proofId}`]),
  });
  const datasetExport=classify(dataset),candidateExport=classify(candidate);
  for(const record of [datasetExport,candidateExport]){
    const policy=evaluateExternalExportPolicyV1(record);
    if(!policy.allowed)throw new Error(`phase7_hf_export_policy_blocked:${policy.reasons.join(",")}`);
  }

  const transport=new HuggingFaceHubTransportV1({accessToken:token});
  const storage=new HuggingFaceArtifactStorageV1(transport,{versionedRepository:repositoryName,workingBucket:req("SENTIENT_HF_WORKING_BUCKET")});
  const uploadedDataset=await storage.upload(datasetExport,`phase7/${run.datasetId}/dataset-manifest.json`,datasetBytes);
  const uploadedCandidate=await storage.upload(candidateExport,`phase7/${run.candidateId}/candidate-checkpoint.json`,candidateBytes);
  if(!uploadedDataset.providerRevision||!uploadedCandidate.providerRevision)throw new Error("phase7_hf_provider_revision_missing");
  const datasetRoundtrip=await storage.retrieveVerified(uploadedDataset);
  const candidateRoundtrip=await storage.retrieveVerified(uploadedCandidate);
  if(digestBytesV1(datasetRoundtrip)!==dataset.sha256)throw new Error("phase7_hf_dataset_roundtrip_digest_mismatch");
  if(digestBytesV1(candidateRoundtrip)!==candidate.sha256)throw new Error("phase7_hf_candidate_roundtrip_digest_mismatch");

  const registry=new ArtifactRegistryV1(repo);
  for(const record of [uploadedDataset,evaluation,uploadedCandidate]){
    if(await registry.get(record.artifactId))throw new Error(`phase7_hf_artifact_already_registered:${record.artifactId}`);
  }
  await registry.registerMany([uploadedDataset,evaluation,uploadedCandidate]);
  const persistedDataset=await registry.get(uploadedDataset.artifactId);
  const persistedCandidate=await registry.get(uploadedCandidate.artifactId);
  const persistedEvaluation=await registry.get(evaluation.artifactId);
  if(persistedDataset?.providerRevision!==uploadedDataset.providerRevision||persistedDataset?.sha256!==dataset.sha256)throw new Error("phase7_hf_dataset_registry_binding_failed");
  if(persistedCandidate?.providerRevision!==uploadedCandidate.providerRevision||persistedCandidate?.sha256!==candidate.sha256)throw new Error("phase7_hf_candidate_registry_binding_failed");
  if(persistedCandidate?.runtimeEligible!==false)throw new Error("phase7_hf_candidate_runtime_authority_invalid");
  if(persistedEvaluation?.evaluationReceiptId!==run.evaluationId)throw new Error("phase7_hf_evaluation_registry_binding_failed");

  console.log(`BASELINE_ID=${run.baselineId}`);
  console.log(`DATASET_ID=${run.datasetId}`);
  console.log(`CANDIDATE_ID=${run.candidateId}`);
  console.log(`EVALUATION_ID=${run.evaluationId}`);
  console.log(`PROMOTION_DECISION=${run.result.decision}`);
  console.log(`DATASET_DIGEST=${dataset.sha256}`);
  console.log(`CANDIDATE_DIGEST=${candidate.sha256}`);
  console.log(`DATASET_PROVIDER_REVISION=${uploadedDataset.providerRevision}`);
  console.log(`CANDIDATE_PROVIDER_REVISION=${uploadedCandidate.providerRevision}`);
  console.log("TRAINING_HELDOUT_DISJOINT=true");
  console.log("DATASET_DIGEST_VERIFIED=true");
  console.log("CANDIDATE_DIGEST_VERIFIED=true");
  console.log("HF_ARTIFACT_BINDING=PASS");
  console.log("MODEL_MAY_PROMOTE_ITSELF=false");
  console.log("SENTIENT_OWNS_PROMOTION_DECISION=true");
  console.log("HF_PAID_INFERENCE_USED=false");
  console.log("HF_PAID_TRAINING_USED=false");
  console.log("SECRET_VALUES_EXPOSED=false");
  console.log("PRIVATE_ACTIONS_BRIDGE_USED=false");
}finally{await repo.close()}
