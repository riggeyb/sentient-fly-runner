#!/usr/bin/env bash
set -euo pipefail
S=976047b626cced9ed9c84b53ca7a8d44f8c93c6b
T=2707935c55452e67e31428c26a669a03802daae7
test "$(git rev-parse HEAD)" = "$S"
test "$(git rev-parse 'HEAD^{tree}')" = "$T"
before="$(sha256sum package-lock.json | awk '{print $1}')"
npm ci --no-audit --no-fund
test "$before" = "$(sha256sum package-lock.json | awk '{print $1}')"
npm run build:vinext
dirty="$(git diff --name-only)"
if [ -n "$dirty" ]; then
  test "$dirty" = "next-env.d.ts"
  git restore -- next-env.d.ts
fi
git diff --quiet
git diff --cached --quiet
test "$(git rev-parse HEAD)" = "$S"
test "$(git rev-parse 'HEAD^{tree}')" = "$T"
f="$RUNNER_TEMP/director-prod.env"
umask 077
printf 'CF_ACCESS_TEAM_DOMAIN=%s\nCF_ACCESS_POLICY_AUD=%s\nDIRECTOR_SENTIENT_BASE_URL=%s\nDIRECTOR_SENTIENT_TOKEN=%s\n' \
  "$CF_ACCESS_TEAM_DOMAIN" "$CF_ACCESS_POLICY_AUD" "$DIRECTOR_SENTIENT_BASE_URL" "$DIRECTOR_SENTIENT_TOKEN" >"$f"
npx wrangler deploy --secrets-file "$f"
rm -f "$f"
echo "PRODUCTION_DEPLOYMENT_COMMANDS=1"
echo "DEPLOYED=true" >>"$GITHUB_ENV"
echo "WRANGLER_DEPLOY=PASS"
