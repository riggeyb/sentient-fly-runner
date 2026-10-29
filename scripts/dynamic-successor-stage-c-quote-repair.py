from pathlib import Path

p = Path("scripts/dynamic-successor-stage-c-objective-envelope.py")
s = p.read_text()
replacements = [
    ("    ''import { isBearerAuthorized }", "    '''import { isBearerAuthorized }"),
    ("      engineeringJob','',", "      engineeringJob,''',"),
    ("    ''import {completeProductionObjectiveStateV1", "    '''import {completeProductionObjectiveStateV1"),
]
for old, new in replacements:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"stage-c quote repair expected one match for {old!r}, got {count}")
    s = s.replace(old, new, 1)

marker = 'Path("test/dynamic-objective-envelope-runtime-v1.test.ts").write_text(r\'\'\''
idx = s.find(marker)
if idx < 0:
    raise SystemExit("stage-c generated test marker missing")
head, tail = s[:idx], s[idx:]
doubled = tail.count("\\\\")
if doubled < 1:
    raise SystemExit("stage-c generated test regex escapes missing")
tail = tail.replace("\\\\", "\\")
p.write_text(head + tail)
