from pathlib import Path
p=Path("sentient/test/dynamic-cognition-plan-admission-v1.test.ts")
s=p.read_text()
for old,new in [
    ('    plan = ["inspect", "revise", "synthesize"],','    plan: ["inspect", "revise", "synthesize"],'),
    ('    workers = [','    workers: ['),
]:
    n=s.count(old)
    if n!=1:
        raise SystemExit(f"expected one generated test anchor, got {n}: {old!r}")
    s=s.replace(old,new,1)
p.write_text(s)
print("D3 generated test syntax fixed")
