#!/usr/bin/env bash
set -euo pipefail

SCRIPT="${1:-scripts/director-ui-release-deploy.sh}"
SECRET_SENTINEL="do-not-print-secret-sentinel"

run_preflight() {
  env -i     PATH="$PATH"     CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN-}"     CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID-}"     CF_ACCESS_TEAM_DOMAIN="${CF_ACCESS_TEAM_DOMAIN-}"     CF_ACCESS_POLICY_AUD="${CF_ACCESS_POLICY_AUD-}"     DIRECTOR_SENTIENT_BASE_URL="${DIRECTOR_SENTIENT_BASE_URL-}"     DIRECTOR_SENTIENT_TOKEN="${DIRECTOR_SENTIENT_TOKEN-}"     bash "$SCRIPT" --binding-preflight-only
}

set_all_valid() {
  CLOUDFLARE_API_TOKEN="$SECRET_SENTINEL"
  CLOUDFLARE_ACCOUNT_ID="account-id"
  CF_ACCESS_TEAM_DOMAIN="team.example"
  CF_ACCESS_POLICY_AUD="policy-aud"
  DIRECTOR_SENTIENT_BASE_URL="https://sentient.example"
  DIRECTOR_SENTIENT_TOKEN="$SECRET_SENTINEL"
}

set_all_valid
out="$(run_preflight)"
grep -qx 'DIRECTOR_RELEASE_BINDING_PREFLIGHT=PASS' <<<"$out"
grep -qx 'REQUIRED_BINDINGS_PRESENT=true' <<<"$out"
if grep -Fq "$SECRET_SENTINEL" <<<"$out"; then
  echo "SECRET_VALUE_PRINTED=true"
  exit 1
fi
echo "ALL_REQUIRED_BINDINGS_NONEMPTY=true"
echo "PREFLIGHT_RESULT=PASS"
echo "DEPLOY_COMMAND_ELIGIBLE=true"
echo "SECRET_VALUE_PRINTED=false"

set_all_valid
unset DIRECTOR_SENTIENT_TOKEN
set +e
out="$(run_preflight 2>&1)"
status=$?
set -e
test "$status" -ne 0
grep -qx 'DIRECTOR_RELEASE_BINDING_PREFLIGHT=FAIL' <<<"$out"
grep -q 'MISSING_OR_EMPTY_BINDINGS=.*DIRECTOR_SENTIENT_TOKEN' <<<"$out"
if grep -Fq "$SECRET_SENTINEL" <<<"$out"; then
  echo "SECRET_VALUE_PRINTED=true"
  exit 1
fi
echo "MISSING_BINDING_IDENTIFIED=true"
echo "DEPLOY_COMMAND_EXECUTED=false"

set_all_valid
CF_ACCESS_POLICY_AUD=''
set +e
out="$(run_preflight 2>&1)"
status=$?
set -e
test "$status" -ne 0
grep -qx 'DIRECTOR_RELEASE_BINDING_PREFLIGHT=FAIL' <<<"$out"
grep -q 'MISSING_OR_EMPTY_BINDINGS=.*CF_ACCESS_POLICY_AUD' <<<"$out"
echo "EMPTY_BINDING_IDENTIFIED=true"
echo "DEPLOY_COMMAND_EXECUTED=false"

set_all_valid
CLOUDFLARE_ACCOUNT_ID=$' 	  '
set +e
out="$(run_preflight 2>&1)"
status=$?
set -e
test "$status" -ne 0
grep -qx 'DIRECTOR_RELEASE_BINDING_PREFLIGHT=FAIL' <<<"$out"
grep -q 'MISSING_OR_EMPTY_BINDINGS=.*CLOUDFLARE_ACCOUNT_ID' <<<"$out"
echo "WHITESPACE_ONLY_BINDING_IDENTIFIED=true"
echo "DEPLOY_COMMAND_EXECUTED=false"

preflight_line="$(grep -n '^director_release_binding_preflight$' "$SCRIPT" | tail -1 | cut -d: -f1)"
secrets_line="$(grep -n '^f=' "$SCRIPT" | tail -1 | cut -d: -f1)"
deploy_line="$(grep -n '^npx wrangler deploy ' "$SCRIPT" | tail -1 | cut -d: -f1)"
test "$preflight_line" -lt "$secrets_line"
test "$secrets_line" -lt "$deploy_line"

segment="$(sed -n "${preflight_line},$((deploy_line - 1))p" "$SCRIPT")"
if grep -Eq 'wrangler deploy|curl .*api\.cloudflare\.com|gh api .*deploy' <<<"$segment"; then
  echo "PRE_DEPLOY_MUTATION_BETWEEN_PREFLIGHT_AND_WRANGLER=true"
  exit 1
fi

echo "PREFLIGHT_IMMEDIATELY_BEFORE_DEPLOY_PATH=true"
echo "PRODUCTION_DEPLOYMENT=false"
