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
const at=s.indexOf(old);if(at<0||s.indexOf(old,at+1)>=0)throw Error("REV5_ANCHOR_NOT_UNIQUE");
s=s.slice(0,at)+neu+s.slice(at+old.length);
const patch=Buffer.from(s),want=h(patch),chunks=[];for(let i=0;i<patch.length;i+=5000)chunks.push(patch.subarray(i,i+5000));
if(chunks.length<2||chunks.length>8)throw Error("REV5_CHUNK_COUNT");
const commands=[
{name:"install",category:"shell",command:"npm",args:["ci","--ignore-scripts"],timeoutMs:300000},
{name:"prebuild",category:"build",command:"npm",args:["run","build"],timeoutMs:120000},
{name:"preflight-tests",category:"test",command:"node",args:["--test","dist/test/action-fabric-authority-reuse.test.js","dist/test/engineering-jobs.test.js","dist/test/deployment-governor-boundaries.test.js","dist/test/job2-self-execution.test.js"],timeoutMs:180000},
...chunks.map((b,i)=>({name:`patch-${i}`,category:"edit",command:"node",args:["-e","require('fs').writeFileSync(process.argv[1],Buffer.from(process.argv[2],'base64'))",`/tmp/cap-tier.mjs.${i}`,b.toString("base64")],timeoutMs:30000})),
{name:"assemble",category:"inspect",command:"node",args:["-e","const f=require('fs'),c=require('crypto'),n=+process.argv[1],w=process.argv[2],p=Buffer.concat(Array.from({length:n},(_,i)=>f.readFileSync('/tmp/cap-tier.mjs.'+i))),g=c.createHash('sha256').update(p).digest('hex');if(g!==w)throw Error('PATCH_DIGEST_MISMATCH');f.writeFileSync('/tmp/cap-tier.mjs',p)",String(chunks.length),want],timeoutMs:30000},
{name:"apply",category:"edit",command:"node",args:["/tmp/cap-tier.mjs"],timeoutMs:60000},
{name:"compat-phase0",category:"edit",command:"node",args:["-e","const f=require(\"fs\"),p=\"src/fly/phase0-engineering-acceptance.ts\";let s=f.readFileSync(p,\"utf8\");const r=(a,b)=>{const i=s.indexOf(a);if(i<0||s.indexOf(a,i+a.length)>=0)throw new Error(\"phase0_compat_anchor\");s=s.slice(0,i)+b+s.slice(i+a.length)};\nr('export function phase0AcceptanceJobInputV1(expectedHead: string): EngineeringJobInputV1 {\\n  const sha = expectedHead.trim().toLowerCase();\\n  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(\"phase0_acceptance_expected_head_invalid\");',\n'export function phase0AcceptanceJobInputV1(expectedHead: string, expectedTree: string): EngineeringJobInputV1 {\\n  const sha = expectedHead.trim().toLowerCase();\\n  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(\"phase0_acceptance_expected_head_invalid\");\\n  const tree = expectedTree.trim().toLowerCase();\\n  if (!/^[0-9a-f]{40}$/.test(tree)) throw new Error(\"phase0_acceptance_expected_tree_invalid\");');\nr('    expectedHead: sha,\\n    objective: `phase0-42601-repair:${sha}`,\\n',\n'    expectedHead: sha,\\n    expectedTree: tree,\\n    objectiveId: `phase0-42601-repair:${sha}`,\\n    actionId: `phase0-42601-source-repair:${sha}`,\\n    authorizedPaths: Object.freeze([\"scripts/bootstrap-bounded/cloud-db.mjs\"]),\\n    authorizationIdentity: \"sentient-phase0-acceptance\",\\n    authorizationReason: \"bounded legacy Phase0 PostgreSQL privilege alias repair\",\\n    policyVersion: \"sentient-capability-tier/v1\",\\n    objective: `phase0-42601-repair:${sha}`,\\n');\nr('const input = phase0AcceptanceJobInputV1(options.identity.source.sha);','const input = phase0AcceptanceJobInputV1(options.identity.source.sha, options.identity.source.tree);');\nf.writeFileSync(p,s);console.log(\"PHASE0_ENGINEERING_COMPAT=APPLIED\");"],timeoutMs:30000},
{name:"compat-job2",category:"edit",command:"node",args:["-e","const f=require(\"fs\"),p=\"test/job2-self-execution.test.ts\";let s=f.readFileSync(p,\"utf8\");const r=(a,b)=>{const i=s.indexOf(a);if(i<0||s.indexOf(a,i+a.length)>=0)throw new Error(\"job2_compat_anchor\");s=s.slice(0,i)+b+s.slice(i+a.length)};\nr('  expectedHead: SHA,\\n  idempotencyKey: \"sentient-job2-self-execution-proof\",',\n'  expectedHead: SHA,\\n  expectedTree: TREE,\\n  objectiveId: \"job2-self-execution-test\",\\n  actionId: \"job2-self-execution-source-mutation\",\\n  authorizedPaths: [\"README.md\"],\\n  authorizationIdentity: \"sentient-test-authority\",\\n  authorizationReason: \"bounded self-execution test fixture\",\\n  policyVersion: \"sentient-capability-tier/v1\",\\n  idempotencyKey: \"sentient-job2-self-execution-proof\",');\nr('    category: \"inspect\",\\n    command: \"node\",\\n    args: [\"--version\"],','    category: \"test\",\\n    command: \"node\",\\n    args: [\"--version\"],');\nr('    objective: JOB.objective,\\n    status,','    objective: JOB.objective,\\n    authorityReceipt: null,\\n    status,');\nf.writeFileSync(p,s);console.log(\"JOB2_ENGINEERING_COMPAT=APPLIED\");"],timeoutMs:30000},
{name:"postbuild",category:"build",command:"npm",args:["run","build"],timeoutMs:180000},
{name:"authority-tests",category:"test",command:"bash",args:["-lc","node --test dist/test/*capability*.test.js dist/test/action-fabric-authority-reuse.test.js dist/test/engineering-jobs.test.js dist/test/job2-self-execution.test.js dist/test/spawn-immutable-identity.test.js dist/test/deployment-governor-boundaries.test.js"],timeoutMs:240000},
{name:"governor-tests",category:"test",command:"npm",args:["run","test:deployment-governor"],timeoutMs:240000},
{name:"diff-check",category:"test",command:"git",args:["diff","--check"],timeoutMs:30000}
];
process.stdout.write(JSON.stringify({repo:"riggeyb/sentient",branch:"sentient-production-composition-20261017",expectedHead:"5ce976089532a86ac262a2760367318b6f4b72a5",objective:"SENTIENT_CAPABILITY_TIER_AND_AUTHORITY_ENFORCEMENT_V1 bootstrap rev5 from verified rev2 bytes with strict compatibility updates for legacy Phase0 and Job2 callers. Explicit user-authorized protected-policy bootstrap. Fail closed on exact-head/digest/build/test/diff failure. No deploy, resize, paid compute, secret exposure, or certification mutation.",commands,commitMessage:"feat: enforce capability tiers and authority bounds",timeoutMs:1700000}));
