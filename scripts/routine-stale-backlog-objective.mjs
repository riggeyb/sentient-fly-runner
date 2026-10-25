const oid=process.env.OID,sid=process.env.SID,sha=process.env.SHA,tree=process.env.TREE;
const token=String(process.env.SENTIENT_API_TOKEN??"").trim();
if(!oid||!sid||!sha||!tree||!token) throw Error("BINDING_MISSING");
const base="http://127.0.0.1:8080",auth={authorization:`Bearer ${token}`};
const h=await (await fetch(base+"/healthz")).json();
if(h?.application?.identity?.source?.sha!==sha||h?.application?.identity?.source?.tree!==tree) throw Error("IDENTITY_MISMATCH");
const request=`Inspect the authoritative PostgreSQL coordination and spawn-continuation state for stale historical work left by prior Phase-5/certification activity. Current read-only evidence observed expired ACTIVE collaboration leases and many old spawn executions still marked reserved/running. Determine whether those records are reachable from any genuinely active current objective, EngineeringJob, continuation, recovery reference, retained lesson, promoted artifact, or other live authority; determine whether they currently impair admission, restart recovery, queue liveness, latency, or reliability; and produce an evidence-backed bounded remediation recommendation. This objective is operational hygiene, not certification. Read-only analysis only: do not mutate source, runtime configuration, Fly resources, HF artifacts, PostgreSQL records other than normal objective/evidence persistence, or Git history; do not create an EngineeringJob; do not deploy; do not train or run Phase-7. Distinguish historical inert residue from an actual current blocker. Prefer existing runtime/repository evidence and report concrete counts/identities and verification receipts where available.`;
const get=()=>fetch(base+"/v1/objectives/"+encodeURIComponent(oid),{headers:auth,signal:AbortSignal.timeout(30000)});
let r=await get();
if(r.status===404){
  let p;
  try{
    p=await fetch(base+"/v1/objectives",{method:"POST",headers:{...auth,"content-type":"application/json"},body:JSON.stringify({objectiveId:oid,sessionId:sid,mode:"auto",privacy:"private",deployOnSuccess:false,request}),signal:AbortSignal.timeout(120000)});
  }catch(e){
    const c=await get().catch(()=>null);
    if(!c||c.status!==200) throw e;
    console.log("OBJECTIVE_ACCEPTED_AFTER_TRANSPORT_AMBIGUITY=true");
  }
  if(p){
    const x=await p.json().catch(()=>({}));
    if(p.status!==202||x.objectiveId!==oid) throw Error("SUBMIT_"+p.status);
    console.log("OBJECTIVE_ACCEPTED=true");
  }
}else if(r.status===200) console.log("OBJECTIVE_ALREADY_EXISTS=true");
else throw Error("PRECHECK_"+r.status);
let state;
for(let i=0;i<300;i++){
  r=await get(); if(r.status!==200) throw Error("READ_"+r.status);
  state=await r.json();
  if(["succeeded","failed","cancelled"].includes(String(state.status))) break;
  await new Promise(x=>setTimeout(x,2000));
}
if(!state) throw Error("STATE_MISSING");
const scrub=(v,d=0)=>{if(d>7)return"[truncated]";if(v===null||typeof v==="boolean"||typeof v==="number")return v;if(typeof v==="string")return v.replace(/[\r\n\0]/g," ").slice(0,5000);if(Array.isArray(v))return v.slice(0,80).map(x=>scrub(x,d+1));if(typeof v!=="object")return String(v).slice(0,256);const o={};for(const[k,x]of Object.entries(v))o[k]=/(authorization|token|secret|password|credential|cookie|api[_-]?key)/i.test(k)?"[redacted]":scrub(x,d+1);return o};
console.log("OBJECTIVE_ID="+oid);
console.log("OBJECTIVE_STATUS="+String(state.status));
console.log("ACTIVE_ENGINEERING_JOB_ID="+String(state.activeEngineeringJobId??"none"));
console.log("OBJECTIVE_ERROR="+String(state.error??"none").replace(/[\r\n]/g," ").slice(0,1000));
console.log("OBJECTIVE_RESULT="+JSON.stringify(scrub(state.result)).slice(0,20000));
console.log("DEPLOY_ON_SUCCESS=false");
console.log("ACTIONS_CONTINUATION_ROLE=NONE");
console.log("PRIVATE_ACTIONS_BRIDGE_USED=false");
console.log("SECRET_VALUES_EXPOSED=false");
if(state.status!=="succeeded") throw Error("TERMINAL_"+String(state.status));
