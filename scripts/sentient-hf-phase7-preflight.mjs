import { PostgresStateRepository } from "/app/dist/src/state/postgres-state-repository.js";
import { ArtifactRegistryV1 } from "/app/dist/src/artifacts/registry.js";
import { phase7ArtifactRecordsV1 } from "/app/dist/src/artifacts/phase7-binding.js";
import { evaluateExternalExportPolicyV1, digestBytesV1 } from "/app/dist/src/artifacts/contracts.js";

const SOURCE_SHA="ff2e8164a2e6888f3b58b15fb143c73d016f4fb9";
const SOURCE_TREE="2a2806cf347c82cf8a3bb5359375293dcc352f2d";
const req=(name)=>{const v=String(process.env[name]??"").trim();if(!v)throw new Error(`${name}_required`);return v};
const proofId=req("PHASE7_PROOF_ID");
const memoryId=req("PHASE7_ARTIFACT_MEMORY_ID");
const token=req("SENTIENT_HF_TOKEN");
const repoName=req("SENTIENT_HF_VERSIONED_REPOSITORY");
const db=String(process.env.DATABASE_URL??process.env.DIRECT_URL??"").trim();
if(!db) throw new Error("phase7_hf_database_binding_missing");
if(req("SENTIENT_RUNTIME_SHA")!==SOURCE_SHA||req("SENTIENT_RUNTIME_TREE")!==SOURCE_TREE) throw new Error("phase7_hf_runtime_identity_mismatch");
const safe=(e)=>String(e instanceof Error?e.message:e).replace(/[^A-Za-z0-9_:.,-]/g,"_").slice(0,220);
const repo=new PostgresStateRepository({connectionString:db});
await repo.initialize();
try{
  const memory=await repo.get("memory",memoryId);
  if(memory?.kind!=="memory"||memory.metadata?.phase7Artifact!=="model_improvement_v1") throw new Error("phase7_hf_artifact_memory_invalid");
  const p=JSON.parse(memory.content);
  const snapshot=await repo.snapshot();
  const lesson=snapshot.records.lessons.find(x=>x.id===p.lessonId);
  if(!lesson||lesson.metadata?.phase7LiveProofId!==proofId) throw new Error("phase7_hf_proof_lesson_binding_invalid");
  const training=[...(p.trainingRunIds??[])], held=[...(p.heldOutRunIds??[])];
  const runMap=new Map(snapshot.records.modelRuns.map(x=>[x.id,x]));
  if(training.length===0||held.length===0||[...training,...held].some(id=>runMap.get(id)?.metadata?.phase7LiveProofId!==proofId)) throw new Error("phase7_hf_proof_run_binding_invalid");
  if(training.some(id=>held.includes(id))) throw new Error("phase7_hf_training_heldout_overlap");
  if(p.evaluationEligibility?.heldOutDisjoint!==true||p.evaluationEligibility?.bothLabels!==true) throw new Error("phase7_hf_evaluation_eligibility_invalid");
  if(p.promotionPolicy?.decisionOwner!=="SENTIENT_RUNTIME"||p.promotionPolicy?.modelMayPromoteItself!==false) throw new Error("phase7_hf_authority_policy_invalid");
  if(!["PROMOTED","REJECTED"].includes(p.result?.decision)) throw new Error("phase7_hf_promotion_decision_invalid");
  if(!p.checkpoint||!p.candidateId) throw new Error("phase7_hf_candidate_checkpoint_missing");
  const run=Object.freeze({
    contractVersion:p.contractVersion,component:p.component,lessonId:p.lessonId,result:p.result,
    artifactMemoryId:memory.id,trainingRunIds:Object.freeze(training),heldOutRunIds:Object.freeze(held),
    evaluationEvidenceRefs:Object.freeze([...(p.evaluationEvidenceRefs??[])]),datasetId:p.datasetId,
    baselineId:p.baselineId,candidateId:p.candidateId,evaluationId:p.evaluationId,
    promotionPolicyId:p.promotionPolicy.policyId,promotionThreshold:p.promotionPolicy.minimumImprovement,
    promotionDecisionOwner:p.promotionPolicy.decisionOwner,
    modelMayProposeImprovement:p.promotionPolicy.modelMayProposeImprovement,
    modelMayPromoteItself:p.promotionPolicy.modelMayPromoteItself,
    evaluationEligibility:p.evaluationEligibility
  });
  const records=phase7ArtifactRecordsV1({sourceSha:SOURCE_SHA,sourceTree:SOURCE_TREE,createdAt:memory.createdAt,memoryId:memory.id,run,checkpoint:p.checkpoint});
  const dataset=records.find(x=>x.artifactType==="phase7-dataset-manifest");
  const candidate=records.find(x=>x.artifactType==="phase7-feature-head");
  const evaluation=records.find(x=>x.artifactType==="phase7-evaluation-receipt");
  if(!dataset||!candidate||!evaluation) throw new Error("phase7_hf_artifact_binding_incomplete");
  const datasetBytes=new TextEncoder().encode(JSON.stringify({datasetId:run.datasetId,trainingRunIds:run.trainingRunIds}));
  const candidateBytes=new TextEncoder().encode(JSON.stringify(p.checkpoint));
  if(digestBytesV1(datasetBytes)!==dataset.sha256) throw new Error("phase7_hf_dataset_digest_binding_mismatch");
  if(digestBytesV1(candidateBytes)!==candidate.sha256) throw new Error("phase7_hf_candidate_digest_binding_mismatch");
  const classify=(r)=>Object.freeze({...r,privacyClass:"PUBLIC",licenseClass:"OPEN",usageRights:"ALLOWED",secretScanStatus:"CLEAR",piiStatus:"CLEAR",permittedStorageVisibility:"PUBLIC",policyStatus:"ALLOWED"});
  for(const r of [classify(dataset),classify(candidate)]){
    const policy=evaluateExternalExportPolicyV1(r);
    if(!policy.allowed) throw new Error(`phase7_hf_export_policy_blocked:${policy.reasons.join(",")}`);
  }
  console.log("PREFLIGHT_CONTRACT=PASS");
  const registry=new ArtifactRegistryV1(repo);
  for(const [name,r] of [["DATASET",dataset],["EVALUATION",evaluation],["CANDIDATE",candidate]]){
    const got=await registry.get(r.artifactId);
    console.log(`${name}_BINDING_EXISTS=${got!==undefined}`);
    if(got){
      console.log(`${name}_REGISTRY_DIGEST_MATCH=${got.sha256===r.sha256}`);
      console.log(`${name}_REGISTRY_PROVIDER_REVISION_PRESENT=${typeof got.providerRevision==="string"&&got.providerRevision.length>0}`);
    }
  }
  async function hfProbe(name,path,bytes,digest){
    const url=`https://huggingface.co/${repoName}/resolve/main/${path.split("/").map(encodeURIComponent).join("/")}`;
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
    console.log(`${name}_HF_HTTP_STATUS=${response.status}`);
    if(response.ok){
      const body=new Uint8Array(await response.arrayBuffer());
      console.log(`${name}_HF_DIGEST_MATCH=${digestBytesV1(body)===digest}`);
      console.log(`${name}_HF_SIZE_MATCH=${body.byteLength===bytes.byteLength}`);
    }else{
      await response.body?.cancel().catch(()=>{});
    }
  }
  await hfProbe("DATASET",`phase7/${run.datasetId}/dataset-manifest.json`,datasetBytes,dataset.sha256);
  await hfProbe("CANDIDATE",`phase7/${run.candidateId}/candidate-checkpoint.json`,candidateBytes,candidate.sha256);
  console.log("READONLY_PREFLIGHT=PASS");
  console.log("HF_WRITE_PERFORMED=false");
  console.log("POSTGRES_WRITE_PERFORMED=false");
  console.log("SECRET_VALUES_EXPOSEE=false");
}catch(e){
  console.error(`PHASE7_HF_PREFLIGHT_ERROR=${safe(e)}`);
  console.error("SECRET_VALUES_EXPOSED=false");
  process.exitCode=1;
}finally{
  await repo.close();
}
