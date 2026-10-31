#!/usr/bin/env bash
set -euo pipefail
W=director-studio-beta
if [ "${DEPLOYED:-false}" != "true" ]; then
  echo "ROLLBACK_REQUIRED=false"
  exit 0
fi
H="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
d="$(curl -fsS -H "$H" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$W/deployments")"
cur="$(jq -er '(.result.deployments // .result)[0].id' <<<"$d")"
if [ "$cur" = "$OLD_DEPLOY" ]; then
  echo "ROLLBACK_REQUIRED=false"
  exit 0
fi
echo "ROLLBACK_REQUIRED=true"
npx wrangler versions deploy "${OLD_VERSION}@100%" --name "$W" --yes
for _ in $(seq 1 30); do
  d="$(curl -fsS -H "$H" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$W/deployments")"
  v="$(jq -er '(.result.deployments // .result)[0].versions[0].version_id' <<<"$d")"
  [ "$v" = "$OLD_VERSION" ] && break
  sleep 2
done
test "$v" = "$OLD_VERSION"
echo "ROLLBACK_STATUS=PASS"
echo "PREVIOUS_DIRECTOR_DEPLOYMENT_RESTORED=true"
echo "SENTIENT_UNCHANGED=true"
