from pathlib import Path

path = Path("src/model/providers/atlas-hybrid-adapters.ts")
text = path.read_text()
marker = "export class AtlasHybridSpawnExecutionBackendV1"
if text.count(marker) != 1:
    raise SystemExit("spawn backend class marker mismatch")
prefix, tail = text.split(marker, 1)

def once_tail(old: str, new: str, label: str) -> None:
    global tail
    n = tail.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected one match in Spawn backend tail, got {n}")
    tail = tail.replace(old, new, 1)

once_tail(
    '    const result = await this.#router.cognition({\n',
    '    const startedAtMs = Date.now();\n'
    '    const result = await this.#router.cognition({\n',
    "spawn router call",
)
once_tail(
    '    });\n'
    '    if (!result.ok) return failure("failed", "atlas_hybrid_terminal_unavailable");\n\n'
    '    const usage = aggregateUsage(result.telemetry);\n',
    '    });\n'
    '    const runtimeMs = Math.max(0, Date.now() - startedAtMs);\n'
    '    if (!result.ok) {\n'
    '      return hybridFailure("failed", "atlas_hybrid_terminal_unavailable", result.telemetry, runtimeMs);\n'
    '    }\n\n'
    '    const usage = aggregateUsage(result.telemetry);\n',
    "terminal failure",
)
once_tail(
    '      return failure("failed", "atlas_hybrid_reported_cost_exceeded_grant");\n',
    '      return hybridFailure(\n'
    '        "failed",\n'
    '        "atlas_hybrid_reported_cost_exceeded_grant",\n'
    '        result.telemetry,\n'
    '        runtimeMs,\n'
    '      );\n',
    "cost reconciliation failure",
)
once_tail(
    '    ) return failure("failed", "atlas_hybrid_reported_usage_exceeded_grant");\n',
    '    ) {\n'
    '      return hybridFailure(\n'
    '        "failed",\n'
    '        "atlas_hybrid_reported_usage_exceeded_grant",\n'
    '        result.telemetry,\n'
    '        runtimeMs,\n'
    '      );\n'
    '    }\n',
    "usage reconciliation failure",
)
once_tail(
    '        costMicros,\n'
    '        toolRounds: 0,\n',
    '        costMicros,\n'
    '        runtimeMs,\n'
    '        toolRounds: 0,\n',
    "success runtime usage",
)
once_tail(
    '      latencyMs: totalLatency(result.telemetry),\n',
    '      latencyMs: runtimeMs,\n',
    "success latency",
)

text = prefix + marker + tail

helper_marker = "function failure(\n"
if text.count(helper_marker) != 1:
    raise SystemExit("failure helper marker mismatch")
helper = '''function hybridFailure(
  status: "failed" | "cancelled" | "timed_out",
  message: string,
  telemetry: readonly HybridModelTelemetryV1[],
  runtimeMs: number,
): BackendExecutionResultV1 {
  const usage = aggregateUsage(telemetry);
  const costMicros = reportedCostMicros(telemetry);
  const attemptSummary = telemetry
    .map((item) => `${item.model}:${item.fallbackReason ?? "unknown"}`)
    .join(",");
  return {
    status,
    output: null,
    artifactRefs: [],
    evidenceRefs: [],
    toolActions: [],
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      costMicros,
      runtimeMs,
      toolRounds: 0,
      toolActions: 0,
      currency: "USD",
      telemetryComplete:
        usage.inputTokens !== null
        && usage.outputTokens !== null
        && usage.totalTokens !== null
        && costMicros !== null,
    },
    latencyMs: runtimeMs,
    ...(costMicros === null ? {} : { costMicros }),
    providerReceipt: {
      kind: "sentient-hybrid-model-failure/v1",
      routeProvider: ATLAS_HYBRID_PROVIDER_ID_V1,
      modelOutputIsAuthority: false,
      attempts: jsonValue(telemetry),
    },
    failure: {
      class: status === "timed_out" ? "timeout" : "atlas_hybrid_backend",
      message: `${message};attempts=${attemptSummary || "none"}`,
      retryable: false,
    },
    unresolvedAmbiguities: [],
  };
}

'''
path.write_text(text.replace(helper_marker, helper + helper_marker, 1))

