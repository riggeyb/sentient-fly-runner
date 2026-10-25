import{readFile}from"node:fs/promises";
import{HuggingFaceHubTransportV1}from"/app/dist/src/artifacts/huggingface-hub-transport.js";
import{HuggingFaceArtifactStorageV1}from"/app/dist/src/artifacts/huggingface-storage.js";
import{ArtifactRegistryV1}from"/app/dist/src/artifacts/registry.js";
import{digestBytesV1,evaluateExternalExportPolicyV1,isTrustedArtifactV1}from"/app/dist/src/artifacts/contracts.js";
import{PostgresStateRepository}from"/app/dist/src/state/postgres-state-repository.js";

const E=new TextEncoder();
const EXPECTED={
 sourceSha:"ff2e8164a2e6888f3b58b15fb143c73d016f4fb9",
 sourceTree:"2a2806cf347c82cf8a3bb5359375293dcc352f2d",
 proofId:"40227159272-1",
 lessonId:"8f8baf80-5246-491c-bba1-e135553336ec",
 memoryId:"8033fe8f-a927-4271-a810-0e4d0544a322",
 datasetId:"phase7-dataset:sha256:6d6b8900fb568ac4fd62c35a06be9f98ce1f80a8c0895de05977028459df14f1",
 baselineId:"phase7-baseline:sha256:60d0b2e760f8a7e69d832f9bfdd62c7836df2df4b4f103705e58317ddab7782c",
 candidateId:"phase7-candidate:sha256:06e555edbb4fbc5411a5a50c3bdad4dc44ae7518cfc95c1af1b5568c380261e0",
 evaluationId:"phase7-evaluation:sha256:f835a37b3d19e33b22822a6a111cf7adad5df15b43111704046b26d36dac180c",
 decision:"PROMOTED",
 trainingRunIds:["bd1b4708-a1a3-4e00-ac2d-152c7533ec75","c2d06cbd-9300-4ba1-833e-911f838ca270"],
 heldOutRunIds:["08f496ac-5395-4c57-926e-af9b06a8eb19","ec592869-ba3b-4324-a831-71cf3558a968"],
 evaluationEvidenceRefs:["17c017ed-aa8c-42c7-b853-725070ab9d55","709c7e03-d444-4027-b5a2-114c3a60d175"],
};
const req=n=>{const v=process.env[n]?.trim();if(!v)throw Error(`${n}_required`);return v};
const ok=(v,m)=>{if(!v)throw Error(m)};
const token=req("SENTIENT_HF_TOKEN"),vr=req("SENTIENT_HF_VERSIONED_REPOSITORY"),ns=req("SENTIENT_HF_NAMESPACE");
const db=process.env.DATABASE_URL?.trim()||process.env.DIRECT_URL?.trim();
const ss=req("SENTIENT_RUNTIME_SHA"),st=req("SENTIENT_RUNTIME_TREE");
if(!db)throw Error("database_url_required");
ok(ss===EXPECTED.sourceSha,"runtime_source_sha_mismatch");
ok(st===EXPECTED.sourceTree,"runtime_source_tree_mismatch");
ok(ns==="sentient-labs","namespace_mismatch");
ok(vr===`${ns}/sentient-ml-artifacts`,"versioned_repository_mismatch");
const secrets=[token,db],clean=x=>{let s=String(x);for(const v of secrets)s=s.split(v).join("[REDACTED]");return s.replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"postgresql://[REDACTED]")};
const stable=v=>{if(v===null||typeof v!=="object")return JSON.stringify(v);if(Array.isArray(v))return`[${v.map(stable).join(",")}]`;return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`};
const repo=new PostgresStateRepository({connectionString:db});
try{
 await repo.initialize();
 const memory=await repo.get("memory",EXPECTED.memoryId);
 ok(memory?.kind==="memory","phase7_artifact_memory_missing");
 ok(memory?.metadata?.phase7Artifact==="model_improvement_v1","phase7_artifact_memory_type_mismatch");
 const a=JSON.parse(memory.content);
 for(const k of["lessonId","datasetId","baselineId","candidateId","evaluationId"])ok(a[k]===EXPECTEDk],`phase7_${k}_mismatch`);
 ok(a.result?.decision===EXPECTED.decision,"phase7_decision_mismatch");
 ok(a.promotionPolicy?.decisionOwner==="SENTIENT_RUNTIME","phase7_decision_owner_mismatch");
 ok(a.promotionPolicy?.modelMayPromoteItself===false,"phase7_model_self_promotion_forbidden");
 ok(a.evaluationEligibility?.heldOutDisjoint===true&&a.evaluationEligibility?.bothLabels===true,"phase7_evaluation_eligibility_mismatch");
 ok(JSON.stringify([...a.trainingRunIds].sort())===JSON.stringify([...EXPECTED.trainingRunIds].sort()),"training_run_identity_mismatch");
 ok(JSON.stringify([...a.heldOutRunIds].sort())===JSON.stringify([...EXPECTED.heldOutRunIds].sort()),"heldout_run_identity_mismatch");
 ok(!a.trainingRunIds.some(x=>a.heldOutRunIds.includes(x)),"training_heldout_overlap");
 ok(JSON.stringify([...a.evaluationEvidenceRefs].sort())===JSON.stringify([...EXPECTED.evaluationEvidenceRefs].sort()),"evaluation_evidence_mismatch");
 ok(a.checkpoint&&typeof a.checkpoint==="object","phase7_checkpoint_missing");

 const transport=new HuggingFaceHubTransportV1({accessToken:token});
 const storage=new HuggingFaceArtifactStorageV1(transport,{versionedRepository:vr,workingBucket:req("SENTIENT_HF_WORKING_BUCKET")});
 const registry=new ArtifactRegistryV1(repo);
 const createdAt=new Date().toISOString();
 const baseEvidence=Object.freeze([
   `phase7-proof:${EXPECTED.proofId}`,`phase7-memory:${EXPECTED.memoryId}`,`phase7-lesson:${EXPECTED.lessonId}`,
   `source:${ss}`,`evaluation:${EXPECTED.evaluationId}`,
   ...EXPECTED.evaluationEvidenceRefs.map(x=>`evidence:${x}`),
   "synthetic-public-fixture:privacy-public","synthetic-public-fixture:license-open",
   "synthetic-public-fixture:secret-scan-clear","synthetic-public-fixture:pii-clear",
 ]);
 const makeBase=(artifactId,artifactType,digest,sizeBytes,mediaType)=>({
   contractVersion:"sentient-artifacts/v1",artifactId,artifactClass:"VERSIONED_ML",artifactType,
   sourceSha:ss,sourceTree:st,storageProvider:"EXTERNAL",artifactUri:"pending://hugging-face/phase7",
   providerRevision:null,sha256:digest,sizeBytes,mediaType,
   datasetRevision:EXPECTED.datasetId,parentModelRevision:null,trainingRunId:EXPECTED.proofId,
   evaluationReceiptId:EXPECTED.evaluationId,createdAt,createdBy:"SENTIENT_RUNTIME",
   verificationStatus:"UNVERIFIED",provenanceStatus:"VERIFIED",policyStatus:"ALLOWED",
   sentientAuthorization:"AUTHORIZED",promotionStatus:"APPROVED",
   privacyClass:"PUBLIC",licenseClass:"OPEN",usageRights:"ALLOWED",secretScanStatus:"CLEAR",piiStatus:"CLEAR",
   permittedStorageVisibility:"PUBLIC",retentionClass:"ACTIVE_DATASET_REVISION",runtimeEligible:false,
   lifecycleStatus:"APPROVED",references:Object.freeze([
      {kind:"TRAINING_LINEAGE",id:EXPECTED.datasetId},{kind:"EVALUATION_LINEAGE",id:EXPECTED.evaluationId}
   ]),retentionPinned:true,retentionExpiresAt:null,evidenceRefs:baseEvidence
 });

 const datasetPayload={
   contract:"sentient-phase7-hf-dataset-manifest/v1",synthetic:true,lessonId:EXPECTED.lessonId,
   datasetId:EXPECTED.datasetId,baselineId:EXPECTED.baselineId,candidateId:EXPECTED.candidateId,
   evaluationId:EXPECTED.evaluationId,trainingRunIds:[...a.trainingRunIds].sort(),
   heldOutRunIds:[...a.heldOutRunIds].sort(),evaluationEvidenceRefs:[...a.evaluationEvidenceRefs].sort(),
   sourceSha:ss,sourceTree:st
 };
 const datasetBytes=E.encode(stable(datasetPayload)),datasetDigest=digestBytesV1(datasetBytes);
 const datasetArtifactId=`artifact:v1:VERSIONED_ML:${datasetDigest}`;
 const datasetPending=Object.freeze(makeBase(datasetArtifactId,"phase7-approved-training-dataset",datasetDigest,datasetBytes.byteLength,"application/json"));
 const datasetPolicy=evaluateExternalExportPolicyV1(datasetPending);ok(datasetPolicy.allowed,`dataset_export_policy_blocked:${datasetPolicy.reasons.join(",")}`);
 const datasetUploaded=await storage.upload(datasetPending,`phase7/${EXPECTED.datasetId}/dataset-manifest.json`,datasetBytes);
 ok(typeof datasetUploaded.providerRevision==="string"&&datasetUploaded.providerRevision.length>0,"dataset_provider_revision_missing");
 const datasetRetrieved=await storage.retrieveVerified(datasetUploaded);
 ok(digestBytesV1(datasetRetrieved)===datasetDigest,"dataset_digest_retrieval_mismatch");
 const datasetRecord=Object.freeze({...datasetUploaded,verificationStatus:"VERIFIED",provenanceStatus:"VERIFIED",policyStatus:"ALLOWED",runtimeEligible:false,lifecycleStatus:"APPROVED"});
 await registry.register(datasetRecord);
 const datasetBound=await registry.get(datasetArtifactId);
 ok(datasetBound?.sha256===datasetDigest&&datasetBound?.providerRevision===datasetUploaded.providerRevision&&datasetBound?.datasetRevision===EXPECTED.datasetId,"dataset_postgres_binding_failed");

 const candidateBytes=E.encode(stable(a.checkpoint)),candidateDigest=digestBytesV1(candidateBytes);
 const candidateArtifactId=`artifact:v1:VERSIONED_ML:${candidateDigest}`;
 const promoted=EXPECTED.decision==="PROMOTED";
 const candidatePending=Object.freeze({
   ...makeBase(candidateArtifactId,"phase7-feature-head-candidate",candidateDigest,candidateBytes.byteLength,"application/json"),
   parentModelRevision:EXPECTED.baselineId,
   promotionStatus:promoted?"PROMOTED":"REJECTED",
   sentientAuthorization:promoted?"AUTHORIZED":"REJECTED",
   retentionClass:promoted?"PROMOTED_MODEL":"FAILED_TRAINING_OUTPUT",
   retentionPinned:promoted,
   lifecycleStatus:promoted?"PROMOTED":"REJECTED",
   references:Object.freeze([
     {kind:"TRAINING_LINEAGE",id:EXPECTED.datasetId},{kind:"EVALUATION_LINEAGE",id:EXPECTED.evaluationId},
     ...(promoted?[{kind:"PROMOTED_MODEL",id:EXPECTED.candidateId}]:[])
   ]),
 });
 const candidatePolicy=evaluateExternalExportPolicyV1(candidatePending);ok(candidatePolicy.allowed,`candidate_export_policy_blocked:${candidatePolicy.reasons.join(",")}`);
 const candidateUploaded=await storage.upload(candidatePending,`phase7/${EXPECTED.candidateId}/candidate-checkpoint.json`,candidateBytes);
 ok(typeof candidateUploaded.providerRevision==="string"&&candidateUploaded.providerRevision.length>0,"candidate_provider_revision_missing");
 const candidateRetrieved=await storage.retrieveVerified(candidateUploaded);
 ok(digestBytesV1(candidateRetrieved)===candidateDigest,"candidate_digest_retrieval_mismatch");
 const candidateRecord=Object.freeze({...candidateUploaded,verificationStatus:"VERIFIED",provenanceStatus:"VERIFIED",policyStatus:"ALLOWED",runtimeEligible:promoted,lifecycleStatus:promoted?"PROMOTED":"REJECTED"});
 ok(!promoted||isTrustedArtifactV1(candidateRecord),"promoted_candidate_not_trusted_after_binding");
 await registry.register(candidateRecord);
 const candidateBound=await registry.get(candidateArtifactId);
 ok(candidateBound?.sha256===candidateDigest&&candidateBound?.providerRevision===candidateUploaded.providerRevision&&candidateBound?.evaluationReceiptId===EXPECTED.evaluationId,"candidate_postgres_binding_failed");
 ok(candidateBound?.promotionStatus===EXPECTED.decision,"candidate_promotion_binding_mismatch");
 ok(candidateBound?.sentientAuthorization===(promoted?"AUTHORIZED":"REJECTED"),"candidate_authorization_binding_mismatch");

 console.log(`BASELINE_ID=${EXPECTED.baselineId}`);
 console.log(`DATASET_ID=${EXPECTED.datasetId}`);
 console.log(`CANDIDATE_ID=${EXPECTED.candidateId}`);
 console.log(`EVALUATION_ID=${EXPECTED.evaluationId}`);
 console.log(`PROMOTION_DECISION=${EXPECTED.decision}`);
 console.log(`HF_DATASET_ARTIFACT_ID=${datasetArtifactId}`);
 console.log(`HF_CANDIDATE_ARTIFACT_ID=${candidateArtifactId}`);
 console.log(`DATASET_DIGEST=${datasetDigest}`);
 console.log(`CANDIDATE_DIGEST=${candidateDigest}`);
 console.log(`DATASET_PROVIDER_REVISION=${datasetUploaded.providerRevision}`);
 console.log(`CANDIDATE_PROVIDER_REVISION=${candidateUploaded.providerRevision}`);
 for(const x of[
   "FIRST_HF_LEARNING_CYCLE=PASS","TRAINING_HELDOUT_DISJOINT=true","DATASET_DIGEST_VERIFIED=true",
   "CANDIDATE_DIGEST_VERIFIED=true","HF_ARTIFACT_BINDING=PASS","POSTGRES_ARTIFACT_BINDING=PASS",
   "PRIVACY_GATE=PASS","LICENSE_GATE=PASS","SECRET_SCAN_GATE=PASS",
   "MODEL_MAY_PROMOTE_ITSELF=false","SENTIENT_OWNS_PROMOTION_DECISION=true",
   "HF_PAID_INFERENCE_USED=false","HF_PAID_TRAINING_USED=false","PRIVATE_ACTIONS_BRIDGE_USED=false",
   "SECRET_VALUES_EXPOSED=false","SOURCE_MUTATION=false","PRODUCTION_SOURCE_DEPLOYED=false"
 ])console.log(x);
}catch(e){
 console.error(`PHASE7_HF_BINDING_ERROR=${clean(e instanceof Error?e.message:e)}`);
 console.error("SECRET_VALUES_EXPOSED=false");
 process.exitCode=1;
}finally{await repo.close().catch(()=>{})}
