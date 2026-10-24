import {PostgresSpawnObjectiveRepository} from "/app/dist/src/objective-continuation/postgres-spawn-repository.js";
const oid=String(process.env.CERT_OBJECTIVE_ID??"").trim();
const sid=String(process.env.CERT_SESSION_ID??"").trim();
const db=String(process.env.DATABASE_URL??process.env.DIRECT_URL??"").trim();
if(!oid||!sid||!db) throw new Error("CERT_ARM_BINDING_MISSING");
const repo=new PostgresSpawnObjectiveRepository({connectionString:db});
try{
  const task=await repo.get("task",oid);
  const root=await repo.getObjectiveContinuation(oid);
  const satisfied=(root?.evidenceDependencies??[]).filter(d=>d.status==="SATISFIED").length;
  const works=(await repo.activeWork(sid,true)).filter(w=>w.objectiveId.startsWith(`${oid}:`)&&w.workKey==="independent-analysis"&&w.status==="ACTIVE");
  const spawn=await repo.spawnSnapshot();
  let armed=false;
  for(const work of works){
    const child=spawn.records.executions.find(e=>e.requestId===work.participantId&&["reserved","running"].includes(e.identity.status)&&e.reservationReconciled===false);
    if(child&&satisfied>=2){
      console.log("INTEGRATED_ARM_JSON="+JSON.stringify({workId:work.workId,participantId:work.participantId,childId:child.id,rootRevision:root?.revision??null,satisfied}));
      console.log("INTEGRATED_RESTART_ARMED=PASS");
      console.log("SECRET_VALUES_EXPOSED=false");
      armed=true;
      break;
    }
  }
  if(!armed){
    console.log("INTEGRATED_ARM_READY=false");
    console.log("INTEGRATED_ARM_STATE="+JSON.stringify({
      taskStatus:task?.kind==="task"?task.status:null,
      rootRevision:root?.revision??null,
      satisfied,
      activeAnalysisWork:works.length,
      spawnAnalysisChildren:spawn.records.executions.filter(e=>e.identity.taskId.startsWith(`${oid}:`)&&e.identity.role==="independent-analysis").length
    }));
    console.log("SECRET_VALUES_EXPOSED=false");
    process.exitCode=3;
  }
}finally{
  await repo.close().catch(()=>undefined);
}
