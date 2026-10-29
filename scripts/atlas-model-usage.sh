#!/usr/bin/env bash
set -euo pipefail
model="${1:?model required}"
scope="${2:-self}"
test -n "${ATLASCLOUD_API_KEY:-}"
[[ "$model" =~ ^[A-Za-z0-9._:/-]{1,240}$ ]]
[[ "$scope" = "self" || "$scope" = "account" ]]
start="$(date -u +%F)"
end="$(date -u -d 'tomorrow' +%F)"
curl -fsS --max-time 10 -G https://api.atlascloud.ai/public/v1/model-usage \
  -H "Authorization: Bearer ${ATLASCLOUD_API_KEY}" \
  -H "Accept: application/json" \
  --data-urlencode "start_date=${start}" \
  --data-urlencode "end_date=${end}" \
  --data-urlencode "scope=${scope}" \
  --data-urlencode "model_types[]=text" \
  --data-urlencode "model_ids[]=${model}" |
  jq -r '[
    ([.data[]?.results[]?.usage.requests // 0] | add // 0),
    ([.data[]?.results[]?.usage.tokens.input // 0] | add // 0),
    ([.data[]?.results[]?.usage.tokens.output // 0] | add // 0),
    ([.data[]?.results[]?.usage.tokens.total // 0] | add // 0)
  ] | @tsv'
