const fs=require("node:fs");
const base="scripts/capability-tier-hardening-v1";
const parts=[0,1,2,3].map(i=>fs.readFileSync(`${base}/part-${String(i).padStart(2,"0")}`));
const commands=[
  {name:"install",category:"shell",command:"npm",args:["ci","--ignore-scripts"],timeoutMs:300000},
  {name:"prebuild",category:"build",command:"npm",args:["run","build"],timeoutMs:120000},
  {name:"preflight-tests",category:"test",command:"node",args:["--test","dist/test/action-fabric-authority-reuse.test.js","dist/test/engineering-jobs.test.js","dist/test/deployment-governor-boundaries.test.js"],timeoutMs:180000},
];
for((const [i,part] of parts.entries()){
  const b64=part.toString("base64");
  commands.push({name:`patch-chunk-${i}`,category:"edit",command:"node",args:["-e","require('fs').writeFileSync(process.argv[1],Buffer.from(process.argv[2],'base64'))","/tmp/capability-tier-hardening.part-"+i,b64],timeoutMs:30000});
}
commands.push(
  {name:"assemble-patch",category:"edit",command:"node",args:["-e","const f=require('fs');let x=Buffer.alloc(0);for(let i=0;i<4;i++){x=Buffer.concat([x,f.readFileSync('/tmp/capability-tier-hardening.part-'+i)])}f.writeFileSync('/tmp/capability-tier-hardening.mjs',x)"],timeoutMs:30000},
  {name:"apply-patch",category:"edit",command:"node",args:["/tmp/capability-tier-hardening.mjs"],timeoutMs:60000},
  {name:"postbuild",category:"build",command:"npm",args:["run","build"],timeoutMs:12000},
  {name:"authority-tests",category:"test",command:"bash",args:["-lc","node --test dist/test/*capability*.test.js dist/test/action-fabric-authority-reuse.test.js dist/test/engineering-jobs.test.js dist/test/spawn-immutable-identity.test.js dist/test/deployment-governor-boundaries.test.js"],timeoutMs:240000},
  {name:"governor-tests",category:"test",command:"npm",args:["run","test:deployment-governor"],timeoutMs:240000},
  {name:"diff-check",category:"test",command:"git",args:["diff","--check"],timeoutMs:30000},
);
const request={
  repo:"riggeyb/sentient",
  branch:"sentient-production-composition-20261017",
  expectedHead:"5ce976089532a86ac262a2760367318b6f4b72a5",
  objective:"SENTIENT_CAPABILITY_TIER_AND_AUTHORITY_ENFORCEMENT_V1 bootstrap hardening under explicit external user authorization: apply the shared peer capability-tier and authority patch. This is the one bootstrap protected-policy source mutation before the new rule is active. Do not deploy from this EngineeringJob; activation must use the independent Governor recovery root exact candidate path.",
  commands,
  commitMessage:"feat: enforce capability tiers and authority bounds",
  timeoutMs:1550000,
};
process.stdout.write(JSON.stringify(request));
