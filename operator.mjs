const MCP = "https://sentient-ops-mcp.fly.dev/mcp";
const PROTOCOL_VERSION = "2026-07-28";
const OPS = new Set(["health","tools_list","fly_machines_list","fly_machine_get","engineering_create","engineering_get"]);
const token = process.env.MCP_CLIENT_TOKEN;
const op = String(process.env.OPERATION ?? "").trim();
let seq = 1;

if (!token) die("MCP_CLIENT_TOKEN_MISSING");
if (!OPS.has(op)) die("UNKNOWN_OPERATION");

let args;
try { args = JSON.parse(process.env.ARGUMENTS ?? "{}"); }
catch { die("ARGUMENTS_MALFORMED_JSON"); }
if (!obj(args)) die("ARGUMENTS_MUST_BE_OBJECT");

await okRpc("MCP_HANDSHAKE", await rpc("server/discover", {}));
console.log("MCP_AUTH=PASS");

if (op === "health") {
  exact(args, []);
  await okTool("SENTIENT_HEALTH", await tool("sentient.health", {}));
  console.log("OPERATION=health\nRESULT=PASS\nSENTIENT_HEALTH=PASS");
} else if (op === "tools_list") {
  exact(args, []);
  const r = await rpc("tools/list", {});
  await okRpc("TOOLS_LIST", r);
  const names = (r?.result?.tools ?? []).map(x => String(x?.name ?? "")).filter(Boolean).sort();
  for (const n of ["sentient.health","sentient.engineering.create_job","sentient.engineering.get_job","fly.machines.list","fly.machines.get"]) {
    if (!names.includes(n)) die(`REQUIRED_TOOL_MISSING_${n}`);
  }
  console.log("OPERATION=tools_list\nRESULT=PASS\nTOOLS_DISCOVERY=PASS");
  console.log(`TOOLS=${names.join(",")}`);
} else if (op === "fly_machines_list") {
  exact(args, ["app"]); str(args.app,"app",/^[A-Za-z0-9._-]{1,128}$/);
  const r = await tool("fly.machines.list",{app:args.app}); await okTool("FLY_MACHINES_LIST",r);
  console.log("OPERATION=fly_machines_list\nRESULT=PASS\nFLY_OBSERVATION=PASS");
  console.log(`APP=${clean(args.app)}`); console.log(`MACHINES=${JSON.stringify(machineSummaries(structured(r)))}`);
} else if (op === "fly_machine_get") {
  exact(args, ["app","machineId"]); str(args.app,"app",/^[A-Za-z0-9._-]{1,128}$/); str(args.machineId,"machineId",/^[A-Za-z0-9_-]{1,128}$/);
  const r = await tool("fly.machines.get",{app:args.app,machineId:args.machineId}); await okTool("FLY_MACHINE_GET",r);
  console.log("OPERATION=fly_machine_get\nRESULT=PASS\nFLY_OBSERVATION=PASS");
  console.log(`APP=${clean(args.app)}`); console.log(`MACHINE=${JSON.stringify(machineSummaries(structured(r))[0] ?? {id:args.machineId})}`);
} else if (op === "engineering_create") {
  validateCreate(args);
  const r = await tool("sentient.engineering.create_job",args);
  if (r?.error || r?.result?.isError) {
    console.log("OPERATION=engineering_create\nRESULT=REJECTED\nINVALID_JOB_REJECTED=PASS");
    process.exitCode = 2;
  } else {
    await okTool("ENGINEERING_CREATE",r);
    const jobId = findString(structured(r),"jobId"); if (!jobId) die("ENGINEERING_JOB_ID_MISSING");
    console.log("OPERATION=engineering_create\nRESULT=PASS\nREAL_JOB_CREATE=PASS"); console.log(`REAL_JOB_ID=${clean(jobId)}`);
  }
} else if (op === "engineering_get") {
  exact(args,["jobId"]); str(args.jobId,"jobId",/^[A-Za-z0-9._:-]{1,200}$/);
  const r = await tool("sentient.engineering.get_job",{jobId:args.jobId}); await okTool("ENGINEERING_GET",r);
  const job = findRecord(structured(r),x=>String(x.jobId??"")===args.jobId && typeof x.status==="string");
  if (!job) die("ENGINEERING_JOB_RECORD_MISSING");
  console.log("OPERATION=engineering_get\nRESULT=PASS\nREAL_JOB_GET=PASS");
  for (const k of ["jobId","status","endSha","endTree","errorCode"]) console.log(`${k.toUpperCase()}=${clean(job[k])}`);
}

