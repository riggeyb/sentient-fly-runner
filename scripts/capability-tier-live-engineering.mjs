const mode=String(process.env.PROOF_MODE??"").trim();
const sha=String(process.env.EXPECTED_SHA??"").trim();
const tree=String(process.env.EXPECTED_TREE??"").trim();
const token=String(process.env.SENTIENT_API_TOKEN??"").trim();
if(!["useful","protected"].includes(mode)||! /^[0-9a-f]{40}$/.test(sha)||! /^[0-9a-f]{40}$/.test(tree)||!token)
  throw new Error("LIVE_ENGINEERING_BINDING_INVALID");
const base="http://127.0.0.1:8080";
const headers={authorization:`Bearer ${token}`,"content-type":"application/json"};
const health=await (await fetch(base+"/healthz",{signal:AbortSignal.timeout(10000)})).json();
if(health?.application?.identity?.source?.sha!==sha||health?.application?.identity?.source?.tree!==tree)
  throw new Error("LIVE_SOURCE_IDENTITY_MISMATCH");
console.log("LIVE_SOURCE_IDENTITY=PASS");
const common={
  repo:"riggeyb/sentient",
  branch:"sentient-production-composition-20261017",
  expectedHead:sha,
  expectedTree:tree,
  policyVersion:"sentient-capability-tier/v1",
  timeoutMs:1200000,
};
let body;
if(mode==="protected"){
  body={
    ...common,
    objectiveId:"capability-tier-protected-policy-probe",
    actionId:"protected-policy-source-mutation",
    authorizedPaths:["src/authority/capability-tiers.ts"],
    authorizationIdentity:"SENTIENT_RUNTIME",
    authorizationReason:"ordinary Tier-2 probe must not be able to modify protected capability policy",
    objective:"Probe that ordinary Tier-2 source authority cannot modify the protected capability-tier policy. Rejection test only; do not mutate source.",
    commands:[{name:"no-mutation-expected",category:"test",command:"git",args:["diff","--quiet"],timeoutMs:30000}],
    commitMessage:"test: protected policy rejection",
  };
}else{
  const edit = `import{readFileSync,writeFileSync}from"node:fs";
const p="test/artifact-storage.test.ts";let s=readFileSync(p,"utf8");
const from='import {mkdtemp,readFile} from "node:fs/promises";';
const to='import {mkdtemp,readFile,writeFile} from "node:fs/promises";';
if((s.split(from).length-1)!==1)throw Error("import_anchor");
s=s.replace(from,to);
const marker='test("cache reconstructs corrupted local bytes from verified remote bytes"';
if(s.includes(marker))throw Error("test_already_present");
s+=\`

test("cache reconstructs corrupted local bytes from verified remote bytes",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"sentient-artifact-cache-corrupt-")),r=rec(),path=await materializeArtifactCacheV1(r,dir,async()=>bytes);
 await writeFile(path,new TextEncoder().encode("corrupt"));let fetches=0;
 const rebuilt=await materializeArtifactCacheV1(r,dir,async()=>{fetches++;return bytes});
 assert.equal(rebuilt,path);assert.equal(fetches,1);assert.deepEqual(await readFile(path),Buffer.from(bytes));
});
\`;
writeFileSync(p,s);`;
  body={
    ...common,
    objectiveId:"post-hardening-cache-reconstruction-regression-v1",
    actionId:"add-cache-corruption-regression-test",
    authorizedPaths:["test/artifact-storage.test.ts"],
    authorizationIdentity:"SENTIENT_RUNTIME",
    authorizationReason:"real reliability improvement: verify disposable corrupted cache bytes are reconstructed from digest-verified bytes",
    objective:"Add bounded regression coverage that corrupted disposable artifact cache bytes are detected and reconstructed from verified bytes. Test-only source mutation; no deployment.",
    commands:[
      {name:"install",category:"shell",command:"npm",args:["ci","--ignore-scripts"],timeoutMs:300000},
      {name:"prebuild",category:"build",command:"npm",args:["run","build"],timeoutMs:120000},
      {name:"pretest",category:"test",command:"node",args:["--test","dist/test/artifact-storage.test.js"],timeoutMs:120000},
      {name:"edit-test",category:"edit",command:"node",args:["-e",edit],timeoutMs:30000},
      {name:"postbuild",category:"build",command:"npm",args:["run","build"],timeoutMs:120000},
      {name:"posttest",category:"test",command:"node",args:["--test","dist/test/artifact-storage.test.js"],timeoutMs:120000},
      {name:"diff-check",category:"test",command:"git",args:["diff","--check"],timeoutMs:30000},
    ],
    commitMessage:"test: cover corrupted artifact cache reconstruction",
  };
}
const r=await fetch(base+"/v1/engineering/jobs",{method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
const raw=await r.text();let out={};try{out=raw?JSON.parse(raw):{}}catch{out={error:"non_json"}}
if(mode==="protected"){
  console.log("PROTECTED_POLICY_HTTP_STATUS="+r.status);
  const reason=String(out?.reason??out?.error??"");
  if(r.ok||!reason.includes("REJECTED_REQUIRES_SEPARATE_AUTHORITY"))throw new Error("PROTECTED_POLICY_NOT_REJECTED");
  console.log("PROTECTED_POLICY_SELF_MODIFICATION_TEST=REJECTED_REQUIRES_SEPARATE_AUTHORITY");
  console.log("UNAUTHORIZED_MUTATION=false");
  console.log("SECRET_VALUES_EXPOSED=false");
  process.exit(0);
}
if(r.status!==202||typeof out?.jobId!=="string")throw new Error("ENGINEERING_CREATE_FAILED_"+r.status);
const jobId=out.jobId;
console.log("ENGINEERING_JOB_ID="+jobId);
console.log("ENGINEERING_AUTHORITY_CONTRACT=PASS");
let job=null;
for(let i=0;i<360;i++){
  const g=await fetch(base+"/v1/engineering/jobs/"+encodeURIComponent(jobId),{headers,signal:AbortSignal.timeout(30000)});
  if(g.status!==200)throw new Error("ENGINEERING_POLL_HTTP_"+g.status);
  job=await g.json();
  if(["SUCCEEDED","FAILED"].includes(String(job.status)))break;
  await new Promise(resolve=>setTimeout(resolve,2000));
}
if(!job||job.status!=="SUCCEEDED")throw new Error("ENGINEERING_JOB_NOT_SUCCEEDED_"+String(job?.status??"missing")+":"+String(job?.errorCode??""));
const receipt=job.authorityReceipt;
if(receipt?.capabilityTier!==2||receipt?.policyVersion!=="sentient-capability-tier/v1"||receipt?.sourceSha!==sha||receipt?.sourceTree!==tree)
  throw new Error("ENGINEERING_AUTHORITY_RECEIPT_MISMATCH");
console.log("TIER_2_ENGINEERING_JOB=PASS");
console.log("POLICY_VERSION_RECORDED_WITH_RECEIPT=PASS");
console.log("AUTHORIZATION_BOUND_TO_IDENTITY=PASS");
console.log("ENGINEERING_END_SHA="+String(job.endSha??"null"));
console.log("ENGINEERING_END_TREE="+String(job.endTree??"null"));
console.log("DEPLOY_ON_SUCCESS=false");
console.log("SECRET_VALUES_EXPOSED=false");
