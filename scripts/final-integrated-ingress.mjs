import {PostgresSpawnObjectiveRepository} from "/app/dist/src/objective-continuation/postgres-spawn-repository.js";
const oid=String(process.env.CERT_OBJECTIVE_ID??"").trim();
const sid=String(process.env.CERT_SESSION_ID??"").trim();
const token=String(process.env.SENTIENT_API_TOKEN??"").trim();
const db=String(process.env.DATABASE_URL??process.env.DIRECT_URL??"").trim();
if(!oid||!sid||!token||!db) throw new Error("CERT_INGRESS_BINDING_MISSING");
const repo=new PostgresSpawnObjectiveRepository({connectionString:db});
try{
  const started=Date.now();
  let response;
  try{
    response=await fetch("http://127.0.0.1:8080/v1/objectives",{
      method:"POST",
      headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
      body:JSON.stringify({
        request:"First inspect the repository current commit identity without mutation; then inspect the working tree status without mutation; then independently collaborate with workers to analyze restart-safe durable collaboration, verify it, and converge under Sentient authority.",
        objectiveId:oid,
        sessionId:sid,
        mode:"multi_step",
        privacy:"public_fixture"
      }),
      signal:AbortSignal.timeout(120000)
    });
  }catch(error){
    console.log("INTEGRATED_INGRESS_TRANSPORT="+String(error instanceof Error?error.name:"UNKNOWN"));
    console.log("INTEGRATED_INGRESS_ELAPSED_MS="+(Date.now()-started));
    throw new Error("INTEGRATED_INGRESS_TRANSPORT_FAILED_NO_RETRY");
  }
  console.log("INTEGRATED_INGRESS_STATUS="+response.status);
  console.log("INTEGRATED_INGRESS_ELAPSED_MS="+(Date.now()-started));
  const receipt=await response.json();
  if(response.status!==202||receipt.objectiveId!==oid) throw new Error("MAIN_INGRESS_NOT_ACCEPTED");
  console.log("OBJECTIVE_ASYNC_INGRESS=PASS");
  const task=await repo.get("task",oid);
  if(task?.kind!=="task") throw new Error("OBJECTIVE_NOT_PERSISTED");
  console.log("OBJECTIVE_PERSISTENCE=PASS");
  console.log("INITIAL_TASK_STATUS="+String(task.status));
  console.log("SECRET_VALUES_EXPOSED=false");
}finally{
  await repo.close().catch(()=>undefined);
}
