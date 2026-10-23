#!/usr/bin/env bash
set -euo pipefail

# Preserve the shared bounded certification harness exactly, applying only the
# concrete operator repairs observed live: ledger module resolution, starting
# the existing frozen autostopped Fly machine, and waiting for exact readiness
# before objective ingress.
REF="23836ffcf56573a1a2f7bb146871989d1c5b977a"
URL="https://raw.githubusercontent.com/riggeyb/sentient-fly-runner/${REF}/phase0-live-cert.sh"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

curl -fsSL --retry 3 --retry-all-errors "$URL" -o "$TMP"

python3 - "$TMP" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
old = r"""cd /app && echo $LEDGER_B64 | base64 -d >/tmp/phase0-ledger.mjs && ENG_OBJECTIVE=$ENG_OBJECTIVE node /tmp/phase0-ledger.mjs; rc=\$?; rm -f /tmp/phase0-ledger.mjs; exit \$rc"""
new = r"""cd /app && echo $LEDGER_B64 | base64 -d >/app/phase0-ledger.mjs && ENG_OBJECTIVE=$ENG_OBJECTIVE node /app/phase0-ledger.mjs; rc=\$?; rm -f /app/phase0-ledger.mjs; exit \$rc"""
if s.count(old) != 1:
    raise SystemExit("LEDGER_PATH_PATCH_TARGET_MISMATCH")
p.write_text(s.replace(old, new))
PY

APP="sentient-validation-runner"
SHA="ce2a5cceab61f31aa490f2e3174992a714f97251"
TREE="bd84818a2610bf2d2077484589580a47aa5399e8"
MID="$(flyctl machines list -a "$APP" --json | jq -r '[.[]|select(.state!="destroyed")][0].id')"
test -n "$MID" && test "$MID" != "null"
flyctl machine start "$MID" -a "$APP" >/dev/null || true
state=""
for _ in $(seq 1 90); do
  state="$(flyctl machines list -a "$APP" --json | jq -r --arg id "$MID" '.[]|select(.id==$id)|.state' | head -n1)"
  [ "$state" = "started" ] && break
  sleep 2
done
test "$state" = "started"
echo "FROZEN_MACHINE_STARTED=PASS"

ready=false
for _ in $(seq 1 120); do
  if curl -fsS --max-time 5 "https://${APP}.fly.dev/readyz" >/tmp/phase0-frozen-ready.json 2>/dev/null; then
    if jq -e --arg s "$SHA" --arg t "$TREE" '.ready==true and (.identity.source.sha==$s) and (.identity.source.tree==$t)' /tmp/phase0-frozen-ready.json >/dev/null; then
      ready=true
      break
    fi
  fi
  sleep 2
done
test "$ready" = true
echo "FROZEN_LIVE_READY=PASS"

exec bash "$TMP"
