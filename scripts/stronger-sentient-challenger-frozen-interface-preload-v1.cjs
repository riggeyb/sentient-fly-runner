const fs=require("node:fs");

const freezePath="measurement-contracts/stronger-sentient-cognition-artifact-v1.freeze.json";
const sourcePath="scripts/stronger-sentient-cognition-challenger-screen-v1.mjs";
const expectedDigest=process.env.CONTRACT_DIGEST;
const COMMON_ADAPTIVE_COGNITION_POLICY_V1=true;

if(!fs.existsSync(freezePath)) throw new Error("cognition_artifact_freeze_missing");
const freeze=JSON.parse(fs.readFileSync(freezePath,"utf8"));
if(
  freeze.contract!=="sentient-cognition-artifact/v1" ||
  freeze.contractDigest!==expectedDigest ||
  freeze.cognitionArtifactInterfaceFrozen!==true ||
  freeze.dots3SynthesisValidation!=="PASS" ||
  freeze.dots3SynthesisPolicy?.enableThinking!==false ||
  freeze.dots3SynthesisPolicy?.maxOutputTokens!==1536 ||
  freeze.dots3SynthesisPolicy?.evidenceCitationRetention!=="REQUIRED_EXACT" ||
  freeze.visibleArtifactEnvelope?.absoluteMax!==2000 ||
  freeze.challengerOutputCostPolicy!=="COMPACT_INTERNAL_ARTIFACT_ONLY"
) throw new Error("frozen_cognition_interface_policy_mismatch");

