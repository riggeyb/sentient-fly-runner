const fs=require("node:fs");
const crypto=require("node:crypto");
const zlib=require("node:zlib");

const base="scripts/capability-tier-hardening-v1-rev2";
const gz=Buffer.concat([0,1].map(i=>fs.readFileSync(`${base}/payload.gz.part-${String(i).padStart(2,"0")}`)));
let patchText=zlib.gunzipSync(gz).toString("utf8");

const brittle=`replaceOnce("test/engineering-jobs.test.ts",
\`      repo:VALID.repo, branch:VALID.branch, expectedHead:VALID.expectedHead, objective:VALID.objective,
      status:"QUEUED", startSha:null,
\`,
\`     repo:VALID.repo, branch:VALID.branch, expectedHead:VALID.expectedHead, objective:VALID.objective,
      authorityReceipt:null, status:"QUEUED", startSha:null,
\`);`;
const tolerant=`replaceOnce("test/engineering-jobs.test.ts",\n\`     status:"QUEUED", startSha:null,\`,\n\`      authorityReceipt:null, status:"QUEUED", startSha:null,\`);`;
const first=patchText.indexOf(brittle);
if(first<0 || patchText.indexOf(brittle,first+1)>=0) throw new Error("EXPECTED_SINGLE_BRITTLE_ENGINEERING_FIXTURE_PATCH");
patchText=patchText.slice(0,first)+tolerant+patchText.slice(first+brittle.length);

const patch=Buffer.from(patchText,"utf8");
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const patchSha=sha(patch);
const chunks=[];
for(let offset=0;offset<patch.length;offset+=5000) chunks.push(patch.subarray(offset,Math.min(offset+5000,patch.length)));
if(chunks.length<2 || chunks.length>8) throw new Error("UNEXPECTED_PATCH_CHUNK_COUNT");

const commands=[
  {name:"install",category:"shell",command:"npm",args:["ci","--ignore-scripts"],timeoutMs:300000},
  {name:"prebuild",category:"build",command:"npm",args:["run","build"],timeoutMs:120000},
  {name:"preflight-tests",category:"test",command:"node",args:["--test","dist/test/action-fabric-authority-reuse.test.js","dist/test/engineering-jobs.test.js","dist/test/deployment-governor-boundaries.test.js"],timeoutMs:180000},
];
for(const [i,chunk] of chunks.entries()){
  commands.push({
    name:`patch-source-chunk-${i}`,
    category:"edit",
    command:"node",
    args:["-e","require('fs').writeFileSync(process.argv[1],Buffer.from(process.argv[2],'base64'))",`/tmp/capability-tier-hardening.mjs.part-${i}`,chunk.toString("base64")],
    timeoutMs:30000,
  });
}
commands.push(
  {
    name:"assemble-verify-patch",
    category:"inspect",
    command:"node",
    args:["-e","const f=require('fs'),c=require('crypto');const n=Number(process.argv[1]),want=process.argv[2];const p=Buffer.concat(Array.from({length:n},(_,i)=>f.readFileSync('/tmp/capability-tier-hardening.mjs.part-'+i)));const got=c.createHash('sha256').update(p).digest('hex');if(got!==want)throw new Error('capability_patch_source_digest_mismatch');f.writeFileSync('/tmp/capability-tier-hardening.mjs',p)",String(chunks.length),patchSha],
    timeoutMs:30000,
  },
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
  objective:"SENTIENT_CAPABILITY_TIER_AND_AUTHORITY_ENFORCEMENT_V1 bootstrap rev4 from known-good rev2 bytes with one deterministic tolerant engineering fixture anchor rewrite under explicit external user authorization. Fail closed on exact-head mismatch, transformed patch SHA-256 mismatch, build/test failure, or diff verification. Do not deploy, resize, enable paid compute, expose secrets, or alter certification state.",
  commands,
  commitMessage:"feat: enforce capability tiers and authority bounds",
  timeoutMs:1600000,
};
process.stdout.write(JSON.stringify(request));
