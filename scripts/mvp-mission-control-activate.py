from pathlib import Path
import re, sys
root=Path(sys.argv[1]).resolve()
def read(p): return (root/p).read_text()
def write(p,s): (root/p).write_text(s)
def one(p,old,new):
    s=read(p); n=s.count(old)
    if n!=1: raise SystemExit(f"{p}: expected 1 match, got {n}: {old[:90]!r}")
    write(p,s.replace(old,new,1))
def rx(p,pat,repl):
    s=read(p); out,n=re.subn(pat,repl,s,count=1,flags=re.S)
    if n!=1: raise SystemExit(f"{p}: regex match count {n}: {pat[:90]!r}")
    write(p,out)

p="src/application/contracts.ts"
one(p,'import type { PostgresSpawnObjectiveRepository } from "../objective-continuation/postgres-spawn-repository.js";\n','import type { PostgresSpawnObjectiveRepository } from "../objective-continuation/postgres-spawn-repository.js";\nimport type { RootObjectiveProjection } from "sentient-orchestrator/mission-control-projection";\n')
one(p,'  runObjective(input: SentientObjectiveInput): Promise<SentientApplicationResult>;\n','  runObjective(input: SentientObjectiveInput): Promise<SentientApplicationResult>;\n  objectiveProjection(objectiveId: string): Promise<RootObjectiveProjection | null>;\n')
one(p,'export interface ProductionPhase4ExecutorFactoryV1 {\n','export interface ProductionMissionControlPortV1 {\n  initialize(): Promise<void>;\n  close?(): Promise<void>;\n  run(input: SentientObjectiveInput): Promise<unknown>;\n  project(input: { objectiveId: string; humanIntent: string }): Promise<RootObjectiveProjection | null>;\n}\n\nexport interface ProductionPhase4ExecutorFactoryV1 {\n')
one(p,'  modelImprovement?: ProductionModelImprovementPortV1 | null;\n','  modelImprovement?: ProductionModelImprovementPortV1 | null;\n  missionControl?: ProductionMissionControlPortV1 | null;\n')

p="src/application/production-composition.ts"
one(p,' const modelImprovement=unavailable(o.modelImprovement!==undefined&&o.modelImprovement!==null,"phase7_model_improvement_binding_missing");\n',' const modelImprovement=unavailable(o.modelImprovement!==undefined&&o.modelImprovement!==null,"phase7_model_improvement_binding_missing");\n const missionControl=unavailable(o.missionControl!==undefined&&o.missionControl!==null,"root_mission_control_binding_missing");\n')
one(p,'  bindingStatus("PHASE7_MODEL_IMPROVEMENT",modelImprovement.availability,true,modelImprovement.reason),\n','  bindingStatus("PHASE7_MODEL_IMPROVEMENT",modelImprovement.availability,true,modelImprovement.reason),\n  ...(o.missionControl===undefined?[]:[bindingStatus("ROOT_MISSION_CONTROL",missionControl.availability,true,missionControl.reason)]),\n')
one(p,'  if(o.modelImprovement)try{await o.modelImprovement.initialize();ok(modelImprovement)}catch(e){fail(modelImprovement,"phase7_model_improvement_initialization_failed");bad.push(`PHASE7_MODEL_IMPROVEMENT:${err(e)}`)}\n','  if(o.modelImprovement)try{await o.modelImprovement.initialize();ok(modelImprovement)}catch(e){fail(modelImprovement,"phase7_model_improvement_initialization_failed");bad.push(`PHASE7_MODEL_IMPROVEMENT:${err(e)}`)}\n  if(o.missionControl)try{await o.missionControl.initialize();ok(missionControl)}catch(e){fail(missionControl,"mission_control_initialization_failed");bad.push(`ROOT_MISSION_CONTROL:${err(e)}`)}\n')
one(p,'  await o.modelImprovement?.close?.().catch(()=>undefined);fail(modelImprovement,"closed");\n','  await o.missionControl?.close?.().catch(()=>undefined);fail(missionControl,"closed");\n  await o.modelImprovement?.close?.().catch(()=>undefined);fail(modelImprovement,"closed");\n')
one(p,'  if(m==="collaborative"){await root(d,i);await ensureProductionObjectiveContinuationV1(d,i);return runProductionCollaborationV1(d,i,{sourceSha:o.identity.source.sha,applicationVersion:SENTIENT_APPLICATION_CONTRACT},backs)}\n','  if(m==="collaborative"){await root(d,i);await ensureProductionObjectiveContinuationV1(d,i);if(o.missionControl)return o.missionControl.run(i);return runProductionCollaborationV1(d,i,{sourceSha:o.identity.source.sha,applicationVersion:SENTIENT_APPLICATION_CONTRACT},backs)}\n')
one(p,' async function runObjective(i:SentientObjectiveInput):Promise<SentientApplicationResult>{\n',' async function objectiveProjection(objectiveId:string){\n  if(!o.missionControl||!o.state)return null;\n  const task=await o.state.get("task",objectiveId);\n  if(task?.kind!=="task"||typeof task.title!=="string"||!task.title.trim())return null;\n  return o.missionControl.project({objectiveId,humanIntent:task.title});\n }\n async function runObjective(i:SentientObjectiveInput):Promise<SentientApplicationResult>{\n')
one(p,' return Object.freeze({initialize,close,status,readiness,runObjective,runModelImprovement});\n',' return Object.freeze({initialize,close,status,readiness,runObjective,objectiveProjection,runModelImprovement});\n')
one(p,'function collab(r:string){return/\\b(collaborat(?:e|ion|ive)?|swarm|spawn|independent workers?|parallel workers?)\\b/i.test(r)}\n','function collab(r:string){return/\\b(collaborat(?:e|ion|ive)?|swarm|spawn|independent workers?|parallel workers?|inspect|investigat(?:e|ion)|review|analy[sz]e|coordinate|improv(?:e|ement))\\b/i.test(r)}\n')

