const request = {
  repo: "riggeyb/sentient",
  branch: "sentient-production-composition-20261017",
  expectedHead: "fdab101aeef2275a3f9333384d6e8445799366a3",
  expectedTree: "c06b0c927efbfdd0cdfa2fc2ae1c8f6c26f2b11e",
  objectiveId: "SENTIENT_ROUTINE_LOCAL_RUNTIME_STARTUP_BUDGET_RELIABILITY_V1",
  actionId: "local-runtime-startup-budget-v1",
  authorizedPaths: [
    "src/local-runtime/lab-support.ts",
    "src/local-runtime/demo.ts"
  ],
  authorizationIdentity: "sentient:objective:SENTIENT_ROUTINE_LOCAL_RUNTIME_STARTUP_BUDGET_RELIABILITY_V1",
  authorizationReason: "Routine bounded reliability repair for a verified N0 physical-runtime registration timeout. Preserve the existing default timeout and apply a larger explicit budget only to N0 physical-demo registration. No deployment, authority change, resource increase, paid compute, learning, or certification mutation.",
  policyVersion: "sentient-capability-tier/v1",
  idempotencyKey: "local-runtime-startup-budget-fdab101a-v1",
  objective: "Make waitRegistered accept an explicit timeout while preserving its 14-second default, and give only runN0Demo registration/re-registration calls a 30-second budget. Validate build, diff, and three consecutive focused local-runtime test runs. No deployment.",
  commands: [
    {name:"install",category:"build",command:"npm",args:["ci","--ignore-scripts","--no-audit","--no-fund"],timeoutMs:240000},
    {name:"prebuild",category:"build",command:"npm",args:["run","build"],timeoutMs:240000},
    {name:"edit-wait-registered",category:"edit",command:"node",args:["-e", String.raw`
const fs=require("node:fs");
const p="src/local-runtime/lab-support.ts";
let s=fs.readFileSync(p,"utf8");
const sig=/export async function waitRegistered\(\n  runtimeDir: string,\n  minimum: number,\n  supervisor\?: SupervisorHandle,\n\): Promise<void> \{/;
if(!sig.test(s)) throw new Error("wait_registered_signature_anchor_missing");
s=s.replace(sig, 'export async function waitRegistered(\n  runtimeDir: string,\n  minimum: number,\n  supervisor?: SupervisorHandle,\n  timeoutMs = 14_000,\n): Promise<void> {');
const start=s.indexOf("export async function waitRegistered(");
const end=s.indexOf("\n}\n\nexport function liveWorkerPids", start);
if(start<0||end<0) throw new Error("wait_registered_body_anchor_missing");
const before=s.slice(0,start), body=s.slice(start,end), after=s.slice(end);
const needle="    14_000,\n    supervisor,\n  );";
const count=body.split(needle).length-1;
if(count!==1) throw new Error("wait_registered_timeout_anchor_count:"+count);
s=before+body.replace(needle,"    timeoutMs,\n    supervisor,\n  );")+after;
fs.writeFileSync(p,s);
`],timeoutMs:30000},
    {name:"edit-n0-budget",category:"edit",command:"node",args:["-e", String.raw`
const fs=require("node:fs");
const p="src/local-runtime/demo.ts";
let s=fs.readFileSync(p,"utf8");
const marker="export interface N0DemoResult {";
const markerPos=s.indexOf(marker);
if(markerPos<0) throw new Error("n0_result_anchor_missing");
const close=s.indexOf("\n}\n",markerPos);
if(close<0) throw new Error("n0_result_close_missing");
const insertAt=close+3;
const constant="\nconst N0_REGISTRATION_TIMEOUT_MS = 30_000;\n";
if(s.includes("N0_REGISTRATION_TIMEOUT_MS")) throw new Error("n0_budget_constant_already_present");
s=s.slice(0,insertAt)+constant+s.slice(insertAt);
const runStart=s.indexOf("export async function runN0Demo()");
const mainStart=s.indexOf("\nasync function main()",runStart);
if(runStart<0||mainStart<0) throw new Error("run_n0_demo_anchor_missing");
const before=s.slice(0,runStart), body=s.slice(runStart,mainStart), after=s.slice(mainStart);
const needle="await waitRegistered(runtimeDir, LSR_MAX_CHILDREN + 1, supervisor);";
const count=body.split(needle).length-1;
if(count!==3) throw new Error("run_n0_registration_call_count:"+count);
const repl="await waitRegistered(runtimeDir, LSR_MAX_CHILDREN + 1, supervisor, N0_REGISTRATION_TIMEOUT_MS);";
s=before+body.split(needle).join(repl)+after;
fs.writeFileSync(p,s);
`],timeoutMs:30000},
    {name:"postbuild",category:"build",command:"npm",args:["run","build"],timeoutMs:240000},
    {name:"diff-check",category:"test",command:"git",args:["diff","--check"],timeoutMs:30000},
    {name:"focused-local-runtime-x3",category:"test",command:"node",args:["-e", String.raw`
const {spawnSync}=require("node:child_process");
for(let i=1;i<=3;i++){
  const r=spawnSync(process.execPath,["--test","dist/test/local-runtime.test.js"],{encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024,env:process.env});
  if(r.status!==0||r.error){
    process.stdout.write((r.stdout||"").slice(-12000));
    process.stderr.write((r.stderr||"").slice(-12000));
    throw new Error("focused_local_runtime_iteration_failed:"+i+":"+(r.error?.message||r.status));
  }
  console.log("FOCUSED_LOCAL_RUNTIME_ITERATION_"+i+"=PASS");
}
`],timeoutMs:600000}
  ],
  commitMessage: "fix: stabilize N0 local runtime startup budget",
  timeoutMs: 1800000
};
process.stdout.write(JSON.stringify(request));
