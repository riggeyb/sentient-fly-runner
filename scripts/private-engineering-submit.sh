#!/usr/bin/env bash
set -euo pipefail
for n in FLY_API_TOKEN ISSUE_NUMBER REQUEST_SHA256 EXPECTED_HEAD EXPECTED_TREE OBJECTIVE_ID; do test -n "${!n:-}"; done
APP="${APP:-sentient-deployment-governor}"
[[ "$ISSUE_NUMBER" =~ ^[0-9]{1,10}$ ]]
[[ "$REQUEST_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$EXPECTED_HEAD" =~ ^[0-9a-f]{40}$ ]]
[[ "$EXPECTED_TREE" =~ ^[0-9a-f]{40}$ ]]
[[ "$OBJECTIVE_ID" =~ ^[A-Za-z0-9._:/-]{1,200}$ ]]
m="$(flyctl machines list -a "$APP" --json | jq -r '[.[]|select((.config.auto_destroy//false)!=true and .state=="started")]|sort_by(.id)|.[0].id//empty')"
test -n "$m"
p="/tmp/pe-${GITHUB_RUN_ID}.mjs"
cat >/tmp/pe.mjs <<'NODE'
import{createHash}from"node:crypto";import{gunzipSync}from"node:zlib";
const n=k=>{const v=String(process.env[k]??"").trim();if(!v)throw Error(k+"_MISSING");return v};
const issue=n("ISSUE_NUMBER"),hash=n("REQUEST_SHA256"),head=n("EXPECTED_HEAD"),tree=n("EXPECTED_TREE"),objective=n("OBJECTIVE_ID");
const sr=await fetch(`https://api.github.com/repos/riggeyb/sentient/issues/${issue}`,{headers:{authorization:`Bearer ${n("SENTIENT_SOURCE_GITHUB_TOKEN")}`,accept:"application/vnd.github+json","x-github-api-version":"2022-11-28","user-agent":"sentient-governor-private-submit"},signal:AbortSignal.timeout(15000)});
if(!sr.ok)throw Error(`PRIVATE_ISSUE_HTTP_${sr.status}`);
const body=await sr.json(),match=String(body.body??"").match(/REQUEST_BASE64_BEGIN\s+([A-Za-z0-9+/=\s]+?)\s+REQUEST_BASE64_END/);if(!match)throw Error("REQUEST_MISSING");
const b=gunzipSync(Buffer.from(match[1].replace(/\s+/g,""),"base64"));if(createHash("sha256").update(b).digest("hex")!==hash)throw Error("DIGEST_MISMATCH");
const r=JSON.parse(b);if(r.repo!=="riggeyb/sentient"||r.branch!=="sentient-production-composition-20261017"||r.expectedHead!==head||r.expectedTree!==tree||r.objectiveId!==objective||r.policyVersion!=="sentient-capability-tier/v1")throw Error("BINDING_MISMATCH");
if(!Array.isArray(r.authorizedPaths)||r.authorizedPaths.length<1||r.authorizedPaths.length>16||!Array.isArray(r.commands)||r.commands.length<1||r.commands.at(-1)?.category!=="test")throw Error("SCOPE_INVALID");
const x=await fetch("http://127.0.0.1:8080/v1/engineering/jobs",{method:"POST",headers:{authorization:`Bearer ${n("SENTIENT_ENGINEERING_API_TOKEN")}`,"content-type":"application/json"},body:JSON.stringify(r),signal:AbortSignal.timeout(30000)});
const o=await x.json().catch(()=>({}));if(!x.ok)throw Error(`ENGINEERING_CREATE_HTTP_${x.status}`);if(typeof o.jobId!=="string"||!o.jobId)throw Error("JOB_ID_MISSING");
console.log(`ENGINEERING_JOB_ID=${o.jobId}`);console.log(`ENGINEERING_STATUS=${String(o.status??"unknown")}`);console.log("PRIVATE_REQUEST_DIGEST=PASS");console.log("PRIVATE_REQUEST_FETCH_BOUNDARY=RESIDENT_GOVERNOR");console.log("PRIVATE_ACTIONS_BRIDGE_USED=false");console.log("SECRET_VALUES_EXPOSED=false");
NODE
s="$(base64 -w0 /tmp/pe.mjs)";rm -f /tmp/pe.mjs
flyctl ssh console -a "$APP" --machine "$m" --command "sh -lc 'echo $s|base64 -d >$p; ISSUE_NUMBER=$ISSUE_NUMBER REQUEST_SHA256=$REQUEST_SHA256 EXPECTED_HEAD=$EXPECTED_HEAD EXPECTED_TREE=$EXPECTED_TREE OBJECTIVE_ID=$OBJECTIVE_ID node $p; rc=\$?; rm -f $p; exit \$rc'"
echo "GOVERNOR_ENGINEERING_INGRESS=PASS"
echo "RESOURCE_ENVELOPE_CHANGED=false"
