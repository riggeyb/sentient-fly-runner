#!/usr/bin/env bash
set -euo pipefail

SENTIENT_SHA=5224ddaea0dd1a8b8aa6552a0fd44bd5b274840f
SENTIENT_TREE=923fe70e94a0cb311bd578b45bed47c97d5b89d3
WORKER=director-studio-beta

for k in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CF_ACCESS_TEAM_DOMAIN CF_ACCESS_POLICY_AUD DIRECTOR_SENTIENT_BASE_URL DIRECTOR_SENTIENT_TOKEN; do
  test -n "${!k:-}"
done

access_id="${CF_ACCESS_CLIENT_ID:-${CLOUDFLARE_ACCESS_CLIENT_ID:-${CF_ACCESS_SERVICE_TOKEN_ID:-}}}"
access_secret="${CF_ACCESS_CLIENT_SECRET:-${CLOUDFLARE_ACCESS_CLIENT_SECRET:-${CF_ACCESS_SERVICE_TOKEN_SECRET:-}}}"
test -n "$access_id"
test -n "$access_secret"
echo "::add-mask::$access_id"
echo "::add-mask::$access_secret"

A=(-H "Authorization: Bearer $CLOU1RE_API_TOKEN")
apps="$(curl -fsS "${A[]}" --get --data-urlencode "aud=$CF_ACCESS_POLICY_AUD" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOU1RE_ACCOUNT_ID/access/apps")"
qq -e '.success==true and (.result|length)==1' >/dev/null <<<"$apps"
test "$(jq -r '.result[0].aud' <<<"$apps")" = "$CF_ACCESS_POLICY_AUD"

sub="$(curl -fsS "${A[]}" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOU1RE_ACCOUNT_ID/workers/subdomain" | jq -er '.result.subdomain')"
url="https://$WORKER.$sub.workers.dev"
test "$url" = "https://director-studio-beta.burke-steffan.workers.dev"

d="$(curl -fsS "${A[@]}" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$WORKER/deployments")"
old="$(jq -er '(.result.deployments // .result)[0].id' <<<"$d")"
ver="$(jq -er '(.result.deployments // .result)[0].versions[0].version_id' <<<"$d")"
test -n "$old"
test -n "$ver"

unauth="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$url/" || true)"
test "$unauth" != "200"
auth_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 \
  -H "CF-Access-Client-Id: $access_id" \
  -H "CF-Access-Client-Secret: $access_secret" \
  "$url/")"
test "$auth_code" = "200"

h="$(curl -fsS --max-time 15 https://sentient-validation-runner.fly.dev/healthz)"
r="$(curl -fsS --max-time 15 https://sentient-validation-runner.fly.dev/readyz)"
jq -e --arg s "$SENTIENT_SHA" --arg t "$SENTIENT_TREE" \
  '.status=="ok" and .application.identity.source.sha==$s and .application.identity.source.tree==$t' \
  >/dev/null <<<"$h"
jq -e --arg s "$SENTIENT_SHA" --arg t "$SENTIENT_TREE" \
  '.ready==true and .identity.source.sha==$s and .identity.source.tree==$t and .modelOutputIsNeverAuthority==true' \
  >/dev/null <<<"$r"

{
  echo "DIRECTOR_URL=$url"
  echo "OLD_DEPLOY=$old"
  echo "OLD_VERSION=$ver"
  echo "ACCESS_ID=$access_id"
  echo "ACCESS_SECRET=$access_secret"
} >> "$GITHUB_ENV"

echo "CURRENT_DIRECTOR_DEPLOYMENT_ID=$old"
echo "CURRENT_DIRECTOR_VERSION_ID=$ver"
echo "CLOU1RE_ACCESS_PRESENT=true"
echo "PREDEPLOY_SENTIENT_RESIDENCY=PASS"