test = r'''import assert from "node:assert/strict";
import test from "node:test";
import { AtlasCloudClientV1 } from "../src/model/providers/atlas-cloud-client.js";
import { AtlasHybridModelRouterV1 } from "../src/model/providers/atlas-hybrid-router.js";
import { AtlasHybridSpawnExecutionBackendV1 } from "../src/model/providers/atlas-hybrid-adapters.js";
import {
  LocalHuggingFaceRuntimeV1,
  type LocalHfRunnerV1,
} from "../src/model/providers/huggingface.js";

class NeverLocal implements LocalHfRunnerV1 {
  async initialize(): Promise<void> {}
  asyng generate(): Promise<never> {
    throw new Error("local_must_not_run");
  }
}

function response(content: string, status = 200): Response {
  const body = status >= 400
    ? { error: { message: content } }
    : {
        choices: [{ message: { content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
      };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function backend(steps: Response[]) {
  const fetchImpl = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 8));
    const next = steps.shift();
    if (!next) throw new Error("unexpected_fetch");
    return next;
  }) as typeof fetch;
  const client = new AtlasCloudClientV1({ apiKey: "test-secret", fetchImpl });
  const router = new AtlasHybridModelRouterV1( {
    atlasClient: client,
    dots3Model: "test/dots3",
    localRuntime: new LocalHuggingFaceRuntimeV1({ runner: new NeverLocal() }),
  });
  return new AtlasHybridSpawnExecutionBackendV1(router);
}

function input(maxRuntimeMs = 45_000) {
  return {
    identity: { executionId: "exec-1", role: "independent-analysis" },
    taskPackage: {
      objective: "analyze",
      context: { artifacts: [] },
      operatingContext: { mission: "test" },
      operatingContextDigest: "digest",
      effectiveGrant: {
        budgets: {
          maxInputTokens: 4_096,
          maxOutputTokens: 512,
          maxTotalTokens: 4_608,
          maxCostMicros: 25_000,
          maxRuntimeMs,
        },
      },
    },
    target: null,
    signal: new AbortController().signal,
  } as any;
}

test("terminal Atlas failure reports actual runtime and preserves attempt telemetry", async () => {
  const b = backend([response("down", 503), response("down", 503)]);
  const [target] = await b.describe();
  const r = await b.execute({ ...input(), target });
  assert.equal(r.status, "failed");
  assert.ok((r.usage?.runtimeMs ?? 0) > 0);
  assert.ok((r.usage?.runtimeMs ?? 45_000) < 45_000);
  assert.equal(r.latencyMs, r.usage?.runtimeMs);
  const receipt = r.providerReceipt as { attempts?: unknown[] } | undefined;
  assert.equal(receipt?.attempts?.length, 2);
  assert.match(r.failure?.message ?? "", /deepseek-ai\/deepseek-v3\.2:/);
  assert.match(r.failure?.message ?? "", /test\/dots3:/);
  assert.doesNotMatch(r.failure?.message ?? "", /test-secret/);
});

test("successful Atlas execution reports actual runtime for budget reconciliation", async () => {
  const b = backend([response('{"answer":"ok"}')]);
  const [target] = await b.describe();
  const r = await b.execute({ ...input(), target });
  assert.equal(r.status, "succeeded");
  assert.ok((r.usage?.runtimeMs ?? 0) > 0);
  assert.ok((r.usage?.runtimeMs ?? 45_000) < 45_000);
  assert.equal(r.latencyMs, r.usage?.runtimeMs);
});
'''
Path("test/atlas-hybrid-spawn-runtime-reconciliation.test.ts").write_text(test)
