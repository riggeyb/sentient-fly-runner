from pathlib import Path
source = Path(__file__).with_name("dynamic-reuse-core-refine-v2.py").read_text()
if source.count("MODD_RESULT") != 1:
    raise SystemExit("expected exactly one known v2 typo")
fixed = source.replace("MODD_RESULT", "MODEL_RESULT")
compile(fixed, "dynamic-reuse-core-refine-v3", "exec")
exec(compile(fixed, "dynamic-reuse-core-refine-v3", "exec"))
