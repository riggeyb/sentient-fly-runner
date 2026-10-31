#!/usr/bin/env bash
set -euo pipefail

SHA=976047b626cced9ed9c84b53ca7a8d44f8c93c6b
TREE=2707935c55452e67e31428c26a669a03802daae7
DREPO=riggeyb/director-studio-beta
PROMO=release/director-ui-976047b6
BASE=sentient-ui-activation-v1

test "${AUTHORIZATION:-}" = "DEPLOY $SHA $TREE"

export GH_TOKEN="$RUNNER_TOKEN"
for spec in   "41247702077|.github/workflows/director-ui-exact-candidate-acceptance.yml|a2df62ff970ef4cc58b5f03e92c8dac447b26372"   "41248369165|.github/workflows/director-ui-exact-preview.yml|b91cdf1c141201961a30f41afee366533c99dd94"; do
  id="${spec%%|*}"
  rest="${spec#*|}"
  path="${rest%%|*}"
  runner_sha="${rest##*|}"
  j="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$id")"
  test "$(jq -r .status <<<"$j")" = completed
  test "$(jq -r .conclusion <<<"$j")" = success
  test "$(jq -r .path <<<"$j")" = "$path"
  test "$(jq -r .head_sha <<<"$j")" = "$runner_sha"
done

export GH_TOKEN="$SOURCE_TOKEN"
test -n "$GH_TOKEN"
test "$(gh api "repos/$DREPO/branches/$PROMO" --jq .commit.sha)" = "$SHA"
test "$(gh api "repos/$DREPO/git/commits/$SHA" --jq .tree.sha)" = "$TREE"

workflows=(
  cloudflare-convergence.yml
  director-202-convergence-proof.yml
  bounded-npm-direct-dependency-patch.yml
)

for w in "${workflows[@]}"; do
  gh api -X PUT "repos/$DREPO/actions/workflows/$w/disable" >/dev/null
  test "$(gh api "repos/$DREPO/actions/workflows/$w" --jq .state)" = disabled_manually
done

for w in "${workflows[@]}"; do
  for s in queued in_progress; do
    gh api "repos/$DREPO/actions/workflows/$w/runs?branch=$BASE&status=$s&per_page=100" --jq '.workflow_runs[].id' |
      while read -r id; do
        [ -z "$id" ] || gh api -X POST "repos/$DREPO/actions/runs/$id/cancel" >/dev/null
      done
  done
done

for _ in $(seq 1 30); do
  n=0
  for w in "${workflows[@]}"; do
    for s in queued in_progress; do
      c="$(gh api "repos/$DREPO/actions/workflows/$w/runs?branch=$BASE&status=$s&per_page=100" --jq .total_count)"
      n=$((n+c))
    done
  done
  [ "$n" -eq 0 ] && break
  sleep 2
done
test "$n" -eq 0

test "$(gh api "repos/$DREPO/branches/$PROMO" --jq .commit.sha)" = "$SHA"
test "$(gh api "repos/$DREPO/git/commits/$SHA" --jq .tree.sha)" = "$TREE"

echo "RELEASE_RECEIPTS=PASS"
echo "PROMOTION_STATUS=PASS"
echo "PROMOTED_SHA=$SHA"
echo "PROMOTED_TREE=$TREE"
echo "ACTIVE_CONFLICTING_DIRECTOR_DEPLOYS=0"
echo "ACTIVE_CONFLICTING_DIRECTOR_BRANCH_MUTATORS=0"
echo "SOURCE_REPO_SELF_DEPLOY_DISABLED=true"
