import {PostgresSpawnObjectiveRepository} from "/app/dist/src/objective-continuation/postgres-spawn-repository.js";
const oid=process.env.CERT_OBJECTIVE_ID,sid=process.env.CERT_SESSION_ID,sha=process.env.CERT_EXPECTED_SHA;
const token=String(process.env.SENTIENT_API_TOKEN??"").trim(),db=String(process.env.DATABASE_URL??process.env.DIRECT_URL??"").trim();
if(!oid||!sid||!sha||!token||!db) throw new Error("CERT_ENGINEERING_BINDING_MISSING");
const repo=new PostgresSpawnObjectiveRepository({connectionString:db});
const call=async(path,options={})=>{const r=await fetch(`http://127.0.0.1:8080${path}`,{...options,headers:{authorization:`Bearer ${token}`,"content-type":"application/json",...(options.headers??{})},signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json()};};
try{
 const engineeringJob={repo:"riggeyb/sentient",branch:"sentient-production-composition-20261017",expectedHead:sha,objective:"Certification-only read-only inspection of the frozen head. Do not mutate source.",commands:[{name:"verify-frozen-head",category:"inspect",command:"bash",args:["-lc",`test "$(git rev-parse HEAD)" = "${sha}" && git diff --quiet`],timeoutMs:30000}],commitMessage:"cert: no mutation expected",timeoutMs:120000};
 const created=await call("/v1/objectives",{method:"POST",body:JSON.stringify({request:"Execute the registered certification engineering inspection and verify its terminal receipt.",objectiveId:oid,sessionId:sid,mode:"multi_step",privacy:"public_fixture",engineeringJob,deployOnSuccess:false})});
 if(created.status!==202||created.body.objectiveId!==oid) throw new Error(`ENGINEERING_INGRESS_${created.status}`);
 let jobId=null,terminal=null;
 for(let i=0;i<300;i++){
  const got=await call(`/v1/objectives/${encodeURIComponent(oid)}`); if(got.status!==200) throw new Error(`ENGINEERING_STATUS_${got.status}`);
  const st=got.body;
  if(!jobId&&typeof st.activeEngineeringJobId==="string"&&st.activeEngineeringJobId){
   jobId=st.activeEngineeringJobId; const durable=await repo.get("task",oid);
   if(durable?.kind!=="task"||durable.metadata?.activeEngineeringJobId!==jobId) throw new Error("JOB_ID_NOT_DURABLY_PERSISTED");
   console.log(`ENGINEERING_JOB_ID=${jobId}`); console.log("JOB_ID_PERSISTED_BEFORE_POLL=PASS");
  }
  if(["succeeded","failed","cancelled"].includes(st.status)){terminal=st;break;}
  await new Promise(r=>setTimeout(r,1000));
 }
 if(!jobId||!terminal) throw new Error("ENGINEERING_TERMINAL_NOT_OBSERVED");
 const receipt=terminal.lastEngineeringReceipt;
 if(!receipt||receipt.jobId!==jobId||receipt.expectedHead!==sha||!["FAILED","SUCCEEDED"].includes(receipt.status)) throw new Error("ENGINEERING_RECEIPT_INVALID");
 const full=await call(`/v1/engineering/jobs/${encodeURIComponent(jobId)}`);
 if(full.status!==200||full.body.jobId!==jobId||full.body.expectedHead!==sha||full.body.startSha!==sha||!["FAILED","SUCCEEDED"].includes(full.body.status)) throw new Error("ENGINEERING_FULL_RECEIPT_INVALID");
 if(full.body.endSha!==null&&full.body.endSha!==sha) throw new Error("FROZEN_SOURCE_MUTATED_BY_CERT_JOB");
 const cont=await repo.getObjectiveContinuation(oid); if(!cont||cont.revision<1||cont.terminal===null) throw new Error("ENGINEERING_CONTINUATION_NOT_ADVANCED");
 console.log(`ENGINEERING_TERMINAL_STATUS=${full.body.status}`); console.log(`ENGINEERING_ERROR_CODE=${full.body.errorCode??"NONE"}`);
 console.log("ENGINEERING_RECEIPT_VERIFIED=PASS"); console.log("CONTINUATION_ADVANCED=PASS"); console.log("SECRET_VALUES_EXPOSED=false");
}finally{await repo.close().catch(()=>undefined);}
