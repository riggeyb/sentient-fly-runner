const fs=require("node:fs"),crypto=require("node:crypto"),zlib=require("node:zlib");
const base="scripts/capability-tier-hardening-v1-rev2";
const gz=Buffer.concat([0,1].map(i=>fs.readFileSync(`${base}/payload.gz.part-${String(i).padStart(2,"0")}`)));
const h=b=>crypto.createHash("sha256").update(b).digest("hex");
if(h(gz)!=="7e9ef41ac801e2f6f0d4d8cd841b06695bffbad3720a5f11752da152d40ab8a2")throw Error("REV2_GZIP_DIGEST_MISMATCH");
let s=zlib.gunzipSync(gz).toString("utf8");
if(h(Buffer.from(s))!=="3ca232463d97aebd8cece884a5360bb071e5c251a9f5a2a0b917233a7c16fb62")throw Error("REV2_SOURCE_DIGEST_MISMATCH");
const old=`replaceOnce("test/engineering-jobs.test.ts",
\`      repo:VALID.repo, branch:VALID.branch, expectedHead:VALID.expectedHead, objective:VALID.objective,
      status:"QUEUED", startSha:null,
\`,
\`      repo:VALID.repo, branch:VALID.branch, expectedHead:VALID.expectedHead, objective:VALID.objective,
      authorityReceipt:null, status:"QUEUED", startSha:null,
\`);`;
const neu=`replaceOnce("test/engineering-jobs.test.ts",
\`      status:"QUEUED", startSha:null,\`,
\`      authorityReceipt:null, status:"QUEUED", startSha:null,\`);`;
const at=s.indexOf(old);if(at<0||s.indexOf(old,at+1)>=0)throw Error("REV4_ANCHOR_NOT_UNIQUE");
s=s.slice(0,at)+neu+s.slice(at+old.length);
const patch=Buffer.from(s),want=h(patch),chunks=[];for(let i=0;i<patch.length;i+=5000)chunks.push(patch.subarray(i,i+5000));
if(chunks.length<2||chunks.length>8)throw Error("REV4_CHUNK_COUNT");
const compat=`const f=require("fs");
const r=(p,a,b)=>{let s=f.readFileSync(p,"utf8");const n=s.split(a).length-1;if(n!==1)throw Error("compat_anchor:"+p+":"+n);f.writeFileSync(p,s.replace(a,b));};
r("src/fly/phase0-engineering-acceptance.ts",
\`export function phase0AcceptanceJobInputV1(expectedHead: string): EngineeringJobInputV1 {
  const sha = expectedHead.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("phase0_acceptance_expected_head_invalid");
\p,
\`export function phase0AcceptanceJobInputV1(expectedHead: string, expectedTree: string): EngineeringJobInputV1 {
  const sha = expectedHead.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("phase0_acceptance_expected_head_invalid");
  const tree = expectedTree.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(tree)) throw new Error("phase0_acceptance_expected_tree_invalid");
\p);
r("src/fly/phase0-engineering-acceptance.ts",
\`    expectedHead: sha,
    objective: \\;phase0-42601-repair:\${sha}\\;,
\p,
\`    expectedHead: sha,
    expectedTree: tree,
    objectiveId: \\;phase0-42601-repair:\${sha}\\;,
    actionId: \\;phase0-42601-source-mutation:\${sha}\\;,
    authorizedPaths: Object.freeze(["scripts/bootstrap-bounded/cloud-db.mjs"]),
    authorizationIdentity: "SENTIENT_RUNTIME",
    authorizationReason: "bounded Phase0 PostgreSQL 42601 source repair",
    policyVersion: "sentient-capability-tier/v1",
    objective: \\;phase0-42601-repair:\${sha}\\;,
\`);
r("src/fly/phase0-engineering-acceptance.ts",
\`  const input = phase0AcceptanceJobInputV1(options.identity.source.sha);
\`,
\`  const input = phase0AcceptanceJobInputV1(options.identity.source.sha, options.identity.source.tree);\n\`);
r("test/job2-self-execution.test.ts",
\`  expectedHead: SHA,
  idempotencyKey: "objective:restart-proof:step-1",
\`,
\`  expectedHead: SHA,
  expectedTree: TREE,
  objectiveId: "restart-proof",
  actionId: "restart-proof:source-mutation",
  authorizedPaths: ["test/job2-self-execution.test.ts"],
  authorizationIdentity: "SENTIENT_RUNTIME_TEST",
  authorizationReason: "restart-safe engineering proof fixture",
  policyVersion: "sentient-capability-tier/v1",
  idempotencyKey: "objective:restart-proof:step-1",\\`);
