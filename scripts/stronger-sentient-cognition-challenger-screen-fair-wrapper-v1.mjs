import fs from "node:fs";
import { spawnSync } from "node:child_process";

const source = "scripts/stronger-sentient-cognition-challenger-screen-v1.mjs";
const target = "scripts/stronger-sentient-cognition-challenger-screen-fair-tmp.mjs";
let s = fs.readFileSync(source, "utf8");

const oldCap = "maxOutputTokens:2000";
if ((s.match(/maxOutputTokens:2000/g) ?? []).length !== 1) {
  throw new Error("unexpected_provider_cap_marker");
}
s = s.replace(oldCap, "maxOutputTokens:4096");

const marker = "const verification=cognitionVerify(task,artifact);";
if ((s.match(/const verification=cognitionVerify\(task,artifact\);/g) ?? []).length !== 1) {
  throw new Error("unexpected_verification_marker");
}
s = s.replace(
  marker,
  marker +
    "\n  if(result.ok){" +
    "const billed=result.usage.outputTokens;" +
    "const reasoning=result.usage.reasoningTokens??null;" +
    "const visible=reasoning==null?billed:Math.max(0,billed-reasoning);" +
    "if(visible>2000) verification.verified=false;" +
    "}"
);

const oldReport = "commonCognitionMaxOutputTokens:2000";
if ((s.match(/commonCognitionMaxOutputTokens:2000/g) ?? []).length !== 1) {
  throw new Error("unexpected_report_marker");
}
s = s.replace(
  oldReport,
  "commonProviderCompletionMaxTokens:4096,visibleArtifactMaxTokens:2000"
);

fs.writeFileSync(target, s);
const result = spawnSync(process.execPath, [target], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
