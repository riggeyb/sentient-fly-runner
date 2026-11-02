import fs from "node:fs";
import { pathToFileURL } from "node:url";

const sourceUrl = new URL("./stronger-sentient-baseline-measurement.mjs", import.meta.url);
let source = fs.readFileSync(sourceUrl, "utf8");

const replacements = [
  [
    'const corpus=JSON.parse(raw),t0=Date.now();',
    'const corpus=JSON.parse(raw);corpus.tasks=corpus.tasks.filter(t=>["cog-v1-02","cog-v1-03","cog-v1-14"].includes(t.taskId));if(corpus.tasks.length!==3)throw Error("target_task_set_mismatch");const t0=Date.now();',
  ],
  [
    'campaign:"STRONGER_SENTIENT_BASELINE_V1"',
    'campaign:"STRONGER_SENTIENT_OUTPUT_CAP_1024_V1"',
  ],
  ['tasksExpected:15', 'tasksExpected:3'],
  [
    'fs.writeFileSync("stronger-sentient-baseline-v1.json"',
    'fs.writeFileSync("stronger-sentient-output-cap-1024-v1.json"',
  ],
  ['maxOutputTokens:512', 'maxOutputTokens:1024'],
];

for (const [from, to] of replacements) {
  const first = source.indexOf(from);
  const last = source.lastIndexOf(from);
  if (first < 0 || first !== last) {
    throw new Error(`baseline_harness_replacement_mismatch:${from}`);
  }
  source = source.replace(from, to);
}

const targetUrl = new URL("./.stronger-sentient-output-cap-1024-runtime.mjs", import.meta.url);
fs.writeFileSync(targetUrl, source);
try {
  await import(`${pathToFileURL(TargetUrl.pathname).href}?v=${Date.now()}`);
} finally {
  fs.rmSync(targetUrl, { force: true });
}
