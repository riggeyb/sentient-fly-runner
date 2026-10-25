const oid = String(process.env.OBJECTIVE_ID ?? "").trim();
const sid = String(process.env.SESSION_ID ?? "").trim();
const token = String(process.env.SENTIENT_API_TOKEN ?? "").trim();
if (!oid || !sid || !token) throw new Error("OPERATIONAL_INGRESS_BINDING_MISSING");

const base = "http://127.0.0.1:8080";
const auth = { authorization: "Bearer " + token };
const request = [
  "Examine the existing Sentient production repository and Fly configuration.",
  "Identify avoidable storage consumption, resource inefficiencies, and operational costs.",
  "Produce a prioritized report with concrete source references.",
  "Do not modify source, databases, infrastructure, deployment configuration, or secrets."
].join(" ");

async function getObjective() {
  return fetch(base + "/v1/objectives/" + encodeURIComponent(oid), {
    method: "GET",
    headers: auth,
    signal: AbortSignal.timeout(30000)
  });
}

let existing = await getObjective();
if (existing.status === 200) {
  console.log("OBJECTIVE_ALREADY_EXISTS=true");
} else if (existing.status === 404) {
  let response;
  try {
    response = await fetch(base + "/v1/objectives", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        objectiveId: oid,
        sessionId: sid,
        mode: "auto",
        privacy: "private",
        deployOnSuccess: false,
        request
      }),
      signal: AbortSignal.timeout(120000)
    });
  } catch (error) {
    console.log("OBJECTIVE_SUBMIT_TRANSPORT=" + (error instanceof Error ? error.name : "UNKNOWN"));
    const check = await getObjective().catch(() => undefined);
    if (!check || check.status !== 200) {
      throw new Error("OBJECTIVE_SUBMIT_OUTCOME_UNKNOWN_NO_DURABLE_RECEIPT");
    }
    console.log("OBJECTIVE_ACCEPTED_AFTER_TRANSPORT_AMBIGUITY=true");
  }
  if (response) {
    const raw = await response.text();
    let receipt = {};
    try { receipt = raw ? JSON.parse(raw) : {}; } catch {}
    console.log("OBJECTIVE_SUBMIT_STATUS=" + response.status);
    if (response.status !== 202 || receipt.objectiveId !== oid) {
      throw new Error("OBJECTIVE_NOT_ACCEPTED:" + response.status);
    }
    console.log("OBJECTIVE_ACCEPTED=true");
  }
} else {
  throw new Error("OBJECTIVE_PRECHECK_UNEXPECTED_STATUS:" + existing.status);
}

const stateResponse = await getObjective();
if (stateResponse.status !== 200) {
  throw new Error("OBJECTIVE_NOT_PERSISTED:" + stateResponse.status);
}
const state = await stateResponse.json();
if (state.objectiveId !== oid) throw new Error("OBJECTIVE_ID_MISMATCH");

const view = {
  objectiveId: state.objectiveId,
  status: state.status,
  activeEngineeringJobId: state.activeEngineeringJobId ?? null,
  lastEngineeringReceipt: state.lastEngineeringReceipt ?? null,
  updatedAt: state.updatedAt ?? null,
  error: state.error ?? null,
  result: state.result ?? null
};
console.log("OBJECTIVE_PERSISTED=true");
console.log("OBJECTIVE_STATE=" + JSON.stringify(view));
console.log("DEPLOY_ON_SUCCESS=false");
console.log("UNAUTHORIZED_MUTATIONS_REQUESTED=false");
console.log("ACTIONS_CONTINUATION_ROLE=NONE");
console.log("SECRET_VALUES_EXPOSED=false");
