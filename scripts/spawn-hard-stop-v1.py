from pathlib import Path
import re
p=Path("src/spawn/orchestrator.ts")
s=p.read_text()
pat=re.compile(r'''  let raw: BackendExecutionResultV1;\n  try \{\n    raw = await backend\.execute\(\{\n(?P<body>.*?)      signal: input\.signal \?\? new AbortController\(\)\.signal,\n    \}\);\n  \} catch \(error\) \{\n    raw = spawnBackendFailureV1\(error\);\n  \}\n''',re.S)
m=pat.search(s)
if not m: raise SystemExit("spawn backend block mismatch")
body=m.group("body")
new='''  const reservationSignal = AbortSignal.timeout(Math.max(1, decision.reservation.runtimeMs));
  const executionSignal = input.signal
    ? AbortSignal.any([input.signal, reservationSignal])
    : reservationSignal;
  let raw: BackendExecutionResultV1;
  try {
    raw = await awaitSpawnBackendResultV1(
      backend.execute({
'''+body+'''        signal: executionSignal,
      }),
      executionSignal,
      reservationSignal,
    );
  } catch (error) {
    raw = spawnBackendFailureV1(error);
  }
'''
s,n=pat.subn(new,s,count=1)
if n!=1: raise SystemExit(f"spawn backend replace count {n}")
vpat=re.compile(r'''  const verification = await verifySpawnResultV1\(deps\.verifier, request, taskPackage, childResult\);\n  childResult = \{\n    \.\.\.childResult,\n    verifierResultRefs: \[`spawn-verification:\$\{request\.requestId\}:\$\{verification\.verifierId\}`\],\n  \};\n''')
vnew='''  let verification: SpawnVerificationResultV1 | null = null;
  if (!executionSignal.aborted) {
    const candidate = await verifySpawnResultV1(deps.verifier, request, taskPackage, childResult);
    if (!executionSignal.aborted) verification = candidate;
  }
  if (verification) {
    childResult = {
      ...childResult,
      verifierResultRefs: [`spawn-verification:${request.requestId}:${verification.verifierId}`],
    };
  }
'''
s,n=vpat.subn(vnew,s,count=1)
if n!=1: raise SystemExit(f"verification replace count {n}")
helper='''

async function awaitSpawnBackendResultV1(
  pending: Promise<BackendExecutionResultV1>,
  signal: AbortSignal,
  reservationSignal: AbortSignal,
): Promise<BackendExecutionResultV1> {
  if (signal.aborted) return stoppedBackendResultV1(reservationSignal.aborted);
  return await new Promise<BackendExecutionResultV1>((resolve) => {
    let settled = false;
    const finish = (value: BackendExecutionResultV1) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(signal.aborted ? stoppedBackendResultV1(reservationSignal.aborted) : value);
    };
    const onAbort = () => finish(stoppedBackendResultV1(reservationSignal.aborted));
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(finish, (error) => finish(spawnBackendFailureV1(error)));
  });
}

function stoppedBackendResultV1(runtimeExhausted: boolean): BackendExecutionResultV1 {
  return {
    status: runtimeExhausted ? "timed_out" : "cancelled",
    output: null,
    usage: {},
    failure: {
      class: runtimeExhausted ? "runtime_budget_exhausted" : "cancelled",
      message: runtimeExhausted
        ? "spawn runtime reservation exhausted"
        : "spawn execution cancelled by parent",
      retryable: false,
    },
  };
}
'''
s += helper
p.write_text(s)
