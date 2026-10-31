#!/usr/bin/env bash
set -euo pipefail

S=5224ddaea0dd1a8b8aa6552a0fd44bd5b274840f
T=923fe70e94a0cb311bd578b45bed47c97d5b89d3
W=director-studio-beta
H="Authorization: Bearer $CLOUDFLARE_API_TOKEN"

N=""
NV=""
for _ in $(seq 1 30); do
  d="$(curl -fsS -H "$H" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$W/deployments")"
  N="$(jq -er '(.result.deployments // .result)[0].id' <<<"$d")"
  NV="$(jq -er '(.result.deployments // .result)[0].versions[0].version_id' <<<"$d")"
  [ "$N" != "$OLD_DEPLOY" ] && break
  sleep 2
done
test -n "$N"
test "$N" != "$OLD_DEPLOY"
test -n "$NV"

headers="$RUNNER_TEMP/post-access.headers"
code="$(curl -sS -D "$headers" -o /dev/null -w '%{http_code}' --max-time 20 "$DIRECTOR_URL/" || true)"
test "$code" != "200"
if [ "$code" = "302" ]; then
  grep -qi '^location: .*cloudflareaccess.com' "$headers"
fi

h="$(curl -fsS --max-time 15 https://sentient-validation-runner.fly.dev/healthz)"
r="$(curl -fsS --max-time 15 https://sentient-validation-runner.fly.dev/readyz)"
jq -e --arg s "$S" --arg t "$T" '.status=="ok" and .application.identity.source.sha==$s and .application.identity.source.tree==$t' >/dev/null <<<"$h"
jq -e --arg s "$S" --arg t "$T" '.ready==true and .identity.source.sha==$s and .identity.source.tree==$t and .modelOutputIsNeverAuthority==true' >/dev/null <<<"$r"

echo "NEW_DEPLOY=$N" >>"$GITHUB_ENV"
echo "NEW_VERSION=$NV" >>"$GITHUB_ENV"
echo "DIRECTOR_DEPLOYMENT_ID=$N"
echo "DIRECTOR_VERSION_ID=$NV"
echo "DIRECTOR_DEPLOYMENT_ID_CHANGED=true"
echo "POST_DEPLOY_RESIDENCY=PASS"
echo "CLOUDFLARE_ACCESS_UNCHANGED=true"
echo "LIVE_SENTIENT_SHA_UNCHANGED=true"
echo "LIVE_SENTIENT_TREE_UNCHANGED=true"
echo "HUMAN_AUTHENTICATED_UI_SMOKE_REQUIRED=true"
