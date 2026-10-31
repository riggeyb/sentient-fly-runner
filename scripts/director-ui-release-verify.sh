#!/usr/bin/env bash
set -euo pipefail

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

body="$RUNNER_TEMP/post-access.body"
head="$RUNNER_TEMP/post-access.headers"
code="$(curl -sS -o "$body" -D "$head" -w '%{http_code}' --max-time 20 "$DIRECTOR_URL/" || true)"
test "$code" != "200"
if [ "$code" = "302" ]; then
  grep -qiE 'location:.*(cloudflareaccess|cloudflare)' "$head" "$body"
elif [ "$code" != "401" ] && [ "$code" != "403" ]; then
  grep -qiE 'cloudflare|access' "$head" "$body"
fi
rm -f "$body" "$head"

echo "NEW_DEPLOY=$N" >>"$GITHUB_ENV"
echo "NEW_VERSION=$NV" >>"$GITHUB_ENV"
echo "DIRECTOR_DEPLOYMENT_ID=$N"
echo "DIRECTOR_VERSION_ID=$NV"
echo "DIRECTOR_DEPLOYMENT_ID_CHANGED=true"
echo "POST_DEPLOY_RESIDENCY=PASS"
echo "CLOUDFLARE_ACCESS_UNCHANGED=true"
echo "POST_DEPLOY_SENTIENT_AUDIT_REQUIRED=true"
echo "HUMAN_AUTHENTICATED_UI_SMOKE_REQUIRED=true"
