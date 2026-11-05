from pathlib import Path
import re
p=Path("scripts/gate2-live-cognition-artifact-quality.mjs")
s=p.read_text()
s=s.replace('MAXOUT=900','MAXOUT=1000',1)
objective='''const objective=`Design the safest minimal approach for an at-least-once job processor under ambiguous post-effect timeout.
Return exactly one JSON object with exactly these keys and types:
{"schemaVersion":"sentient-cognition-artifact/v1","problemRepresentation":"one sentence <=160 chars","keyFindings":[{"claim":"one sentence <=180 chars","evidenceRefs":["E5"],"confidence":"high"}],"hypotheses":[{"hypothesis":"one sentence <=160 chars","status":"unresolved","evidenceRefs":["E5"]}],"recommendedApproach":"<=260 chars","evidenceRefs":["E5"],"constraints":["C17"],"toolRecommendations":[{"tool":"T7","rationale":"<=120 chars"}],"risks":["one concise risk <=140 chars"],"uncertainties":["U2"],"verificationNeeded":["V3"]}
Do not rename keys. Do not add keys. Do not expand arrays. Preserve C17, E5, V3, T7 and U2 exactly as shown.
Return JSON only: no markdown, no preamble, no explanation outside JSON. Do not restate context or pad. Keep visible output under 500 tokens. Do not expose private chain-of-thought. Do not claim any action was executed.`;'''
s,n=re.subn(r'const objective=`.*?`;\nconst sys=',objective+'\nconst sys=',s,count=1,flags=re.S)
if n!=1: raise SystemExit("objective anchor missing")
sys='''const sys=`Primary engineering cognition only. Produce a compact sentient-cognition-artifact/v1; model output is advisory and Sentient remains authoritative. Follow the exact JSON shape and field limits in the user request. No private chain-of-thought and no presentation prose.`;'''
s,n=re.subn(r'const sys=`.*?`;\nconst bundle=',sys+'\nconst bundle=',s,count=1,flags=re.S)
if n!=1: raise SystemExit("system anchor missing")
Path("gate2-second-runtime.mjs").write_text(s)
print("GATE2_SECOND_CALL_TRANSFORM=PASS")
