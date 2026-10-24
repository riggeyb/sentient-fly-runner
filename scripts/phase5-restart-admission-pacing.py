from pathlib import Path

p=Path("src/fly/self-execution.ts")
s=p.read_text()
anchor="const PHASE5_RESTART_LEASE_MAX_WAIT_MS = 180_250;"
assert s.count(anchor)==1
s=s.replace(anchor,anchor+"\nconst PHASE5_RESTART_ADMISSION_PACING_MS = 1_000;",1)
old='''  #scheduleInheritedRestart(objectiveId: string): void {
    this.#restartRecoveryTail = this.#restartRecoveryTail
      .catch(() => undefined)
      .then(async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        this.#schedule(objectiveId, true);
        const work = this.#active.get(objectiveId);
        if (work !== undefined) await work;
      });
  }'''
new='''  #scheduleInheritedRestart(objectiveId: string): void {
    this.#restartRecoveryTail = this.#restartRecoveryTail
      .catch(() => undefined)
      .then(async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        this.#schedule(objectiveId, true);
        await new Promise<void>((resolve) =>
          setTimeout(resolve, PHASE5_RESTART_ADMISSION_PACING_MS)
        );
      });
  }'''
assert s.count(old)==1, s.count(old)
p.write_text(s.replace(old,new,1))

t=Path("test/phase5-fly-restart-lease-retry.test.ts")
q=t.read_text()
oldtest='''test("restart lease retry is wired only from resumeUnfinished", async () => {
  const source = await readFile("src/fly/self-execution.ts", "utf8");
  assert.ok(source.includes("this.#schedule(task.id, true)"));
  assert.ok(source.includes("#schedule(objectiveId: string, inheritedRestart = false)"));
  assert.ok(source.includes("inheritedRestart\\n      ? await runObjectiveWithInheritedPhase5LeaseRetryV1"));
});'''
newtest='''test("restart recovery paces admission without waiting for a previous objective lifetime", async () => {
  const source = await readFile("src/fly/self-execution.ts", "utf8");
  assert.ok(source.includes("this.#scheduleInheritedRestart(task.id)"));
  assert.ok(source.includes("PHASE5_RESTART_ADMISSION_PACING_MS = 1_000"));
  assert.ok(source.includes("this.#schedule(objectiveId, true)"));
  assert.ok(source.includes("setTimeout(resolve, PHASE5_RESTART_ADMISSION_PACING_MS)"));
  assert.ok(!source.includes("if (work !== undefined) await work"));
  assert.ok(source.includes("#schedule(objectiveId: string, inheritedRestart = false)"));
  assert.ok(source.includes("inheritedRestart\\n      ? await runObjectiveWithInheritedPhase5LeaseRetryV1"));
});'''
assert q.count(oldtest)==1, q.count(oldtest)
t.write_text(q.replace(oldtest,newtest,1))
