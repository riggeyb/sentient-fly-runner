import { spawnSync } from "node:child_process";
if (!process.env.EXPERIMENT_OUT) process.env.EXPERIMENT_OUT="/tmp/deepseek-readiness-raw-v1.json";
for (const [cmd,args] of [
  ["npm",["install","--no-audit","--no-fund","--package-lock=false"]],
  ["npm",["run","build"]],
]) {
  const r=spawnSync(cmd,args,{cwd:"sentient",stdio:"inherit"});
  if (r.status!==0) process.exit(r.status??1);
}
await import("./stronger-sentient-deepseek-readiness-raw-v1.mjs");
