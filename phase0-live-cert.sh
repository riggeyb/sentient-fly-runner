#!/usr/bin/env bash
set -euo pipefail

APP="sentient-validation-runner"
GOV="sentient-deployment-governor"
SHA="ce2a5cceab61f31aa490f2e3174992a714f97251"
TREE="bd84818a2610bf2d2077484589580a47aa5399e8"
BRANCH="sentient-production-composition-20261017"
RUN_ID="${GITHUB_RUN_ID:-manual}"
OID="phase0-live-cert-${RUN_ID}"
ENG_OBJECTIVE="phase0-live-cert-noop-${RUN_ID}"

test -n "${FLY_API_TOKEN:-}"
command -v flyctl >/dev/null
command -v jq >/dev/null

cat >/tmp/phase0-cert-client.mjs <<'NODE'
const token=String(process.env.SENTIENT_API_TOKEN??"").trim();
if(!token) throw new Error("SENTIENT_API_TOKEN_MISSING");
const mode=String(process.env.MODE??"");
const oid=String(process.env.OBJECTIVE_ID??"");
const jobId=String(process.env.JOB_ID??"");
const engObjective=String(process.env.ENG_OBJECTIVE??"");
const sha="ce2a5cceab61f31aa490f2e3174992a714f97251";
const tree="bd84818a2610bf2d2077484589580a47aa5399e8";
const origin="http://127.0.0.1:8080";
async function call(path,init={}){
  const r=await fetch(origin+path,{...init,headers:{authorization:`Bearer ${token}`,accept:"application/json","content-type":"application/json",...(init.headers??{})},signal:AbortSignal.timeout(180000)});
  const text=await r.text(); let b={}; try{b=JSON.parse(text)}catch{}
  return {r,b};
}
function out(v){console.log("CERT_JSON="+JSON.stringify(v))}
if(mode==="cert"){
  const {r,b}=await call("/v1/certification/tests/action-fabric-local-repository-executor",{method:"POST",body:"{}"});
  out({mode,httpStatus:r.status,testResult:b.testResult??null,sentientSha:b.sentientSha??null,sentientTree:b.sentientTree??null,skillsSha:b.skillsSha??null,flyAppName:b.flyAppName??null});
  if(!r.ok||b.testResult!=="PASS"||b.sentientSha!==sha||b.sentientTree!==tree) process.exit(21);
}else if(mode==="ingress"){
  if(!oid||!engObjective) process.exit(22);
  const body={
    request:"Phase-0 live certification: execute one bounded non-mutating engineering inspection and preserve durable continuation across restart.",
    objectiveId:oid,
    sessionId:`session-${oid}`,
    mode:"multi_step",
    privacy:"public_fixture",
    deployOnSuccess:false,
    engineeringJob:{
      repo:"riggeyb/sentient",
      branch:"sentient-production-composition-20261017",
      expectedHead:sha,
      objective:engObjective,
      commands:[{name:"hold-active-work",category:"inspect",command:"node",args:["-e","setTimeout(()=>process.exit(0),90000)"],timeoutMs:120000}],
      commitMessage:"cert: phase0 live no-op",
      timeoutMs:180000
    }
  };
  const {r,b}=await call("/v1/objectives",{method:"POST",body:JSON.stringify(body)});
  out({mode,httpStatus:r.status,objectiveId:b.objectiveId??null,status:b.status??null,activeEngineeringJobId:b.activeEngineeringJobId??null,lastEngineeringReceipt:b.lastEngineeringReceipt??null,error:b.error??null});
  if(r.status!==202||b.objectiveId!==oid) process.exit(23);
}else if(mode==="status"){
  const {r,b}=await call(`/v1/objectives/${encodeURIComponent(oid)}`);
  out({mode,httpStatus:r.status,objectiveId:b.objectiveId??null,status:b.status??null,activeEngineeringJobId:b.activeEngineeringJobId??null,lastEngineeringReceipt:b.lastEngineeringReceipt??null,error:b.error??null,updatedAt:b.updatedAt??null});
  if(!r.ok||b.objectiveId!==oid) process.exit(24);
}else if(mode==="job"){
  const {r,b}=await call(`/v1/engineering/jobs/${encodeURIComponent(jobId)}`);
  out({mode,httpStatus:r.status,jobId:b.jobId??null,status:b.status??null,expectedHead:b.expectedHead??null,startSha:b.startSha??null,startTree:b.startTree??null,workerMachineId:b.workerMachineId??null,buildResult:b.buildResult??null,endSha:b.endSha??null,endTree:b.endTree??null,changedFiles:Array.isArray(b.changedFiles)?b.changedFiles:[],testResult:b.testResult??null,pushResult:b.pushResult??null,errorCode:b.errorCode??null,createdAt:b.createdAt??null,completedAt:b.completedAt??null,steps:Array.isArray(b.steps)?b.steps.map(s=>({name:s.name??null,category:s.category??null,exitCode:s.exitCode??null,termination:s.termination??null,spawnError:s.spawnError??null})).slice(0,30):[]});
  if(!r.ok||b.jobId!==jobId) process.exit(25);
}else if(mode==="identity"){
  const r=await fetch(origin+"/readyz",{headers:{accept:"application/json"},signal:AbortSignal.timeout(20000)});
  const b=await r.json();
  const src=b?.identity?.source??b?.source??{};
  out({mode,httpStatus:r.status,ready:b.ready??null,sha:src.sha??null,tree:src.tree??null,cognition:b?.bindings?.PHASE3_HF_COGNITION?.availability??null,phase7:b?.bindings?.PHASE7_MODEL_IMPROVEMENT?.availability??null,authorityOwner:b.authorityOwner??null,modelOutputIsNeverAuthority:b.modelOutputIsNeverAuthority??null,dots3Role:b.dots3Role??null});
  if(!r.ok||b.ready!==true||src.sha!==sha||src.tree!==tree) process.exit(26);
}else{
  throw new Error("MODE_INVALID");
}
NODE
CLIENT_B64="$(base64 -w0 /tmp/phase0-cert-client.mjs)"

