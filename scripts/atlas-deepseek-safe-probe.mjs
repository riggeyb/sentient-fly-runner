import { spawnSync } from "node:child_process";
import fs from "node:fs";

for (const [cmd,args] of [
  ["npm",["install","--no-audit","--no-fund","--package-lock=false"]],
  ["npm",["run","build"]],
]) {
  const r=spawnSync(cmd,args,{cwd:"sentient",stdio:"inherit"});
  if(r.status!==0) process.exit(r.status??1);
}

const out="/tmp/stronger-sentient-adaptive-readiness-static.json";
const env={
  ...process.env,
  STATIC_VALIDATE:"true",
  EXPERIMENT_OUT:out,
  BASELINE_SHA:"c05ebe9ffed7254bb749cee1c72a965f970def7c",
  BASELINE_TREE:"00296d7129fa8ab7f3254943a57df444591ad1ab",
  CONTRACT_DIGEST:"sha256:62f98338f60164620a3fe93fd69e7c94b33e8ec4602ba3337c1b06b89651673d",
};
const r=spawnSync(process.execPath,["scripts/stronger-sentient-cognition-challenger-screen-fair-wrapper-v1.mjs"],{stdio:"inherit",env});
if(r.status!==0) process.exit(r.status??1);
if(!fs.existsSync(out)) throw new Error("static_receipt_missing");
const receipt=JSON.parse(fs.readFileSync(out,"utf8"));
if(receipt.fairnessGateStaticValidation!=="PASS" || receipt.providerCalls!==0 || receipt.challengerCalls!==0) {
  throw new Error("static_receipt_invalid");
}
console.log("ADAPTIVE_READINESS_STATIC_RECEIPT="+JSON.stringify(receipt));
