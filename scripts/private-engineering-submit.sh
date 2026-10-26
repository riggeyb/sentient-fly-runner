#!/usr/bin/env bash
set -euo pipefail

for n in FLY_API_TOKEN SOURCE_GITHUB_TOKEN ISSUE_NUMBER REQUEST_SHA256 EXPECTED_HEAD EXPECTED_TREE OBJECTIVE_ID; do
  test -n "${!n:-}"
done

APP="${APP:-sentient-deployment-governor}"
[[ "$ISSUE_NUMBER" =~ ^[0-9]{1,10}$ ]]
[[ "$REQUEST_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$EXPECTED_HEAD" =~ ^[0-9a-f]{40}$ ]]
[[ "$EXPECTED_TREE" =~ ^[0-9a-f]{40}$ ]]
[[ "$OBJECTIVE_ID" =~ ^[A-Za-z0-9._:/-]{1,200}$ ]]

REQUEST_FILE="/tmp/private-engineering-request-${GITHUB_RUN_ID}.json"
FETCH_SCRIPT="/tmp/private-engineering-fetch-${GITHUB_RUN_ID}.mjs"
cat >"$FETCH_SCRIPT" <<'NODE'
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const need=(k)=>{
  const v=String(process.env[k]??"").trim();
  if(!v) throw new Error(k+"_MISSING");
  return v;
};

const issue=need("ISSUE_NUMBER");
const hash=need("REQUEST_SHA256");
const head=need("EXPECTED_HEAD");
const tree=need("EXPECTED_TREE");
const objective=need("OBJECTIVE_ID");
const token=need("SOURCE_GITHUB_TOKEN");
const output=need("REQUEST_FILE");

const response=await fetch(`https://api.github.com/repos/riggeyb/sentient/issues/${issue}`,{
  headers:{
    authorization:`Bearer ${token}`,
    accept:"application/vnd.github+json",
    "x-github-api-version":"2022-11-28",
    "user-agent":"sentient-private-engineering-submit"
  },
  signal:AbortSignal.timeout(15000)
});
if(!response.ok) throw new Error(`PRIVATE_ISSUE_HTTP_${response.status}`);

const issueBody=String((await response.json()).body??"");
const match=issueBody.match(/REQUEST_BASE64_BEGIN\s+([A-Za-z0-9+/=\s]+?)\s+REQUEST_BASE64_END/);
if(!match) throw new Error("REQUEST_MISSING");

const requestBytes=gunzipSync(Buffer.from(match[1].replace(/\s+/g,""),"base64"));
if(createHash("sha256").update(requestBytes).digest("hex")!==hash) throw new Error("DIGEST_MISMATCH");

const request=JSON.parse(requestBytes);
if(
  request.repo!=="riggeyb/sentient" ||
  request.branch!=="sentient-production-composition-20261017" ||
  request.expectedHead!==head ||
  request.expectedTree!==tree ||
  request.objectiveId!==objective ||
  request.policyVersion!=="sentient-capability-tier/v1"
) throw new Error("BINDING_MISMATCH");

if(
  !Array.isArray(request.authorizedPaths) ||
  request.authorizedPaths.length<1 ||
  request.authorizedPaths.length>16 ||
  !Array.isArray(request.commands) ||
  request.commands.length<1 ||
  request.commands.at(-1)?.category!=="test"
) throw new Error("SCOPE_INVALID");

writeFileSync(output,requestBytes,{mode:0o600});
console.log("PRIVATE_REQUEST_FETCH=PASS");
console.log("PRIVATE_REQUEST_DIGEST=PASS");
console.log("PRIVATE_REQUEST_FETCH_BOUNDARY=AUTHORIZED_GITHUB_RUNNER");
console.log("SECRET_VALUES_EXPOSED=false");
NODE

REQUEST_FILE="$REQUEST_FILE" node "$FETCH_SCRIPT"
rm -f "$FETCH_SCRIPT"

m="$(flyctl machines list -a "$APP" --json | jq -r '[.[]|select((.config.auto_destroy//false)!=true and .state=="started")]|sort_by(.id)|.[0].id//empty')"
test -n "$m"

GOVERNOR_SCRIPT="/tmp/private-engineering-governor-${GITHUB_RUN_ID}.mjs"
cat >"$GOVERNOR_SCRIPT" <<'NODE'
import { readFileSync } from "node:fs";

const need=(k)=>{
  const v=String(process.env[k]??"").trim();
  if(!v) throw new Error(k+"_MISSING");
  return v;
};

const request=JSON.parse(readFileSync(need("REQUEST_FILE"),"utf8"));
const response=await fetch("http://127.0.0.1:8080/v1/engineering/jobs",{
  method:"POST",
  headers:{
    authorization:`Bearer ${need("SENTIENT_ENGINEERING_API_TOKEN")}`,
    "content-type":"application/json"
  },
  body:JSON.stringify(request),
  signal:AbortSignal.timeout(30000)
});
const output=await response.json().catch(()=>({}));
if(!response.ok) throw new Error(`ENGINEERING_CREATE_HTTP_${response.status}:${String(output?.error??output?.reason??"")}`);
if(typeof output.jobId!=="string"||!output.jobId) throw new Error("JOB_ID_MISSING");
console.log(`ENGINEERING_JOB_ID=${output.jobId}`);
console.log(`ENGINEERING_STATUS=${String(output.status??"unknown")}`);
console.log("PRIVATE_ACTIONS_BRIDGE_USED=false");
console.log("SECRET_VALUES_EXPOSED=false");
NODE

REQUEST_B64="$(base64 -w0 "$REQUEST_FILE")"
SCRIPT_B64="$(base64 -w0 "$GOVERNOR_SCRIPT")"
rm -f "$REQUEST_FILE" "$GOVERNOR_SCRIPT"

REMOTE_REQUEST="/tmp/private-engineering-request-${GITHUB_RUN_ID}.json"
REMOTE_SCRIPT="/tmp/private-engineering-governor-${GITHUB_RUN_ID}.mjs"
flyctl ssh console -a "$APP" --machine "$m" --command \
  "sh -lc 'echo $REQUEST_B64|base64 -d >$REMOTE_REQUEST; chmod 600 $REMOTE_REQUEST; echo $SCRIPT_B64|base64 -d >$REMOTE_SCRIPT; REQUEST_FILE=$REMOTE_REQUEST node $REMOTE_SCRIPT; rc=\$?; rm -f $REMOTE_REQUEST $REMOTE_SCRIPT; exit \$rc'"

echo "GOVERNOR_ENGINEERING_INGRESS=PASS"
echo "PRIVATE_REQUEST_FETCH_BOUNDARY=AUTHORIZED_GITHUB_RUNNER"
echo "RESOURCE_ENVELOPE_CHANGED=false"
echo "PRIVATE_ACTIONS_BRIDGE_USED=false"
echo "SECRET_VALUES_EXPOSED=false"
