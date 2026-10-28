from pathlib import Path

source = Path("../operator/scripts/mvp-root-replay-budget-v1.py").read_text()
old = "\n\n''\nreplace_once(\n"
new = "\n\n'''\nreplace_once(\n"
if source.count(old) != 1:
    raise SystemExit(f"expected one unterminated-helper marker, found {source.count(old)}")
fixed = source.replace(old, new, 1)
exec(compile(fixed, "mvp-root-replay-budget-v1-fixed.py", "exec"))
