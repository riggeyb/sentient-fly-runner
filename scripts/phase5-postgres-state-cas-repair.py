
from pathlib import Path

p = Path("src/state/postgres-state-repository.ts")
s = p.read_text()

s = s.replace(
    'import { Pool, type PoolClient, type PoolConfig } from "pg";',
    'import { Pool, type PoolConfig } from "pg";',
    1,
)

anchor = '''interface StoredRow {
  generation: string | number;
  snapshot: unknown;
}
'''
insert = '''interface StoredRow {
  generation: string | number;
  snapshot: unknown;
}

const POSTGRES_STATE_TRANSACTION_MAX_ATTEMPTS = 8;
'''
assert anchor in s
s = s.replace(anchor, insert, 1)

old = '''  protected async transaction<T>(
    change: (snapshot: StateSnapshot) => SharedStateTransactionResult<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await this.lockedSnapshot(client);
      const next = structuredClone(current);
      const outcome = change(next);
      if (outcome.changed) {
        next.generation = current.generation + 1;
        assertStateSnapshot(next);
        const updated = await client.query(
          `UPDATE ${this.tableSql}
           SET generation = $2, snapshot = $3::jsonb, updated_at = now()
           WHERE state_key = $1 AND generation = $4`,
          [this.stateKey, next.generation, JSON.stringify(next), current.generation],
        );
        if (updated.rowCount !== 1) {
          throw new Error("Sentient durable state generation fence failed");
        }
      }
      await client.query("COMMIT");
      return outcome.result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
'''
new = '''  protected async transaction<T>(
    change: (snapshot: StateSnapshot) => SharedStateTransactionResult<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= POSTGRES_STATE_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
      const current = await this.snapshot();
      const next = structuredClone(current);

      let outcome: SharedStateTransactionResult<T>;
      try {
        outcome = change(next);
      } catch (error) {
        const observedGeneration = await this.currentGeneration();
        if (
          observedGeneration !== current.generation &&
          attempt < POSTGRES_STATE_TRANSACTION_MAX_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }

      if (!outcome.changed) return outcome.result;

      next.generation = current.generation + 1;
      assertStateSnapshot(next);
      const serialized = JSON.stringify(next);

      const updated = await this.pool.query(
        `UPDATE ${this.tableSql}
         SET generation = $2, snapshot = $3::jsonb, updated_at = now()
         WHERE state_key = $1 AND generation = $4`,
        [this.stateKey, next.generation, serialized, current.generation],
      );
      if (updated.rowCount === 1) return outcome.result;
      if (attempt < POSTGRES_STATE_TRANSACTION_MAX_ATTEMPTS) continue;
    }

    throw new Error(
      `Sentient durable state generation fence failed after ${POSTGRES_STATE_TRANSACTION_MAX_ATTEMPTS} attempts`,
    );
  }
'''
assert old in s
s = s.replace(old, new, 1)

old_helper = '''  private async lockedSnapshot(client: PoolClient): Promise<StateSnapshot> {
    const result = await client.query<StoredRow>(
      `SELECT generation, snapshot FROM ${this.tableSql}
       WHERE state_key = $1
       FOR UPDATE`,
      [this.stateKey],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("Sentient durable state is not initialized");
    return decodeRow(row);
  }
'''
new_helper = '''  private async currentGeneration(): Promise<number> {
    const result = await this.pool.query<Pick<StoredRow, "generation">>(
      `SELECT generation FROM ${this.tableSql} WHERE state_key = $1`,
      [this.stateKey],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("Sentient durable state is not initialized");
    const generation = Number(row.generation);
    if (!Number.isSafeInteger(generation) || generation < 0) {
      throw new Error("invalid Sentient durable state generation");
    }
    return generation;
  }
'''
assert old_helper in s
s = s.replace(old_helper, new_helper, 1)
p.write_text(s)

t = Path("test/phase5-fly-restart-lease-retry.test.ts")
q = t.read_text()
marker = '''test("restart recovery paces admission without waiting for a previous objective lifetime", async () => {'''
assert marker in q
extra = '''test("Postgres state mutation keeps CPU snapshot work outside a row lock", async () => {
  const source = await readFile("src/state/postgres-state-repository.ts", "utf8");
  assert.ok(source.includes("POSTGRES_STATE_TRANSACTION_MAX_ATTEMPTS = 8"));
  assert.ok(source.includes("const current = await this.snapshot()"));
  assert.ok(source.includes("const serialized = JSON.stringify(next)"));
  assert.ok(source.includes("WHERE state_key = $1 AND generation = $4"));
  assert.ok(source.includes("if (updated.rowCount === 1) return outcome.result"));
  assert.ok(!source.includes("FOR UPDATE"));
});

'''
assert extra not in q
q = q.replace(marker, extra + marker, 1)
t.write_text(q)
