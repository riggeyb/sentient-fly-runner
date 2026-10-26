const editScript = String.raw`const fs=require("node:fs");
const srcPath="src/application/production-collaboration.ts";
let src=fs.readFileSync(srcPath,"utf8");
const from="      maxOutputTokens: 1_024,";
const to="      maxOutputTokens: 256,";
const count=src.split(from).length-1;
if(count!==1)throw new Error("production_collaboration_output_budget_anchor:"+count);
src=src.replace(from,to);
fs.writeFileSync(srcPath,src);

const testPath="test/job2-production-convergence.test.ts";
let test=fs.readFileSync(testPath,"utf8");
const marker='test("production collaboration keeps concise zero-cost child budgets inside the 60 second envelope"';
if(test.includes(marker))throw new Error("production_collaboration_budget_test_already_present");
test += [
  "",
  "",
  'test("production collaboration keeps concise zero-cost child budgets inside the 60 second envelope", async () => {',
  '  const collaboration = await readFile("src/application/production-collaboration.ts", "utf8");',
  '  assert.match(collaboration, /maxInputTokens:\\s*4_096/);',
  '  assert.match(collaboration, /maxOutputTokens:\\s*256/);',
  '  assert.match(collaboration, /maxCostMicros:\\s*0/);',
  '  assert.match(collaboration, /maxRuntimeMs:\\s*60_000/);',
  '  assert.doesNotMatch(collaboration, /maxOutputTokens:\\s*1_024/);',
  '});',
  ""
].join("\n");
fs.writeFileSync(testPath,test);`;

const request={
  repo:"riggeyb/sentient",
  branch:"sentient-production-composition-20261017",
  expectedHead:"fdab101aeef2275a3f9333384d6e8445799366a3",
  expectedTree:"c06b0c927efbfdd0cdfa2fc2ae1c8f6c26f2b11e",
  objectiveId:"SENTIENT_ROUTINE_COLLABORATION_OUTPUT_BUDGET_RELIABILITY_V1",
  actionId:"production-collaboration-concise-output-budget-v1",
  authorizedPaths:[
    "src/application/production-collaboration.ts",
    "test/job2-production-convergence.test.ts"
  ],
  authorizationIdentity:"SENTIENT_RUNTIME",
  authorizationReason:"Live objective routine-stale-coordination-backlog-40259838215-1 produced two durable timed_out collaboration children under maxRuntimeMs=60000 and maxOutputTokens=1024. The local zero-cost model is healthy and generated a concise 14-token response in about one second after initialization. Reduce only the production collaboration child output allowance to a concise 256-token ceiling while preserving input budget, 60-second runtime, zero-cost policy, authority, model, resource envelope, and recovery semantics.",
  policyVersion:"sentient-capability-tier/v1",
  objective:"Bound production collaboration child output to 256 tokens so concise analysis and verification fit the existing 60-second zero-cost CPU runtime envelope. Preserve maxInputTokens=4096, maxRuntimeMs=60000, maxCostMicros=0, model/provider policy, authority, recovery, and all production resource settings. Add a focused regression. No deployment, resource change, paid compute, model change, policy/authority mutation, certification change, or historical cleanup.",
  commands:[
    {name:"install",category:"shell",command:"npm",args:["ci","--ignore-scripts"],timeoutMs:300000},
    {name:"prebuild",category:"build",command:"npm",args:["run","build"],timeoutMs:120000},
    {name:"pretest",category:"test",command:"node",args:["--test","dist/test/job2-production-convergence.test.js","dist/test/phase5-collaborative-convergence.test.js","dist/test/production-collaboration-restart-recovery.test.js"],timeoutMs:180000},
    {name:"edit-collaboration-output-budget",category:"edit",command:"node",args:["-e",editScript],timeoutMs:30000},
    {name:"postbuild",category:"build",command:"npm",args:["run","build"],timeoutMs:120000},
    {name:"posttest",category:"test",command:"node",args:["--test","dist/test/job2-production-convergence.test.js","dist/test/phase5-collaborative-convergence.test.js","dist/test/production-collaboration-restart-recovery.test.js"],timeoutMs:180000},
    {name:"diff-check",category:"test",command:"git",args:["diff","--check"],timeoutMs:30000}
  ],
  commitMessage:"fix: bound production collaboration output budget",
  timeoutMs:1020000,
  idempotencyKey:"sentient-collaboration-output-budget-v1-fdab101a"
};
process.stdout.write(JSON.stringify(request));
