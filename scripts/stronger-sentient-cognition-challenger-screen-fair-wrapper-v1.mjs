import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  AtlasCloudAdapter,
  DEEPSEEK_V3_2_MODEL_V1,
  retrieval,
} from "../sentient/dist/src/index.js";

const source="scripts/stronger-sentient-cognition-challenger-screen-v1.mjs";
const freezePath="measurement-contracts/stronger-sentient-cognition-artifact-v1.freeze.json";
const preloadPath=path.resolve("scripts/stronger-sentient-challenger-frozen-interface-preload-v1.cjs");
const out=process.env.EXPERIMENT_OUT;
const key=String(process.env.ATLASCLOUD_API_KEY??"").trim();
const expectedContract="sentient-cognition-artifact/v1";
const expectedDigest=process.env.CONTRACT_DIGEST;

if(!out) throw new Error("experiment_out_missing");
if(!key) throw new Error("atlas_secret_missing");

function writeBlocked(reason,extra={}){
  const report={
    schemaVersion:"stronger-sentient-cognition-challenger-screen-gate/v1",
    baselineSha:process.env.BASELINE_SHA,
    baselineTree:process.env.BASELINE_TREE,
    contract:expectedContract,
    contractDigest:expectedDigest,
    screenStatus:"BLOCKED",
    blockedReason:reason,
    challengerCalls:0,
    modelRanking:"NOT_PERMITTED",
    stopScreen:true,
    kimiK26Calls:0,
    qwen38MaxCalls:0,
    kimiK31ProCalls:0,
    sourceChange:false,
    productionDeployment:false,
    ...extra,
  };
  fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
  console.log("CHALLENGER_SCREEN_GATE="+JSON.stringify(report));
  process.exit(0);
}

if(!fs.existsSync(freezePath)) writeBlocked("COGNITION_ARTIFACT_INTERFACE_NOT_FROZEN");
if(!fs.existsSync(preloadPath)) throw new Error("frozen_interface_preload_missing");

const freeze=JSON.parse(fs.readFileSync(freezePath,"utf8"));
const envelope=freeze.visibleArtifactEnvelope??{};
const freezeValid=
  freeze.schemaVersion==="sentient-cognition-artifact-freeze/v1" &&
  freeze.contract===expectedContract &&
  freeze.contractDigest===expectedDigest &&
  freeze.baselineSha===process.env.BASELINE_SHA &&
  freeze.baselineTree===process.env.BASELINE_TREE &&
  freeze.cognitionArtifactInterfaceFrozen===true &&
  freeze.dots3SynthesisValidation==="PASS" &&
  freeze.challengerOutputCostPolicy==="COMPACT_INTERNAL_ARTIFACT_ONLY" &&
  freeze.dots3SynthesisPolicy?.enableThinking===false &&
  freeze.dots3SynthesisPolicy?.maxOutputTokens===1536 &&
  freeze.dots3SynthesisPolicy?.evidenceCitationRetention==="REQUIRED_EXACT" &&
  JSON.stringify(envelope.low)==='[500,750]' &&
  JSON.stringify(envelope.standard)==='[750,1200]' &&
  JSON.stringify(envelope.high)==='[1200,2000]' &&
  envelope.absoluteMax===2000 &&
  envelope.doNotPad===true &&
  envelope.doNotOverCompress===true;
if(!freezeValid){
  writeBlocked("COGNITION_ARTIFACT_INTERFACE_NOT_FROZEN",{freezeObserved:{
    schemaVersion:freeze.schemaVersion??null,
    contract:freeze.contract??null,
    contractDigest:freeze.contractDigest??null,
    baselineSha:freeze.baselineSha??null,
    baselineTree:freeze.baselineTree??null,
    cognitionArtifactInterfaceFrozen:freeze.cognitionArtifactInterfaceFrozen??null,
    dots3SynthesisValidation:freeze.dots3SynthesisValidation??null,
    challengerOutputCostPolicy:freeze.challengerOutputCostPolicy??null,
    dots3SynthesisPolicy:freeze.dots3SynthesisPolicy??null,
    visibleArtifactEnvelope:envelope,
  }});
}

