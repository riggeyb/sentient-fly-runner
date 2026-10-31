#!/usr/bin/env bash
set -euo pipefail

S=5224ddaea0dd1a8b8aa6552a0fd44bd5b274840f
T=923fe70e94a0cb311bd578b45bed47c97d5b89d3
W=director-studio-beta

for k in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; do
  test -n "${!k:-}"
done

H="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
sub="$(curl -fsS -H "$H" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" | jq -er '.result.subdomain')"
U="https://$W.$sub.workers.dev"
test "$U" = "https://director-studio-beta.burke-steffan.workers.dev"

d="$(curl -fsS -H "$H" "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$W/deployments")"
O="$(jq -er '(.result.deployments // .result)[0].id' <<<"$d")"
V="$(jq -er '(.result.deployments // .result)[0].versions[0].version_id' <<<"$d")"
test -n "$O"
test -n "$V"

headers="$RUNNER_TEMP/director-predeploy-unauth.headers"
code="$(curl -sS -D "$headers" -o /dev/null -w '%{http_code}' --max-time 20 "$U/" || true)"
case "$code" in
  302)
    grep -qi '^location: .*cloudflareaccess\.com' "$headers"
    ;;
  401|403)
    ;;
  *)
    echo "UNEXPECTED_UNAUTH_STATUS=$code"
    exit 1
    ;;
esac

h="$(curl -fsS --max-time 15 https://sentient-validation-runner.fly.dev/healthz)"
r="$(curl -fsS --max-time 15 https://sentient-validation-runner.fly.dev/readyz)"
jq -e --arg s "$S" --arg t "$T" '.status=="ok" and .application.identity.source.sha==$s and .application.identity.source.tree==$t' >/dev/null <<<"$h"
jq -e --arg s "$S" --arg t "$T" '.ready==true and .identity.source.sha==$s and .identity.source.tree==$t and .modelOutputIsNeverAuthority==true' >/dev/null <<<"$r"

printf 'DIRECTOR_URL=%s\nOLD_DEPLOY=%s\nOLD_VERSION=%s\n' "$U" "$O" "$V" >>"$GITHUB_ENV"
echo "CURRENT_DIRECTOR_DEPLOYMENT_ID=$O"
echo "CURRENT_DIRECTOR_VERSION_ID=$V"
echo "CLOUDFLARE_ACCESS_PRESENT=true"
echo "PREDEPLOY_SENTIENT_RESIDENCY=PASS"
