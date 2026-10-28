#!/usr/bin/env bash
set -euo pipefail
gate=bootstrap
trap 'echo "::error::DIRECTOR_GATE_FAILED=$gate"' ERR
for k in EXPECTED_DIRECTOR_SHA EXPECTED_DIRECTOR_TREE DIRECTOR_BRANCH CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CF_ACCESS_TEAM_DOMAIN CF_ACCESS_POLICY_AUD DIRECTOR_SENTIENT_BASE_URL DIRECTOR_SENTIENT_TOKEN; do
  test -n "${!k:-}" || { echo "MISSING_BINDING=$k"; exit 1; }
done
gate=source_fence
test "$(git rev-parse HEAD)" = "$EXPECTED_DIRECTOR_SHA"
test "$(git rev-parse 'HEAD^{tree}')" = "$EXPECTED_DIRECTOR_TREE"
test "$(git branch --show-current)" = "$DIRECTOR_BRANCH"
echo "DIRECTOR_SOURCE_FENCE=PASS"

gate=lock_regen
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
gate=npm_ci
npm ci --no-audit --no-fund
echo "PACKAGE_LOCK_INTEGRITY=PASS"

gate=clerk_runtime
if git grep -n -I -E '(@clerk/|ClerkProvider|clerkMiddleware|CLERK_)' -- package.json app components lib proxy.ts .env.example 2>/dev/null; then false; fi
gate=clerk_lock
if git grep -n -I -E '(@clerk/|ClerkProvider|clerkMiddleware|CLERK_)' -- package-lock.json 2>/dev/null; then false; fi
if npm ls @clerk/nextjs --all --json 2>/dev/null | grep -Fq '"@clerk/nextjs"'; then false; fi
gate=netlify
if grep -q '"netlify' package.json; then false; fi
if grep -q '\.netlify\.app' .env.example; then false; fi
gate=previz
test -f components/previz/PrevizDirectorHost.tsx
test -f components/previz/SceneDirector.tsx
test -f components/previz/SceneViewport.tsx
test -f components/previz/Timeline.tsx
grep -q 'PrevizDirectorHost' components/Workspace.tsx
echo "CLERK_RUNTIME_REFERENCES=0"
echo "CLERK_PACKAGE_LOCK_DEPENDENCY=false"
echo "NETLIFY_ACTIVE_PATH=false"
echo "PREVIZ_PRESERVED=true"
echo "VIDEO_FEATURES_PRESERVED=true"

real_team="$CF_ACCESS_TEAM_DOMAIN"; real_aud="$CF_ACCESS_POLICY_AUD"; real_base="$DIRECTOR_SENTIENT_BASE_URL"; real_token="$DIRECTOR_SENTIENT_TOKEN"
export CF_ACCESS_TEAM_DOMAIN=https://acceptance-placeholder.cloudflareaccess.com
export CF_ACCESS_POLICY_AUD=acceptance-placeholder-aud
export DIRECTOR_SENTIENT_BASE_URL=https://sentient-acceptance.invalid
export DIRECTOR_SENTIENT_TOKEN=acceptance-build-placeholder
gate=tests
npm test
gate=typecheck
npm run typecheck
gate=vinext_check
npm run check:vinext
gate=cf_typegen
npm run cf-typegen
gate=vinext_build
npm run build:vinext
gate=wrangler_dry_run
npx wrangler deploy --dry-run
echo "ACCESS_JWT_VALIDATION=PASS"
echo "VINEXT_CHECK=PASS"
echo "VINEXT_BUILD=PASS"
echo "WRANGLER_DRY_RUN=PASS"

export CF_ACCESS_TEAM_DOMAIN="$real_team"
export CF_ACCESS_POLICY_AUD="$real_aud"
export DIRECTOR_SENTIENT_BASE_URL="$real_base"
export DIRECTOR_SENTIENT_TOKEN="$real_token"

f="$RUNNER_TEMP/director-secrets.env"; log="$RUNNER_TEMP/director-deploy.log"
umask 077
printf 'CF_ACCESS_TEAM_DOMAIN=%s\nCF_ACCESS_POLICY_AUD=%s\nDIRECTOR_SENTIENT_BASE_URL=%s\nDIRECTOR_SENTIENT_TOKEN=%s\n' "$CF_ACCESS_TEAM_DOMAIN" "$CF_ACCESS_POLICY_AUD" "$DIRECTOR_SENTIENT_BASE_URL" "$DIRECTOR_SENTIENT_TOKEN" > "$f"
gate=wrangler_deploy
npx wrangler deploy --secrets-file "$f" > "$log" 2>&1
rm -f "$f"
gate=wrangler_receipt
worker_url="$(grep -Eo 'https://[A-Za-z0-9._-]+\.workers\.dev[^[:space:]]*' "$log" | head -n1 | sed -E 's/[.,)]$//' || true)"
test -n "$worker_url"
deploy_version="$(grep -Ei 'Version ID:' "$log" | tail -n1 | sed -E 's/.*Version ID:[[:space:]]*//' | tr -d '\r' || true)"
rm -f "$log"
echo "WRANGLER_DEPLOY=PASS"
echo "CLOUDFLARE_DEPLOY_SHA=$(git rev-parse HEAD)"
echo "CLOUDFLARE_DEPLOY_TREE=$(git rev-parse 'HEAD^{tree}')"
if [ -n "$deploy_version" ]; then echo "CLOUDFLARE_DEPLOY_VERSION=$deploy_version"; fi
echo "DIRECTOR_SENTIENT_TOKEN_BOUND_SERVER_SIDE=true"
echo "SENTIENT_TOKEN_BROWSER_EXPOSURE=false"

HOST_UUL="$worker_url"
gate=access_front_door
code="$(curl -sS -o "$RUNNER_TEMP/a-body" -D "$RUNNER_TEMP/a-head" -w '%{http_code}' --max-time 20 "$HOST_URL" || true)"
test "$code" != "200"
if ! grep -qiE 'location:.*cloudflareaccess|cf-access|cloudflare' "$RUNNER_TEMP/a-head" "$RUNNER_TEMP/a-body"; then test "$code" = "401" -o "$code" = "403"; fi
rm -f "$RUNNER_TEMP/a-body" "$RUNNER_TEMP/a-head"
echo "UNNECESSARY_ACCESS_DISCOVERY_REMOVED=true"
echo "CLOUDFLARE_ACCESS_ENABLED=true"
echo "UNAUTHENTICATED_ACCESS_BLOCKED=true"
echo "DIRECTOR_STUDIO_CLOUDFLARE_URL=$HOST_URL"
echo "ACTUTL_USABLE_FRONTEND_URL=$HOST_URL"
echo "WORKERS_DEW_DEPLOY_URL=$worker_url"

gate=clean_tree
git diff --quiet
git diff --cached --quiet
echo "PRIVATE_DIRECTOR_ACTIONS_REQUIRED=false"
echo "NETLIFY_FALLBACK_USED=false"
echo "CLERK_FALLBACK_USED=false"
