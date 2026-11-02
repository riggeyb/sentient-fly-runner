import fs from "node:fs";

const taskIds = (process.env.TARGET_TASK_IDS ?? "cog-v1-02,cog-v1-03,cog-v1-14")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const maxOutputTokens = Number(process.env.TARGET_MAX_OUTPUT_TOKENS ?? "1024");
const complexity =
  process.env.TARGET_COMPLEXITY === undefined ? undefined : Number(process.env.TARGET_COMPLEXITY);
const campaign = process.env.TARGET_CAMPAIGN ?? "STRONGER_SENTIENT_OUTPUT_CAPN_1024_V1";
const outputFile =
  process.env.TARGET_OUTPUT_FILE ?? "stronger-sentient-output-cap-1024-v1.json";

if (
  taskIds.length === 0 ||
  !Number.isInteger(maxOutputTokens) ||
  maxOutputTokens < 1 ||
  (complexity !== undefined && (!Number.isFinite(complexity) || complexity < 0 || complexity > 1))
) {
  throw new Error("target_experiment_configuration_invalid");
}

const sourceUrl = new URL("./stronger-sentient-baseline-measurement.mjs", import.meta.url);
let source = fs.readFileSync(sourceUrl, "utf8");

const replacements = [
  [
    'const corpus=JSON.parse(raw),t0=Date.now();',
    `const corpus=JSON.parse(raw);corpus.tasks=corpus.tasks.filter(t=>${JSON.stringify(taskIds)}.includes(t.taskId));if(corpus.tasks.length!==${taskIds.length})throw Error("target_task_set_mismatch");const t0=Date.now();`,
  ],
  ['campaign:"STRONGER_SENTIENT_BASELINE_V1"', `campaign:${JSON.stringify(campaign)}`],
  ["tasksExpected:15", `tasksExpected:${taskIds.length}`],
  [
    'fs.writeFileSync("stronger-sentient-baseline-v1.json"',
    `fs.writeFileSync(${JSON.stringify(outputFile)}`,
  ],
  ["maxOutputTokens:512", `maxOutputTokens:${maxOutputTokens}`],
];

if (complexity !== undefined) {
  replacements.push([
    "complexity:.5,uncertainty:.5",
    `complexity:${complexity},uncertainty:.5`,
  ]);
}

for (const [from, to] of replacements) {
  const first = source.indexOf(from);
  const last = source.lastIndexOf(from);
  if (first < 0 || first !== last) {
    throw new Error(`baseline_harness_replacement_mismatch:${from}`);
  }
  source = source.replace(from, to);
}

const targetUrl = new URL("./.stronger-sentient-targeted-runtime.mjs", import.meta.url);
s.writeFileSync(targetUrl, source);
try {
  await import(`${targetUrl.href}?v=${Date.now()}`);
} finally {
  fs.rmSync(targetUrl, { force: true });
}
