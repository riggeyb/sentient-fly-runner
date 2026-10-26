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

GOVERNOR_SCRIPT="/tmp/private-engineering-governor-${GITHUB_RUN_ID}.mjs"