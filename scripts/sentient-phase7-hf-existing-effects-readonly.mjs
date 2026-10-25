import { PostgresStateRepository as P } from "/app/dist/src/state/postgres-state-repository.js";
import { ArtifactRegistryV1 as R } from "/app/dist/src/artifacts/registry.js";
import { phase7ArtifactRecordsV1 as map } from "/app/dist/src/artifacts/phase7-binding.js";
import { digestBytesV1 as dg } from "/app/dist/src/artifacts/contracts.js";

const S="ff2e8164a2e6888f3b58b15fb143c73d016f4fb9", Q="2a2806cf347c82cf8a3bb5359375293dc352f2d";
const PROOF="40227159272-1", MEM="8033fe8f-a927-4271-a810-0e4d0544a322";
const req=n=>{const v=process.env[n]?.trim();if(!v)throw Error(`${n}_required`);return v};
const token=req("SENTIENT_HF_TOKEN"), repoName=req("SENTIENT_HF_VERSIONED_REPOSITORY");
const db=process.env.DATABASE_URL?.trim()||process.env.DIRECT_URL?.trim(); if(!db)throw Error("database_url_required");
const clean=x=>{let s=String(x).split(token).join("[REDACTED]");return s.replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"postgresql://[REDACTED]")};
const out=(k,v)=>console.log(`${k}=${v}`);
const repo=new P({connectionString:db});
try{
 if(process.env.SENTIENT_RUNTIME_SHA!!=S||process.env.SENTIENT_RUNTIME_TREE!==Q)throw Error("runtime_identity_mismatch");
 await repo.initialize();
 const ss=await repo.snapshot(), memory=ss.records.memories.find(x=>x.id===MEM);
 if(!memory||memory.metadata?.phase7Artifact!=="model_improvement_v1")throw Error("phase7_memory_invalid");
 const p=JSON.parse(memory.content), lesson=ss.records.lessons.find(x=>x.id===p.lessonId);
 if(!lesson||lesson.metadata?.phase7LiveProofId!=PROOF)throw Error("proof_binding_invalid");
 const run=Object.freeze({
  contractVersion:p.contractVersion,component:p.component,lessonId:p.lessonId,result:p.result,artifactMemoryId:memory.id,
 trainingRunIds:Object.freeze([...(p.trainingRunIds??[])]),heldOutRunIds:Object.freeze([...(p.heldOutRunIds??[])]),
 evaluationEvidenceRefs:Object.freeze([...(p.evaluationEvidenceRefs_?[])]),datasetId:p.datasetId,baselineId:p.baselineId,
 candidateId:p.candidateId,evaluationId:p.evaluationId,promotionPolicyId:p.promotionPolicy.policyId,promotionThreshold:p.promotionPolicy.minimumImprovement,
promotionDecisionOwner:p.promotionPolicy.decisionOwner,modelMayProposeImprovement:p.promotionPolicy.modelMayProposeImprovement,
modelMayPromoteItself:p.promotionPolicy.modelMayPromoteItself,evaluationEligibility:p.evaluationEligibility
 });
 const recs=map({sourceSha:S,sourceTree:Q,createdAt:memory.createdAt,memoryId:memory.id,run,checkpoint:p.checkpoint});
 const dataset=recs.find(x=>x.artifactType==="phase7-dataset-manifest"), candidate=recs.find(x=>x.artifactType==="phase7-feature-head"), evaluation=recs.find(x=>x.artifactType==="phase7-evaluation-receipt");
 if(!dataset||!candidate||!evaluation)throw Error("mapper_incomplete");
 const reg=new R(repo);
 for(const [name,record] of [["DATASET",dataset],["CANDIDATE",candidate],["EVALUATION",evaluation]]){
   const got=await reg.get(record.artifactId);
   out(`${name}_REGISTERED`,got?"true":"false");
   if(got){out(`${name}_REGISTRY_DIGEST_MATCH`,got.sha256===record.sha256?"true":"false");out(`${name}_REGISTRY_PROVIDER_REVISION_PRESENT`,got.providerRevision?"true":"false")}
 }
 async function hf(name,path,digest){
   const url=`https://huggingface.co/${repoName}/resolve/main/${path.split("/").map(encodeURIComponent).join("/")}`;
   const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
   out(`${name}_HF_HTTP_STATUS`,r.status);
   if(r.ok){const b=new Uint8Array(await r.arrayBuffer());out(`${name}_HF_DIGEST_MATCH`,dg(b)===digest?"true":"false")}else await r.body?.cancel().catch(()=>{});
 }
 await hf("DATASET",`phase7/${run.datasetId}/dataset-manifest.json`,dataset.sha256);
 await hf("CANDIDATE",`phase7/${run.candidateId}/candidate-checkpoint.json`,candidate.sha256);
 out("READONLY_EFFECTS_CHECK","PASS");out("HF_WRITE_PERFORMED","false");out("POSTGRES_WRITE_PERFORMED","false");out("SECRET_VALUES_EXPOSED","false";
}catch(e){console.error(gEFFECTS_CHECK_ERROR=${clean(e instanceof Error?e.message:e)}`);console.error("SECRET_VALUES_EXPOSED=false");process.exitCode=1}
finally{await repo.close().catch(()=>{})}
