import {PostgresSpawnObjectiveRepository} from "/app/dist/src/objective-continuation/postgres-spawn-repository.js";
const oid=process.env.CERT_OBJECTIVE_ID,sid=process.env.CERT_SESSION_ID;
const token=String(process.env.SENTIENT_API_TOKEN??"").trim();
const db=String(process.env.DATABASE_URL??process.env.DIRECT_URL??"").trim();
if(!oid||!sid||!token||!db) throw new Error("CERT_BINDING_MISSING");
const repo=new PostgresSpawnObjectiveRepository({connectionString:db});
try{
 const response=await fetch("http://127.0.0.1:8080/v1/objectives",{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({
  request:"First inspect the repository current commit identity without mutation; then use a bounded tool to inspect the current commit identity without mutation; then independently collaborate with workers to analyze restart-safe durable collaboration, verify it, and converge under Sentient authority.",
  objectiveId:oid,sessionId:sid,mode:"multi_step",privacy:"public_fixture"
 }),signal:AbortSignal.timeout(30000)});
 const receipt=await response.json();
 if(response.status!==202||receipt.objectiveId!==oid) throw new Error(`MAIN_INGRESS_${response.status}`);
 console.log("OBJECTIVE_ASYNC_INGRESS=PASS");
 if((await repo.get("task",oid))?.kind!=="task") throw new Error("OBJECTIVE_NOT_PERSISTED");
 console.log("OBJECTIVE_PERSISTENCE=PASS");
 let armed=false;
 for(let i=0;i<2400;i++){
  const root=await repo.getObjectiveContinuation(oid);
  const satisfied=(root?.evidenceDependencies??[]).filter(d=>d.status==="SATISFIED").length;
  const works=(await repo.activeWork(sid,true)).filter(w=>w.objectiveId.startsWith(`${oid}:`)&&w.workKey==="independent-analysis"&&w.status==="ACTIVE");
  const spawn=await repo.spawnSnapshot();
  for(const work of works){
   const child=spawn.records.executions.find(e=>e.requestId===work.participantId&&["reserved","running"].includes(e.identity.status)&&e.reservationReconciled===false);
   if(child&&satisfied>=2){
    console.log("INTEGRATED_ARM_JSON="+JSON.stringify({workN9:work.workId,participantId:work.participantId,childId:child.id,rootRevision:root?.revision??null,satisfied}));
    console.log("INTEGRATED_RESTART_ARMED=PASS");
    armed=true;
    break;
   }
  }
  if(armed) break;
  await new Promise(r=>setTimeout(r,100));
 }
 if(!armed) throw new Error("INTEGRATED_RESTART_WINDOW_NOT_OBSERVED");
}finally{await repo.close().catch(()=>undefined);}
