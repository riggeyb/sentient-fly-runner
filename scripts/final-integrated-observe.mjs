import {PostgresSpawnObjectiveRepository} from "/app/dist/src/objective-continuation/postgres-spawn-repository.js";
const oid=process.env.CERT_OBJECTIVE_ID,sid=process.env.CERT_SESSION_ID,workId=process.env.CERT_WORK_ID,oldParticipant=process.env.CERT_PARTICIPANT_ID,childId=process.env.CERT_CHILD_ID;
const preRevision=Number(process.env.CERT_PRE_REVISION),db=String(process.env.DATABASE_URL??process.env.DIRECT_URL??"").trim();
if(!db||!oid||!sid||!workId||!oldParticipant||!childId||!Number.isFinite(preRevision)) throw new Error("CERT_OBSERVER_BINDING_MISSING");
const repo=new PostgresSpawnObjectiveRepository({connectionString:db});
try{
 const task=await repo.get("task",oid),root=await repo.getObjectiveContinuation(oid),snap=await repo.snapshot(),spawn=await repo.spawnSnapshot();
 const work=(snap.collaborationActiveWork?.records??[]).find(w=>w.workId===workId);
 const analyses=spawn.records.executions.filter(e=>e.identity.taskId.startsWith(`${oid}:`)&&e.identity.role==="independent-analysis");
 const old=spawn.records.executions.find(e=>e.id===childId);
 const terminalTask=task?.kind==="task"&&["succeeded","failed","cancelled"].includes(task.status);
 const terminalRoot=Boolean(root?.terminal),satisfied=(root?.evidenceDependencies??[]).filter(d=>d.status==="SATISFIED").length;
 const recovered=Boolean(work&&work.workId===workId&&work.reclaimCount===1&&work.participantId!==oldParticipant);
 const oldReconciled=old?.identity.status==="timed_out"&&old?.reservationReconciled===true;
 const noDuplicate=analyses.length===2&&new Set(analyses.map(e=>e.id)).size===2;
 const passed=Boolean(terminalTask&&terminalRoot&&root.revision>preRevision&&satisfied>=2&&work&&["COMPLETED","ABANDONED"].includes(work.status)&&recovered&&oldReconciled&&noDuplicate);
 console.log("INTEGRATED_OBSERVATION="+JSON.stringify({taskStatus:task?.kind==="task"?task.status:null,terminalState:root?.terminal?.status??null,rootRevision:root?.revision??null,satisfied,workStatus:work?.status??null,reclaimCount:work?.reclaimCount??null,sameWorkId:work?.workId===workId,participantRotated:work?.participantId!==oldParticipant,oldChildStatus:old?.identity.status??null,oldReservationReconciled:old?.reservationReconciled??null,analysisCount:analyses.length,passed}));
 console.log("INTEGRATED_OBSERVATION_PASS="+String(passed));
}finally{await repo.close().catch(()=>undefined);}
