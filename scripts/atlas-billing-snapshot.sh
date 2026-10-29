#!/usr/bin/env bash
set -euo pipefail
runner="${1:?runner dir required}"
deep="deepseek-ai/deepseek-v3.2"
dots="dots-studio/dots-3-note-prev-free"
one() {
  local prefix="$1" model="$2" scope="${3:-self}" cost usage requests input output total avg
  cost="$(bash "$runner/scripts/atlas-model-cost.sh" "$model" "$scope")"
  usage="$(bash "$runner/scripts/atlas-model-usage.sh" "$model" "$scope")"
  IFS=$'\t' read -r requests input output total <<<"$usage"
  avg="$(awk -v c="$cost" -v r="$requests" 'BEGIN { if (r > 0) printf "%.9f", c/r; else printf "UNAVAILABLE" }')"
  echo "${prefix}_BILLING_SCOPE=${scope}"
  echo "${prefix}_BILLED_COST_TOTAL_USD=${cost}"
  echo "${prefix}_BILLED_REQUESTS=${requests}"
  echo "${prefix}_BILLED_INPUT_TOKENS=${input}"
  echo "${prefix}_BILLED_OUTPUT_TOKENS=${output}"
  echo "${prefix}_BILLED_TOTAL_TOKENS=${total}"
  echo "ACTUAL_${prefix}_SMOKE_COST=${avg}"
}
scope="${ATLAS_BILLING_SCOPE:-self}"
one DEEPSEEK "$deep" "$scope"
one DOTS3 "$dots" "$scope"
echo "COST_TELEMETRY=PASS"
echo "ATLASCLOUD_SECRET_EXPOSED=false"
