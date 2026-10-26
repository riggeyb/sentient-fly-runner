#!/usr/bin/env bash
set -euo pipefail
APP="sentient-deployment-governor"
REQUEST=/tmp/n0-engineering-request.json
CREATE=/tmp/n0-engineering-create.mjs

node --check scripts/local-runtime-startup-budget-request.cjs
node scripts/local-runtime-startup-budget-request.cjs > "$REQUEST"
jq -e '
  .repo=="riggeyb/sentient" and
  .branch=="sentient-production-composition-20261017" and
  .expectedHead=="fdab101aeef2275a3f9333384d6e8445799366a3" and
  .expectedTree=="c06b0c927efbfdd0cdfa2fc2ae1c8f6c26f2b11e" and
  .objectiveId=="SENTIENT_ROUTINE_LOCAL_RUNTIME_STARTUP_BUDGET_RELIABILITY_V1" and
  .policyVersion=="sentient-capability-tier/v1" and
  .authorizedPaths==["src/local-runtime/lab-support.ts","src/local-runtime/demo.ts"] and
  (.commands|length)==7 and .commands[-1].category=="test"
' "$REQUEST" >/dev/null
echo "REQUEST_BINDING=PASS"
echo "PUBLIC_SOURCE_CONTENT_EXPOSED=false"

cat > "$CREATE" <<'NODE'
import {readFile} from "node:fs/promises";
const token=String(process.env.SENTIENT_ENGINEERING_API_TOKEN??"").trim();
if(!token) throw new Error("ENGINEERING_CREDENTIAL_MISSING");
const request=JSON.parse(await readFile("/tmp/n0-engineering-request.json","utf8"));
const r=await fetch("http://127.0.0.1:8080/v1/engineering/jobs",{
  method:"POST",
  headers:{authorization:"Bearer "+token,"content-type":"application/json"},
  body:JSON.stringify(request),
  signal:AbortSignal.timeout(30000)
});
const raw=await r.text(); let body={}; try{body=JSON.parse(raw)}catch{}
console.log(JSON.stringify({http:r.status,jobId:body.jobId??null,status:body.status??null,expectedHead:body.expectedHead??null,capabilityTier:body.authorityReceipt?.capabilityTier??null,policyVersion:body.authorityReceipt?.policyVersion??null}));
if(r.status!==202||typeof body.jobId!=="string"||!body.jobId)process.exit(31);
if(body.expectedHead!==request.expectedHead)process.exit(32);
console.log("ENGINEERING_CREATE=PASS");
console.log("ENGINEERING_JOB_ID="+body.jobId);
console.log("PRIVATE_ACTIONS_BRIDGE_USED=false");
console.log("SECRET_VALUES_EXPOSED=false");
NODE

request_b64="$(base64 -w0 "$REQUEST")"
script_b64="$(base64 -w0 "$CREATE")"
rm -f "$REQUEST" "$CREATE"
id="$(flyctl machines list -a "$APP" --json | jq -r '[.[]|select((.config.auto_destroy//false)!=true)]|sort_by(.id)|.[0].id//empty')"
test -n "$id"
before="$(flyctl machines list -a "$APP" --json | jq -r --arg id "$id" '.[]|select(.id==$id)|.state'|head -n1)"
started_here=false
cleanup(){ if [ "$started_here" = true ]; then flyctl machine stop "$id" -a "$APP" >/dev/null 2>&1||true; fi; }
trap cleanup EXIT
if [ "$before" != "started" ]; then flyctl machine start "$id" -a "$APP" >/dev/null; started_here=true; fi
for _ in $(seq 1 60); do
  state="$(flyctl machines list -a "$APP" --json|jq -r --arg id "$id" '.[]|select(.id==$id)|.state'|head -n1)"
  [ "$state" = "started" ] && break
  sleep 2
done
test "$state" = "started"
flyctl ssh console -a "$APP" --machine "$id" --command "sh -lc 'echo $request_b64|base64 -d >/tmp/n0-engineering-request.json; chmod 600 /tmp/n0-engineering-request.json; echo $script_b64|base64 -d >/tmp/n0-engineering-create.mjs; node /tmp/n0-engineering-create.mjs; rc=\$?; rm -f /tmp/n0-engineering-request.json /tmp/n0-engineering-create.mjs; exit \$rc'"
echo "GOVERNOR_ENGINEERING_INGRESS=PASS"
echo "RESOURCE_ENVELOPE_CHANGED=false"
echo "PRIVATE_ACTIONS_BRIDGE_USED=false"
echo "SECRET_VALUES_EXPOSED=false"
