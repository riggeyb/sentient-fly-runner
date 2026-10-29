const key = String(process.env.ATLASCLOUD_API_KEY ?? "").trim();
if (!key) throw new Error("ATLASCLOUD_API_KEY secret is unavailable");

const clientModule = await import("../sentient/dist/src/model/providers/atlas-cloud-client.js");
const AtlasCloudClientV1 = clientModule.AtlasCloudClientV1;

const modelResponse = await fetch("https://api.atlascloud.ai/v1/models", {
  headers: new Headers([
    ["Authorization", `Bearer ${key}`],
    ["Accept", "application/json"],
  ]),
  signal: AbortSignal.timeout(10_000),
});
if (!modelResponse.ok) {
  console.log(`ATLAS_AUTH=FAIL_HTTP_${modelResponse.status}`);
  process.exit(2);
}
console.log("ATLAS_AUTH=PASS");

const payload = await modelResponse.json();
const rows = Array.isArray(payload?.data)
  ? payload.data
  : Array.isArray(payload?.models)
    ? payload.models
    : Array.isArray(payload)
      ? payload
      : [];

const candidates = rows
  .filter(row => row && typeof row === "object" && !Array.isArray(row))
  .map(row => {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const searchable = [
      row.id,
      row.name,
      row.display_name,
      row.displayName,
      row.model,
      row.description,
      row.slug,
    ].filter(value => typeof value === "string").join(" ").toLowerCase();
    let score = 0;
    if (
      searchable.includes("dots3-note")
      || searchable.includes("dots3_note")
      || searchable.includes("dots3/note")
    ) score += 120;
    if (searchable.includes("dots 3 note")) score += 110;
    if (searchable.includes("dots3") && searchable.includes("note")) score += 100;
    if (
      searchable.includes("dots")
      && searchable.includes("3")
      && searchable.includes("note")
    ) score += 80;
    return { id, score };
  })
  .filter(row => row.id && row.score > 0)
  .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

if (candidates.length === 0) {
  throw new Error("Atlas model catalog contained no Dots3-Note candidate");
}
const bestScore = candidates[0].score;
const topIds = [
  ...new Set(
    candidates
      .filter(row => row.score === bestScore)
      .map(row => row.id),
  ),
];
if (topIds.length !== 1) {
  console.log(`DOTS3_MODEL_CANDIDATE_COUNT=${topIds.length}`);
  for (const id of topIds) console.log(`DOTS3_MODEL_CANDIDATE=${id}`);
  throw new Error("Atlas Dots3-Note resolution ambiguous");
}
const dotsModel = topIds[0];
console.log("DOTS3_MODEL_RESOLUTION=PASS");
console.log(`DOTS3_MODEL=${dotsModel}`);

const clientOptions = Object.create(null);
clientOptions.apiKey = key;
const client = new AtlasCloudClientV1(clientOptions);

async function smoke(label, model, maxOutputTokens) {
  const result = await client.complete({
    model,
    systemPrompt:
      "Connectivity test only. Return one tiny JSON object. Do not call tools or take actions.",
    userPrompt: 'Return exactly {"status":"ok"}.',
    maxOutputTokens,
    timeoutMs: 15_000,
    requireJsonObject: true,
    requiredTextValidator: text => /"status"\s*:\s*"ok"/i.test(text),
  });

  if (!result.ok) {
    console.log(`${label}_CONNECTIVITY=FAIL`);
    console.log(`${label}_FAILURE_REASON=${result.reason}`);
    return false;
  }

  const structured = result.structuredOutput;
  if (
    !structured
    || typeof structured !== "object"
    || Array.isArray(structured)
    || structured.status !== "ok"
  ) {
    console.log(`${label}_CONNECTIVITY=PASS`);
    console.log(`${label}_RESPONSE_VALID=FAIL`);
    return false;
  }

  const usage = result.usage;
  const usageCaptured =
    typeof usage.inputTokens === "number"
    && typeof usage.outputTokens === "number"
    && typeof usage.totalTokens === "number";

  console.log(`${label}_CONNECTIVITY=PASS`);
  console.log(`${label}_RESPONSE_VALID=PASS`);
  console.log(`${label}_USAGE_CAPTURED=${usageCaptured ? "PASS" : "FAIL"}`);
  console.log(`${label}_INPUT_TOKENS=${usage.inputTokens ?? "NOT_REPORTED"}`);
  console.log(
    `${label}_CACHED_INPUT_TOKENS=${usage.cachedInputTokens ?? "NOT_REPORTED"}`,
  );
  console.log(`${label}_OUTPUT_TOKENS=${usage.outputTokens ?? "NOT_REPORTED"}`);
  console.log(
    `${label}_REASONING_TOKENS=${usage.reasoningTokens ?? "NOT_REPORTED"}`,
  );
  console.log(`${label}_TOTAL_TOKENS=${usage.totalTokens ?? "NOT_REPORTED"}`);
  console.log(`${label}_FINISH_REASON=${result.finishReason ?? "NOT_REPORTED"}`);
  console.log(
    `${label}_PROVIDER_REQUEST_ID=${result.providerRequestId ?? "NOT_REPORTED"}`,
  );
  console.log(
    `${label}_REPORTED_COST_USD=${result.reportedCostUsd ?? "NOT_REPORTED"}`,
  );
  console.log(`${label}_LATENCY_MS=${result.latencyMs}`);

  return usageCaptured;
}

let failed = false;
if (!await smoke("DEEPSEEK_V3_2", "deepseek-ai/deepseek-v3.2", 1_024)) failed = true;
if (!await smoke("DOTS3", dotsModel, 128)) failed = true;

console.log("ATLASCLOUD_SECRET_EXPOSED=false");
if (failed) {
  console.log("REAL_ATLAS_SMOKE=FAIL");
  process.exit(3);
}
console.log("REAL_ATLAS_SMOKE=PASS");
