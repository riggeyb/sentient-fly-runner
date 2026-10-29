from pathlib import Path

operator = Path(__file__).parent
source = "".join((operator / f"dynamic-adapter-final.part{i}").read_text() for i in range(3))

needle = """r('    const usage = aggregateUsage(result.telemetry);\\n',
  '    if (input.signal.aborted) return failure("timed_out", "late_model_output_rejected");\\n    const usage = aggregateUsage(result.telemetry);\\n')"""
replacement = """old_usage = '    const usage = aggregateUsage(result.telemetry);\\\\n'
new_usage = '    if (input.signal.aborted) return failure("timed_out", "late_model_output_rejected");\\\\n    const usage = aggregateUsage(result.telemetry);\\\\n'
usage_positions = [i for i in range(len(s)) if s.startswith(old_usage, i)]
if len(usage_positions) != 2:
    raise SystemExit(f"expected exactly two aggregate usage sites, found {len(usage_positions)}")
idx = usage_positions[1]
s = s[:idx] + new_usage + s[idx + len(old_usage):]"""

if source.count(needle) != 1:
    raise SystemExit(f"expected exactly one brittle usage rewrite, found {source.count(needle)}")
fixed = source.replace(needle, replacement, 1)
compile(fixed, "dynamic-adapter-final-v3", "exec")
exec(compile(fixed, "dynamic-adapter-final-v3", "exec"))
