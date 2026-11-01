#!/usr/bin/env bash
set -euo pipefail

DEPLOY="${1:-scripts/director-ui-release-deploy.sh}"
PREFLIGHT="${2:-scripts/director-ui-release-preflight.sh}"
WORKFLOW="${3:-.github/workflows/director-ui-exact-production-deploy.yml}"

EXPECTED_SHA="a6eca55db67fc03fbaf996dc1c06570593f9145f"
EXPECTED_TREE="cd3d49ce5be866b2fd7c0212066ab2c30dea9207"
OLD_SHA="976047b626cced9ed9c84b53ca7a8d44f8c93c6b"
OLD_TREE="2707935c55452e67e31428c26a669a03802daae7"

grep -qx "S=$EXPECTED_SHA" "$DEPLOY"
grep -qx "T=$EXPECTED_TREE" "$DEPLOY"
grep -qx "SHA=$EXPECTED_SHA" "$PREFLIGHT"
grep -qx "TREE=$EXPECTED_TREE" "$PREFLIGHT"
grep -qx 'PROMO=release/director-hotfix-a6eca55d' "$PREFLIGHT"
grep -q '41306921145|.github/workflows/director-chat-activity-hotfix-audit-acceptance-v1.yml' "$PREFLIGHT"
grep -q "ref: $EXPECTED_SHA" "$WORKFLOW"

for active in "$DEPLOY" "$PREFLIGHT" "$WORKFLOW"; do
  if grep -Fq "$OLD_SHA" "$active" || grep -Fq "$OLD_TREE" "$active"; then
    echo "OLD_DIRECTOR_PIN_STILL_ACTIVE=$active"
    exit 1
  fi
done

grep -q 'test "$(git rev-parse HEAD)" = "$S"' "$DEPLOY"
grep -q "test \"\$(git rev-parse 'HEAD^{tree}')\" = \"\$T\"" "$DEPLOY"

preflight_line="$(grep -n '^director_release_binding_preflight$' "$DEPLOY" | tail -1 | cut -d: -f1)"
secrets_line="$(grep -n '^f=' "$DEPLOY" | tail -1 | cut -d: -f1)"
deploy_line="$(grep -n '^npx wrangler deploy ' "$DEPLOY" | tail -1 | cut -d: -f1)"
test "$preflight_line" -lt "$secrets_line"
test "$secrets_line" -lt "$deploy_line"

segment="$(sed -n "${preflight_line},$((deploy_line - 1))p" "$DEPLOY")"
if grep -Eq 'wrangler deploy|curl .*api\.cloudflare\.com|gh api .*deploy' <<<"$segment"; then
  echo "PRE_DEPLOY_MUTATION_BETWEEN_PREFLIGHT_AND_WRANGLER=true"
  exit 1
fi

echo "DIRECTOR_RELEASE_EXPECTED_SHA=$EXPECTED_SHA"
echo "DIRECTOR_RELEASE_EXPECTED_TREE=$EXPECTED_TREE"
echo "OLD_DIRECTOR_PIN_REMOVED_FROM_ACTIVE_RELEASE_PATH=true"
echo "EXACT_SHA_TREE_FENCE_TESTED=PASS"
echo "BINDING_PREFLIGHT_IMMEDIATELY_BEFORE_DEPLOY_PATH=true"
echo "PRODUCTION_DEPLOYMENT=false"
