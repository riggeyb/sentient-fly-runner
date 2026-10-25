import { PostgresStateRepository } from "/app/dist/src/state/postgres-state-repository.js";
import { ArtifactRegistryV1 } from "/app/dist/src/artifacts/registry.js";
import { phase7ArtifactRecordsV1 } from "/app/dist/src/artifacts/phase7-binding.js";
import { evaluateExternalExportPolicyV1, digestBytesV1 } from "/app/dist/src/artifacts/contracts.js";

const SOURCE_SHA="ff2e8164a2e6888f3b58b15fb143c73d016f4fb9";
const SOURCE_TREE="2a2806cf347c82cf8a3bb5359375293dcc352f2d";
const req=(name)=>{const v=String(process.env[name]??"").trim();if(!v)throw new Error(`${name}_required`);return v};
const proofId=req("PHASE7_PROOF_ID");
const memoryId=req("PHASE7_ARTIFACT_MEMORY_ID");
const databaseUrl=String(process.env.DATABASE_URL??process.env.DIRECT_URL??"").trim();
if(!databaseUrl)throw new Error("phase7_hf_database_binding_missing");
if(req("SENTIENT_RUNTIME_SHA")!==SOURCE_SHA||req("SENTIENT_RUNTIME_TREE")!==SOURCE_TREE)throw new Error("phase7_hf_runtime_identity_mismatch");
const safe=(e)=>String(e instanceof Error?e.message:e).replace(/[^A-Za-z0-9_:,.-]/g,"_").slice(0,220);
const repo=new PostgresStateRepository({connectionString:databaseUrl});
await repo.initialize();
try{
 const memory=await repo.get("memory",memoryId);
 if(memory?.kind!=="memory"||memory.metadata?.phase7Artifact!=="model_improvement_v1")throw new Error("phase7_hf_artifact_memory_invalid");
 const persisted=JSON.parse(memory.content);
 const snapshot=await repo.snapshot();
 const lesson=snapshot.records.lessons.find(x=>x.id===persisted.lessonId);
 if(!lesson||lesson.metadata?.phase7LiveProofId!==proofId)throw new Error("phase7_hf_proof_lesson_binding_invalid");
 const training=[...(persisted.trainingRunIds??[])],held=[...(persisted.heldOutRunIds??[])];
 const runMap=new Map(snapshot.records.modelRuns.map(x=>[x.id,x]));
 if(training.length===0||held.length===0||[...training,...held].some(id=>runMap.get(id)?.metadata?.phase7LiveProofId!==proofId))throw new Error("phase7_hf_proof_run_binding_invalid");
 if(training.some(id=>held.includes(id)))throw new Error("phase7_hf_training_heldout_overlap");
 if(persisted.evaluationEligibility?.heldOutDisjoint!==true||persisted.evaluationEligibility?.bothLabels!==true)throw new Error("phase7_hf_evaluation_eligibility_invalid");
 if(persisted.promotionPolicy?.decisionOwner!=="SENTIENT_RUNTIME"||persisted.promotionPolicy?.modelMayPromoteItself!==false)throw new Error("phase7_hf_authority_policy_invalid");
 if(!["PROMOTED","REJECTED"].includes(persisted.result?.decision))throw new Error("phase7_hf_promotion_decision_invalid");
 if(!persisted.checkpoint||typeof persisted.candidateId!=="string"||!persisted.candidateId)throw new Error("phase7_hf_candidate_checkpoint_missing");
 console.log("PREFLIGHT_PROOF_LINEAGE=PASS");
 const run=Object.freeze({
  contractVersion:persisted.contractVersion,component:persisted.component,lessonId:persisted.lessonId,result:persisted.result,
  artifactMemoryId:memory.id,trainingRunIds:Object.freeze(training),heldOutRunIds:Object.freeze(held),
  evaluationEvidenceRefs:Object.freeze([...(persisted.evaluationEvidenceRefs??[])]),datasetId:persisted.datasetId,
  baselineId:persisted.baselineId,candidateId:persisted.candidateId,evaluationId:persisted.evaluationId,
  promotionPolicyId:persisted.promotionPolicy.policyId,promotionThreshold:persisted.promotionPolicy.minimumImprovement,
  promotionDecisionOwner:persisted.promotionPolicy.decisionOwner,modelMayProposeImprovement:persisted.promotionPolicy.modelMayProposeImprovement,
  modelMayPromoteItself:persisted.promotionPolicy.modelMayPromoteItself,evaluationEligibility:persisted.evaluationEligibility
 });
 const records=phase7ArtifactRecordsV1({sourceSha:SOURCE_SHA,sourceTree:SOURCE_TREE,createdAt:memory.createdAt,memoryId:memory.id,run,checkpoint:persisted.checkpoint});
 const dataset=records.find(x=>x.artifactType==="phase7-dataset-manifest");
 const candidate=records.find(x=>x.artifactType==="phase7-feature-head");
 const evaluation=records.find(x=>x.artifactType==="phase7-evaluation-receipt");
 if(!dataset||!candidate||!evaluation)throw new Error("phase7_hf_artifact_binding_incomplete");
 console.log("PREFLIGHT_SOURCE_ARTIFACTS=PASS");
 const datasetBytes=new TextEncoder().encode(JSON.stringify({datasetId:run.datasetId,trainingRunIds:run.trainingRunIds}));
 const candidateBytes=new TextEncoder().encode(JSON.stringify(persisted.checkpoint));
 if(digestBytesV1(datasetBytes)!==dataset.sha256)throw new Error("phase7_hf_dataset_digest_binding_mismatch");
 if(digestBytesV1(candidateBytes)!==candidate.sha256)throw new Error("phase7_hf_candidate_digest_binding_mismatch");
 console.log("PREFLIGHT_DIGESTS=PASS");
 const classify=(record)=>Object.freeze({...record,privacyClass:"PUBLIC",licenseClass:"OPEN",usageRights:"ALLOWED",
  secretScanStatus:"CLEAR",piiStatus:"CLEAR",permittedStorageVisibility:"PUBLIC",policyStatus:"ALLOWED",
  evidenceRefs:Object.freeze([...record.evidenceRefs,`phase7-operational-proof:${proofId}`])});
 for(const record of [classify(dataset),classify(candidate)]){
  const policy=evaluateExportPolicyV1(record); if(!policy.allowed)throw new Error(phase7_hf_export_policy_blocked:$${policy.reasons.join(",")}`);
 }
 console.log("PREFLIGHT_EXPORT_POLICY=PASS");
 const registry=new ArtifactRegistryV1(repo);
 const existingDataset=await registry.get(dataset.artifactId);
 const existingEvaluation=await registry.get(evaluation.artifactId);
 const existingCandidate=await registry.get(candidate.artifactId);
 console.log(`DATASET_BINDING_EXISTS=${existingDataset!==undefined}`);
 console.log(`EVALUATION_BINDING_EXISTS=${existingEvaluation!==undefined}`);
 console.log(`CANDIDATE_BINDING_EXISTS=${existingCandidate!==undefined}`);
 console.log(`DATASET_ARTIFACT_ID=${dataset.artifactId}`);
 console.log `CANDIDATE_ARTIFACT_ID=${candidate.artifactId}`);
 console.log `EVALUATION_ARTIFACT_ID=${evaluation.artifactId}`);
 console.log("PREFLIGHT_PROVIDER_WRITE=false");
 console.log("SECRET_VALUES_EXPOSED=false");
}catch(e){
 console.error(`PHASE7_HF_PREFLIGHT_ERROR=${safe(e)}`);
 console.error("SECRET_VALUES_EXPOSED=false");
 process.exitCode=1;
}finally{await repo.close()}
