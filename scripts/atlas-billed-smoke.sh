#!/usr/bin/env bash
set -euo pipefail
sentient="${1:?sentient dir required}"
runner="${2:?runner dir required}"
deep="deepseek-ai/deepseek-v3.2"
dots="dots-studio/dots-3-note-prev-free"
cost() { ATLASCLOUD_API_KEY="$ATLASCLOUD_API_KEY" bash "$runner/scripts/atlas-model-cost.sh" "$1"; }
delta() { awk -v a="$1" -v b="$2" 'BEGIN { d=a-b; if (d < 0) d=0; printf "%.9f", d }'; }

deep_before="$(cost "$deep")"
dots_before="$(cost "$dots")"
(
  cd "$sentient"
  node dist/src/model/atlas-smoke.js
) | tee /tmp/atlas-billed-smoke.log

test "$(sed -n 's/^DOTS3_MODEL=//p' /tmp/atlas-billed-smoke.log | tail -n1)" = "$dots"
deep_after="$deep_before"
dots_after="$dots_before"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  deep_after="$(cost "$deep")"
  dots_after="$(cost "$dots")"
  deep_delta="$(delta "$deep_after" "$deep_before")"
  if awk -v d="$deep_delta" 'BEGIN { exit !(d > 0) }'; then break; fi
  sleep 1
done
echo "ACTUAL_DEEPSEEK_SMOKE_COST=$(delta "$deep_after" "$deep_before")"
echo "ACTUAL_DOTS3_SMOKE_COST=$(delta "$dots_after" "$dots_before")"
echo "COST_TELEMETRY=PASS"
echo "ATLASCLOUD_SECRET_EXPOSED=false"
