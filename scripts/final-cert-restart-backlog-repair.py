from pathlib import Path

source = Path("src/fly/self-execution.ts")
s = source.read_text()

replacements = [
    (
        "        this.#schedule(objectiveId, true);",
        "        await this.#schedule(objectiveId, true);",
    ),
    (
        "  #schedule(objectiveId: string, inheritedRestart = false): void {\n"
        "    if (this.#active.has(objectiveId)) return;",
        "  #schedule(objectiveId: string, inheritedRestart = false): Promise<void> {\n"
        "    const active = this.#active.get(objectiveId);\n"
        "    if (active !== undefined) return active;",
    ),
    (
        "    this.#active.set(objectiveId, work);\n"
        "  }\n\n"
        "  async #run(objectiveId: string, inheritedRestart: boolean): Promise<void> {",
        "    this.#active.set(objectiveId, work);\n"
        "    return work;\n"
        "  }\n\n"
        "  async #run(objectiveId: string, inheritedRestart: boolean): Promise<void> {",
    ),
]
for old, new in replacements:
    count = s.count(old)
    assert count == 1, (old, count)
    s = s.replace(old, new, 1)
source.write_text(s)

test_file = Path("test/final-cert-restart-backlog-serialization.test.ts")
assert not test_file.exists(), str(test_file)
test_file.write_text(r'''import test from "node:test";
import assert from "node:assert/strict";

import {
  FlyObjectiveRunnerV1,
  FLY_OBJECTIVE_RUNNER_CONTRACT,
} from "../src/fly/self-execution.js";

test("restart recovery executes unfinished managed objectives serially", async () => {
  const managedTask = (id: string) => ({
    kind: "task" as const,
    id,
    title: id,
    status: "running" as const,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    provenance: { actor: "user" as const },
    version: {
      schemaVersion: "2.0.0",
      applicationVersion: FLY_OBJECTIVE_RUNNER_CONTRACT,
      repository: "riggeyb/sentient",
      commitSha: "a".repeat(40),
    },
    metadata: {
      contract: FLY_OBJECTIVE_RUNNER_CONTRACT,
      request: `recover ${id}`,
      sessionId: `session-${id}`,
      mode: "ordinary",
      privacy: "public_fixture",
      engineeringJob: null,
      deployOnSuccess: false,
      activeEngineeringJobId: null,
      lastEngineeringReceipt: null,
      result: null,
      error: null,
    },
  });

  const tasks = new Map<string, any>([
    ["recover-a", managedTask("recover-a")],
    ["recover-b", managedTask("recover-b")],
  ]);
  const state = {
    async list(kind: string) {
      assert.equal(kind, "task");
      return [...tasks.values()];
    },
    async get(kind: string, id: string) {
      assert.equal(kind, "task");
      return tasks.get(id);
    },
    async replace(task: any) {
      tasks.set(task.id, task);
    },
  };

  const started: string[] = [];
  const release = new Map<string, () => void>();
  const application = {
    async runObjective(input: { objectiveId: string }) {
      started.push(input.objectiveId);
      await new Promise<void>((resolve) => release.set(input.objectiveId, resolve));
      return { httpStatus: 200, body: { result: { status: "COMPLETED" } } };
    },
  };

  const runner = new FlyObjectiveRunnerV1({
    state: state as any,
    application: application as any,
    registry: { unregister() {}, register() {} } as any,
    identity: {} as any,
  });

  assert.equal(await runner.resumeUnfinished(), 2);
  for (let i = 0; i < 100 && started.length < 1; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.deepEqual(started, ["recover-a"]);

  release.get("recover-a")?.();
  for (let i = 0; i < 400 && started.length < 2; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.deepEqual(started, ["recover-a", "recover-b"]);

  release.get("recover-b")?.();
  for (let i = 0; i < 100 && tasks.get("recover-b")?.status !== "succeeded"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(tasks.get("recover-a")?.status, "succeeded");
  assert.equal(tasks.get("recover-b")?.status, "succeeded");
});
''')
