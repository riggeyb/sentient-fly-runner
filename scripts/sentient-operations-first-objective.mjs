import {PostgresSpawnObjectiveRepository as DB} from "/app/dist/src/objective-continuation/postgres-spawn-repository.js";
const id="sentient-operations-001",session="sentient-operations";
const request="Examine the existing Sentient production repository and Fly configuration. Identify avoidable storage consumption, resource inefficiencies, and operational costs. Produce a prioritized read-only report with concrete source references and recommendations. Do not modify source, databases, infrastructure, deployments, configuration, permissions, or secrets. Do not invoke engineering mutations or deploy.";
const token=process.env.SENTIENT_API_TOKEN;
if(!token)throw Error("AUTH_BINDING_MISSING");
const h={authorization:`Bearer ${token}`,"content-type":"application/json"};
const origin="http://127.0.0.1:8080";
async function get(){const r=await fetch(`${origin}/v1/objectives/${id}`,{headers:h,signal:AbortSignal.timeout(30000)});if(r.status===404)return null;if(r.status!==200)throw Error("GET_HTTP_"+r.status);return r.json()}
let status=await get();
if(!status){
 try{
  const r=await fetch(`${origin}/v1/objectives`,{method:"POST",headers:h,body:JSON.stringify({objectiveId:id,sessionId:session,mode:"auto",privacy:"private",deployOnSuccess:false,request}),signal:AbortSignal.timeout(120000)});
  if(r.status!==202)throw Error("POST_HTTP_"+r.status);
  status=await r.json();
  console.log("OPERATIONAL_OBJECTIVE_ACCEPTED=PASS");
 }catch(e){
  status=await get().catch(()=>null);
  if(!status)throw Error("AMBIGUOUS_POST_CHECK_EXISTING_ID_BEFORE_RETRY");
  console.log("OPERATIONAL_POST_RECOVERED_BY_EXISTING_ID=PASS");
 }
}
const repo=new DB({connectionString:process.env.DATABASE_URL??process.env.DIRECT_URL});
try{
 const task=await repo.get("task",id),meta=task?.metadata??{};
 if(task?.kind!=="task"||meta.request!==request||meta.sessionId!==session||meta.privacy!=="private"||meta.deployOnSuccess!==false)throw Error("OBJECTIVE_ID_CONFLICT");
 console.log("OBJECTIVE_ID="+id);
 console.log("OBJECTIVE_PERSISTED=PASS");
 console.log("OBJECTIVE_PRIVATE=PASS");
 console.log("DEPLOY_ON_SUCCESS=false");
}finally{await repo.close()}
let end=Date.now()+15*60000;
while(Date.now()<end&&!["succeeded","failed","cancelled"].includes(status.status)){await new Promise(r=>setTimeout(r,8000));status=await get()}
console.log("OBJECTIVE_STATUS="+status.status);
console.log("OBJECTIVE_RESULT_PRESENT="+String(status.result!=null));
console.log("OBJECTIVE_ERROR_PRESENT="+String(status.error!=null));
console.log("PRIVATE_RESULT_REDACTED_FROM_PUBLIC_LOGS=true");
console.log("SECRET_VALUES_EXPOSED=false");
console.log("OBJECTIVE_RESULT_GET=/v1/objectives/"+id);
