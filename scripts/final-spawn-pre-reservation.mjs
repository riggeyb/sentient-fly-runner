import { PostgresSpawnObjectiveRepository as Repo } from "/app/dist/src/objective-continuation/postgres-spawn-repository.js";
import { LocalHuggingFaceRuntimeV1, LOCAL_HF_MODEL_REVISION_V1, LOCAL_HF_MODEL_V1, LOCAL_HF_PROVIDER_V1 } from "/app/dist/src/model/providers/huggingface.js";
import { LocalHuggingFaceSpawnExecutionBackendV1, HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1, HUGGINGFACE_LOCAL_DATA_HANDLING_MODE_V1 } from "/app/dist/src/spawn/backends/huggingface.js";
import { evaluateSpawnPolicyV1 } from "/app/dist/src/spawn/policy.js";
import { selectSpawnExecutionTargetV1 } from "/app/dist/src/spawn/selection.js";
import { buildChildTaskPackageV1 } from "/app/dist/src/spawn/context.js";

const oid=String(process.env.CERT_OID??"").trim();
const sid=String(process.env.CERT_SID??"").trim();
const db=String(process.env.DATABASE_URL??process.env.DIRECT_URL??"").trim();
if(!oid||!sid||!db) throw new Error("probe_binding_missing");
const repo=new Repo({connectionString:db});
const pass=(n,d={})=>console.log(`STAGE_${n}=PASS ${JSON.stringify(d)}`);
const fail=(n,e)=>{const m=e instanceof Error?e.message:String(e);console.log(`STAGE_${n}=FAIL ${JSON.stringify({message:m.slice(0,500)})}`);throw e};
const targetConstraints=()=>({
  targets:{allowed:[],denied:[]},
  backends:{allowed:[HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1],denied:["atlascloud-dots3","openrouter","huggingface-inference-api"]},
  providers:{allowed:[LOCAL_HF_PROVIDER_V1],denied:["atlascloud","openai","openrouter","huggingface"]},
  models:{allowed:[LOCAL_HF_MODEL_V1],denied:[]},
  preferenceOrder:[]
});
const ceilings={maxInputTokens:32000,maxOutputTokens:8000,maxTotalTokens:40000,maxCostMicros:0,currency:"USD",maxRuntimeMs:120000,maxToolRounds:8,maxToolActions:16,maxChildExecutions:4,maxRecursionDepth:1};
try{
  let works;
  try{
    const snapshot=await repo.snapshot();
    works=(snapshot.collaborationActiveWork?.records??[]).filter(x=>x.objectiveId===oid&&x.workKey==="independent-analysis");
    pass("WORK",{count:works.length,statuses:works.map(x=>x.status),sessions:[...new Set(works.map(x=>x.sessionId))]});
  }catch(e){fail("WORK",e)}
  const work=[...works].sort((a,b)=>b.sessionSequence-a.sessionSequence)[0]; if(!work)throw new Error("work_missing");
  const requestId=work.participantId,rootId=`root:${oid}`;
  let root;try{root=await repo.getSpawnExecution(rootId);if(!root)throw new Error("root_missing");pass("ROOT",{status:root.identity.status,depth:root.identity.depth,remaining:root.remainingBudgets});}catch(e){fail("ROOT",e)}
  let catalog;try{const backend=new LocalHuggingFaceSpawnExecutionBackendV1(new LocalHuggingFaceRuntimeV1());catalog=[...(await backend.describe())];pass("DESCRIBE",{count:catalog.length,backendId:catalog[0]?.backendId,provider:catalog[0]?.provider,model:catalog[0]?.model});}catch(e){fail("DESCRIBE",e)}
  let ledger;try{ledger=await repo.spawnLedger(oid,rootId);pass("LEDGER",ledger);}catch(e){fail("LEDGER",e)}
  const privacy=root.effectiveGrant.privacyPolicy.classification;
  const policy={
    schemaVersion:"spawn-policy/v1",policyId:"sentient-production-collaboration",
    maxChildrenPerExecution:4,maxConcurrentChildrenPerExecution:2,maxDepth:1,maxTotalExecutionsPerTask:5,
    budgetCeilings:structuredClone(ceilings),allowedCapabilities:["objective.cognition","objective.verification"],tools:[],
    scopes:{worldState:[],evidence:["objective"],repositories:[],durableMemory:[],episodes:["collaboration"]},
    privacy:{allowedClassifications:[privacy],allowedDataHandlingModes:[HUGGINGFACE_LOCAL_DATA_HANDLING_MODE_V1],allowExternalProcessing:false},
    targetConstraints:targetConstraints()
  };
  const req={
    schemaVersion:"spawn-sentient/v1",requestId,taskId:oid,parentExecutionId:rootId,role:"independent-analysis",objective:work.currentAction,
    targetPolicy:{requiredCapabilities:["objective.cognition"],qualityRequirements:[],costRequirements:["approved-zero-cost"],privacyRequirements:[privacy],...targetConstraints()},
    skills:{exactSkillIds:[],selectionPolicy:{policyId:"sentient-production-default",parameters:{}}},
    tools:[],scopes:{worldState:[],evidence:["objective"],repositories:[],durableMemory:[],episodes:["collaboration"]},
    budgets:{maxInputTokens:4096,maxOutputTokens:1024,maxTotalTokens:5120,maxCostMicros:0,currency:"USD",maxRuntimeMs:60000,maxToolRounds:0,maxToolActions:0,maxChildExecutions:0,maxRecursionDepth:0},
    outputSchema:{},acceptanceContract:{verifierId:"sentient-deterministic-convergence",configuration:{},allowedOutcomes:["accept","repair","escalate","reject"]},
    privacyPolicy:{classification:privacy,allowedDataHandlingModes:[HUGGINGFACE_LOCAL_DATA_HANDLING_MODE_V1],allowExternalProcessing:false}
  };
  let decision;try{decision=await evaluateSpawnPolicyV1({policy,parent:{identity:root.identity,effectiveGrant:root.effectiveGrant,remainingBudgets:root.remainingBudgets},request:req,ledger,targetCatalog:catalog});pass("POLICY",{decision:decision.decision,reasons:decision.reasonCodes,reservation:decision.reservation});}catch(e){fail("POLICY",e)}
  if(decision.decision!=="allow"||!decision.effectiveGrant||!decision.reservation)throw new Error(`policy_not_allow:${decision.reasonCodes.join(",")}`);
  let target;try{target=selectSpawnExecutionTargetV1(req,decision.effectiveGrant,catalog);pass("SELECT",{targetId:target.targetId});}catch(e){fail("SELECT",e)}
  const eid=`${requestId}:execution`;
  try{const pkg=await buildChildTaskPackageV1({request:req,executionId:eid,depth:root.identity.depth+1,target,sentientCode:root.identity.sentientCode,effectiveGrant:decision.effectiveGrant,resolvedSkills:[],contextCandidates:[],contextBounds:{maxArtifacts:4,maxTotalChars:16000,maxArtifactChars:8000}});pass("PACKAGE",{requestDigest:pkg.requestDigest,packageDigest:pkg.packageDigest});}catch(e){fail("PACKAGE",e)}
  try{
    const snap=await repo.spawnSnapshot(), rec=snap.records, nowLedger=await repo.spawnLedger(oid,rootId);
    const r=decision.reservation;
    const pairs=[["inputTokens","maxInputTokens"],["outputTokens","maxOutputTokens"],["totalTokens","maxTotalTokens"],["costMicros","maxCostMicros"],["runtimeMs","maxRuntimeMs"],["toolRounds","maxToolRounds"],["toolActions","maxToolActions"]];
    pass("RESERVE_PRE",{
      nowLedger,decisionLedger:decision.ledger,
      ledgerEqual:JSON.stringify(nowLedger)===JSON.stringify(decision.ledger),
      duplicateRequest:rec.requests.some(x=>x.id===requestId),
      duplicateExecution:rec.executions.some(x=>x.id===eid),
      childSlots:root.remainingBudgets.maxChildExecutions,
      budgetFailures:pairs.filter(([u,b])=>root.remainingBudgets[b]<r[u]).map(([u,b])=>({u,b}))
    });
  }catch(e){fail("RESERVE_PRE",e)}
  console.log("PRE_RESERVTTION_DIAGNOSTIC=PASS");
  console.log("SECRET_VALUES_EXPOSED=false");
}finally{await repo.close().catch(()=>undefined)}
