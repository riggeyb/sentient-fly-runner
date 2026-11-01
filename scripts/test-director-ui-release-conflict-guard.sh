#!/usr/bin/env bash
set -euo pipefail

SCRIPT="${1:-scripts/director-ui-release-preflight.sh}"
TMP="$(mktemp -d)"
CALL_LOG="$TMP/gh-calls.log"
trap 'rm -rf "$TMP"' EXIT

cat >"$TMP/gh" <<'FAKE_GH'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >>"$CALL_LOG"

if [[ "$*" == *"/cancel"* || "$*" == *"-X POST"* ]]; then
  echo "AUTO_CANCEL_ATTEMPTED=true" >>"$CALL_LOG"
  exit 97
fi

request="${2-}"
case "${FIXTURE:-none}:$request" in
  queued_zero:*cloudflare-convergence.yml/runs\?status=queued*)
    echo "40591948243"
    ;;
  queued_with_job:*cloudflare-convergence.yml/runs\?status=queued*)
    echo "50000000001"
    ;;
  in_progress:*director-202-convergence-proof.yml/runs\?status=in_progress*)
    echo "50000000002"
    ;;
  queued_zero:*actions/runs/40591948243/jobs*)
    echo "0"
    ;;
  queued_with_job:*actions/runs/50000000001/jobs*)
    echo "1"
    ;;
  *)
    ;;
esac
FAKE_GH
chmod +x "$TMP/gh"
: >"$CALL_LOG"

run_guard() {
  local fixture="$1"
  PATH="$TMP:$PATH" FIXTURE="$fixture" CALL_LOG="$CALL_LOG"     bash "$SCRIPT" --conflict-preflight-only
}

expect_block() {
  local fixture="$1"
  local expected_id="$2"
  local label="$3"
  local out status

  set +e
  out="$(run_guard "$fixture" 2>&1)"
  status=$?
  set -e

  test "$status" -ne 0
  grep -qx 'CONFLICTING_PRODUCTION_RUN=true' <<<"$out"
  grep -qx 'DUPLICATE_DEPLOY_GUARD=FAIL' <<<"$out"
  grep -q "^CONFLICTING_RUN_IDS=.*${expected_id}" <<<"$out"
  echo "$label=PASS"
}

jobs="$(
  PATH="$TMP:$PATH" FIXTURE=queued_zero CALL_LOG="$CALL_LOG"     gh api "repos/riggeyb/director-studio-beta/actions/runs/40591948243/jobs?per_page=100"       --jq '.total_count'
)"
test "$jobs" = "0"
expect_block queued_zero 40591948243 QUEUED_ZERO_JOB_PRODUCTION_RUN_BLOCKS

jobs="$(
  PATH="$TMP:$PATH" FIXTURE=queued_with_job CALL_LOG="$CALL_LOG"     gh api "repos/riggeyb/director-studio-beta/actions/runs/50000000001/jobs?per_page=100"       --jq .total_count'
)"
test "$jobs" = "1"
expect_block queued_with_job 5000000001 QUEUED_WITH_JOB_PRODUCTION_RUN_BLOCKS

expect_block in_progress 50000000002 IN_PROGRESS_PRODUCTION_RUN_BLOCKS

out="$(run_guard none)"
grep -qx 'CONFLICTING_PRODUCTION_RUN=false' <<<"$out"
grep -qx 'DUPLICATE_DEPLOY_GUARD=PASS' <<<"$out"
if grep -q '^CONFLICTING_RUN_IDS=' <<<"$out"; then
  echo "UNEXPECTED_CONFLICTING_RUN_IDS=true"
  exit 1
fi
echo "NO_ACTIVE_OR_QUEUED_PRODUCTION_RUNS_PASSES=PASS"

if grep -Eq '/cancel|-X POST' "$CALL_LOG"; then
  echo "CONFLICTING_RUN_AUTO_CANCELLED=true"
  exit 1
fi
if grep -Eq '/cancel|gh api[[:space:]]+-X[[:space:]]+0POST' "$SCRIPT"; then
  echo "PREFLIGHT_CONTAINS_AUTO_CANCEL=true"
  exit 1
fi

echo "CONFLICTING_RUN_NOT_AUTO_CANCELLED=true"
echo "PRODUCTION_DEPLOYMENT=false"
