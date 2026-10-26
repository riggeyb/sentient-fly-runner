#!/usr/bin/env bash
set -euo pipefail
: "${FLY_API_TOKEN:?}" "${SOURCE_GITHUB_TOKEN:?}" "${ISSUE_NUMBER:?}" "${REQUEST_SHA256:?}" "${EXPECTED_HEAD:?}" "${EXPECTED_TREE:?}" "${OBJECTIVE_ID:?}"
APP="${APP:-sentient-deployment-governor}"
[[ "$ISSUE_NUMBER" =~ ^[0-9]{1,10}$ ]]
[[ "$REQUEST_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$EXPECTED_HEAD" =~ ^[0-9a-f]{40}$ ]]
[[ "$EXPECTED_TREE" =~ ^[0-9a-f]{40}$ ]]

code="$(curl -sS -o /tmp/pe-issue.json -w '%{http_code}' \
  -H "Authorization: Bearer $SOURCE_GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/riggeyb/sentient/issues/$ISSUE_NUMBER")"
test "$code" = 200
node >/tmp/pe-request.b64 <<'NODE'
const f=require("fs"),z=require("zlib"),c=require("crypto"),i=JSON.parse(f.readFileSync("/tmp/pe-issue.json","utf8"));
const m=String(i.body??"").match(/REQUEST_BASE64_BEGIN\s+([A-Za-z0-9+/=\s]+?)\s+REQUEST_BASE64_END/);if(!m)throw Error("REQUEST_MISSING");
const gz=Buffer.from(m[1].replace(/\s+/g,""),"base64"),b=z.gunzipSync(gz),r=JSON.parse(b);
if(c.createHash("sha256").update(b).digest("hex")!==process.env.REQUEST_SHA256)throw Error("DIGEST_MISMATCH");
if(r.repo!=="riggeyb/sentient"||r.branch!=="sentient-production-composition-20261017"||r.expectedHead!==process.env.EXPECTED_HEAD||r.expectedTree!==process.env.EXPECTED_TREE||r.objectiveId!==process.env.OBJECTIVE_ID||r.policyVersion!=="sentient-capability-tier/v1")throw Error("BINDING_MISMATCH");
if(!Array.isArray(r.authorizedPaths)||r.authorizedPaths.length<1||r.authorizedPaths.length>16||!Array.isArray(r.commands)||r.commands.length<1||r.commands.at(-1)?.category!=="test")throw Error("SCOPE_OR_TEST_INVALID");
process.stdout.write(gz.toString("base64"));
NODE
rm -f /tmp/pe-issue.json

machines="$(flyctl machines list -a "$APP" --json)"
machine="$(jq -r '[.[]|select((.config.auto_destroy//false)!=true and .state=="started")][0].id//empty' <<<"$machines")"
test -n "$machine"
rr="/tmp/pe-${GITHUB_RUN_ID}.b64"
rs="/tmp/pe-${GITHUB_RUN_ID}.mjs"
cleanup(){ rm -f /tmp/pe-request.b64 /tmp/pe-submit.mjs; flyctl ssh console -a "$APP" --machine "$machine" --command "sh -lc 'rm -f $rr $rs'" >/dev/null 2>&1 || true; }
trap cleanup EXIT

flyctl ssh console -a "$APP" --machine "$machine" --command "sh -lc ': > $rr'" >/dev/null
while IFS= read -r chunk; do
  test -n "$chunk"
  flyctl ssh console -a "$APP" --machine "$machine" --command "sh -lc \"printf '%s' '$chunk' >> $rr\"" >/dev/null
done < <(fold -w 1800 /tmp/pe-request.b64)

cat >/tmp/pe-submit.mjs <<'NODE'
import {createHash} from "node:crypto";import {gunzipSync} from "node:zlib";import {readFile} from "node:fs/promises";
const n=x=>{const v=String(process.env[x]??"").trim();if(!v)throw Error(`${x}_MISSING`);return v};
const gz=Buffer.from((await readFile(n("REQUEST_PATH"),"utf8")).trim(),"base64"),b=gunzipSync(gz);
if(createHash("sha256").update(b).digest("hex")!==n("REQUEST_SHA256"))throw Error("DIGEST_MISMATCH");
const r=JSON.parse(b);if(r.expectedHead!==n("EXPECTED_HEAD")||r.expectedTree!==n("EXPECTED_TREE")||r.objectiveId!==n("OBJECTIVE_ID"))throw Error("BINDING_MISMATCH");
const x=await fetch("http://127.0.0.1:8080/v1/engineering/jobs",{method:"POST",headers:{authorization:`Bearer ${n("SENTIENT_ENGINEERING_API_TOKEN")}`,"content-type":"application/json"},body:JSON.stringify(r),signal:AbortSignal.timeout(30000)});
const o=await x.json().catch(()=>({}));if(!x.ok)throw Error(`ENGINEERING_CREATE_HTTP_${x.status}`);if(typeof o.jobId!=="string"||!o.jobId)throw Error("JOB_ID_MISSING");
console.log(`ENGINEERING_JOB_ID=${o.jobId}`);console.log(`ENGINEERING_STATUS=${String(o.status??"unknown")}`);console.log("PRIVATE_REQUEST_DIGEST=PASS");console.log("PRIVATE_ACTIONS_BRIDGE_USED=false");console.log("SECRET_VALUES_EXPOSED=false");
NODE
s="$(base64 -w0 /tmp/pe-submit.mjs)"
flyctl ssh console -a "$APP" --machine "$machine" --command "sh -lc 'echo $s|base64 -d >$rs; REQUEST_PATH=$rr REQUEST_SHA256=$REQUEST_SHA256 EXPECTED_HEAD=$EXPECTED_HEAD EXPECTED_TREE=$EXPECTED_TREE OBJECTIVE_ID=$OBJECTIVE_ID node $rs'"
