const fs = require("fs");
const crypto = require("crypto");

const parts = [
  "scripts/local-hf-crash-isolation-edit.part-00",
  "scripts/local-hf-crash-isolation-edit.part-01",
];
const editCode = parts.map(p => fs.readFileSync(p, "utf8")).join("");
if (Buffer.byteLength(editCode, "utf8") !== 7322) throw new Error("EDIT_SIZE_MISMATCH");
const editDigest = crypto.createHash("sha256").update(editCode, "utf8").digest("hex");
if (editDigest !== "d381018d2ca7af82b12e8c3b0eef459a88900c205f17846ea516ae58e97f80bc") throw new Error("EDIT_DIGEST_MISMATCH");

const request = {
  repo: "riggeyb/sentient",
  branch: "sentient-production-composition-20261017",
  expectedHead: "7d54e0f5b77b65bc4984cd5a667084e12eb738c1",
  expectedTree: "3f1929fead05d17b182bea29c168faeafbcc1a98",
  objectiveId: "SENTIENT_ROUTINE_LOCAL_HF_CRASH_ISOLATION_20261025",
  actionId: "local-hf-native-child-process-isolation-v1",
  authorizedPaths: [
    "src/model/providers/huggingface.ts",
    "src/model/providers/huggingface-worker.ts",
    "test/local-hf-worker-isolation.test.ts",
  ],
  authorizationIdentity: "user:SENTIENT_ROUTINE_OPERATIONAL_DEVELOPMENT_V1",
  authorizationReason: "Repeated live Napi::Error SIGABRT crashes terminate the authoritative Sentient host while local Hugging Face ONNX inference runs inside worker_threads. Isolate the same local-zero-cost inference protocol in an OS child process so native aborts are contained and retried without changing model, authority, resources, or paid-compute policy.",
  policyVersion: "sentient-capability-tier/v1",
  objective: "ROUTINE_LOCAL_HF_NATIVE_CRASH_ISOLATION_V1: Replace the production local Hugging Face worker_threads boundary with an OS child-process boundary while preserving the LocalHfWorkerPortV1 request/response contract, current SmolLM2 model/revision/q4 CPU configuration, one-retry behavior, abort semantics, model non-authority, and zero-paid-compute policy. Sanitize the child environment to a narrow runtime/network allowlist so HF write secrets and unrelated credentials are not inherited. Add a real child-process regression where the first child process.abort()s during generation and the authoritative parent survives, recreates a child, and succeeds. No deployment, resource change, policy/authority mutation, model change, paid compute, certification change, or historical-state cleanup.",
  commands: [
    { name: "install-js-no-native-scripts", category: "shell", command: "npm", args: ["ci", "--ignore-scripts"], timeoutMs: 300000 },
    { name: "preflight-build", category: "build", command: "npm", args: ["run", "build"], timeoutMs: 120000 },
    { name: "preflight-local-hf-tests", category: "test", command: "node", args: ["--test", "dist/test/local-hf-worker-isolation.test.js", "dist/test/phase3-local-hf-adapter.test.js", "dist/test/production-phase3-cognition.test.js"], timeoutMs: 180000 },
    { name: "implement-child-process-isolation", category: "edit", command: "node", args: ["--input-type=module", "-e", editCode], timeoutMs: 30000 },
    { name: "build-after-change", category: "build", command: "npm", args: ["run", "build"], timeoutMs: 120000 },
    { name: "local-hf-crash-isolation-tests", category: "test", command: "node", args: ["--test", "dist/test/local-hf-worker-isolation.test.js", "dist/test/phase3-local-hf-adapter.test.js", "dist/test/production-phase3-cognition.test.js", "dist/test/dots3-presentation-only-local-hf.test.js"], timeoutMs: 240000 },
    { name: "diff-check", category: "test", command: "git", args: ["diff", "--check"], timeoutMs: 30000 },
  ],
  commitMessage: "fix: isolate local HF native runtime in child process",
  timeoutMs: 1200000,
};
process.stdout.write(JSON.stringify(request));
