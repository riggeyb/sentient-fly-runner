#!/usr/bin/env bash
set -euo pipefail

APP="sentient-deployment-governor"
REQUEST=/tmp/local-hf-engineering-request.json
CREATE=/tmp/local-hf-engineering-create.mjs

node scripts/local-hf-crash-isolation-request.cjs > "$REQUEST"
jq -e '
  .repo=="riggeyb/sentient" and
  .branch=="sentient-production-composition-20261017" and
  .expectedHead=="7d54e0f5b77b65bc4984cd5a667084e12eb738c1" and
  .expectedTree=="3f1929fead05d17b182bea29c168faeafbcc1a98" and
  .policyVersion=="sentient-capability-tier/v1" and
  .commitMessage=="fix: isolate local HF native runtime in child process" and
  .authorizedPaths==[
    "src/model/providers/huggingface.ts",
    "src/model/providers/huggingface-worker.ts",
    "test/local-hf-worker-isolation.test.ts"
  ] and
  (.commands|length)==7 and
  .commands[-1].category=="test"
' "$REQUEST" >/dev/null

cat > "$CREATE" <<'NODE'
import { readFile } from "node:fs/promises";
const token=String(process.env.SENTIENT_ENGINEERING_API_TOKEN??"").trim();
if(!token) throw new Error("GOVERNOR_RESIDENT_ENGINEERING_CREDENTIAL_MISSING");
const request=JSON.parse(await readFile("/tmp/local-hf-engineering-request.json","utf8"));
const r=await fetch("http://127.0.0.1:8080/v1/engineering/jobs",{
  method:"POST",
  headers:{authorization:"Bearer "+token,"content-type":"application/json"},
  body:JSON.stringify(request),
  signal:AbortSignal.timeout(30000)
});
const raw=await r.text();
let body={}; try{body=JSON.parse(raw)}catch{}
const out={HTTP_STATUS:r.status};
for(const k of ["contract","jobId","repo","branch","expectedHead","status","createdAt"]) if(k in body) out[k]=body[k];
if(body.authorityReceipt&&typeof body.authorityReceipt==="object"){
  const a=body.authorityReceipt;
  out.authorityReceipt={actionId:a.actionId??null,actionType:a.actionType??null,capabilityTier:a.capabilityTier??null,policyVersion:a.policyVersion??null,sourceSha:a.sourceSha??null,sourceTree:a.sourceTree??null,authorizedScope:a.authorizedScope??null};
}
console.log(JSON.stringify(out));
if(r.status!==202 || typeof body.jobId!=="string" || !body.jobId) process.exit(31);
if(body.expectedHead!==request.expectedHead) process.exit(32);
console.log("ENGINEERING_CREATE=PASS");
console.log("JOB_ID="+body.jobId);
console.log("PRIVATE_ACTIONS_BRIDGE_USED=false");
console.log("SECRET_VALUES_EXPOSED=false");
NODE

request_b64="$(base64 -w0 "$REQUEST")"
script_b64="$(base64 -w0 "$CREATE")"
id="$(flyctl machines list -a "$APP" --json | jq -r '[.[] | select((.config.auto_destroy // false) != true)] | sort_by(.id) | .[0].id // empty')"
test -n "$id"
before="$(flyctl machines list -a "$APP" --json | jq -r --arg id "$id" '.[]|select(.id==$id)|.state' | head -n1)"
test -n "$before"
started_here=false
cleanup() {
  rm -f "$REQUEST" "$CREATE"
  if [ "$started_here" = true ]; then flyctl machine stop "$id" -a "$APP" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
if [ "$before" != "started" ]; then
  flyctl machine start "$id" -a "$APP" >/dev/null
  started_here=true
fi
state="$before"
for _ in $(seq 1 60); do
  state="$(flyctl machines list -a "$APP" --json | jq -r --arg id "$id" '.[]|select(.id==$id)|.state' | head -n1)"
  [ "$state" = "started" ] && break
  sleep 2
done
test "$state" = "started"
flyctl ssh console -a "$APP" --machine "$id" --command "sh -lc 'echo $request_b64 | base64 -d >/tmp/local-hf-engineering-request.json && echo $script_b64 | base64 -d >/tmp/local-hf-engineering-create.mjs && node /tmp/local-hf-engineering-create.mjs; rc=\$?; rm -f /tmp/local-hf-engineering-request.json /tmp/local-hf-engineering-create.mjs; exit \$rc'"
echo "GOVERNOR_ENGINEERING_INGRESS=PASS"
echo "GOVERNOR_MACHINE_PRIOR_STATE=$before"
echo "RESOURCE_ENVELOPE_CHANGED=false"
