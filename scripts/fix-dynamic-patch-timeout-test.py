from pathlib import Path
p = Path("/tmp/dynamic-core-patch.py")
s = p.read_text()
old = """    fetchImpl: (async (_url, init) => await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const abort = () => { observedAbort = true; reject(new Error("aborted")); };
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
    })) as typeof fetch,
"""
new = """    fetchImpl: (async (_url, init) => await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const keeper = setTimeout(() => reject(new Error("transport_safety_timeout")), 250);
      const abort = () => { clearTimeout(keeper); observedAbort = true; reject(new Error("aborted")); };
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
    })) as typeof fetch,
"""
if s.count(old) != 1:
    raise SystemExit("expected one timeout test anchor")
p.write_text(s.replace(old, new, 1))