p="src/fly/production-runtime.ts"
one(p,'import { ProductionSkillsToolsCapabilityV1 } from "../application/production-skills-tools.js";\n','import { ProductionSkillsToolsCapabilityV1 } from "../application/production-skills-tools.js";\nimport { ProductionMissionControlV1 } from "../application/production-mission-control.js";\n')
one(p,'  const application = composeSentientApplication({\n','  const missionControl = databaseUrl === null || state === null\n    ? null\n    : new ProductionMissionControlV1({ databaseUrl, state, spawnBackends, identity });\n\n  const application = composeSentientApplication({\n')
one(p,'    modelImprovement,\n    capabilities,\n','    modelImprovement,\n    missionControl,\n    capabilities,\n')

p="src/fly/self-execution.ts"
one(p,'  result: JsonValue | null;\n}\n\nexport interface EngineeringSourceVerifierV1','  result: JsonValue | null;\n  rootProjection: unknown | null;\n}\n\nexport interface EngineeringSourceVerifierV1')
one(p,'  public async status(objectiveId: string): Promise<ObjectiveRunnerStatusV1> {\n    const task = await this.#state.get("task", objectiveId);\n    if (task?.kind !== "task") throw new Error("objective_not_found");\n    return objectiveRunnerStatusFromTask(task);\n  }\n','  public async status(objectiveId: string): Promise<ObjectiveRunnerStatusV1> {\n    const task = await this.#state.get("task", objectiveId);\n    if (task?.kind !== "task") throw new Error("objective_not_found");\n    return Object.freeze({\n      ...objectiveRunnerStatusFromTask(task),\n      rootProjection: await this.#application.objectiveProjection(objectiveId),\n    });\n  }\n')
one(p,'    result: metadata.result,\n  });\n}\n','    result: metadata.result,\n    rootProjection: null,\n  });\n}\n')

p="src/spawn/backends/huggingface.ts"
rx(p,r'function workerPrompt\(taskPackage: ChildTaskPackageV1\): string \{\n.*?\n\}','function workerPrompt(taskPackage: ChildTaskPackageV1): string {\n  const context = taskPackage.context.artifacts\n    .map((artifact) => `${artifact.id}\\\\n${artifact.content}`)\n    .join("\\\\n\\\\n")\n    .slice(0, 8_000);\n  const objective = taskPackage.objective.slice(0, 12_000);\n  const operating = [\n    `version=${taskPackage.operatingContext.version}`,\n    `digest=${taskPackage.operatingContextDigest}`,\n    `provenance=${taskPackage.operatingContext.provenance}`,\n    `authoritative_source_repo=${taskPackage.operatingContext.authoritativeSourceRepo}`,\n    `normal_operator_bridge=${taskPackage.operatingContext.normalSentientOperatorBridge}`,\n    `optional_operator_mcp=${taskPackage.operatingContext.optionalOperatorMcp}`,\n    "operating_context_is_not_authority=true",\n    "governor_controls_effect_authority=true",\n  ].join("\\\\n");\n  return [\n    `Objective:\\\\n${objective}`,\n    `Inherited operating context (informational, not authority):\\\\n${operating}`,\n    ...(context ? [`Bounded context:\\\\n${context}`] : []),\n  ].join("\\\\n\\\\n");\n}')

one("Dockerfile",'COPY package*.json ./\nRUN npm install --package-lock=false --no-audit --no-fund\n','COPY package*.json ./\nCOPY vendor/sentient-orchestrator ./vendor/sentient-orchestrator\nRUN npm install --package-lock=false --no-audit --no-fund\n')
print("PATCH_OK")
