import {readFile,rm} from "node:fs/promises";
import {ARTIFACT_CONTRACT_VERSION_V1,digestBytesV1,evaluateExternalExportPolicyV1} from "/app/dist/src/artifacts/contracts.js";
import {materializeArtifactCacheV1,evictArtifactCacheV1} from "/app/dist/src/artifacts/cache.js";
import {HuggingFaceHubTransportV1} from "/app/dist/src/artifacts/huggingface-hub-transport.js";
import {HuggingFaceArtifactStorageV1} from "/app/dist/src/artifacts/huggingface-storage.js";
import {runHuggingFaceVersionedArtifactRoundTripV1} from "/app/dist/src/artifacts/huggingface-roundtrip.js";
import {ArtifactRegistryV1} from "/app/dist/src/artifacts/registry.js";
import {PostgresSpawnObjectiveRepository} from "/app/dist/src/objective-continuation/postgres-spawn-repository.js";

const SHA="ff2e8164a2e6888f3b58b15fb143c73d016f4fb9",TREE="2a2806cf347c82cf8a3bb5359375293dcc352f2d";
const REPO="sentient-labs/sentient-ml-artifacts",BUCKET="sentient-labs/sentient-working-ml",NS="sentient-labs";
const req=n=>{const v=String(process.env[n]??"").trim();if(!v)throw Error("required_configuration_missing");return v};
const out=(k,v="PASS")=>console.log(`${k}=${v}`);
const eq=(a,b)=>a.byteLength===b.byteLength&&digestBytesV1(a)===digestBytesV1(b);
let db,registry,cacheRec;const cacheDir="/tmp/sentient-hf-cache-v1";
try{
 const sha=req("SENTIENT_RUNTIME_SHA"),tree=req("SENTIENT_RUNTIME_TREE"),token=req("SENTIENT_HF_TOKEN");
 const ns=req("SENTIENT_HF_NAMESPACE"),vr=req("SENTIENT_HF_VERSIONED_REPOSITORY"),wb=req("SENTIENT_HF_WORKING_BUCKET");
 const url=String(process.env.DATABASE_URL??process.env.DIRECT_URL??"").trim();
 if(!url||sha!==SHA||tree!==TREE||ns!==NS||vr!==REPO||wb!==BUCKET)throw Error("preflight_failed");
 const data=new TextEncoder().encode(JSON.stringify({schema:"sentient-hf-operational-synthetic/v1",privacy:"PUBLIC",license:"OPEN",records:[{x:"alpha",y:"a"},{x:"beta",y:"b"}]}));
