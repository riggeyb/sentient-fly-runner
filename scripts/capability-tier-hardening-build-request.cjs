const fs=require("node:fs");
const crypto=require("node:crypto");
const zlib=require("node:zlib");
const base="scripts/capability-tier-hardening-v1-rev2";
const parts=[0,1].map(i=>fs.readFileSync(`${base}/payload.gz.part-${String(i).padStart(2,"0")}`));
const gz=Buffer.concat(parts);
const patch=zlib.gunzipSync(gz);
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const gzSha=sha(gz);
const patchSha=sha(patch);
const commands=[
  {name:"install",category:"shell",command:"npm",args:["ci","--ignore-scripts"],timeoutMs:300000},
  {name:"prebuild",category:"build",command:"npm",args:["run","build"],timeoutMs:120000},
  {name:"preflight-tests",category:"test",command:"node",args:["--test","dist/test/action-fabric-authority-reuse.test.js","dist/test/engineering-jobs.test.js","dist/test/deployment-governor-boundaries.test.js"],timeoutMs:180000},
];
for(const [i,part] of parts.entries()){
  const b64=part.toString("base64");
  commands.push({name:`patch-gzip-chunk-${i}`,category:"edit",command:"node",args:["-e","require('fs').writeFileSync(process.argv[1],Buffer.from(process.argv[2],'base64'))","/tmp/capability-tier-hardening.gz.part-"+i,b64],timeoutMs:30000});
}
commands.push(
  {name:"assemble-verify-patch",category:"inspect",command:"node",args:["-e","const f=require('fs'),c=require('crypto'),z=require('zlib');const h=b=>c.createHash('sha256').update(b).digest('hex');const g=Buffer.concat([f.readFileSync('/tmp/capability-tier-hardening.gz.part-0'),f.readFileSync('/tmp/capability-tier-hardening.gz.part-1')]);if(h(g)!==process.argv[1])throw new Error('capability_patch_gzip_digest_mismatch');const p=z.gunzipSync(g);if(h(p)!==process.argv[2])throw new Error('capability_patch_source_digest_mismatch');f.writeFileSync('/tmp/capability-tier-hardening.mjs',p);",gzSha,patchSha],timeoutMs:30000},
  {name:"apply-patch",category:"edit",command:"node",args:["/tmp/capability-tier-hardening.mjs"],timeoutMs:60000},
  {name:"postbuild",category:"build",command:"npm",args:["run","build"],timeoutMs:180000},
  {name:"authority-tests",category:"test",command:"bash",args:["-lc","node --test dist/test/*capability*.test.js dist/test/action-fabric-authority-reuse.test.js dist/test/engineering-jobs.test.js dist/test/spawn-immutable-identity.test.js dist/test/deployment-governor-boundaries.test.js"],timeoutMs:240000},
  {name:"governor-tests",category:"test",command:"npm",args:["run","test:deployment-governor"],timeoutMs:240000},
  {name:"diff-check",category:"test",command:"git",args:["diff","--check"],timeoutMs:30000},
);
const request={
  repo:"riggeyb/sentient",
  branch:"sentient-production-composition-20261017",
  expectedHead:"5ce976089532a86ac262a2760367318b6f4b72a5",
  objective:"SENTIENT_CAPABILITY_TIER_AND_AUTHORITY_ENFORCEMENT_V1 bootstrap retry using corrected rev2 payload under explicit external user authorization. This is the one bootstrap protected-policy source mutation before the new rule is active. Fail closed on exact head, patch digest, build, test, or diff verification. Do not deploy, resize, enable paid compute, expose secrets, or alter certification state.",
  commands,
  commitMessage:"feat: enforce capability tiers and authority bounds",
  timeoutMs:1600000,
};
process.stdout.write(JSON.stringify(request));
