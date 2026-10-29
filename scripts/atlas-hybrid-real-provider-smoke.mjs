const key = String(process.env.ATLASCLOUD_API_KEY ?? "").trim();
if (!key) throw new Error("ATLASCLOUD_API_KEY secret is unavailable");

const { AtlasCloudClientV1, resolveAtlasDots3NoteModelV1 } =
  await import("../sentient/dist/src/model/providers/atlascloud-client.js");

const client = new AtlasCloudClientV1({ apiKey: key });

let dotsModel;
try {
  dotsModel = await resolveAtlasDots3NoteModelV1(client);
  console.log("ATLAS_AUTH=PASS");
  console.log("DOTS3_MODEL_RESOLUTION=PASS");
  console.log(`DOTS3_MODEL=${dotsModel}`);
} catch (error) {
  console.log("ATLAS_AUTH=FAIL");
  console.log("DOTS3_MODEL_RESOLUTION=FAIL");
  console.log(`DOTS3_MODEL_RESOLUTION_ERROR=${safeError(error)}`);
  console.log("ATLASCLOUD_SECRET_EXPOSED=false");
  process.exit(2);
}

async function smoke(label, model, stage, maxOutputTokens) {
  try {
    const result = await client.complete({
      model,
      stage,
      attemptNumber: 1,
      systemPrompt:
        "Connectivity test only. Return one tiny JSON object. Do not call tools or take actions.",
      userPrompt: 'Return exactly {"status":"ok"}.',
      maxOutputTokens,
      timeoutMs: 15_000,
      requireJson: true,
    });

    if (!result.ok) {
      console.log(`${label}_CONNECTIVITY=FAIL`);
      console.log(`${label}_FAILURE_REASON=${result.failureKind}`);
      console.log(`${label}_LATENCY_MS=${result.latencyMs}`);
      return false;
    }

    const structured = result.structured;
    const valid = Boolean(
      structured &&
      typeof structured === "object" &&
      !Array.isArray(structured) &&
      structured.status === "ok",
    );
    const usage = result.usage;
    const usageCaptured =
      typeof usage.inputTokens === "number" &&
      typeof usage.outputTokens === "number" &&
      typeof usage.totalTokens === "number";
    const cost = result.telemetry.reportedCostUsd;

    console.log(`${label}_CONNECTIVITY=PASS`);
    console.log(`${label}_RESPONSE_VALID=${valid ? "PASS" : "FAIL"}`);
    console.log(`${label}_USAGE_CAPTURED=${usageCaptured ? "PASS" : "FAIL"}`);
    console.log(`${label}_INPUT_TOKENS=${usage.inputTokens}`);
    console.log(`${label}_CACHED_INPUT_TOKENS=${usage.cachedInputTokens ?? "NOT_REPORTED"}`);
    console.log(`${label}_OUTPUT_TOKENS=${usage.outputTokens}`);
    console.log(`${label}_REASONING_TOKENS=${usage.reasoningTokens ?? "NOT_REPORTED"}`);
    console.log(`${label}_TOTAL_TOKENS=${usage.totalTokens}`);
    console.log(`${label}_FINISH_REASON=${result.finishReason}`);
    console.log(`${label}_PROVIDER_REQUEST_ID=${result.providerRequestId ?? "NOT_REPORTED"}`);
    console.log(`${label}_REPORTED_COST_USD=${cost ?? "NOT_REPORTED"}`);
    console.log(`${label}_LATENCY_MS=${result.latencyMs}`);
    return valid && usageCaptured;
  } catch (error) {
    console.log(`${label}_CONNECTIVITY=FAIL`);
    console.log(`${label}_UNEXPECTED_ERROR=${safeError(error)}`);
    return false;
  }
}

function safeError(error) {
  const message = error instanceof Error ? error.message : "unknown_error";
  return String(message).replace(/[\r\n]/g, " ").slice(0, 240);
}

let failed = false;
const deepSeekOk = await smoke(
  "DEEPSEEK_V3_2",
  "deepseek-ai/deepseek-v3.2",
  "cognition",
  1_024,
);
if (!deepSeekOk) failed = true;

const dots3Ok = await smoke("DOTS3", dotsModel, "synthesis", 256);
if (!dots3Ok) failed = true;

console.log("ATLASCLOUD_SECRET_EXPOSED=false");
if (failed) {
  console.log("REAL_ATLAS_SMOKE=FAIL");
  process.exit(3);
}
console.log("REAL_ATLAS_SMOKE=PASS");
