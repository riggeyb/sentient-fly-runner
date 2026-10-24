from pathlib import Path

p = Path("src/state/postgres-state-repository.ts")
s = p.read_text()

old = """      if (!outcome.changed) return outcome.result;
"""
new = """      if (!outcome.changed) {
        const observedGeneration = await this.currentGeneration();
        if (observedGeneration === current.generation) return outcome.result;
        if (attempt < POSTGRES_STATE_TRANSACTION_MAX_ATTEMPTS) continue;
        break;
      }
"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)
p.write_text(s)

t = Path("test/phase5-fly-restart-lease-retry.test.ts")
q = t.read_text()
needle = '  assert.ok(source.includes("if (updated.rowCount === 1) return outcome.result"));\n'
replacement = needle + '  assert.ok(source.includes("if (observedGeneration === current.generation) return outcome.result"));\n'
assert q.count(needle) == 1, q.count(needle)
q = q.replace(needle, replacement, 1)
t.write_text(q)
