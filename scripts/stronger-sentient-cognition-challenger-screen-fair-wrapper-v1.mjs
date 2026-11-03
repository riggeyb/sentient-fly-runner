import fs from "node:fs";
import { DEEPSEEK_V3_2_MODEL_V1 as D } from "../sentient/dist/src/index.js";

const SCREEN="scripts/stronger-sentient-cognition-challenger-screen-v1.mjs";
const FREEZE="measurement-contracts/stronger-sentient-cognition-artifact-v1.freeze.json";
const OUT=process.env.EXPERIMENT_OUT;
const DIGEST=process.env.CONTRACT_DIGEST;

if(!OUT) throw new Error("experiment_out_missing");
if(D!=="deepseek-ai/deepseek-v3.2") throw new Error("deepseek_model_constant_mismatch");
if(!fs.existsSync(FREEZE)||!fs.existsSync(SCREEN)) throw new Error("measurement_integrity_input_missing");

const f=JSON.parse(fs.readFileSync(FREEZE,"utf8"));
const e=f.visibleArtifactEnvelope??{};
const s=fs.readFileSync(SCREEN,"utf8");

const freezeValid=
  f.contract==="sentient-cognition-artifact/v1" &&
  f.contractDigest===DIGEST &&
  f.baselineSha===process.env.BASELINE_SHA &&
  f.baselineTree===process.env.BASELINE_TREE &&
  f.cognitionArtifactInterfaceFrozen===true &&
  f.dots3SynthesisValidation==="PASS" &&
  f.dots3SynthesisPolicy?.enableThinking===false &&
  f.challengerOutputCostPolicy==="COMPACT_INTERNAL_ARTIFACT_ONLY" &&
  JSON.stringify(e.low)==="[500,750]" &&
  JSON.stringify(e.standard)==="[750,1200]" &&
  JSON.stringify(e.high)==="[1200,2000]" &&
  e.absoluteMax===2000 &&
  e.doNotPad===true &&
  e.doNotOverCompress===true;

const requiredMarkers=[
  'const taskIds=["cog-v1-02","cog-v1-08","cog-v1-06"]',
  '["DeepSeek V3.2","deepseek-ai/deepseek-v3.2"]',
  '["Kimi K2.6","moonshotai/kimi-k2.6"]',
  '["Qwen 3.8 Max","qwen/qwen3.8-max"]',
  '["Kimi K3.1 Pro","moonshotai/kimi-k3.1-pro"]',
  'const INITIAL=2000, ESCALATE_TO=4000, VISIBLE_ARTIFACT_MAX=2000',
  'const MAX_INITIAL_ARMS=12, MAX_PROVIDER_CALLS=24',
  'result.finishReason==="length"',
  'structurallyRelevant',
  'sameForEveryModel:true',
  'measurementIntegrityRequired:true',
  'incumbentCognitionSuccessRequired:false',
  'dots3Called:false',
  'dots3Thinking:false',
  'dots3MandatoryForMachineExecution:false',
];
const screenValid=requiredMarkers.every(m=>s.includes(m)) && !s.includes("dots-studio/");
if(!freezeValid||!screenValid) throw new Error("measurement_integrity_static_validation_failed");

const report={
  schemaVersion:"stronger-sentient-challenger-measurement-integrity/v1",
  fairnessGateStaticValidation:"PASS",
  measurementIntegrityRequired:true,
  incumbentCognitionSuccessRequired:false,
  providerCalls:0,
  challengerCalls:0,
  freezeReceiptVerified:true,
  deepseekModelConstant:D,
  models:4,
  tasks:3,
  maximumInitialTaskArms:12,
  cognitionInitialProviderCompletionTokens:2000,
  cognitionAdaptiveProviderCompletionMaxTokens:4000,
  cognition2000IsInitialScreenEnvelope:true,
  cognition2000IsGlobalIntelligenceLimit:false,
  visibleArtifactMaxTokens:2000,
  dots3SynthesisValidation:"PASS_5_OF_5",
  dots3Thinking:false,
  dots3Role:"OPTIONAL_SYNTHESIS_PRESENTATION",
  dots3MandatoryForMachineExecution:false,
  completionPolicy:"INITIAL_2000_ESCALATE_TO_4000_ONLY_ON_LENGTH_AND_INCOMPLETE_AND_STRUCTURALLY_RELEVANT",
  priorChallengerDataClass:"EXPLORATORY_PRE_FAIRNESS_SCREEN_DATA_NOT_PROMOTION_EVIDENCE",
  sourceChange:false,
  productionDeployment:false,
};
fs.writeFileSync(OUT,JSON.stringify(report,null,2)+"\n");
console.log("MEASUREMENT_INTEGRITY_GATE="+JSON.stringify(report));
