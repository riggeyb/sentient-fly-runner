const ENDPOINT = "https://sentient-ops-mcp.fly.dev/mcp";
const PROTOCOL = "2026-07-28";
const OPS = new Set(["health","tools_list","fly_machines_list","fly_machine_get","engineering_create","engineering_get","public_probe"]);
const APPS = new Set(["sentient-deployment-governor","sentient-validation-runner"]);
const BRANCH = new Map([["riggeyb/sentient","sentient-production-composition-20261017"],["riggeyb/director-studio-beta","sentient-staging-v0"]]);
const REQUIRED = ["sentient.health","sentient.engineering.create_job","sentient.engineering.get_job","fly.machines.list","fly.machines.get"];
const PROBES = new Map([
  ["sentient_health","https://sentient-validation-runner.fly.dev/healthz"],
  ["sentient_ready","https://sentient-validation-runner.fly.dev/readyz"],
  ["governor_health","https://sentient-deployment-governor.fly.dev/healthz"],
  ["recovery_health","https://sentient-governor-recovery.fly.dev/healthz"],
  ["mcp_health","https://sentient-ops-mcp.fly.dev/healthz"],
  ["mcp_ready","https://sentient-ops-mcp.fly.dev/readyz"],
]);
let id = 1;
const token = String(process.env.MCP_CLIENT_TOKEN ?? "").trim();
if (!token) bad("MCP_CLIENT_TOKEN_MISSING");
const operation = String(process.env.OPERATION ?? "").trim();
if (!OPS.has(operation)) bad("UNKNOWN_OPERATION");
const args = parseArgs(process.env.ARGUMENTS ?? "{}");
validate(operation,args);
console.log(`OPERATION=${operation}`);

if (operation === "public_probe") {
  const url = PROBES.get(args.target);
  let res;
  try { res = await fetch(url,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(20000)}); }
  catch(e) { bad(`PUBLIC_PROBE_UNREACHABLE_${code(e)}`); }
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  console.log(`HTTP_STATUS=${res.status}`);
  console.log(`DATA=${safeJson(body)}`);
  if (res.status !== 200 && !(args.target === "sentient_ready" && res.status === 503)) bad(`PUBLIC_PROBE_HTTP_${res.status}`);
  console.log("PUBLIC_PROBE=PASS");
  console.log("RESULT=PASS");
  console.log("SECRET_VALUES_EXPOSED=false");
  process.exit(0);
}

const hello = await rpc("server/discover",{});
if (hello?.error) bad(`MCP_DISCOVER_${code(hello.error)}`);
console.log("MCP_AUTH=PASS");
console.log("MCP_HANDSHAKE=PASS");

if (operation === "health") {
  const r = await tool("sentient.health",{});
  ok("SENTIENT_HEALTH",r);
  console.log("SENTIENT_HEALTH=PASS");
  console.log(`DATA=${safeJson(value(r))}`);
} else if (operation === "tools_list") {
  const r = await rpc("tools/list",{});
  if (r?.error) bad(`TOOLS_LIST_${code(r.error)}`);
  const names = Array.isArray(r?.result?.tools) ? r.result.tools.map(x=>String(x?.name??"")).filter(Boolean).sort() : [];
  for (const name of REQUIRED) if (!names.includes(name)) bad(`REQUIRED_TOOL_MISSING_${name}`);
  console.log("TOOLS_DISCOVERY=PASS");
  for (const name of names) console.log(`TOOL=${clean(name,200)}`);
} else if (operation === "fly_machines_list") {
  const r = await tool("fly.machines.list",{app:args.app});
  ok("FLY_MACHINES_LIST",r);
  console.log("FLY_MACHINES_LIST=PASS");
  console.log(`DATA=${safeJson(value(r))}`);
} else if (operation === "fly_machine_get") {
  const r = await tool("fly.machines.get",{app:args.app,machineId:args.machineId});
  ok("FLY_MACHINE_GET",r);
  console.log("FLY_MACHINE_GET=PASS");
  console.log(`DATA=${safeJson(value(r))}`);
} else if (operation === "engineering_create") {
  const r = await tool("sentient.engineering.create_job",args);
  ok("ENGINEERING_CREATE",r);
  const v = value(r), jobId = find(v,"jobId");
  if (!jobId) bad("ENGINEERING_CREATE_JOB_ID_MISSING");
  console.log("ENGINEERING_CREATE=PASS");
  console.log(`JOB_ID=${clean(jobId,200)}`);
  console.log(`DATA=${safeJson(jobEvidence(v,false))}`);
} else if (operation === "engineering_get") {
  const r = await tool("sentient.engineering.get_job",{jobId:args.jobId});
  ok("ENGINEERING_GET",r);
  const v = value(r);
  console.log("ENGINEERING_GET=PASS");
  console.log(`JOB_ID=${clean(args.jobId,200)}`);
  console.log(`DATA=${safeJson(jobEvidence(v,true))}`);
}
console.log("RESULT=PASS");
console.log("SECRET_VALUES_EXPOSED=false");

