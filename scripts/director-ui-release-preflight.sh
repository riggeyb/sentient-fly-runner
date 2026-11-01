#!/usr/bin/env bash
set -euo pipefail

SHA=a6eca55db67fc03fbaf996dc1c06570593f9145f
TREE=cd3d49ce5be866b2fd7c0212066ab2c30dea9207
DREPO=riggeyb/director-studio-beta
PROMO=release/director-hotfix-a6eca55d

director_release_conflict_guard() {
  local workflows=(
    cloudflare-convergence.yml
    director-202-convergence-proof.yml
  )
  local conflict_ids=()
  local workflow status run_id joined
  local unique_ids=()

  for workflow in "${workflows[@]}"; do
    for status in queued in_progress; do
      while IFS= read -r run_id; do
        [ -n "$run_id" ] || continue
        conflict_ids+=("$run_id")
      done < <(
        gh api "repos/$DREPO/actions/workflows/$workflow/runs?status=$status&per_page=100"           --jq '.workflow_runs[].id'
      )
    done
  done

  if (( ${#conflict_ids[@]} > 0 )); then
    mapfile -t unique_ids < <(printf '%s\n' "${conflict_ids[@]}" | sort -u)
    joined="$(IFS=,; echo "${unique_ids[*]}")"
    echo "CONFLICTING_PRODUCTION_RUN=true"
    echo "DUPLICATE_DEPLOY_GUARD=FAIL"
    echo "CONFLICTING_RUN_IDS=$joined"
    return 1
  fi

  echo "CONFLICTING_PRODUCTION_RUN=false"
  echo "DUPLICATE_DEPLOY_GUARD=PASS"
}

if [[ "${1-}" == "--conflict-preflight-only" ]]; then
  director_release_conflict_guard
  exit 0
fi

test "${AUTHORIZATION:-}" = "DEPLOY $SHA $TREE"

export GH_TOKEN="$RUNNER_TOKEN"
for spec in   "41306921145|.github/workflows/director-chat-activity-hotfix-audit-acceptance-v1.yml"   "41248305081|.github/workflows/final-sentient-exact-live-runtime-audit.yml"; do
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

director_release_conflict_guard

echo "RELEASE_RECEIPTS=PASS"
echo "PREDEPLOY_SENTIENT_AUDIT=PASS"
echo "PROMOTION_STATUS=PASS"
echo "PROMOTED_SHA=$SHA"
echo "PROMOTED_TREE=$TREE"