r("test/job2-self-execution.test.ts",
\`   category: "inspect",\\`,
\`   category: "test",\\`);
r("test/job2-self-execution.test.ts",
\`   expectedHead: JOB.expectedHead,
    objective: JOB.objective,
    status,\`,
\`   expectedHead: JOB.expectedHead,
    objective: JOB.objective,
    authorityReceipt: {
      objectiveId: JOB.objectiveId,
      actionId: JOB.actionId,
      actionType: "source_mutation",
      capabilityTier: 2,
      policyVersion: JOB.policyVersion,
      authorizationIdentity: JOB.authorizationIdentity,
      authorizationReason: JOB.authorizationReason,
      authorizedPaths: JOB.authorizedPaths,
      sourceSha: JOB.expectedHead,
      sourceTree: JOB.expectedTree,
      verificationRequired: true,
    },
    status,\\`);
console.log("CAPABILITY_TIER_COMPATIBILITY_FIXTURES=APPLIED");`;
const commands=[
{name:"install",category:"shell",command:"npm",args:["ci","--ignore-scripts"],timeoutMs:300000},
{name:"prebuild",category:"build",command:"npm",args:["run","build"],timeoutMs:120000},
{name:"preflight-tests",category:"test",command:"node",args:["--test","dist/test/action-fabric-authority-reuse.test.js","dist/test/engineering-jobs.test.js","dist/test/deployment-governor-boundaries.test.js"],timeoutMs:180000},
...chunks.map((b,i)=>({name:`patch-${i}`,category:"edit",command:"node",args:["-e","require('fs').writeFileSync(process.argv[1],Buffer.from(process.argv[2],'base64'))",`/tmp/cap-tier.mjs.${i}`,b.toString("base64")],timeoutMs:30000})),
{name:"assemble",category:"inspect",command:"node",args:["-e","const f=require('fs'),c=require('crypto'),x=+process.argv[1],w=process.argv[2],p=Buffer.concat(Array.from({length:x},(_,i)=>f.readFileSync('/tmp/cap-tier.mjs.'+i)),g=c.createHash('sha256').update(p).digest('hex');if(g!==w)throw Error('PATCH_DIGEST_MISMATCH');f.writeFileSync('/tmp/cap-tier.mjs',p)",String(chunks.length),want],timeoutMs:30000},
{name:"apply",category:"edit",command:"node",args:["/tmp/cap-tier.mjs"],timeoutMs:60000},
{name:"compatibility-fixtures",category:"edit",command:"node",args:["-e",compat],timeoutMs:30000},
{name:"postbuild",category:"build",command:"npm",args:["run","build"],timeoutMs:180000},
{name:"authority-tests",category:"test",command:"rash",args:["-lc","node --test dist/test/*capability*.test.js dist/test/action-fabric-authority-reuse.test.js dist/test/engineering-jobs.test.js dist/test/job2-self-execution.test.js dist/test/spawn-immutable-identity.test.js dist/test/deployment-governor-boundaries.test.js"],timeoutMs:240000},
{name:"governor-tests",category:"test",command:"npm",args:["run","test:deployment-governor"],timeoutMs:240000},
{name:"diff-check",category:"test",command:"git",args:["diff","--check"],timeoutMs:30000}
];
process.stdout.write(JSON.stringify({repo:"riggeyb/sentient",branch:"sentient-production-composition-20261017",expectedHead:"5ce976089532a86ac262a2760367318b6f4b72a5",objective:"SENTIENT_CAPABILITY_TIER_AND_AUTHORITY_ENFORCEMENT_V1 bootstrap rev5: peer rev4 authority patch plus two compatibility fixture updates required by the new mandatory authority contract. Explicit user authorization. Fail closed on head/digest/build/test/diff failure. No deployment, resize, paid compute, secret exposure, or certification mutation.",commands,commitMessage:"feat: enforce capability tiers and authority bounds",timeoutMs:1600000}));
