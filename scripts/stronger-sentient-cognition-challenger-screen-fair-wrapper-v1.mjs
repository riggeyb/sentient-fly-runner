import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  AtlasCloudAdapter,
  DEEPSEEK_V3_2_MODEL_V1,
  retrieval,
} from "../sentient/dist/src/index.js";

const source="scripts/stronger-sentient-cognition-challenger-screen-v1.mjs";
const target="scripts/stronger-sentient-cognition-challenger-screen-fair-tmp.mjs";
const freezePath="measurement-contracts/stronger-sentient-cognition-artifact-v1.freeze.json";
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
    sourceChange:false,
    productionDeployment:false,
    ...extra,
  };
  fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
  console.log("CHALLENGER_SCREEN_GATE="+JSON.stringify(report));
  process.exit(0);
}

if(!fs.existsSync(freezePath)) writeBlocked("COGNITION_ARTIFACT_INTERFACE_NOT_FROZEN");
const freeze=JSON.parse(fs.readFileSync(freezePath,"utf8"));
if(freeze.contract!==expectedContract || freeze.contractDigest!==expectedDigest ||
   freeze.cognitionArtifactInterfaceFrozen!==true || freeze.dots3SynthesisValidation!=="PASS"){
  writeBlocked("COGNITION_ARTIFACT_INTERFACE_NOT_FROZEN",{freezeObserved:{
    contract:freeze.contract??null,
    contractDigest:freeze.contractDigest??null,
    cognitionArtifactInterfaceFrozen:freeze.cognitionArtifactInterfaceFrozen??null,
    dots3SynthesisValidation:freeze.dots3SynthesisValidation??null,
  }});
}

const caps={text_generation:true,structured_output:false,tool_use:false,tool_continuation:false,reasoning_effort:false,image_input:false,server_side_tools:false};
const preflightAdapter=new AtlasCloudAdapter({
  apiKey:key,
  maxProviderRetries:0,
  modelProfiles:[{model:DEEPSEEK_V3_2_MODEL_V1,capabilities:caps,profileId:"challenger-fairness-preflight-v1"}],
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
    maxOutputTokens:16,
    timeoutMs:20000,
    maxProviderRetries:0,
    inputDigest:digest,
  },DEEPSEEK_V3_2_MODEL_V1);
  preflight.push({
    attempt:i+1,
    ok:result.ok,
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
    stopScreen:true,
    kimiK26Calls:0,
    qwen38MaxCalls:0,
    kimiK31ProCalls:0,
  });
}

let s=fs.readFileSync(source,"utf8");
if((s.match(/maxOutputTokens:2000/g)??[]).length!==1) throw new Error("unexpected_cognition_cap_marker");
if(s.includes("maxOutputTokens:4096")) throw new Error("economic_guard_regression_4096");
const oldOut='const out=c.result.ok?c.result.usage.outputTokens:null, reason=c.result.ok?(c.result.usage.reasoningTokens??null):null;';
const newOut='const out=c.result.ok?c.result.usage.outputTokens:null, reason=c.result.ok?(c.result.usage.reasoningTokens??null):null, visible=c.result.ok?Math.ceil(Buffer.byteLength(String(c.result.text??""),"utf8")/4):null;';
if((s.split(oldOut).length-1)!==1) throw new Error("unexpected_output_accounting_marker");
s=s.replace(oldOut,newOut);
const oldVisible='visibleArtifactTokens:c.result.ok?(reason==null?out:Math.max(0,out-reason)):null';
if((s.split(oldVisible).length-1)!==1) throw new Error("unexpected_visible_accounting_marker");
s=s.replace(oldVisible,'visibleArtifactTokens:visible');
fs.writeFileSync(target,s);

console.log("CHALLENGER_SCREEN_GATE="+JSON.stringify({
  screenStatus:"OPEN",
  contract:expectedContract,
  contractDigest:expectedDigest,
  cognitionArtifactInterfaceFrozen:true,
  dots3SynthesisValidation:"PASS",
  deepseekWindow:window,
  deepseekPreflight:preflight,
  cognitionProviderCompletionMaxTokens:2000,
  visibleArtifactMaxTokens:2000,
  challengerOutputCostPolicy:"COMPACT_INTERNAL_ARTIFACT_ONLY",
}));

const result=spawnSync(process.execPath,[target],{stdio:"inherit",env:process.env});
process.exit(result.status??1);
