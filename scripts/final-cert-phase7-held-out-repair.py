#!/usr/bin/env python3
from pathlib import Path
p=Path('src/phase7/production-lineage.ts')
q=Path('src/application/production-model-improvement.ts')
s=p.read_text(); a=q.read_text()
def replace_once(source, before, after, name):
 n=source.count(before)
 if n!=1: raise RuntimeError(f'{name}: expected one, found {n}')
 return source.replace(before,after)
s=replace_once(s,'excluded:ReadonlySet<string>):readonly Phase7ResolvedExampleV1[]{','excluded:ReadonlySet<string>,sessionId?:string):readonly Phase7ResolvedExampleV1[]{','signature')
s=replace_once(s,' const out:Phase7ResolvedExampleV1[]=[];\n for(const [runId,experiences] of [...byRun.entries()].sort',' const out:Phase7ResolvedExampleV1[]=[];\n let firstPositive:Phase7ResolvedExampleV1|undefined;\n let firstNegative:Phase7ResolvedExampleV1|undefined;\n for(const [runId,experiences] of [...byRun.entries()].sort','track labels')
s=replace_once(s,'  const verification=snapshot.records.verifications.filter(x=>validVerification(snapshot,x,runId))','  if(sessionId!==undefined&&run.sessionId!==sessionId)continue;\n  const verification=snapshot.records.verifications.filter(x=>validVerification(snapshot,x,runId))','session scope')
s=replace_once(s,'''  out.push(Object.freeze({runId,text:experienceText(experiences),label:outcome==="success"?"POSITIVE":"NEGATIVE",
   evidenceRefs:Object.freeze([...verification.evidenceIds]),verificationRef:verification.id}));
  if(out.length>=MAX_HELD_OUT_EXAMPLES)break;
 }
 return Object.freeze(out);
}''','''  const example:Phase7ResolvedExampleV1=Object.freeze({runId,text:experienceText(experiences),label:outcome==="success"?"POSITIVE":"NEGATIVE",
   evidenceRefs:Object.freeze([...verification.evidenceIds]),verificationRef:verification.id});
  if(out.length<MAX_HELD_OUT_EXAMPLES)out.push(example);
  if(example.label==="POSITIVE"&&!firstPositive)firstPositive=example;
  if(example.label==="NEGATIVE"&&!firstNegative)firstNegative=example;
 }
 // Maintain verified class coverage even if the minority label sorts after the bounded prefix.
 if(out.length===MAX_HELD_OUT_EXAMPLES){
  if(firstPositive&&!out.some(x=>x.label==="POSITIVE"))out[out.length-1]=firstPositive;
  if(firstNegative&&!out.some(x=>x.label==="NEGATIVE"))out[out.length-1]=firstNegative;
  out.sort((a,b)=>a.runId.localeCompare(b.runId));
 }
 return Object.freeze(out);
}''','label preservation')
a=replace_once(a,'''  const heldOut=resolvePhase7HeldOutExamplesV1(snapshot,trainingRunIds).filter(
   x=>snapshot.records.modelRuns.some(run=>run.id===x.runId&&run.sessionId===learning.episode.sessionId),
  );''','''  const heldOut=resolvePhase7HeldOutExamplesV1(snapshot,trainingRunIds,learning.episode.sessionId);''','callsite')
p.write_text(s);q.write_text(a)

test=Path('test/final-cert-phase7-held-out-robustness.test.ts')
if test.exists(): raise RuntimeError('targeted regression already exists')
test.write_text("""import assert from "node:assert/strict";
import test from "node:test";
import type { StateSnapshot } from "../src/state/types.js";
import {resolvePhase7HeldOutExamplesV1,phase7ExamplesHaveBothLabelsV1} from "../src/phase7/production-lineage.js";
type Row={id:string;session:string;label:"POSITIVE"|"NEGATIVE";verified?:boolean};
function fixture(rows:readonly Row[]):StateSnapshot{
 return {records:{
  modelRuns:rows.map(x=>({id:x.id,sessionId:x.session,status:x.label==="POSITIVE"?"succeeded":"failed"})),
  experiences:rows.map(x=>({id:`xp-${x.id}`,modelRunId:x.id,outcome:x.label==="POSITIVE"?"success":"failure",summary:`verified ${x.label} ${x.id}`})),
  evidence:rows.map(x=>({id:`ev-${x.id}`})),
  verifications:rows.map(x=>({id:`vr-${x.id}`,status:x.verified===false?"failed":"passed",deterministic:true,provenance:{actor:"system",modelRunId:x.id},evidenceIds:[`ev-${x.id}`]})),
 }} as unknown as StateSnapshot;
}
const pos=(id:string,session:string):Row=>({id,session,label:"POSITIVE"});
const neg=(id:string,session:string):Row=>({id,session,label:"NEGATIVE"});
test("session filter precedes global cap even with >32 earlier verified runs",()=>{
 const earlier=Array.from({length:40},(_,i)=>pos(`aaa-${String(i).padStart(3,"0")}`,"other"));
 const out=resolvePhase7HeldOutExamplesV1(fixture([...earlier,pos("zzz-positive","target"),neg("zzz-negative","target")]),new Set(),"target");
 assert.deepEqual(out.map(x=>x.runId),["zzz-negative","zzz-positive"]);
 assert.equal(phase7ExamplesHaveBothLabelsV1(out),true);
});
test("bounded deterministic held-out selection preserves late minority label and disjointness",()=>{
 const rows=[...Array.from({length:40},(_,i)=>pos(`a-${String(i).padStart(3,"0")}`,"target")),neg("z-last-negative","target"),pos("zz-train","target"),neg("zzz-other","other")];
 const snapshot=fixture(rows),excluded=new Set(["zz-train"]);
 const once=resolvePhase7HeldOutExamplesV1(snapshot,excluded,"target");
 const twice=resolvePhase7HeldOutExamplesV1(snapshot,excluded,"target");
 assert.equal(once.length,32);
 assert.deepEqual(once,twice);
 assert.equal(phase7ExamplesHaveBothLabelsV1(once),true);
 assert(once.some(x=>x.runId==="z-last-negative"));
 assert(!once.some(x=>x.runId==="zz-train"||x.runId==="zzz-other"));
 assert.deepEqual(once.map(x=>x.runId),[...once.map(x=>x.runId)].sort());
});
test("genuinely missing verified negative in target session remains fail-closed",()=>{
 const rows=[pos("a-pos","target"),{...neg("b-unverified","target"),verified:false},neg("c-other-negative","other")];
 const out=resolvePhase7HeldOutExamplesV1(fixture(rows),new Set(),"target");
 assert.deepEqual(out.map(x=>x.runId),["a-pos"]);
 assert.equal(phase7ExamplesHaveBothLabelsV1(out),false);
});
""")
