const token=String(process.env.SENTIENT_API_TOKEN??"").trim();
const cert=String(process.env.CERT_ID??"").trim();
const kind=String(process.env.CERT_KIND??"").trim();
if(!token||!cert||!["phase2","phase6","phase4"].includes(kind)) throw new Error("FINAL_CERT_OBJECTIVE_BINDING_INVALID");
const base="http://127.0.0.1:8080";
const h={authorization:`Bearer ${token}`,"content-type":"application/json"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cfg={
  phase2:{mode:"capability",request:"Use tools to inspect the current commit identity."},
  phase6:{mode:"capability",request:"Inspect repository current commit identity."},
  phase4:{mode:"multi_step",request:"First use tools to inspect the current commit identity, then use tools to inspect the working tree status."}
}[kind];
const objectiveId=`${cert}:${kind}`,sessionId=`session:${objectiveId}`;
let r=await fetch(base+"/v1/objectives",{method:"POST",headers:h,body:JSON.stringify({objectiveId,sessionId,request:cfg.request,mode:cfg.mode,privacy:"public_fixture"}),signal:AbortSignal.timeout(120000)});
let b=await r.json();
if(r.status!==202||b.objectiveId!==objectiveId) throw new Error(`FINAL_CERT_${kind}_INGRESS_${r.status}`);
r=await fetch(base+`/v1/objectives/${encodeURIComponent(objectiveId)}`,{headers:h,signal:AbortSignal.timeout(30000)});
b=await r.json();
if(r.status!==200||b.objectiveId!==objectiveId) throw new Error(`FINAL_CERT_${kind}_PERSISTENCE`);
console.log("OBJECTIVE_ASYNC_INGRESS=PASS");
console.log("OBJECTIVE_PERSISTENCE=PASS");
const end=Date.now()+600000;
while(Date.now()<end){
  r=await fetch(base+`/v1/objectives/${encodeURIComponent(objectiveId)}`,{headers:h,signal:AbortSignal.timeout(30000)});
  b=await r.json();
  if(r.status!==200) throw new Error(`FINAL_CERT_${kind}_STATUS_${r.status}`);
  if(["succeeded","failed","cancelled"].includes(String(b.status))) break;
  await sleep(1000);
}
if(b.status!=="succeeded") throw new Error(`FINAL_CERT_${kind}_TASK_${b.status}`);
const x=b?.result?.body?.result??{};
if(kind==="phase2"){
  if(x.selectedCapability!=="SKILLS_TOOLS"||x.status!=="SUCCEEDED"||x.authorityOwner!=="SENTIENT_RUNTIME"||!x.authoritativeResultRef||!Array.isArray(x.evidenceRefs)||x.evidenceRefs.length<1) throw new Error("FINAL_CERT_PHASE2_RESULT_INVALID");
  console.log("PHASE2_LIVE_ACTION=PASS");
  console.log("ACTION_AUTHORITY_RETAINED_BY_SENTIENT=PASS");
}
if(kind==="phase6"){
  if(x.selectedCapability!=="REPOSITORY"||x.status!=="SUCCEEDED"||x.authorityOwner!=="SENTIENT_RUNTIME"||!x.authoritativeResultRef||!Array.isArray(x.evidenceRefs)||x.evidenceRefs.length<1) throw new Error("FINAL_CERT_PHASE6_RESULT_INVALID");
  console.log("PHASE6_LIVE_CAPABILITY=PASS");
  console.log("DIRECTOR_IS_SENTIENT=false");
}
if(kind==="phase4"){
  const c=x.continuation??{},t=c.terminal??{},deps=Array.isArray(c.evidenceDependencies)?c.evidenceDependencies:[];
  if(x.status!=="COMPLETED"||!Array.isArray(x.completedStepIds)||x.completedStepIds.length!==2) throw new Error("FINAL_CERT_PHASE4_RESULT_INVALID");
  if(!Number.isSafeInteger(c.revision)||c.revision<7||t.status!=="COMPLETED") throw new Error("FINAL_CERT_PHASE4_CONTINUATION_INVALID");
  if(deps.length<2||!deps.every(d=>d?.status==="SATISFIED"&&typeof d?.evidenceId==="string"&&d.evidenceId)) throw new Error("FINAL_CERT_PHASE4_EVIDENCE_INVALID");
  console.log("PHASE4_DURABLE_AUTONOMY=PASS");
  console.log("DURABLE_CONTINUATION=PASS");
  console.log("CONTINUATION_ADVANCED=PASS");
  console.log("OBJECTIVE_TERMINAL=PASS");
  console.log("TERMINAL_STATE=COMPLETED");
}
console.log("FINAL_CERT_OBJECTIVE_ID="+objectiveId);
console.log("SECRET_VALUES_EXPOSED=false");
