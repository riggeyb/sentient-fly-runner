from pathlib import Path
ROOT = Path("sentient")
def read(rel):
    return (ROOT / rel).read_text()
def write(rel, text):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)
def replace_once(rel, old, new):
    p = ROOT / rel
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{rel}: expected 1 occurrence, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))
replace_once(
    "src/spawn/orchestrator.ts",
    ''' let raw:BackendExecutionResultV1;try{raw=await b.execute({identity:{...id,status:"running"},taskPackage:pkg,target:t,signal:i.signal??new AbortController().signal})}catch(e){raw=spawnBackendFailureV1(e)}
 const end=d.now(),s=await d.repository.spawnSnapshot(),children=s.records.lineage.filter(x=>x.parentExecutionId===eid).map(x=>x.childExecutionId).sort();''',
    ''' const runtimeSignal=AbortSignal.timeout(Math.max(1,dec.reservation.runtimeMs));
 const executionSignal=i.signal?AbortSignal.any([i.signal,runtimeSignal]):runtimeSignal;
 let raw:BackendExecutionResultV1;
 try{
  const stopped=new Promise<BackendExecutionResultV1>((resolve)=>{
   const finish=()=>resolve(spawnBudgetStopV1(runtimeSignal.aborted,i.signal?.aborted===true));
   if(executionSignal.aborted)finish();
   else executionSignal.addEventListener("abort",finish,{once:true});
  });
  raw=await Promise.race([
   b.execute({identity:{...id,status:"running"},taskPackage:pkg,target:t,signal:executionSignal}),
   stopped,
  ]);
  if(executionSignal.aborted&&raw.status==="succeeded"){
   raw=spawnBudgetStopV1(runtimeSignal.aborted,i.signal?.aborted===true,true);
  }
 }catch(e){raw=spawnBackendFailureV1(e)}
 const end=d.now(),s=await d.repository.spawnSnapshot(),children=s.records.lineage.filter(x=>x.parentExecutionId===eid).map(x=>x.childExecutionId).sort();'''
)
p = ROOT / "src/spawn/orchestrator.ts"
p.write_text(p.read_text() + r'''
function spawnBudgetStopV1(
  runtimeExpired:boolean,
  callerCancelled:boolean,
  late=false,
):BackendExecutionResultV1{
 const timedOut=runtimeExpired&&!callerCancelled;
 return{
  status:timedOut?"timed_out":"cancelled",
  output:null,
  artifactRefs:[],
  evidenceRefs:[],
  toolActions:[],
  usage:{costMicros:0,toolRounds:0,toolActions:0},
  costMicros:0,
  failure:{
   class:timedOut?"timeout":"cancelled",
   message:late?"late_model_output_rejected":timedOut?"runtime_budget_exhausted":"parent_execution_cancelled",
   retryable:false,
  },
  unresolvedAmbiguities:[],
 };
}
''')

