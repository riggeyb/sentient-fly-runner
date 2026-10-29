const key = String(process.env.ATLASCLOUD_API_KEY ?? "").trim();
if (!key) throw new Error("atlas_secret_missing");

const response = await fetch("https://api.atlascloud.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    model: "deepseek-ai/deepseek-v3.2",
    messages: [
      { role: "system", content: "Connectivity probe only. Return a tiny final answer. Do not call tools or take actions." },
      { role: "user", content: "Reply with OK." },
    ],
    max_tokens: 2048,
    stream: false,
    reasoning_effort: "low",
    thinking: { type: "enabled" },
  }),
  signal: AbortSignal.timeout(20_000),
});

console.log(`HTTP_STATUS=${response.status}`);
if (!response.ok) {
  console.log("DEEPSEEK_SAFE_PROBE=FAIL_HTTP");
  process.exit(2);
}
const root = await response.json();
const choice = Array.isArray(root?.choices) ? root.choices[0] : null;
const message = choice && typeof choice === "object" ? choice.message : null;
const content = typeof message?.content === "string" ? message.content : "";
const reasoning = typeof message?.reasoning_content === "string" ? message.reasoning_content : "";
const usage = root?.usage && typeof root.usage === "object" ? root.usage : {};
const details = usage?.completion_tokens_details && typeof usage.completion_tokens_details === "object"
  ? usage.completion_tokens_details
  : {};
console.log(`FINISH_REASON=${typeof choice?.finish_reason === "string" ? choice.finish_reason : "NOT_REPORTED"}`);
console.log(`CONTENT_CHARS=${content.length}`);
console.log(`REASONING_CHARS=${reasoning.length}`);
console.log(`INPUT_TOKENS=${usage.prompt_tokens ?? usage.input_tokens ?? "NOT_REPORTED"}`);
console.log(`OUTPUT_TOKENS=${usage.completion_tokens ?? usage.output_tokens ?? "NOT_REPORTED"}`);
console.log(`REASONING_TOKENS=${details.reasoning_tokens ?? usage.reasoning_tokens ?? "NOT_REPORTED"}`);
console.log(`TOTAL_TOKENS=${usage.total_tokens ?? "NOT_REPORTED"}`);
console.log(`REPORTED_COST_USD=${usage.cost ?? usage.cost_usd ?? root.cost ?? "NOT_REPORTED"}`);
console.log(`PROVIDER_REQUEST_ID_PRESENT=${Boolean(response.headers.get("x-request-id") || response.headers.get("request-id") || root?.id)}`);
console.log("ATLASCLOUD_SECRET_EXPOSED=false");
console.log(`DEEPSEEK_SAFE_PROBE=${content.trim().length > 0 ? "PASS" : "FAIL_EMPTY_CONTENT"}`);
if (!content.trim()) process.exit(1);
