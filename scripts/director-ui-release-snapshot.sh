#!/usr/bin/env bash
set -euo pipefail

S=5224ddaea0dd1a8b8aa6552a0fd44bd5b274840f
T=923fe70e94a0cb311bd578b45bed47c97d5b89d3
W=director-studio-beta

for k in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CF_ACCESS_POLICY_AUD DIRECTOR_SENTIENT_BASE_URL DIRECTOR_SENTIENT_TOKEN; do
  test -n "${!k:-}"
done

H="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
apps="$(curl -fsS -H "$H" --get --data-urlencode "aud=$CF_ACCESS_POLICY_AUD" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps")"
jq -e '.success==true and (.result|length)==1' >/dev/null <<<"$apps"
test "$(jq -r '.result[0].aud' <<<"$apps")" = "$CF_ACCESS_POLICY_AUD"

sub="$(curl -fsS -H "$H" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" | jq -er '.result.subdomain')"
U="https://$W.$sub.workers.dev"
test "$U" = "https://director-studio-beta.burke-steffan.workers.dev"

d="$(curl -fsS -H "$H" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$W/deployments")"
O="$(jq -er '(.result.deployments // .result)[0].id' <<<"$d")"
V="$(jq -er '(.result.deployments // .result)[0].versions[0].version_id' <<<"$d")"

headers="$RUNNER_TEMP/pre-access.headers"
code="$(curl -sS -D "$headers" -o /dev/null -w '%{http_code}' --max-time 20 "$U/" || true)"
test "$code" != "200"
if [ "$code" = "302" ]; then
  grep -qi '^location: .*cloudflareaccess.com' "$headers"
fi

h="$(curl -fsS --max-time 15 https://sentient-validation-runner.fly.dev/healthz)"
r="$(curl -fsS --max-time 15 https://sentient-validation-runner.fly.dev/readyz)"
jq -e --arg s "$S" --arg t "$T" '.status=="ok" and .application.identity.source.sha==$s and .application.identity.source.tree==$t' >/dev/null <<<"$h"
jq -e --arg s "$S" --arg t "$T" '.ready==true and .identity.source.sha==$s and .identity.source.tree==$t and .modelOutputIsNeverAuthority==true' >/dev/null <<<"$r"

printf 'DIRECTOR_URL=%s\nOLD_DEPLOY=%s\nOLD_VERSION=%s\n' "$U" "$O" "$V" >>"$GITHUB_ENV"
echo "CURRENT_DIRECTOR_DEPLOYMENT_ID=$O"
echo "CURRENT_DIRECTOR_VERSION_ID=$V"
echo "CLOUDFLARE_ACCESS_PRESENT=true"
echo "PREDEPLOY_SENTIENT_RESIDENCY=PASS"
