const fs=require("node:fs");
const {createHash}=require("node:crypto");
const {gunzipSync}=require("node:zlib");
const base="scripts/capability-tier-hardening-v1-rev3";
const p0=fs.readFileSync(`${base}/payload.gz.part-00`);
const p1=fs.readFileSync(`${base}/payload.gz.part-01`);
const gz=Buffer.concat([p0,p1]);
const h=x=>createHash("sha256").update(x).digest("hex");
if(h(gz)!=="2477671742050bbe9f682815c28063a42adc30665818a09e0c04994648f3e86e")throw new Error("REV4_GZIP_DIGEST_MISMATCH");
const src=gunzipSync(gz);
if(h(src)!=="a8af4b447f5dc8a2a1bc66e15769c3dc67a5132a61b6481d2fa971c84d2cf977")throw new Error("REV4_SOURCE_DIGEST_MISMATCH");
const writeCmd=(name,dest,buf)=>({name,category:"edit",command:"node",args:["-e","require('fs').writeFileSync(process.argv[1],Buffer.from(process.argv[2],'base64'))",dest,buf.toString("base64")],timeoutMs:30000});
const commands=[
  {name:"install-locked-dependencies",category:"build",command:"npm",args:["ci","--ignore-scripts"],timeoutMs:240000},
  {name:"baseline-build",category:"build",command:"npm",args:["run","build"],timeoutMs:180000},
  writeCmd("embed-verified-authority-patch-0","/tmp/capbility-rev4-p0",p0),
  writeCmd("embed-verified-authority-patch-1","/tmp/capability-rev4-p1",p1),
  {name:"assemble-verify-authority-patch",category:"inspect",command:"node",args:["--input-type=module","-e","import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{gunzipSync}from'node:zlib';const gz=Buffer.concat([readFileSync('/tmp/capbility-rev4-p0'),readFileSync('/tmp/capbility-rev4-p1')]);const h=x=>createHash('sha256').update(x).digest('hex');if(h(gz)!=='2477671742050bbe9f682815c28063a42adc30665818a09e0c04994648f3e86e')throw Error('payload_gzip_digest_mismatch');const src=gunzipSync(gz);if(h(src)!=='a8af4b447f5dc8a2a1bc66e15769c3dc67a5132a61b6481d2fa971c84d2cf977')throw Error('payload_source_digest_mismatch');writeFileSync('/tmp/sentient-capability-tier-hardening-v1-rev4.mjs',src);console.log('AUTHORITY_PATCH_DIGEST_VERIFIED=true');"],timeoutMs:30000},
  {name:"apply-authority-hardening",category:"edit",command:"node",args:["/tmp/sentient-capability-tier-hardening-v1-rev4.mjs"],timeoutMs:30000},
  {name:"post-change-build",category:"build",command:"npm",args:["run","build"],timeoutMs:180000},
  {name:"authority-focused-tests",category:"test",command:"node",args:["--test","dist/test/capability-tier-authority.test.js","dist/test/engineering-jobs.test.js","dist/test/deployment-governor.test.js","dist/test/deployment-governor-boundaries.test.js"],timeoutMs:150000},
  {name:"diff-check",category:"test",command:"git",args:["diff","--check"],timeoutMs:30000},
];
const request={repo:"riggeyb/sentient",branch:"sentient-production-composition-20261017",expectedHead:"5ce976089532a86ac262a2760367318b6f4b72a5",objective:"SENTIENT_CAPABILITY_TIER_AND_AUTHORITY_ENFORCEMENT_V1 bootstrap rev4: same verified rev3 patch, embedded into the bounded worker after rev3 verified baseline build but failed only because bounded command networking could not fetch the pinned public payload. Verify exact sha/tree and payload digests; do not deploy, resize, enable paid compute, expose secrets, or reopen certification.",commands,commitMessage:"feat: enforce capability tiers and authority bounds",timeoutMs:900000};
process.stdout.write(JSON.stringify(request));
