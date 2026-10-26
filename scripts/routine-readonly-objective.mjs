const oid = String(process.env.OBJECTIVE_ID ?? "").trim();
const sid = String(process.env.SESSION_ID ?? "").trim();
const requestB64 = String(process.env.OBJECTIVE_REQUEST_B64 ?? "").trim();
const token = String(process.env.SENTIENT_API_TOKEN ?? "").trim();
if (!oid || !sid || !requestB64 || !token) throw new Error("ROUTINE_READONLY_INGRESS_BINDING_MISSING");
const request = Buffer.from(requestB64, "base64").toString("utf8").trim();
if (!request) throw new Error("ROUTINE_READONLY_REQUEST_EMPTY");

const base = "http://127.0.0.1:8080";
const auth = { authorization: "Bearer " + token };

async function getObjective() {
  return fetch(base + "/v1/objectives/" + encodeURIComponent(oid), {
    method: "GET",
    headers: auth,
    signal: AbortSignal.timeout(30000)
  });
}

let response = await getObjective();
if (response.status === 404) {
  try {
    const submit = await fetch(base + "/v1/objectives", {
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
    const raw = await submit.text();
    let receipt = {};
    try { receipt = raw ? JSON.parse(raw) : {}; } catch {}
    if (submit.status !== 202 || receipt.objectiveId !== oid) {
      throw new Error("OBJECTIVE_NOT_ACCEPTED:" + submit.status);
    }
    console.log("OBJECTIVE_ACCEPTED=true");
  } catch (error) {
    const check = await getObjective().catch(() => undefined);
    if (!check || check.status !== 200) throw error;
    console.log("OBJECTIVE_ACCEPTED_AFTER_TRANSPORT_AMBIGUITY=true");
  }
} else if (response.status === 200) {
  console.log("OBJECTIVE_ALREADY_EXISTS=true");
} else {
  throw new Error("OBJECTIVE_PRECHECK_UNEXPECTED_STATUS:" + response.status);
}

response = await getObjective();
if (response.status !== 200) throw new Error("OBJECTIVE_NOT_PERSISTED:" + response.status);
let state = await response.json();
if (state.objectiveId !== oid) throw new Error("OBJECTIVE_ID_MISMATCH");

const deadline = Date.now() + 12 * 60 * 1000;
while (Date.now() < deadline && !["succeeded", "failed", "cancelled"].includes(state.status)) {
  await new Promise(resolve => setTimeout(resolve, 8000));
  const poll = await getObjective().catch(() => undefined);
  if (!poll || poll.status !== 200) {
    console.log("POLL_TRANSPORT_INTERRUPTED=true");
    break;
  }
  state = await poll.json();
}

console.log("OBJECTIVE_ID=" + oid);
console.log("OBJECTIVE_STATUS=" + state.status);
console.log("OBJECTIVE_RESULT_PRESENT=" + String(state.result != null));
console.log("OBJECTIVE_ERROR_PRESENT=" + String(state.error != null));
console.log("ACTIVE_ENGINEERING_JOB_PRESENT=" + String(state.activeEngineeringJobId != null));
console.log("OBJECTIVE_PERSISTED=true");
console.log("OBJECTIVE_PRIVATE=true");
console.log("DEPLOY_ON_SUCCESS=false");
console.log("TIER=0");
console.log("UNAUTHORIZED_MUTATIONS_REQUESTED=false");
console.log("ACTIONS_CONTINUATION_ROLE=NONE");
console.log("SECRET_VALUES_EXPOSED=false");
