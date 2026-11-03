const fs=require("node:fs");
const F="measurement-contracts/stronger-sentient-cognition-artifact-v1.freeze.json";
const S="scripts/stronger-sentient-cognition-challenger-screen-v1.mjs";
const D=process.env.CONTRACT_DIGEST;
const COMMON_ADAPTIVE_COGNITION_POLICY_V1=true;

const f=JSON.parse(fs.readFileSync(F,"utf8"));
if(
  f.contract!=="sentient-cognition-artifact/v1" ||
  f.contractDigest!==D ||
  f.cognitionArtifactInterfaceFrozen!==true ||
  f.dots3SynthesisValidation!=="PASS" ||
  f.dots3SynthesisPolicy?.enableThinking!==false ||
  f.visibleArtifactEnvelope?.absoluteMax!==2000 ||
  f.challengerOutputCostPolicy!=="COMPACT_INTERNAL_ARTIFACT_ONLY"
) throw new Error("frozen_cognition_interface_policy_mismatch");

let s=fs.readFileSync(S,"utf8");
if(!s.includes("DEEPSEEK_COGNITION_READINESS_V2")){
  const ceiling="let calls=0; const MAX_CALLS=24;";
  if(!s.includes(ceiling)) throw new Error("challenger_call_ceiling_anchor_mismatch");
  s=s.replace(ceiling,"let calls=0; const MAX_CALLS=process.env.SCREEN_MODE==='deepseek_readiness'?2:24;");

  const anchor="const rows=[];";
  if(!s.includes(anchor)) throw new Error("challenger_rows_anchor_mismatch");
  const inject=String.raw`
const DEEPSEEK_COGNITION_READINESS_V2=true;
if(process.env.SCREEN_MODE==="deepseek_readiness"){
  const task=tasks[0],model=routes[0][1],ladder=[2000,4000],attempts=[];
  const prompt={goal:task.input.goal,suppliedFacts:task.input.suppliedFacts,requiredEvidence:task.requiredEvidence,permittedEvidence:task.permittedEvidence,toolsAvailable:task.toolsAvailable,authorityRequirements:task.authorityRequirements,securityRequirements:task.securityRequirements,artifactContract:schema};
  const content="Produce one compact cognition artifact as JSON only. Do not write final user-facing prose. Use only supplied facts/evidence. Preserve conclusions, constraints, uncertainty, tool rationale, risks, and verification needs. Do not expose private chain-of-thought. Do not claim authority or execution.\n"+JSON.stringify(prompt);
  const digest=await retrieval.sha256Text(\`deepseek-readiness:\${task.taskId}:\${content}\`);
  let final=null;
  for(let i=0;i<ladder.length;i++){
    const cap=ladder[i],eventStart=events.length;
    const result=await adapter.generate({taskId:task.taskId,sessionId:"challenger-deepseek-readiness-v1",traceId:\`deepseek-readiness:\${task.taskId}:cap-\${cap}\`,runtime:{name:"measurement",version:process.env.BASELINE_SHA},systemPolicy:"Model output is never authority. Produce only the externally useful model-neutral cognition artifact.",messages:[{role:"user",content}],context:{artifacts:[],contextDigest:digest},tools:[],requiredCapabilities:["text_generation"],maxOutputTokens:cap,timeoutMs:60000,maxProviderRetries:0,inputDigest:digest},model);
    const artifact=result.ok?parse(result.text):null,verification=cognitionVerify(task,artifact);
    const utf8Bytes=Buffer.byteLength(String(result.ok?result.text:""),"utf8"),visibleArtifactTokens=Math.ceil(utf8Bytes/4);
    const complete=verification.verified&&visibleArtifactTokens<=2000,reasoningTokens=result.ok?(result.usage.reasoningTokens??null):null;
    const ongoing=result.ok&&((typeof result.text==="string"&&result.text.trim().length>0)||(typeof reasoningTokens==="number"&&reasoningTokens>0));
    const event=events[eventStart]??null,escalate=i<ladder.length-1&&result.ok&&result.finishReason==="length"&&!complete&&ongoing;
    attempts.push({attempt:i+1,providerCompletionMaxTokens:cap,providerOk:result.ok,httpStatus:event?.status??(result.ok?200:(result.metadata?.httpStatus??null)),finishReason:result.ok?result.finishReason:null,providerRequestId:result.providerRequestId??null,latencyMs:result.latencyMs,inputTokens:result.ok?result.usage.inputTokens:null,providerOutputTokens:result.ok?result.usage.outputTokens:null,reasoningTokens,visibleArtifactUtf8Bytes:utf8Bytes,visibleArtifactTokens,visibleArtifactTokenMeasurement:"ceil_utf8_bytes_div_4_NOT_TOKENIZER_EXACT",actualBilledCostUsd:result.ok?(result.metadata?.observedCostUsd??null):null,artifactParsed:artifact!==null,artifactSchemaValid:verification.schemaValid,artifactGrounded:verification.grounded,constraintsRetained:verification.constraints,taskCorrect:verification.taskCorrect,completeUsableArtifact:complete,validOngoingCognition:ongoing,escalationEligible:escalate,failureClass:result.ok?null:(result.metadata?.failureClass??result.code)});
    final={complete,artifact,verification};
    if(!escalate)break;
  }
  const report={schemaVersion:"stronger-sentient-deepseek-cognition-readiness/v1",baselineSha:process.env.BASELINE_SHA,baselineTree:process.env.BASELINE_TREE,contract:"sentient-cognition-artifact/v1",contractDigest:process.env.CONTRACT_DIGEST,model,taskId:task.taskId,providerCalls:attempts.length,transportHealth:attempts.some(a=>a.httpStatus===200)?"HEALTHY":"UNHEALTHY",cognitionReadiness:final?.complete?"READY":"NOT_READY",completeUsableArtifact:final?.complete===true,initial2000TokenEnvelopeSufficient:attempts.length===1&&final?.complete===true,cognition2000IsInitialScreenEnvelope:true,cognition2000IsGlobalIntelligenceLimit:false,providerCompletionPolicy:{ladder,initial:2000,nextBoundedEnvelope:4000,escalateOnlyIf:"finish_reason=length AND artifact_incomplete AND valid_ongoing_cognition",sameForEveryModel:true},visibleArtifactMaxTokens:2000,attempts,challengerCalls:0,sourceChange:false,productionDeployment:false};
  fs.writeFileSync(process.env.EXPERIMENT_OUT,JSON.stringify(report,null,2)+"\n");
  console.log("DEEPSEEK_COGNITION_READINESS="+JSON.stringify(report));
  process.exit(0);
}
`;
  s=s.replace(anchor,inject+anchor);
  fs.writeFileSync(S,s);
}