async function tool(name,a){ return rpc("tools/call",{name,arguments:a},name); }
async function rpc(method,params,name=null){
  const body={jsonrpc:"2.0",id:seq++,method,params:{...params,_meta:{
    "io.modelcontextprotocol/protocolVersion":PROTOCOL_VERSION,
    "io.modelcontextprotocol/clientCapabilities":{},
    "io.modelcontextprotocol/clientInfo":{name:"sentient-public-fly-runner",version:"1.0.0"}
  }}};
  const headers={authorization:`Bearer ${token}`,accept:"application/json, text/event-stream","content-type":"application/json","mcp-protocol-version":PROTOCOL_VERSION,"mcp-method":method};
  if(name) headers["mcp-name"]=name;
  const res=await fetch(MCP,{method:"POST",headers,body:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(30000)});
  const text=await res.text(), parsed=parse(text);
  if(!res.ok && !parsed?.error) die(`MCP_HTTP_${res.status}`);
  return parsed;
}
function parse(text){
  const s=String(text??"").trim(); if(!s) die("MCP_EMPTY_RESPONSE");
  if(s.startsWith("{")){ try{return JSON.parse(s)}catch{die("MCP_INVALID_JSON")} }
  const ds=s.split(/\r?\n/).filter(x=>x.startsWith("data:")).map(x=>x.slice(5).trim()).filter(Boolean);
  if(!ds.length) die("MCP_RESPONSE_UNPARSEABLE");
  try{return JSON.parse(ds.at(-1))}catch{die("MCP_INVALID_JSON")}
}
async function okRpc(label,r){ if(r?.error) die(`${label}_RPC_${code(r.error.code??r.error.message)}`); }
async function okTool(label,r){
  await okRpc(label,r); if(r?.result?.isError) die(`${label}_TOOL_ERROR`);
  const u=findRecord(structured(r),x=>typeof x.ok==="boolean"&&"status" in x);
  if(u&&u.ok===false) die(`${label}_UPSTREAM_${code(u.status)}`);
}
function structured(r){return r?.result?.structuredContent??r?.result??null}
function validateCreate(x){
  exact(x,["repo","branch","expectedHead","objective","commands","commitMessage","timeoutMs"]);
  str(x.repo,"repo",/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/); str(x.branch,"branch",/^[A-Za-z0-9._/-]{1,160}$/);
  if(x.branch==="main"||x.branch==="master") die("ENGINEERING_BRANCH_NOT_ALLOWED");
  str(x.expectedHead,"expectedHead",/^[0-9a-f]{40}$/);
  bounded(x.objective,"objective",1,4096); bounded(x.commitMessage,"commitMessage",1,240); if(/[\r\n]/.test(x.commitMessage)) die("COMMIT_MESSAGE_INVALID");
  integer(x.timeoutMs,"timeoutMs",5000,1800000);
  if(!Array.isArray(x.commands)||x.commands.length<1||x.commands.length>32) die("COMMANDS_INVALID");
  let budget=0;
  for(const c of x.commands){
    if(!obj(c)) die("COMMAND_INVALID"); exact(c,["name","category","command","args","timeoutMs"]);
    bounded(c.name,"command_name",1,512); if(!["inspect","edit","build","test","shell"].includes(c.category)) die("COMMAND_CATEGORY_INVALID");
    str(c.command,"command",/^[A-Za-z0-9._/+:-]{1,160}$/);
    if(!Array.isArray(c.args)||c.args.length>64||c.args.some(a=>typeof a!=="string"||a.length>8192)) die("COMMAND_ARGS_INVALID");
    integer(c.timeoutMs,"command_timeout",1000,600000); budget+=c.timeoutMs;
  }
  if(budget>x.timeoutMs) die("COMMAND_BUDGET_EXCEEDS_TIMEOUT");
}
function exact(x,ks){const a=Object.keys(x).sort(),b=[...ks].sort(); if(a.length!==b.length||a.some((k,i)=>k!==b[i])) die("ARGUMENT_KEYS_NOT_ALLOWED")}
function obj(x){return x!==null&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype}
function str(v,l,r){if(typeof v!=="string"||!r.test(v))die(`${l.toUpperCase()}_INVALID`)}
function bounded(v,l,min,max){if(typeof v!=="string"||v.length<min||v.length>max)die(`${l.toUpperCase()}_INVALID`)}
function integer(v,l,min,max){if(!Number.isInteger(v)||v<min||v>max)die(`${l.toUpperCase()}_INVALID`)}
function findRecord(v,p){const q=[v],seen=new Set();while(q.length){const c=q.shift();if(!c||typeof c!=="object"||seen.has(c))continue;seen.add(c);if(Array.isArray(c)){q.push(...c);continue}if(p(c))return c;q.push(...Object.values(c))}return null}
function findString(v,k){const r=findRecord(v,x=>typeof x[k]==="string"&&x[k]);return r?r[k]:null}
function machineSummaries(v){const out=[],q=[v],seen=new Set();while(q.length&&out.length<50){const c=q.shift();if(!c||typeof c!=="object"||seen.has(c))continue;seen.add(c);if(Array.isArray(c)){q.push(...c);continue}if(typeof c.id==="string"&&typeof c.state==="string"){const m={id:c.id,state:c.state};if(typeof c.name==="string")m.name=c.name;if(typeof c.region==="string")m.region=c.region;out.push(m)}q.push(...Object.values(c))}return out}
function clean(v){return v==null?"":String(v).replace(/[\r\n]/g," ").replace(/[^\x20-\x7E]/g,"").slice(0,256)}
function code(v){return clean(v).replace(/[^A-Za-z0-9_.:-]/g,"_").slice(0,160)||"unknown"}
function die(c){console.error(`ERROR=${code(c)}`);process.exit(1)}
