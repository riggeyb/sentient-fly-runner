import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DEEPSEEK_V3_2_MODEL_V1 as D } from "../sentient/dist/src/index.js";

const S="scripts/stronger-sentient-cognition-challenger-screen-v1.mjs";
const F="measurement-contracts/stronger-sentient-cognition-artifact-v1.freeze.json";
const P=path.resolve("scripts/stronger-sentient-challenger-frozen-interface-preload-v1.cjs");
const O=process.env.EXPERIMENT_OUT;
const K=String(process.env.ATLASCLOUD_API_KEY??"").trim();
const G=process.env.CONTRACT_DIGEST;
const STATIC=process.env.STATIC_VALIDATE==="true";
if(!O||!K) throw new Error("runner_env_missing");
if(D!=="deepseek-ai/deepseek-v3.2") throw new Error("deepseek_model_constant_mismatch");
if(!fs.existsSync(F)||!fs.existsSync(P)||!fs.existsSync(S)) throw new Error("runner_input_missing");

const f=JSON.parse(fs.readFileSync(F,"utf8")),e=f.visibleArtifactEnvelope??{},pre=fs.readFileSync(P,"utf8");
const frozen=
  f.contract==="sentient-cognition-artifact/v1" &&
  f.contractDigest===G &&
  f.baselineSha===process.env.BASELINE_SHA &&
  f.baselineTree===process.env.BASELINE_TREE &&
  f.cognitionArtifactInterfaceFrozen===true &&
  f.dots3SynthesisValidation==="PASS" &&
  f.challengerOutputCostPolicy==="COMPACT_INTERNAL_ARTIFACT_ONLY" &&
  f.dots3SynthesisPolicy?.enableThinking===false &&
  e.absoluteMax===2000 && e.doNotPad===true && e.doNotOverCompress===true;
const policy=
  pre.includes("COMMON_ADAPTIVE_COGNITION_POLICY_V1") &&
  pre.includes("ladder=[2000,4000]") &&
  pre.includes('SCREEN_MODE==="deepseek_readiness"') &&
  pre.includes('result.finishReason==="length"') &&
  pre.includes("validOngoingCognition");
if(!frozen||!policy) throw new Error("frozen_or_adaptive_policy_invalid");

const write=r=>fs.writeFileSync(O,JSON.stringify(r,null,2)+"\n");
if(STATIC){
  const r={
    schemaVersion:"stronger-sentient-challenger-static/v4",
    fairnessGateStaticValidation:"PASS",
    providerCalls:0,
    deepseekModel:D,
    freezeReceiptVerified:true,
    dots3SynthesisValidation:"PASS",
    dots3EnableThinking:false,
    cognitionInitialProviderCompletionTokens:2000,
    cognitionAdaptiveProviderCompletionMaxTokens:4000,
    cognition2000IsInitialScreenEnvelope:true,
    cognition2000IsGlobalIntelligenceLimit:false,
    visibleArtifactMaxTokens:2000,
    correctedHealthPredicate:"COMPLETE_USABLE_SENTIENT_COGNITION_ARTIFACT_UNDER_COMMON_ADAPTIVE_COMPLETION_POLICY",
    challengerCalls:0,
    sourceChange:false,
    productionDeployment:false,
  };
  write(r);
  console.log("FAIRNESS_GATE_STATIC_VALIDATION="+JSON.stringify(r));
  process.exit(0);
}

const opts=[process.env.NODE_OPTIONS,`--require=${P}`].filter(Boolean).join(" ");
const R=path.join(os.tmpdir(),"deepseek-readiness-v1.json");
const a=spawnSync(process.execPath,[S],{
  stdio:"inherit",
  env:{...process.env,NODE_OPTIONS:opts,SCREEN_MODE:"deepseek_readiness",EXPERIMENT_OUT:R},
});
if(a.status!==0||!fs.existsSync(R)) throw new Error("deepseek_readiness_child_failed");
const rr=JSON.parse(fs.readFileSync(R,"utf8"));
const ready=
  rr.schemaVersion==="stronger-sentient-deepseek-cognition-readiness/v1" &&
  rr.model===D &&
  rr.contract==="sentient-cognition-artifact/v1" &&
  rr.contractDigest===G &&
  rr.providerCompletionPolicy?.initial===2000 &&
  rr.providerCompletionPolicy?.nextBoundedEnvelope===4000 &&
  rr.providerCompletionPolicy?.sameForEveryModel===true &&
  rr.visibleArtifactMaxTokens===2000 &&
  rr.cognitionReadiness==="READY" &&
  rr.completeUsableArtifact===true;

const gate={
  schemaVersion:"stronger-sentient-challenger-readiness-gate/v4",
  fairnessGateStaticValidation:"PASS",
  deepseekTransportHealth:rr.transportHealth??"UNKNOWN",
  deepseekCognitionReadiness:rr.cognitionReadiness??"NOT_READY",
  deepseekReadiness:rr,
  readinessProviderCalls:rr.providerCalls??0,
  readyForFairChallengerScreen:ready,
  screenOpened:false,
  stopScreen:!ready,
  kimiK26Calls:0,
  qwen38MaxCalls:0,
  kimiK31ProCalls:0,
  modelRanking:"NOT_PERMITTED",
  sourceChange:false,
  productionDeployment:false,
};
write(gate);
console.log("CHALLENGER_READINESS_GATE="+JSON.stringify(gate));