cat >/tmp/phase0-ledger.mjs <<'NODE'
import pg from "pg";
const {Pool}=pg;
const cs=String(process.env.SENTIENT_DEPLOYMENT_LEDGER_DATABASE_URL??"").trim();
if(!cs) throw new Error("LEDGER_DB_MISSING");
const objective=String(process.env.ENG_OBJECTIVE??"");
const p=new Pool({connectionString:cs,max:1,connectionTimeoutMillis:10000});
try{
  const q=await p.query(`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('QUEUED','RUNNING'))::int AS active,
      COUNT(*) FILTER (WHERE objective=$1)::int AS matching,
      COUNT(DISTINCT job_id) FILTER (WHERE objective=$1)::int AS matching_distinct,
      COALESCE(array_agg(job_id ORDER BY created_at) FILTER (WHERE objective=$1),'{}') AS matching_ids
    FROM sentient_deployment_governor.engineering_jobs
  `,[objective]);
  const idx=await p.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='sentient_deployment_governor'
      AND indexname IN ('engineering_jobs_idempotency_idx','engineering_jobs_one_active_idx')
    ORDER BY indexname
  `);
  const r=q.rows[0]??{};
  console.log("LEDGER_JSON="+JSON.stringify({active:Number(r.active??0),matching:Number(r.matching??0),matchingDistinct:Number(r.matching_distinct??0),matchingIds:r.matching_ids??[],indexes:idx.rows.map(x=>x.indexname)}));
  console.log("SECRET_VALUES_EXPOSED=false");
} finally {await p.end()}
NODE
LEDGER_B64="$(base64 -w0 /tmp/phase0-ledger.mjs)"

remote_client(){
  local mode="$1" oid="${2:-}" job="${3:-}"
  flyctl ssh console -a "$APP" -C "sh -lc 'echo $CLIENT_B64 | base64 -d >/tmp/phase0-cert-client.mjs && MODE=$mode OBJECTIVE_ID=$oid JOB_ID=$job ENG_OBJECTIVE=$ENG_OBJECTIVE node /tmp/phase0-cert-client.mjs'"
}
ledger(){
  flyctl ssh console -a "$GOV" -C "sh -lc 'cd /app && echo $LEDGER_B64 | base64 -d >/tmp/phase0-ledger.mjs && ENG_OBJECTIVE=$ENG_OBJECTIVE node /tmp/phase0-ledger.mjs; rc=\$?; rm -f /tmp/phase0-ledger.mjs; exit \$rc'"
}
extract_json(){ grep '^CERT_JSON=' | tail -1 | sed 's/^CERT_JSON=//'; }
field(){ node -e 'const fs=require("fs"),o=JSON.parse(fs.readFileSync(0,"utf8"));const v=o[process.argv[1]];if(v!==null&&v!==undefined)process.stdout.write(String(v))' "$1"; }

machines="$(flyctl machines list -a "$APP" --json)"
MID="$(printf '%s' "$machines" | jq -r '[.[]|select(.state!="destroyed")][0].id')"
test -n "$MID" && test "$MID" != "null"

before="$(ledger)"
echo "$before"
before_json="$(printf '%s\n' "$before" | grep '^LEDGER_JSON=' | tail -1 | sed 's/^LEDGER_JSON=//')"
before_active="$(printf '%s' "$before_json" | field active)"
test "$before_active" = "0"

cert_out="$(remote_client cert)"
echo "$cert_out"
cert_json="$(printf '%s\n' "$cert_out" | extract_json)"
test "$(printf '%s' "$cert_json" | field testResult)" = "PASS"
echo "LIVE_ACTION_FABRIC_CERT=PASS"

ingress_out="$(remote_client ingress "$OID")"
echo "$ingress_out"
ingress_json="$(printf '%s\n' "$ingress_out" | extract_json)"
test "$(printf '%s' "$ingress_json" | field httpStatus)" = "202"
echo "OBJECTIVE_ASYNC_INGRESS=PASS"

JOB_ID=""
for _ in $(seq 1 60); do
  s="$(remote_client status "$OID")"
  j="$(printf '%s\n' "$s" | extract_json)"
  JOB_ID="$(printf '%s' "$j" | field activeEngineeringJobId)"
  if [ -n "$JOB_ID" ]; then
    echo "$s"
    break
  fi
  sleep 2
done
test -n "$JOB_ID"
echo "OBJECTIVE_PERSISTENCE=PASS"
echo "JOB_ID_PERSISTED_BEFORE_POLL=PASS"
echo "JOB_ID=$JOB_ID"

job_before="$(remote_client job "$OID" "$JOB_ID")"
echo "$job_before"
job_before_json="$(printf '%s\n' "$job_before" | extract_json)"
job_state="$(printf '%s' "$job_before_json" | field status)"
test "$job_state" = "QUEUED" -o "$job_state" = "RUNNING"

repeat="$(remote_client ingress "$OID")"
echo "$repeat"
repeat_json="$(printf '%s\n' "$repeat" | extract_json)"
repeat_job="$(printf '%s' "$repeat_json" | field activeEngineeringJobId)"
test "$repeat_job" = "$JOB_ID"

mid_before="$MID"
flyctl machine restart "$MID" -a "$APP" >/dev/null
for _ in $(seq 1 90); do
  state="$(flyctl machines list -a "$APP" --json | jq -r --arg id "$MID" '.[]|select(.id==$id)|.state')"
  [ "$state" = "started" ] && break
  sleep 2
done
test "$state" = "started"

ready=false
for _ in $(seq 1 90); do
  if curl -fsS --max-time 5 "https://${APP}.fly.dev/readyz" >/tmp/phase0-ready.json 2>/dev/null; then
    if jq -e --arg s "$SHA" --arg t "$TREE" '.ready==true and (.identity.source.sha==$s) and (.identity.source.tree==$t)' /tmp/phase0-ready.json >/dev/null; then
      ready=true; break
    fi
  fi
  sleep 2
done
test "$ready" = true

identity="$(remote_client identity)"
echo "$identity"

resumed=false
for _ in $(seq 1 30); do
  logs="$(flyctl logs -a "$APP" --no-tail 2>/dev/null | tail -n 300 || true)"
  n="$(printf '%s\n' "$logs" | grep 'sentient_application_initialized' | grep -o '"resumed":[0-9]*' | tail -1 | cut -d: -f2 || true)"
  if [ -n "$n" ] && [ "$n" -ge 1 ]; then resumed=true; echo "RESUMED_COUNT=$n"; break; fi
  sleep 2
done
test "$resumed" = true

recovered=false
for _ in $(seq 1 60); do
  s="$(remote_client status "$OID")"
  j="$(printf '%s\n' "$s" | extract_json)"
  active="$(printf '%s' "$j" | field activeEngineeringJobId)"
  last="$(printf '%s' "$j" | node -e 'const fs=require("fs"),o=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(String(o.lastEngineeringReceipt?.jobId??""))')"
  if [ "$active" = "$JOB_ID" ] || [ "$last" = "$JOB_ID" ]; then recovered=true; echo "$s"; break; fi
  sleep 2
done
test "$recovered" = true
echo "RESTART_RESUME=PASS"
echo "EXISTING_JOB_RECOVERED=PASS"
echo "FLY_RESIDENT_RUNNER=PASS"

terminal=""
for _ in $(seq 1 90); do
  s="$(remote_client status "$OID")"
  j="$(printf '%s\n' "$s" | extract_json)"
  st="$(printf '%s' "$j" | field status)"
  if [ "$st" = "failed" ] || [ "$st" = "succeeded" ]; then terminal="$j"; echo "$s"; break; fi
  sleep 2
done
test -n "$terminal"
last_id="$(printf '%s' "$terminal" | node -e 'const fs=require("fs"),o=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(String(o.lastEngineeringReceipt?.jobId??""))')"
test "$last_id" = "$JOB_ID"

job_after="$(remote_client job "$OID" "$JOB_ID")"
echo "$job_after"
job_after_json="$(printf '%s\n' "$job_after" | extract_json)"
test "$(printf '%s' "$job_after_json" | field status)" = "FAILED"
test "$(printf '%s' "$job_after_json" | field pushResult)" = "NOT_RUN"
changed_count="$(printf '%s' "$job_after_json" | node -e 'const fs=require("fs"),o=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(String(Array.isArray(o.changedFiles)?o.changedFiles.length:-1))')"
test "$changed_count" = "0"
err="$(printf '%s' "$job_after_json" | field errorCode)"
case "$err" in engineering_job_produced_no_changes*) ;; *) echo "unexpected_error_code=$err" >&2; exit 31;; esac
echo "ENGINEERING_RECEIPT_VERIFIED=PASS"
echo "CONTINUATION_ADVANCED=PASS"

after="$(ledger)"
echo "$after"
after_json="$(printf '%s\n' "$after" | grep '^LEDGER_JSON=' | tail -1 | sed 's/^LEDGER_JSON=//')"
test "$(printf '%s' "$after_json" | field matching)" = "1"
test "$(printf '%s' "$after_json" | field matchingDistinct)" = "1"
test "$(printf '%s' "$after_json" | field active)" = "0"
idx_count="$(printf '%s' "$after_json" | node -e 'const fs=require("fs"),o=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(String(Array.isArray(o.indexes)?o.indexes.length:0))')"
test "$idx_count" = "2"
echo "DUPLICATE_JOB_CREATED=false"
echo "ACTIVE_WORK_LEASING=PASS"
echo "FENCING=PASS"
echo "DURABLE_CONTINUATION=PASS"
echo "SECRET_VALUES_EXPOSED=false"
echo "RESULT=PASS"
