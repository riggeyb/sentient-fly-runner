const edit = String.raw`
import { readFileSync, writeFileSync } from "node:fs";
const path = "src/application/production-collaboration.ts";
let source = readFileSync(path, "utf8");
if (source.includes("PHASE5_WORKER_MAX_OUTPUT_TOKENS_V1")) throw new Error("PHASE5_BUDGET_ALREADY_PRESENT");
const marker = 'export interface ProductionCollaborationInputV1 {';
if ((source.match(/export interface ProductionCollaborationInputV1 \{/g) ?? []).length !== 1) throw new Error("PHASE5_INTERFACE_ANCHOR_MISMATCH");
const constants = [
  'export const PHASE5_PARENT_MAX_RUNTIME_MS_V1 = 120_000 as const;',
  'export const PHASE5_WORKER_MAX_RUNTIME_MS_V1 = 60_000 as const;',
  'export const PHASE5_WORKER_MAX_OUTPUT_TOKENS_V1 = 512 as const;',
  '',
].join("\\n");
source = source.replace(marker, constants + marker);
for (const [from,to,label] of [
  ['maxOutputTokens: 1_024,','maxOutputTokens: PHASE5_WORKER_MAX_OUTPUT_TOKENS_V1,','OUTPUT'],
  ['maxRuntimeMs: 60_000,','maxRuntimeMs: PHASE5_WORKER_MAX_RUNTIME_MS_V1,','WORKER_RUNTIME'],
  ['maxRuntimeMs: 120_000,','maxRuntimeMs: PHASE5_PARENT_MAX_RUNTIME_MS_V1,','PARENT_RUNTIME'],
]) {
  if ((source.split(from).length - 1) !== 1) throw new Error("PHASE5_"+label+"_ANCHOR_MISMATCH");
  source = source.replace(from,to);
}
writeFileSync(path, source);
`;

const testFile = String.raw`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PHASE5_PARENT_MAX_RUNTIME_MS_V1,
  PHASE5_WORKER_MAX_OUTPUT_TOKENS_V1,
  PHASE5_WORKER_MAX_RUNTIME_MS_V1,
} from "../src/application/production-collaboration.js";

test("Phase 5 local-HF workers stay within the parent runtime budget and a concise output ceiling", async () => {
  assert.equal(PHASE5_PARENT_MAX_RUNTIME_MS_V1, 120_000);
  assert.equal(PHASE5_WORKER_MAX_RUNTIME_MS_V1, 60_000);
  assert.equal(PHASE5_WORKER_MAX_OUTPUT_TOKENS_V1, 512);
  assert.equal(PHASE5_WORKER_MAX_RUNTIME_MS_V1 * 2, PHASE5_PARENT_MAX_RUNTIME_MS_V1);
  assert.ok(PHASE5_WORKER_MAX_OUTPUT_TOKENS_V1 < 1_024);
  const source = await readFile("src/application/production-collaboration.ts", "utf8");
  assert.match(source, /maxOutputTokens: PHASE5_WORKER_MAX_OUTPUT_TOKENS_V1,/);
  assert.match(source, /maxRuntimeMs: PHASE5_WORKER_MAX_RUNTIME_MS_V1,/);
  assert.match(source, /maxRuntimeMs: PHASE5_PARENT_MAX_RUNTIME_MS_V1,/);
});
`;

const request = {
  repo:"riggeyb/sentient",
  branch:"sentient-production-composition-20261017",
  expectedHead:"fdab101aeef2275a3f9333384d6e8445799366a3",
  expectedTree:"c06b0c927efbfdd0cdfa2fc2ae1c8f6c26f2b11e",
  objectiveId:"SENTIENT_ROUTINE_PHASE5_LOCAL_HF_CONVERGENCE_BUDGET_V1",
  actionId:"phase5-local-hf-contribution-budget-v1",
  authorizedPaths:[
    "src/application/production-collaboration.ts",
    "test/phase5-production-budget.test.ts",
  ],
  authorizationIdentity:"user:SENTIENT_ROUTINE_OPERATIONAL_DEVELOPMENT_V1",
  authorizationReason:"Live Phase-5 evidence showed two fresh local-HF workers both timed out at the existing 60s child ceiling with zero reclaims while direct current-runtime HF initialization was ~4.8s and a short generation ~1s. Preserve the two 60s reservations that exactly fit the 120s parent budget and narrow only concise contribution output from 1024 to 512 tokens.",
  policyVersion:"sentient-capability-tier/v1",
  idempotencyKey:"phase5-local-hf-budget-fdab101a-v1",
  objective:"Bound Phase-5 local-HF worker output to 512 tokens while preserving 60s child runtime, 120s parent runtime, zero-cost local HF, deterministic verification, and all authority boundaries. Add focused regression proving two child runtime reservations fit the parent and production spawn requests use the narrowed output budget. No deployment.",
  commands:[
    {name:"install",category:"build",command:"npm",args:["ci","--ignore-scripts","--no-audit","--no-fund"],timeoutMs:300000},
    {name:"prebuild",category:"build",command:"npm",args:["run","build"],timeoutMs:180000},
    {name:"edit-phase5-budget",category:"edit",command:"node",args:["--input-type=module","-e",edit],timeoutMs:30000},
    {name:"write-phase5-budget-test",category:"edit",command:"node",args:["--input-type=module","-e",f'import {{ writeFileSync }} from "node:fs"; writeFileSync("test/phase5-production-budget.test.ts", {json.dumps(testFile)});'],timeoutMs:30000},
    {name:"postbuild",category:"build",command:"npm",args:["run","build"],timeoutMs:180000},
    {name:"focused-phase5-tests",category:"test",command:"node",args:["--test","dist/test/phase5-production-budget.test.js","dist/test/phase5-collaborative-convergence.test.js","dist/test/production-collaboration-restart-recovery.test.js","dist/test/job2-production-convergence.test.js"],timeoutMs:240000},
    {name:"diff-check",category:"test",command:"git",args:["diff","--check"],timeoutMs:30000},
  ],
  commitMessage:"fix: bound Phase5 local HF contribution budget",
  timeoutMs:1200000
};
process.stdout.write(JSON.stringify(request));
