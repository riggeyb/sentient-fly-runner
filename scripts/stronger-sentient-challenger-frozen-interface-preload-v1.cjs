const fs = require("node:fs");

const freezePath = "measurement-contracts/stronger-sentient-cognition-artifact-v1.freeze.json";
const sourcePath = "scripts/stronger-sentient-cognition-challenger-screen-v1.mjs";
const expectedDigest = process.env.CONTRACT_DIGEST;

if (!fs.existsSync(freezePath)) throw new Error("cognition_artifact_freeze_missing");
const freeze = JSON.parse(fs.readFileSync(freezePath, "utf8"));
if (
  freeze.contract !== "sentient-cognition-artifact/v1" ||
  freeze.contractDigest !== expectedDigest ||
  freeze.cognitionArtifactInterfaceFrozen !== true ||
  freeze.dots3SynthesisValidation !== "PASS" ||
  freeze.dots3SynthesisPolicy?.enableThinking !== false ||
  freeze.dots3SynthesisPolicy?.maxOutputTokens !== 1536 ||
  freeze.dots3SynthesisPolicy?.evidenceCitationRetention !== "REQUIRED_EXACT" ||
  freeze.visibleArtifactEnvelope?.absoluteMax !== 2000 ||
  freeze.challengerOutputCostPolicy !== "COMPACT_INTERNAL_ARTIFACT_ONLY"
) {
  throw new Error("frozen_cognition_interface_policy_mismatch");
}

if (fs.existsSync(sourcePath)) {
  let s = fs.readFileSync(sourcePath, "utf8");

  const oldSynth = 'const content=`Synthesize a clear user-facing answer only from this cognition artifact. Return JSON only with answer, findingIndexes, evidenceIndexes, constraintIndexes, uncertaintyIndexes, toolIndexes, verificationIndexes, inventedActions. Every index array must contain all zero-based indexes from the corresponding artifact field. Do not invent actions or authority.\\nArtifact:${JSON.stringify(artifact)}`;';
  const newSynth = 'const requiredEvidence=artifact.evidenceRefs.map(id=>`[evidence: ${id}]`).join(" "); const content=`Synthesize a clear user-facing answer only from this cognition artifact. Return JSON only with answer, findingIndexes, evidenceIndexes, constraintIndexes, uncertaintyIndexes, toolIndexes, verificationIndexes, inventedActions. Every index array must contain all zero-based indexes from the corresponding artifact field. Include every required evidence citation token exactly once in answer: ${requiredEvidence}. Do not invent actions or authority.\\nArtifact:${JSON.stringify(artifact)}`;';
  if (s.includes(oldSynth)) s = s.replace(oldSynth, newSynth);
  else if (!s.includes("Include every required evidence citation token exactly once in answer")) throw new Error("challenger_synthesis_prompt_anchor_mismatch");

  const oldVerify = 'return x.answer.length>20&&all(x.findingIndexes,a.keyFindings.length)&&all(x.evidenceIndexes,a.evidenceRefs.length)&&all(x.constraintIndexes,a.constraints.length)&&all(x.uncertaintyIndexes,a.uncertainties.length)&&all(x.toolIndexes,a.toolRecommendations.length)&&all(x.verificationIndexes,a.verificationNeeded.length)&&x.inventedActions.length===0;';
  const newVerify = 'const evidenceLiteral=a.evidenceRefs.every(id=>x.answer.includes(`[evidence: ${id}]`)); return x.answer.length>20&&evidenceLiteral&&all(x.findingIndexes,a.keyFindings.length)&&all(x.evidenceIndexes,a.evidenceRefs.length)&&all(x.constraintIndexes,a.constraints.length)&&all(x.uncertaintyIndexes,a.uncertainties.length)&&all(x.toolIndexes,a.toolRecommendations.length)&&all(x.verificationIndexes,a.verificationNeeded.length)&&x.inventedActions.length===0;';
  if (s.includes(oldVerify)) s = s.replace(oldVerify, newVerify);
  else if (!s.includes("const evidenceLiteral=a.evidenceRefs.every")) throw new Error("challenger_synthesis_verifier_anchor_mismatch");

  fs.writeFileSync(sourcePath, s);
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch !== "function") throw new Error("global_fetch_unavailable");
globalThis.fetch = async (input, init = {}) => {
  let nextInit = init;
  try {
    const url = typeof input === "string" ? input : input?.url;
    if (typeof url === "string" && url.includes("api.atlascloud.ai/v1/chat/completions") && typeof init?.body === "string") {
      const body = JSON.parse(init.body);
      if (body?.model === "dots-studio/dots-3-note-prev-free") {
        body.enable_thinking = false;
        nextInit = { ...init, body: JSON.stringify(body) };
      }
    }
  } catch {
    nextInit = init;
  }
  return originalFetch(input, nextInit);
};
