import{readFile,rm}from"node:fs/promises";
import{HuggingFaceHubTransportV1}from"/app/dist/src/artifacts/huggingface-hub-transport.js";
import{HuggingFaceArtifactStorageV1}from"/app/dist/src/artifacts/huggingface-storage.js";
import{runHuggingFaceVersionedArtifactRoundTripV1}from"/app/dist/src/artifacts/huggingface-roundtrip.js";
import{ArtifactRegistryV1}from"/app/dist/src/artifacts/registry.js";
import{digestBytesV1,evaluateExternalExportPolicyV1}from"/app/dist/src/artifacts/contracts.js";
import{materializeArtifactCacheV1,evictArtifactCacheV1}from"/app/dist/src/artifacts/cache.js";
import{PostgresStateRepository}from"/app/dist/src/state/postgres-state-repository.js";
const SHA="ff2e8164a2e6888f3b58b15fb143c73d016f4fb9",TREE="2a2806cf347c82cf8a3bb5359375293dcc352f2d",E=new TextEncoder(),CACHE="/tmp/sentient-hf-activation-cache-v1";
const req=n=>{const v=process.env[n]?.trim();if(!v)throw Error(`${n}_required`);return v},ok=(v,m)=>{if(!v)throw Error(m)};
const token=req("SENTIENT_HF_TOKEN"),vr=req("SENTIENT_HF_VERSIONED_REPOSITORY"),wb=req("SENTIENT_HF_WORKING_BUCKET"),ns=req("SENTIENT_HF_NAMESPACE"),db=process.env.DATABASE_URL?.trim()||process.env.DIRECT_URL?.trim(),ss=req("SENTIENT_RUNTIME_SHA"),st=req("SENTIENT_RUNTIME_TREE");
if(!db)throw Error("database_url_required");ok(ss===SHA,"runtime_source_sha_mismatch");ok(st===TREE,"runtime_source_tree_mismatch");ok(ns==="sentient-labs","namespace_mismatch");ok(vr===`${ns}/sentient-ml-artifacts`,"versioned_repository_mismatch");ok(wb===`${ns}/sentient-working-ml`,"working_bucket_mismatch");
const repo=new PostgresStateRepository({connectionString:db}),secrets=[token,db],clean=x=>{let s=String(x);for(const v of secrets)s=s.split(v).join("[REDACTED]");return s.replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"postgresql://[REDACTED]")};
let registry=null,cacheRecord=null,verifiedWorking=null;
try{
 await repo.initialize();registry=new ArtifactRegistryV1(repo);const transport=new HuggingFaceHubTransportV1({accessToken:token}),storage=new HuggingFaceArtifactStorageV1(transport,{versionedRepository:vr,workingBucket:wb}),createdAt=new Date().toISOString(),evidenceRefs=Object.freeze(["sentient-hf-operational-activation-v1",`source:${ss}`,"synthetic-public-fixture:privacy-public","synthetic-public-fixture:license-open","synthetic-public-fixture:secret-scan-clear","synthetic-public-fixture:pii-clear"]);
 const vb=E.encode(JSON.stringify({contract:"sentient-hf-operational-activation-fixture/v1",storageClass:"VERSIONED_ML",classification:"PUBLIC",synthetic:true,payload:[1,2,3]}));
 const v=await runHuggingFaceVersionedArtifactRoundTripV1({enabled:true,sourceSha:ss,sourceTree:st,createdAt,createdBy:"SENTIENT_RUNTIME",artifactType:"sentient-operational-hf-roundtrip-fixture",path:"operational/sentient-hf-activation-v1/versioned-fixture.json",bytes:vb,mediaType:"application/json",privacyClass:"PUBLIC",licenseClass:"OPEN",usageRights:"ALLOWED",secretScanStatus:"CLEAR",piiStatus:"CLEAR",permittedStorageVisibility:"PUBLIC",evidenceRefs},{storage,registry});
 ok(v.uploadVerified&&v.postgresBindingVerified&&v.roundTripRetrievalVerified&&!v.remoteUriAloneTrusted,"versioned_roundtrip_gate_failed");
 const versionedRecord=await registry.get(v.artifactId);ok(versionedRecord?.sha256===v.sha256&&versionedRecord?.providerRevision===v.providerRevision&&versionedRecord?.runtimeEligible===false,"versioned_authority_binding_failed");
 const b=E.encode(JSON.stringify({contract:"sentient-hf-operational-activation-fixture/v1",storageClass:"WORKING_ML",classification:"PUBLIC",synthetic:true,sourceArtifactId:v.artifactId,payload:[4,5,6]})),d=digestBytesV1(b),id=`artifact:v1:WORKING_ML:${d}`;
 const p=Object.freeze({contractVersion:"sentient-artifacts/v1",artifactId:id,artifactClass:"WORKING_ML",artifactType:"sentient-operational-hf-working-fixture",sourceSha:ss,sourceTree:st,storageProvider:"EXTERNAL",artifactUri:"pending://hugging-face/working-artifact",providerRevision:null,sha256:d,sizeBytes:b.byteLength,mediaType:"application/json",datasetRevision:v.artifactId,parentModelRevision:null,trainingRunId:"sentient-hf-operational-activation-v1",evaluationReceiptId:v.evaluationReceiptId,createdAt,createdBy:"SENTIENT_RUNTIME",verificationStatus:"UNVERIFIED",provenanceStatus:"VERIFIED",policyStatus:"UNREVIEWED",sentientAuthorization:"AUTHORIZED",promotionStatus:"APPROVED",privacyClass:"PUBLIC",licenseClass:"OPEN",usageRights:"ALLOWED",secretScanStatus:"CLEAR",piiStatus:"CLEAR",permittedStorageVisibility:"PUBLIC",retentionClass:"WORKING_ML",runtimeEligible:false,lifecycleStatus:"INGESTED",references:Object.freeze([{kind:"EVALUATION_LINEAGE",id:v.artifactId}]),retentionPinned:false,retentionExpiresAt:null,evidenceRefs:Object.freeze([...evidenceRefs,v.providerRevision])});
 const policy=evaluateExternalExportPolicyV1(p);ok(policy.allowed,`working_policy_blocked:${policy.reasons.join(",")}`);
 const u=await storage.upload(Object.freeze({...p,policyStatus:"ALLOWED"}),"operational/sentient-hf-activation-v1/working-fixture.json",b);ok(u.providerRevision===null,"working_bucket_revision_must_be_null");
 const r=await storage.retrieveVerified(u);ok(r.byteLength===b.byteLength&&digestBytesV1(r)===d,"working_roundtrip_verification_failed");
 verifiedWorking=Object.freeze({...u,verificationStatus:"VERIFIED",provenanceStatus:"VERIFIED",policyStatus:"ALLOWED",sentientAuthorization:"AUTHORIZED",promotionStatus:"APPROVED",runtimeEligible:false,lifecycleStatus:"EVALUATED"});
 await registry.register(verifiedWorking);
 const got=await registry.get(id);ok(got?.artifactUri===verifiedWorking.artifactUri&&got?.sha256===d&&got?.providerRevision===null&&got?.datasetRevision===v.artifactId&&got?.runtimeEligible===false,"working_postgres_binding_failed");
 cacheRecord=Object.freeze({...versionedRecord,runtimeEligible:true,lifecycleStatus:"APPROVED"});
 await registry.updateGovernance(cacheRecord);
 try{
  const a=await materializeArtifactCacheV1(cacheRecord,CACHE,()=>storage.retrieveVerified(cacheRecord));const first=new Uint8Array(await readFile(a));ok(digestBytesV1(first)===v.sha256,"cache_first_digest_failed");await evictArtifactCacheV1(a);
  const c=await materializeArtifactCacheV1(cacheRecord,CACHE,()=>storage.retrieveVerified(cacheRecord));const second=new Uint8Array(await readFile(c));ok(digestBytesV1(second)===v.sha256,"cache_reconstruction_digest_failed");ok(a===c,"cache_reconstruction_path_changed");await evictArtifactCacheV1(c);
 }finally{
  await rm(CACHE,{recursive:true,force:true}).catch(()=>{});
  await registry.updateGovernance(Object.freeze({...cacheRecord,runtimeEligible:false,lifecycleStatus:"EVALUATED"}));
  cacheRecord=null;
 }
 const finalVersioned=await registry.get(v.artifactId),finalWorking=await registry.get(id);ok(finalVersioned?.runtimeEligible===false&&finalWorking?.runtimeEligible===false,"remote_uri_authority_boundary_failed");
 console.log(`VERSIONED_ARTIFACT_ID=${v.artifactId}`);console.log(`EVALUATION_ID=${v.evaluationReceiptId}`);console.log(`DATASET_DIGEST=${v.sha256}`);console.log(`WORKING_ARTIFACT_ID=${id}`);console.log(`WORKING_DIGEST=${d}`);console.log(`VERSIONED_PROVIDER_REVISION=${v.providerRevision}`);
 for(const x of["FIRST_HF_ARTIFACT_ROUNDTRIP=PASS","HF_VERSIONED_WRITE=PASS","HF_WORKING_WRITE=PASS","POSTGRES_ARTIFACT_BINDING=PASS","DIGEST_VERIFICATION=PASS","PROVENANCE_BINDING=PASS","PRIVACY_GATE=PASS","LICENSE_GATE=PASS","SECRET_SCAN_GATE=PASS","ROUNDTRIP_RETRIEVAL=PASS","CACHE_RECONSTRUCTABLE=PASS","REMOTE_URI_ALONE_NOT_AUTHORITY=true","HF_PAID_INFERENCE_USED=false","HF_PAID_TRAINING_USED=false","SECRET_VALUES_EXPOSED=false","PRIVATE_ACTIONS_BRIDGE_USED=false"])console.log(x);
}catch(e){
 if(cacheRecord&&registry)await registry.updateGovernance(Object.freeze({...cacheRecord,runtimeEligible:false,lifecycleStatus:"EVALUATED"})).catch(()=>{});
 await rm(CACHE,{recursive:true,force:true}).catch(()=>{});
 console.error(`HF_ROUNDTRIP_ERROR=${clean(e instanceof Error?e.message:e)}`);console.error("SECRET_VALUES_EXPOSED=false");process.exitCode=1
}finally{await repo.close().catch(()=>{})}