if(fs.existsSync(sourcePath)){
  let s=fs.readFileSync(sourcePath,"utf8");

  const oldSynth='const content=`Synthesize a clear user-facing answer only from this cognition artifact. Return JSON only with answer, findingIndexes, evidenceIndexes, constraintIndexes, uncertaintyIndexes, toolIndexes, verificationIndexes, inventedActions. Every index array must contain all zero-based indexes from the corresponding artifact field. Do not invent actions or authority.\\nArtifact:${JSON.stringify(artifact)}`;';
  const newSynth='const requiredEvidence=artifact.evidenceRefs.map(id=>`[evidence: ${id}]`).join(" "); const content=`Synthesize a clear user-facing answer only from this cognition artifact. Return JSON only with answer, findingIndexes, evidenceIndexes, constraintIndexes, uncertaintyIndexes, toolIndexes, verificationIndexes, inventedActions. Every index array must contain all zero-based indexes from the corresponding artifact field. Include every required evidence citation token exactly once in answer: ${requiredEvidence}. Do not invent actions or authority.\\nArtifact:${JSON.stringify(artifact)}`;';
  if(s.includes(oldSynth)) s=s.replace(oldSynth,newSynth);
  else if(!s.includes("Include every required evidence citation token exactly once in answer")) throw new Error("challenger_synthesis_prompt_anchor_mismatch");

  const oldVerify='return x.answer.length>20&&all(x.findingIndexes,a.keyFindings.length)&&all(x.evidenceIndexes,a.evidenceRefs.length)&&all(x.constraintIndexes,a.constraints.length)&&all(x.uncertaintyIndexes,a.uncertainties.length)&&all(x.toolIndexes,a.toolRecommendations.length)&&all(x.verificationIndexes,a.verificationNeeded.length)&&x.inventedActions.length===0;';
  const newVerify='const evidenceLiteral=a.evidenceRefs.every(id=>x.answer.includes(`[evidence: ${id}]`)); return x.answer.length>20&&evidenceLiteral&&all(x.findingIndexes,a.keyFindings.length)&&all(x.evidenceIndexes,a.evidenceRefs.length)&&all(x.constraintIndexes,a.constraints.length)&&all(x.uncertaintyIndexes,a.uncertainties.length)&&all(x.toolIndexes,a.toolRecommendations.length)&&all(x.verificationIndexes,a.verificationNeeded.length)&&x.inventedActions.length===0;';
  if(s.includes(oldVerify)) s=s.replace(oldVerify,newVerify);
  else if(!s.includes("const evidenceLiteral=a.evidenceRefs.every")) throw new Error("challenger_synthesis_verifier_anchor_mismatch");

  s=s.replace("let calls=0; const MAX_CALLS=24;","let calls=0; const MAX_CALLS=process.env.SCREEN_MODE==='deepseek_readiness'?2:36;");

  if(!s.includes("COMMON_ADAPTIVE_COGNITION_POLICY_V1")){
    const start=s.indexOf("async function modelCall(model,task){");
    const end=s.indexOf("function synthVerify",start);
    if(start<0||end<0) throw new Error("challenger_model_call_anchor_mismatch");
    const adaptive=`const COMMON_ADAPTIVE_COGNITION_POLICY_V1=true;
const COGNITION_PROVIDER_COMPLETION_LADDER=Object.freeze([2000,4000]);
const COGNITION_VISIBLE_ARTIFACT_MAX_TOKENS=2000;
const visibleArtifactMeasure=text=>{const utf8Bytes=Buffer.byteLength(String(text??""),"utf8");return {utf8Bytes,tokenEstimate:Math.ceil(utf8Bytes/4),method:"ceil_utf8_bytes_div_4_NOT_TOKENIZER_EXACT"}};
async function modelCall(model,task){
  const prompt={goal:task.input.goal,suppliedFacts:task.input.suppliedFacts,requiredEvidence:task.requiredEvidence,permittedEvidence:task.permittedEvidence,toolsAvailable:task.toolsAvailable,authorityRequirements:task.authorityRequirements,securityRequirements:task.securityRequirements,artifactContract:schema};
  const content="Produce one compact cognition artifact as JSON only. Do not write the final user-facing answer. Use only supplied facts/evidence. Preserve constraints, uncertainty, tool rationale and verification needs. Do not expose private chain-of-thought. Do not claim authority or execution.\\n"+JSON.stringify(prompt);
  const digest=await retrieval.sha256Text(\`screen:\${task.taskId}:\${content}\`),attempts=[];
  let chosen=null;
  for(let i=0;i<COGNITION_PROVIDER_COMPLETION_LADDER.length;i++){
    const providerCompletionMaxTokens=COGNITION_PROVIDER_COMPLETION_LADDER[i],eventStart=events.length;
    const result=await adapter.generate({taskId:task.taskId,sessionId:"cognition-screen-v1",traceId:\`\${model}:\${taskid}:cap-\${providerCompletionMaxTokens}\`,runtime:{name:"measurement",version:process.env.BASELINE_SHA},systemPolicy:"Model output is never authority. Produce only the externally useful model-neutral cognition artifact.",messages:[{role:"user",content}],context:{artifacts:[],contextDigest:digest},tools:[],requiredCapabilities:["text_generation"],maxOutputTokens:providerCompletionMaxTokens,timeoutMs:60000,maxProviderRetries:0,inputDigest:digest},model);
    const artifact=result.ok?parse(result.text):null,verification=cognitionVerify(task,artifact),visible=visibleArtifactMeasure(result.ok?result.text:"");
    const visibleWithinEnvelope=visible.tokenEstimate<=COGNITION_VISIBLE_ARTIFACT_MAX_TOKENS,completeUsableArtifact=verification.verified&&visibleWithinEnvelope;
    const reasoningTokens=result.ok?(result.usage.reasoningTokens??null):null;
    const validOngoingCognition=result.ok&&((typeof result.text==="string"&&result.text.trim().length>0)||(typeof reasoningTokens==="number"&&reasoningTokens>0));
    const event=events[eventStart]??null;
    const escalationEligible=i<COGNITION_PROVIDER_COMPLETION_LADDER.length-1&&result.ok&&result.finishReason==="length"&&!completeUsableArtifact&&validOngoingCognition;
    attempts.push({attempt:i+1,providerCompletionMaxTokens,providerOk*result.ok,httpStatus:event?.status??(result.ok?200:( result.metadata?.httpStatus??null)),finishReason:result.ok?result.finishReason:null,providerRequestId:result.providerRequestId??null,latencyMs:result.latencyMs,inputTokens:result.ok?result.usage.inputTokens:null,providerOutputTokens:result.ok?result.usage.outputTokens:null,reasoningTokens,visibleArtifactUtf8Bytes:visible.utf8Bytes,visibleArtifactTokenEstimate:visible.tokenEstimate,visibleArtifactTokenEstimateMethod:visible.method,visibleArtifactWithinEnvelope:visibleWithinEnvelope,actualBilledCostUsd:result.ok?(result.metadata?.observedCostUsd??null):null,artifactParsed:artifact!==null,artifactSchemaValid:verification.schemaValid,artifactGrounded:verification.grounded,constraintsRetained:verification.constraints,taskCorrect:verification.taskCorrect,completeUsableArtifact,validOngoingCognition,escalationEligible,failureClass:result.ok?null:(result.metadata?.failureClass??result.code)});
    chosen={result,artifact,verification,attempts,completeUsableArtifact,visible};
    if(!escalationEligible) break;
  }
  return chosen;
}
`;
    s=s.slice(0,start)+adaptive+s.slice(end);
  }

  if(!s.includes("DEEPSEEK_COGNITION_READINESS=")){
    const anchor="const rows=[];";
    if(!s.includes(anchor)) throw new Error("challenger_rows_anchor_missing");
    const readiness=`if(process.env.SCREEN_MODE==="deepseek_readiness"){
  const task=tasks[0],model=routes[0][1],c=await modelCall(model,task);
  const report={schemaVersion:"stronger-sentient-deepseeek-cognition-readiness/v1",baselineSha:process.env.BASELINE_SHA,baselineTree:process.env.BASELINE_TREE,contract:"sentient-cognition-artifact/v1",contractDigest:process.env.CONTRACT_DIGEST,model,taskId:task.taskId,providerCalls:c.attempts.length,transportHealth:c.attempts.some(a=>a.httpStatus===200)?"HEALTHY":"UNHEALTHY",cognitionReadiness:c.completeUsableArtifact?"READY":"NOT_READY",completeUsableArtifact:c.completeUsableArtifact,initial2000TokenEnvelopeSufficient:c.attempts.length===1,cognition2000IsInitialScreenEnvelope:true,cognition2000IsGlobalIntelligenceLimit:false,providerCompletionPolicy:{ladder:[2000,4000],initial:2000,nextBoundedEnvelope:4000,escalateOnlyIf:"finish_reason=length AND artifact_incomplete AND valid_ongoing_cognition",sameForEveryModel:true},visibleArtifactMaxTokens:2000,attempts:c.attempts,sourceChange:false,productionDeployment:false};
  fs.writeFileSync(process.env.EXPERIMENT_OUT,JSON.stringify(report,null,2)+"\\n");console.log("DEEPSEEK_COGNITION_READINESS="+JSON.stringify(report));process.exit(0);
}
`;
    s=s.replace(anchor,readiness+anchor);
  }

  s=s.replace("if(c.verification.verified) s=await synth(task,c.artifact,label);","if(c.completeUsableArtifact) s=await synth(task,c.artifact,label);");
  s=s.replace("cognitionVerified:c.verification.verified","cognitionVerified:c.completeUsableArtifact");
  s=s.replace("visibleArtifactTokens:c.result.ok?(reason==null?out:Math.max(0,out-reason)):null,billedOutputTokens:out,reasoningTokens:reason,",
    "visibleArtifactTokens:c.visible.tokenEstimate,visibleArtifactUtf8Bytes:c.visible.utf8Bytes,visibleArtifactTokenEstimateMethod:c.visible.method,billedOutputTokens:out,reasoningTokens:reason,");
  s=s.replace("artifactDigest:c.artifact?sha(JSON.stringify(c.artifact)):null,",
    "artifactDigest:c.artifact?sha(JSON.stringify(c.artifact)):null,adaptiveCompletion:{initial2000TokenEnvelopeSufficient:c.attempts.length===1,finalProviderCompletionEnvelope:c.attempts.at(-1).providerCompletionMaxTokens,attempts:c.attempts},");
  s=s.replace("endToEndVerified:c.verification.verified&&(s?.verified===true),","endToEndVerified:c.completeUsableArtifact&&(s?.verified===true),");
  s=s.replace("commonCognitionMaxOutputTokens:2000,dots3SynthesisMaxOutputTokens:1536,",
    'completionPolicy:{providerCompletionLadder:[2000,4000],initialProviderCompletionTokens:2000,adaptiveProviderCompletionMaxTokens:4000,visibleArtifactMaxTokens:2000,cognition2000IsInitialScreenEnvelope:true,cognition2000IsGlobalIntelligenceLimit:false,escalationPredicate:"finish_reason=length AND artifact_incomplete AND valid_ongoing_cognition",sameForEveryModel:true},dots3SynthesisMaxOutputTokens:1536,evaluationDimensions:{quality:"SEPARATE",efficiency:"SEPARATE",opaqueCombinedScore:false},');

  fs.writeFileSync(sourcePath,s);
}

const originalFetch=globalThis.fetch;
if(typeof originalFetch!=="function") throw new Error("global_fetch_unavailable");
globalThis.fetch=async(input,init={})=>{
  let nextInit=init;
  try{
    const url=typeof input==="string"?input:input?.url;
    if(typeof url==="string"&&url.includes("api.atlascloud.ai/v1/chat/completions")&&typeof init?.body==="string"){
      const body=JSON.parse(init.body);
      if(body?.model==="dots-studio/dots-3-note-prev-free"){
        body.enable_thinking=false;
        nextInit={...init,body:JSON.stringify(body)};
      }
    }
  }catch{nextInit=init}
  return originalFetch(input,nextInit);
};