function parseArgs(raw){let v;try{v=JSON.parse(String(raw))}catch{bad("ARGUMENTS_MALFORMED_JSON")}if(!plain(v))bad("ARGUMENTS_MUST_BE_OBJECT");return v}
function validate(op,v){
  if(op==="health"||op==="tools_list")return keys(v,[]);
  if(op==="public_probe"){keys(v,["target"]);if(typeof v.target!=="string"||!PROBES.has(v.target))bad("PUBLIC_PROBE_TARGET_NOT_ALLOWED");return}
  if(op==="fly_machines_list"){keys(v,["app"]);app(v.app);return}
  if(op==="fly_machine_get"){keys(v,["app","machineId"]);app(v.app);if(typeof v.machineId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(v.machineId))bad("MACHINE_ID_INVALID");return}
  if(op==="engineering_get"){keys(v,["jobId"]);if(typeof v.jobId!=="string"||!/^[A-Za-z0-9._:-]{1,200}$/.test(v.jobId))bad("JOB_ID_INVALID");return}
  if(op==="engineering_create")return job(v);bad("UNKNOWN_OPERATION")
}
function app(v){if(typeof v!=="string"||!APPS.has(v))bad("FLY_APP_NOT_ALLOWLISTED")}
function job(v){
  keys(v,["repo","branch","expectedHead","objective","commands","commitMessage","timeoutMs"]);
  const b=BRANCH.get(v.repo);if(!b)bad("ENGINEERING_REPO_NOT_ALLOWED");
  if(v.branch==="main"||v.branch==="master"||v.branch!==b)bad("ENGINEERING_BRANCH_NOT_ALLOWED");
  if(typeof v.expectedHead!=="string"||!/^[0-9a-f]{40}$/.test(v.expectedHead))bad("ENGINEERING_EXPECTED_HEAD_INVALID");
  if(typeof v.objective!=="string"||v.objective.length<1||v.objective.length>4096)bad("ENGINEERING_OBJECTIVE_INVALID");
  if(!Array.isArray(v.commands)||v.commands.length<1||v.commands.length>32)bad("ENGINEERING_COMMANDS_INVALID");
  if(typeof v.commitMessage!=="string"||v.commitMessage.length<1||v.commitMessage.length>240||/[\r\n]/.test(v.commitMessage))bad("ENGINEERING_COMMIT_MESSAGE_INVALID");
  if(!num(v.timeoutMs,5000,1800000))bad("ENGINEERING_TIMEOUT_INVALID");
  let budget=0;
  for(const c of v.commands){
    if(!plain(c))bad("ENGINEERING_COMMAND_INVALID");keys(c,["name","category","command","args","timeoutMs"]);
    if(typeof c.name!=="string"||!c.name)bad("ENGINEERING_COMMAND_NAME_INVALID");
    if(!["inspect","edit","build","test","shell"].includes(c.category))bad("ENGINEERING_COMMAND_CATEGORY_INVALID");
    if(typeof c.command!=="string"||!/^[A-Za-z0-9._/+:-]{1,160}$/.test(c.command))bad("ENGINEERING_COMMAND_EXECUTABLE_INVALID");
    if(!Array.isArray(c.args)||c.args.length>64||c.args.some(x=>typeof x!=="string"||x.length>8192))bad("ENGINEERING_COMMAND_ARGS_INVALID");
    if(!num(c.timeoutMs,1000,600000))bad("ENGINEERING_COMMAND_TIMEOUT_INVALID");budget+=c.timeoutMs;
  }
  if(budget>v.timeoutMs)bad("ENGINEERING_COMMAND_BUDGET_EXCEEDS_JOB_TIMEOUT");
}
function keys(v,want){const a=Object.keys(v).sort(),b=[...want].sort();if(a.length!==b.length||a.some((x,i)=>x!==b[i]))bad("ARGUMENT_KEYS_INVALID")}
async function tool(name,argumentsValue){return rpc("tools/call",{name,arguments:argumentsValue},name)}
async function rpc(method,params,name=null){
  const headers={authorization:`Bearer ${token}`,accept:"application/json, text/event-stream","content-type":"application/json","mcp-protocol-version":PROTOCOL,"mcp-method":method};if(name)headers["mcp-name"]=name;
  let res;try{res=await fetch(ENDPOINT,{method:"POST",headers,redirect:"manual",signal:AbortSignal.timeout(30000),body:JSON.stringify({jsonrpc:"2.0",id:id++,method,params:{...params,_meta:{"io.modelcontextprotocol/protocolVersion":PROTOCOL,"io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{name:"sentient-public-fly-runner",version:"1.1.0"}}}})})}catch(e){bad(`MCP_UNREACHABLE_${code(e)}`)}
  if(res.status===401||res.status===403)bad("MCP_AUTH_FAILED");if(res.status>=300&&res.status<400)bad("MCP_REDIRECT_REJECTED");
  const parsed=parse(await res.text());if(!res.ok&&!parsed?.error)bad(`MCP_HTTP_${res.status}`);return parsed
}
function parse(text){const t=String(text??"").trim();if(!t)bad("MCP_EMPTY_RESPONSE");if(t.startsWith("{")){try{return JSON.parse(t)}catch{bad("MCP_JSON_INVALID")}}const lines=t.split(/\r?\n/).filter(x=>x.startsWith("data:")).map(x=>x.slice(5).trim()).filter(Boolean);if(!lines.length)bad("MCP_RESPONSE_UNPARSEABLE");try{return JSON.parse(lines.at(-1))}catch{bad("MCP_SSE_JSON_INVALID")}}
function value(r){return r?.result?.structuredContent??r?.result??null}
function ok(label,r){
  if(r?.error)bad(`${label}_RPC_${code(r.error)}`);const v=value(r);
  if(r?.result?.isError){console.log(`ERROR_DATA=${safeJson(v)}`);bad(`${label}_TOOL_${code(v?.error??v?.body?.error??"REJECTED")}`)}
  if(v&&typeof v==="object"&&v.ok===false){console.log(`ERROR_DATA=${safeJson(v)}`);bad(`${label}_UPSTREAM_${code(v.error??v.body?.error??v.status??"FAILED")}`)}
}
function jobEvidence(v,includeSteps){
  const root=findRecord(v,x=>typeof x.jobId==="string"&&typeof x.status==="string")??{};
  const allow=["contract","jobId","repo","branch","expectedHead","objective","status","startSha","startTree","startedAt","workerMachineId","buildResult","endSha","endTree","changedFiles","testResult","pushResult","deployResult","healthz","readyz","errorCode","createdAt","completedAt"];
  const out={};for(const k of allow)if(k in root)out[k]=root[k];
  if(includeSteps&&Array.isArray(root.steps))out.steps=root.steps.slice(0,100).map(s=>plain(s)?({name:s.name??null,category:s.category??null,command:s.command??null,exitCode:s.exitCode??null,stdoutTruncated:s.stdoutTruncated??null,stderrTruncated:s.stderrTruncated??null,termination:s.termination??null,spawnError:s.spawnError??null,startedAt:s.startedAt??null,endedAt:s.endedAt??null}):null).filter(Boolean);
  return out
}
function findRecord(v,pred){const q=[v],seen=new Set();while(q.length){const x=q.shift();if(!x||typeof x!=="object"||seen.has(x))continue;seen.add(x);if(!Array.isArray(x)&&pred(x))return x;for(const y of Array.isArray(x)?x:Object.values(x))q.push(y)}return null}
function find(v,key){const r=findRecord(v,x=>typeof x[key]==="string"&&x[key]);return r?r[key]:null}
function safeJson(v){return JSON.stringify(scrub(v))}
function scrub(v,d=0){if(d>8)return"[truncated]";if(v===null||typeof v==="boolean"||typeof v==="number")return v;if(typeof v==="string")return clean(v,2048);if(Array.isArray(v))return v.slice(0,100).map(x=>scrub(x,d+1));if(!plain(v))return clean(String(v),256);const o={};for(const[k,x]of Object.entries(v))o[k]=/(authorization|token|secret|password|credential|cookie|api[_-]?key)/i.test(k)?"[redacted]":scrub(x,d+1);return o}
function clean(v,n){return String(v).replace(/[\r\n\0]/g," ").slice(0,n)}
function code(v){return clean(plain(v)?v.code??v.message??"unknown":v??"unknown",160).replace(/[^A-Za-z0-9_.:-]/g,"_")}
function plain(v){return v!==null&&typeof v==="object"&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)}
function num(v,a,b){return Number.isInteger(v)&&v>=a&&v<=b}
function bad(v){throw new Error(clean(v,240).replace(/[^A-Za-z0-9_.:-]/g,"_"))}