const screenSource=fs.readFileSync(source,"utf8");
if((screenSource.match(/maxOutputTokens:2000/g)??[]).length!==1) throw new Error("unexpected_cognition_cap_marker");
if(screenSource.includes("maxOutputTokens:4096")) throw new Error("economic_guard_regression_4096");
if(!screenSource.includes("Do not write the final user-facing answer")) throw new Error("compact_artifact_contract_missing");

const caps={
  text_generation:true,
  structured_output:false,
  tool_use:false,
  tool_continuation:false,
  reasoning_effort:false,
  image_input:false,
  server_side_tools:false,
};
const preflightAdapter=new AtlasCloudAdapter({
  apiKey:key,
  maxProviderRetries:0,
  modelProfiles:[{
    model:DEEPSEEK_V3_2_MODD\_V1,
    capabilities:caps,
    profileId:"challenger-fairness-preflight-v1",
  }],
});

const preflight=[];
for(let i=0;i<2;i+=1){
  const content="[challenger-fairness-preflight] Return only OK.";
  const digest=await retrieval.sha256Text(`challenger-preflight:${i}:${content}`);
  const t0=Date.now();
  const result=await preflightAdapter.generate({
    taskId:`challenger-preflight-${i+1}`,
    sessionId:"challenger-fairness-preflight-v1",
    traceId:`challenger-preflight-${i+1}`,
    runtime:{name:"measurement",version:process.env.BASELINE_SHA},
    systemPolicy:"Connectivity preflight only. Model output is never authority.",
    messages:[{role:"user",content}],
    context:{artifacts:[],contextDigest:digest},
    tools:[],
    requiredCapabilities:["text_generation"],
    maxOutputTokens:64,
    timeoutMs:20000,
    maxProviderRetries:0,
    inputDigest:digest,
  },DEEPSEEK_V3_2_MODD\_V1);
  const visible=result.ok && typeof result.text==="string" && result.text.trim().length>0;
  preflight.push({
    attempt:i+1,
    ok:visible,
    providerOk:result.ok,
    visibleTextPresent:visible,
    httpStatus:result.ok?200:(result.metadata?.httpStatus??null),
    failureClass:result.ok?null:(result.metadata?.failureClass??result.code),
    latencyMs:Date.now()-t0,
  });
}

const successes=preflight.filter(x=>x.ok).length;
const window=successes===2?"HEALTHY":successes===1?"DEGRADED":"UNUSABLE";
if(window!=="HEALTHY"){
  writeBlocked("DEEPSEEK_WINDOW_NOT_HEALTHY",{
    deepseekWindow:window,
    deepseekPreflight:preflight,
    deepseekPreflightSuccesses:successes,
  });
}

console.log("CHALLENGER_SCREEN_GATE="+JSON.stringify(s
  screenStatus:"OPEN",
  contract:expectedContract,
  contractDigest:expectedDigest,
  cognitionArtifactInterfaceFrozen:true,
  dots3SynthesisValidation:"PASS",
  dots3EnableThinking:false,
  dots3SynthesisMaxOutputTokens:1536,
  dots3EvidenceCitationRetention:"REQUIRED_EXACT",
  deepseekWindow:window,
  deepseekPreflight:preflight,
  cognitionProviderCompletionMaxTokens:2000,
  visibleArtifactMaxTokens:2000,
  challengerOutputCostPolicy:"COMPACT_INTERNAL_ARTIFACT_ONLY",
}));

const nodeOptions=[process.env.NODE_OPTIONS,`--require=${preloadPath}`].filter(Boolean).join(" ");
const child=spawnSync(process.execPath,[source],{
  stdio:"inherit",
  env:{...process.env,NODE_OPTIONS:nodeOptions},
});
process.exit(child.status??1);
