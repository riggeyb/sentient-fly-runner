#!/usr/bin/env bash
set -euo pipefail

SHA=a6eca55db67fc03fbaf996dc1c06570593f9145f
TREE=cd3d49ce5be866b2fd7c0212066ab2c30dea9207
DREPO=riggeyb/director-studio-beta
PROMO=release/director-hotfix-a6eca55d

test "${AUTHORIZATION:-}" = "DEPLOY $SHA $TREE"

export GH_TOKEN="$RUNNER_TOKEN"
for spec in \
  "41306921145|.github/workflows/director-chat-activity-hotfix-audit-acceptance-v1.yml" \
  "41248305081|.github/workflows/final-sentient-exact-live-runtime-audit.yml"; do
  id="${spec%%|*}"
  path="${spec#*|}"
  j="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$id")"
  test "$(jq -r .status <<<"$j")" = completed
  test "$(jq -r .conclusion <<<"$j")" = success
  test "$(jq -r .path <<<"$j")" = "$path"
done

export GH_TOKEN="$SOURCE_TOKEN"
test "$(gh api "repos/$DREPO/branches/$PROMO" --jq .commit.sha)" = "$SHA"
test "$(gh api "repos/$DREPO/commits/$SHA" --jq .commit.tree.sha)" = "$TREE"

queued_zero_job=0
for workflow in cloudflare-convergence.yml director-202-convergence-proof.yml; do
  active="$(gh api "repos/$DREPO/actions/workflows/$workflow/runs?status=in_progress&per_page=100" --jq .total_count)"
  test "$active" -eq 0

  while read -r run_id; do
    [ -n "$run_id" ] || continue
    jobs="$(gh api "repos/$DREPO/actions/runs/$run_id/jobs?per_page=100" --jq .total_count)"
    test "$jobs" -eq 0
    queued_zero_job=$((queued_zero_job+1))
  done < <(gh api "repos/$DREPO/actions/workflows/$workflow/runs?status=queued&per_page=100" --jq '.workflow_runs[].id')
done

echo "RELEASE_RECEIPTS=PASS"
echo "PREDEPLOY_SENTIENT_AUDIT=PASS"
echo "PROMOTION_STATUS=PASS"
echo "PROMOTED_SHA=$SHA"
echo "PROMOTED_TREE=$TREE"
echo "ACTIVE_CONFLICTING_DIRECTOR_DEPLOYS=0"
echo "QUEUED_CONFLICTING_RUNS_WITH_JOBS=0"
echo "QUEUED_ZERO_JOB_CONVERGENCE_ARTIFACTS=$queued_zero_job"
