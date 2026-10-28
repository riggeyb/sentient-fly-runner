from pathlib import Path

source = Path("../operator/scripts/mvp-root-fallback-evidence-v3.py").read_text()
source = source.replace("verififiedAnalysis", "verifiedAnalysis").replace("???", "??")
exec(compile(source, "mvp-root-fallback-evidence-v3-fixed.py", "exec"))
