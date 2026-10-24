import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const selfExecution = await import(pathToFileURL(path.join(root, "dist/src/fly/self-execution.js")).href);
const stateTypes = await import(pathToFileURL(path.join(root, "dist/src/state/types.js")).href);
const {
  EngineeringObjectiveRegistryV1,
  FLY_OBJECTIVE_RUNNER_CONTRACT,
  FlyObjectiveRunnerV1,
} = selfExecution;
const { STATE_SCHEMA_VERSION } = stateTypes;

function managedTask(id) {
  const now = "2026-10-24T12:00:00.000Z";
  return {
    kind: "task",
    id,
    title: id,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    provenance: { actor: "user" },
    version: {
      schemaVersion: STATE_SCHEMA_VERSION,
      applicationVersion: FLY_OBJECTIVE_RUNNER_CONTRACT,
      repository: "riggeyb/sentient",
      commitSha: "a".repeat(40),
    },
    metadata: {
      contract: FLY_OBJECTIVE_RUNNER_CONTRACT,
      request: `run ${id}`,
      sessionId: `session-${id}`,
      mode: "collaborative",
      privacy: "public_fixture",
      engineeringJob: null,
      deployOnSuccess: false,
      activeEngineeringJobId: null,
      lastEngineeringReceipt: null,
      result: null,
      error: null,
    },
  };
}

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("fixture_wait_timeout");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const rows = new Map([
  ["old-1", managedTask("old-1")],
  ["old-2", managedTask("old-2")],
]);
let getCalls = 0;
const state = {
  async list(kind) {
    assert.equal(kind, "task");
    return [...rows.values()];
  },
  async get(kind, id) {
    assert.equal(kind, "task");
    getCalls += 1;
    return rows.get(id);
  },
  async insert(task) {
    assert.equal(rows.has(task.id), false);
    rows.set(task.id, task);
    return task;
  },
  async replace(task) {
    rows.set(task.id, task);
    return task;
  },
};

const started = [];
let releaseOldOne;
const oldOneGate = new Promise((resolve) => { releaseOldOne = resolve; });
const application = {
  async runObjective(input) {
    started.push(input.objectiveId);
    if (input.objectiveId === "old-1") await oldOneGate;
    return { httpStatus: 200, body: { result: { status: "COMPLETED" } } };
  },
};
const registry = { register() {}, unregister() {} };
const identity = { source: { repository: "riggeyb/sentient", sha: "a".repeat(40) } };

const runner = new FlyObjectiveRunnerV1({ state, application, registry, identity });
assert.equal(await runner.resumeUnfinished(), 2);
await waitFor(() => started.includes("old-1"));
assert.deepEqual(started, ["old-1"]);

const beforeFresh = getCalls;
const receipt = await runner.enqueue({
  request: "run fresh",
  objectiveId: "fresh",
  sessionId: "session-fresh",
  mode: "collaborative",
  privacy: "public_fixture",
});
assert.equal(receipt.objectiveId, "fresh");
assert.equal(receipt.status, "pending");
assert.equal(getCalls, beforeFresh + 1);

await waitFor(() => started.includes("fresh"));
assert.equal(started.includes("old-2"), false);
releaseOldOne();
await waitFor(() => started.includes("old-2"));

assert.equal(started.filter((id) => id === "old-1").length, 1);
assert.equal(started.filter((id) => id === "old-2").length, 1);
assert.equal(started.filter((id) => id === "fresh").length, 1);
console.log("PHASE5_RUNNER_LIVENESS_FIXTURE=PASS");
