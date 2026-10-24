from pathlib import Path
p=Path("src/application/production-composition.ts")
s=p.read_text()

a='import {executeSentientPhase1TurnV1,type SentientTurnResultV1} from "../phase1/core-runtime.js";'
b='import {executeSentientPhase1TurnV1,type Phase1AcceptancePolicyV1,type Phase1CognitionPort,type SentientTurnResultV1} from "../phase1/core-runtime.js";'
assert s.count(a)==1, "phase1 import anchor"
s=s.replace(a,b,1)

marker='export const PHASE3_PRODUCTION_ASSESSMENT_CONTRACT="sentient-phase3-production-assessment/v1" as const;'
assert s.count(marker)==1, "helper marker"
helper='''export function runProductionPhase1TurnV1(i:SentientObjectiveInput,cognition:Phase1CognitionPort,acceptancePolicy?:Phase1AcceptancePolicyV1|null):Promise<SentientTurnResultV1>{
 return executeSentientPhase1TurnV1(
  {requestId:`request:${i.objectiveId}`,sessionId:i.sessionId,taskId:i.objectiveId,userRequest:i.request},
  {cognition,...(acceptancePolicy?{acceptancePolicy}:{})},
 );
}
'''
s=s.replace(marker,helper+marker,1)

a='const phase1=await executeSentientPhase1TurnV1({requestId:`request:${i.objectiveId}`,sessionId:i.sessionId,taskId:i.objectiveId,userRequest:i.request},{cognition:o.cognition});'
b='const phase1=await runProductionPhase1TurnV1(i,o.cognition,o.phase1AcceptancePolicy);'
assert s.count(a)==1, "ordinary path anchor"
s=s.replace(a,b,1)

a='s==="WAITING_AUTHORITY"||s==="FAILED"||s==="NOT_CONVERGED"||s==="SUBORDINATE_RESULT_INVALID"'
b='s==="WAITING_AUTHORITY"||s==="FAILED"||s==="NOT_CONVERGED"||s==="SUBORDINATE_RESULT_INVALID"||s==="SUBORDINATE_RESULT_REJECTED"'
assert s.count(a)==1, "http status anchor"
s=s.replace(a,b,1)

p.write_text(s)
