const cp=require("node:child_process");
const raw=cp.execFileSync(process.execPath,["scripts/capability-tier-hardening-rev6-build-request.cjs"],{encoding:"utf8"});
const request=JSON.parse(raw);
const i=request.commands.findIndex((c)=>c?.name==="compat-job2");
if(i<0)throw new Error("REV8_COMPAT_JOB2_MISSING");
const fix={
  name:"compat-valid-spawn-tier-fixture",
  category:"edit",
  command:"node",
  args:["-e",String.raw`const fs=require("node:fs");
const p="test/capability-tier-authority.test.ts";
let s=fs.readFileSync(p,"utf8");
const from='skills:{exactSkillIds:[],selectionPolicy:null},tools:[],scopes,budgets:budgets(),';
const to='skills:{exactSkillIds:["fixture-skill"],selectionPolicy:null},tools:[],scopes,budgets:budgets(),';
const n=s.split(from).length-1;
if(n!==1)throw new Error("REV8_EXPECTED_SINGLE_INVALID_SKILL_FIXTURE:"+n);
fs.writeFileSync(p,s.replace(from,to));`],
  timeoutMs:30000
};
request.commands.splice(i+1,0,fix);
const sum=request.commands.reduce((n,c)=>n+c.timeoutMs,0);
request.timeoutMs=Math.max(request.timeoutMs,sum+60000);
if(request.timeoutMs>1800000)throw new Error("REV8_TIMEOUT_BUDGET_EXCEEDED");
request.objective="SENTIENT_CAPABILITY_TIER_AND_AUTHORITY_ENFORCEMENT_V1 rev8: unchanged rev6 capability-tier hardening plus one test-fixture correction so the TIER_1 parent/TIER_2 child case is a valid Spawn request and reaches software tier evaluation. Explicit external user authorization applies only to this bootstrap. No deploy, resize, paid compute, secret exposure, certification mutation, or policy-code change beyond the verified rev6 payload.";
process.stdout.write(JSON.stringify(request));
