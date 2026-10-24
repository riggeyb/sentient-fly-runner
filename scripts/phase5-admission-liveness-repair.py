from pathlib import Path

p = Path("src/fly/self-execution.ts")
s = p.read_text()

replacements = [
(
"""  readonly #identity: SentientApplicationIdentity;
  readonly #active = new Map<string, Promise<void>>();
""",
"""  readonly #identity: SentientApplicationIdentity;
  readonly #active = new Map<string, Promise<void>>();
  #restartRecoveryTail: Promise<void> = Promise.resolve();
"""
),
(
"""      this.#schedule(input.objectiveId);
      return this.status(input.objectiveId);
""",
"""      const receipt = objectiveRunnerStatusFromTask(existing);
      setImmediate(() => this.#schedule(input.objectiveId));
      return receipt;
"""
),
(
"""    await this.#state.insert(task);
    this.#schedule(input.objectiveId);
    return this.status(input.objectiveId);
""",
"""    await this.#state.insert(task);
    const receipt = objectiveRunnerStatusFromTask(task);
    setImmediate(() => this.#schedule(input.objectiveId));
    return receipt;
"""
),
(
"""    const metadata = parseRunnerMetadata(task);
    if (metadata === null) throw new Error("objective_not_managed_by_fly_runner");
    return Object.freeze({
      contract: FLY_OBJECTIVE_RUNNER_CONTRACT,
      objectiveId,
      status: task.status,
      activeEngineeringJobId: metadata.activeEngineeringJobId,
      lastEngineeringReceipt: metadata.lastEngineeringReceipt,
      updatedAt: task.updatedAt,
      error: metadata.error,
      result: metadata.result,
    });
""",
"""    return objectiveRunnerStatusFromTask(task);
"""
),
(
"""      count += 1;
      this.#schedule(task.id, true);
""",
"""      count += 1;
      this.#scheduleInheritedRestart(task.id);
"""
),
(
"""  #schedule(objectiveId: string, inheritedRestart = false): void {
""",
"""  #scheduleInheritedRestart(objectiveId: string): void {
    this.#restartRecoveryTail = this.#restartRecoveryTail
      .catch(() => undefined)
      .then(async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        this.#schedule(objectiveId, true);
        const work = this.#active.get(objectiveId);
        if (work !== undefined) await work;
      });
  }

  #schedule(objectiveId: string, inheritedRestart = false): void {
"""
),
(
"""export function summarizeReceipt(receipt: EngineeringJobRecordV1): EngineeringReceiptSummaryV1 {
""",
"""function objectiveRunnerStatusFromTask(task: SentientTask): ObjectiveRunnerStatusV1 {
  const metadata = parseRunnerMetadata(task);
  if (metadata === null) throw new Error("objective_not_managed_by_fly_runner");
  return Object.freeze({
    contract: FLY_OBJECTIVE_RUNNER_CONTRACT,
    objectiveId: task.id,
    status: task.status,
    activeEngineeringJobId: metadata.activeEngineeringJobId,
    lastEngineeringReceipt: metadata.lastEngineeringReceipt,
    updatedAt: task.updatedAt,
    error: metadata.error,
    result: metadata.result,
  });
}

export function summarizeReceipt(receipt: EngineeringJobRecordV1): EngineeringReceiptSummaryV1 {
"""
),
]

for old, new in replacements:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"replacement anchor count={count}: {old[:80]!r}")
    s = s.replace(old, new, 1)

p.write_text(s)
