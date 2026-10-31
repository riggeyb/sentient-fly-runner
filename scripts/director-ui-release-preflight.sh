#!/usr/bin/env bash
set -euo pipefail

SHA=976047b626cced9ed9c84b53ca7a8d44f8c93c6b
TREE=2707935c55452e67e31428c26a669a03802daae7
DREPO=riggeyb/director-studio-beta
PROMO=release/director-ui-976047b6

test "${AUTHORIZATION:-}" = "DEPLOY $SHA $TREE"

export GH_TOKEN="$RUNNER_TOKEN"
for spec in \
  "41247702077|.github/workflows/director-ui-exact-candidate-acceptance.yml" \
  "41248369165|.github/workflows/director-ui-exact-preview.yml"; do
  id="${spec%%|*}"
  path="${spec#*|}"
  j="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$id")"
  test "$(jq -r .status <<<"$j")" = completed
  test "$(jq -r .conclusion <<<"$j")" = success
  test "$(jq -r .path <<<"$j")" = "$path"
done

export GH_TOKEN="$SOURCE_TOKEN"
test "$(gh api "repos/$DREPO/branches/$PROMO" --jq .commit.sha)" = "$SHA"

queued=0
for workflow in cloudflare-convergence.yml director-202-convergence-proof.yml; do
  inprog="$(gh api "repos/$DREPO/actions/workflows/$workflow/runs?status=in_progress&per_page=100")"
  test "$(jq -r .total_count <<<"$inprog")" = "0"

  q="$(gh api "repos/$DREPO/actions/workflows/$workflow/runs?status=queued&per_page=100")"
  while read -r id; do
    [ -n "$id" ] || continue
    jobs="$(gh api "repos/$DREPO/actions/runs/$id/jobs?per_page=100")"
    test "$(jq -r .total_count <<<"$jobs")" = "0"
    queued=$((queued+1))
  done < <(jq -r '.workflow_runs[].id' <<<"$q")
done

echo "RELEASE_RECEIPTS=PASS"
echo "PROMOTION_STATUS=PASS"
echo "PROMOTED_SHA=$SHA"
echo "PROMOTED_TREE=$TREE"
echo "ACTIVE_CONFLICTING_DIRECTOR_DEPLOYS=0"
echo "DORMANT_ZERO_JOB_QUEUED_DEPLOY_ARTIFACTS=$queued"
