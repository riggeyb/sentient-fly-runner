#!/usr/bin/env bash
set -euo pipefail

# Preserve the shared bounded certification harness exactly, applying only the
# concrete module-resolution repair proven by run 40020412592.
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

exec bash "$TMP"
