#!/usr/bin/env bash
set -euo pipefail
for k in EXPECTED_DIRECTOR_SHA EXPECTED_DIRECTOR_TREE DIRECTOR_BRANCH CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CF_ACCESS_TEAM_DOMAIN CF_ACCESS_POLICY_AUD DIRECTOR_SENTIENT_BASE_URL DIRECTOR_SENTIENT_TOKEN; do
  test -n "${!k:-}" || { echo "MISSING_BINDING=$k"; exit 1; }
done
test "$(git rev-parse HEAD)" = "$EXPECTED_DIRECTOR_SHA"
test "$(git rev-parse 'HEAD^{tree}')" = "$EXPECTED_DIRECTOR_TREE"
test "$(git branch --show-current)" = "$DIRECTOR_BRANCH"
echo "DIRECTOR_SOURCE_FENCE=PASS"

npm install --package-lock-only --ignore-scripts --no-audit --no-fund
git diff --exit-code -- package.json
if ! git diff --quiet -- package-lock.json; then
  git config user.name director-cloudflare-operator
  git config user.email director-cloudflare-operator@users.noreply.github.com
  git add package-lock.json
  git diff --cached --exit-code -- . ':(exclude)package-lock.json'
  git commit -m "cloudflare: regenerate vinext dependency lock"
  git push origin HEAD:"$DIRECTOR_BRANCH"
fi
npm ci --no-audit --no-fund
echo "PACKAGE_LOCK_INTEGRITY=PASS"

if git grep -n -I -E '(@clerk/|ClerkProvider|clerkMiddleware|CLERK_)' -- package.json package-lock.json app components lib proxy.ts tests scripts .env.example 2>/dev/null; then exit 1; fi
! npm ls @clerk/nextjs --all --json 2>/dev/null | grep -Fq '"@clerk/nextjs"'
! grep -q '"netlify' package.json
! grep -q '\.netlify\.app' .env.example
echo "CLERK_RUNTIME_REFERENCES=0"
echo "NETLIFY_ACTIVE_PATH=false"

real_team="$CF_ACCESS_TEAM_DOMAIN"; real_aud="$CF_ACCESS_POLICY_AUD"; real_base="$DIRECTOR_SENTIENT_BASE_URL"; real_token="$DIRECTOR_SENTIENT_TOKEN"
export CF_ACCESS_TEAM_DOMAIN=https://acceptance-placeholder.cloudflareaccess.com
export CF_ACCESS_POLICY_AUD=acceptance-placeholder-aud
export DIRECTOR_SENTIENT_BASE_URL=https://sentient-acceptance.invalid
export DIRECTOR_SENTIENT_TOKEN=acceptance-build-placeholder
npm test
npm run typecheck
npm run check:vinext
npm run cf-typegen
npm run build:vinext
npx wrangler deploy --dry-run
echo "ACCESS_JWT_VALIDATION=PASS"
echo "VINEXT_BUILD=PASS"
echo "WRANGLER_DRY_RUN=PASS"

export CF_ACCESS_TEAM_DOMAIN="$real_team"
export CF_ACCESS_POLICY_AUD="$real_aud"
export DIRECTOR_SENTIENT_BASE_URL="$real_base"
export DIRECTOR_SENTIENT_TOKEN="$real_token"

f="$RUNNER_TEMP/director-secrets.env"; log="$RUNNER_TEMP/director-deploy.log"
umask 077
printf 'CF_ACCESS_TEAM_DOMAIN=%s\nCF_ACCESS_POLICY_AUD=%s\nDIRECTOR_SENTIENT_BASE_URL=%s\nDIRECTOR_SENTIENT_TOKEN=%s\n' "$CF_ACCESS_TEAM_DOMAIN" "$CF_ACCESS_POLICY_AUD" "$DIRECTOR_SENTIENT_BASE_URL" "$DIRECTOR_SENTIENT_TOKEN" > "$f"
npx wrangler deploy --secrets-file "$f" > "$log" 2>&1
rm -f "$f"
worker_url="$(grep -Eo 'https://[A-Za-z0-9._-]+\.workers\.dev[^[:space:]]*' "$log" | head -n1 | sed -E 's/[.,)]$//' || true)"
test -n "$worker_url"
rm -f "$log"
echo "WRANGLER_DEPLOY=PASS"
echo "CLOUDFLARE_DEPLOY_SHA=$(git rev-parse HEAD)"
echo "CLOUDFLARE_DEPLOY_TREE=$(git rev-parse 'HEAD^{tree}')"
echo "DIRECTOR_SENTIENT_TOKEN_BOUND_SERVER_SIDE=true"

HOST_URL="$worker_url"
code="$(curl -sS -o "$RUNNER_TEMP/a-body" -D "$RUNNER_TEMP/a-head" -w '%{http_code}' --max-time 20 "$HOST_URL/" || true)"
test "$code" != "200"
if ! grep -qiE 'location:.*cloudflareaccess|cf-acccess|cloudflare' "$RUNNER_TEMP/a-head" "$RUNNER_TEMP/a-body"; then test "$code" = "401" -o "$code" = "403"; fi
rm -f "$RUNNER_TEMP/a-body" "$RUNNER_TEMP/a-head"
echo "UNAUTHENTICATED_ACCESS_BLOCKED=true"
echo "DIRECTOR_STUDIO_CLOUDFLARE_URL=$HOST_URL"
echo "WORKERS_DEV_DEPLOY_URL=$worker_url"

git diff --quiet
git diff --cached --quiet
echo "PRIVATE_DIRECTOR_ACTIONS_REQUIRED=false"
echo "NETLIFY_FALLBACK_USED=false"
echo "CLERK_FALLBACK_USED=false"
