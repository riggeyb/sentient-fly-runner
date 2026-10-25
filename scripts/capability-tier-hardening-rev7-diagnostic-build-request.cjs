const cp=require("node:child_process");
const raw=cp.execFileSync(process.execPath,["scripts/capability-tier-hardening-rev6-build-request.cjs"],{encoding:"utf8"});
const request=JSON.parse(raw);
const i=request.commands.findIndex((c)=>c?.name==="compat-job2");
if(i<0)throw new Error("REV7_COMPAT_JOB2_MISSING");
const inspect={
  name:"inspect-spawn-tier-diagnostic",
 category:"inspect",
 command:"bash",
  args:["-lc",["pecho '=== POLICY ==='","grep -n -C 18 -e 'capability_tier_escalation' -e 'maxCapabilityTier' -e 'requiredCapabilityTier' src/spawn/policy.ts src/spawn/policy-types.ts src/spawn/execution-contracts.ts src/spawn/policy-budgets.ts || true","echo '=== TEST='","grep -n -C 35 'Spawn child cannot exceed parent capability tier' test/capability-tier-authority.test.ts || true"].join(";")],
 timeoutMs:30000
};
const stop={name:"diagnostic-stop",category:"test",command:"node",args:["-e","console.error('CAPABILITY_TIER_DIAGNOSTIC_STOP');process.exit(1)"],timeoutMs:30000};
request.commands.splice(i+1,0,inspect,stop);
request.objective="SENTIENT_CAPABILITY_TIER_AND_AUTHORITY_ENFORCEMENT_V1 diagnostic rev7: apply exact rev6 patch in isolated worker, print only spawn tier enforcement and failing test fixture, then intentionally stop before commit/push. No source push, deploy, resize, paid compute, secret exposure, or certification mutation.";
process.stdout.write(JSON.stringify(request));
