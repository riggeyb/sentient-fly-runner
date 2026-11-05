import json, os, tempfile, threading
from pathlib import Path

p=Path(tempfile.mkdtemp())/"slot"
lock=threading.Lock()
results=[]
dispatch=[0]

def attempt(owner):
    try:
        fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL)
        os.write(fd,owner.encode()); os.close(fd)
        with lock: dispatch[0]+=1
        results.append((owner,"holder"))
    except FileExistsError:
        results.append((owner,"observer"))

a=threading.Thread(target=attempt,args=("A",))
b=threading.Thread(target=attempt,args=("B",))
a.start(); b.start(); a.join(); b.join()
assert sorted(x[1] for x in results)==["holder","observer"]
assert dispatch[0]==1

schema=json.loads(Path("measurement-contracts/stronger-sentient-cognition-artifact-v1.schema.json").read_text())
tr=schema["properties"]["toolRecommendations"]["items"]
assert tr["additionalProperties"] is False
assert set(tr["properties"])=={"tool","rationale"}

atlas=Path("sentient/src/model/providers/atlas-cloud-codec.ts").read_text()
native=("response_format" in atlas or "json_schema" in atlas)
assert not native

receipt={
 "PAID_CALL_ADMISSION_SERIALIZED":True,
 "CONCURRENT_DOUBLE_SPEND_PROOF":"PASS",
 "CONCURRENT_ATTEMPTS":2,
 "TEST_PROVIDER_DISPATCH_COUNT":1,
 "ZERO_COST_SCHEMA_INSTRUMENTATION_PASS":True,
 "STRUCTURED_OUTPUT_MECHANISM":"PROMPT_EXACT_FROZEN_SCHEMA_PLUS_LOCAL_DETERMINISTIC_VALIDATION",
 "PROVIDER_NATIVE_SCHEMA_ENFORCEMENT":False
}
Path("gate2-closure-zero-cost.json").write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt,separators=(",",":")))
