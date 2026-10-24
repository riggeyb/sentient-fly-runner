from pathlib import Path

self_path = Path("src/fly/self-execution.ts")
s = self_path.read_text()
import_old = 'import type { Phase0DeploymentPortV1 } from "./phase0-engineering-acceptance.js";'
import_new = (
    'import type { Phase0DeploymentPortV1 } from "./phase0-engineering-acceptance.js";\n'
    'import {\n'
    '  NOOP_OBJECTIVE_RESIDENCY_V1,\n'
    '  type ObjectiveResidencyV1,\n'
    '} from "./objective-residency.js";'
)
if s.count(import_old) != 1:
    raise SystemExit(f"self-execution import anchor mismatch count={s.count(import_old)}")
s = s.replace(import_old, import_new, 1)

marker = "export class FlyObjectiveRunnerV1"
if s.count(marker) != 1:
    raise SystemExit(f"FlyObjectiveRunnerV1 marker mismatch count={s.count(marker)}")
prefix, tail = s.split(marker, 1)
replacements = [
    (
        '  readonly #identity: SentientApplicationIdentity;\n'
        '  readonly #active = new Map<string, Promise<void>>();',
        '  readonly #identity: SentientApplicationIdentity;\n'
        '  readonly #residency: ObjectiveResidencyV1;\n'
        '  readonly #active = new Map<string, Promise<void>>();'
    ),
    (
        '    identity: SentientApplicationIdentity;\n'
        '  }) {',
        '    identity: SentientApplicationIdentity;\n'
        '    residency?: ObjectiveResidencyV1;\n'
        '  }) {'
    ),
    (
        '    this.#identity = input.identity;\n'
        '  }',
        '    this.#identity = input.identity;\n'
        '    this.#residency = input.residency ?? NOOP_OBJECTIVE_RESIDENCY_V1;\n'
        '  }'
    ),
    (
        '    const work = this.#run(objectiveId, inheritedRestart)',
        '    const residencyLease = this.#residency.acquire(objectiveId);\n'
        '    const work = this.#run(objectiveId, inheritedRestart)'
    ),
    (
        '      .finally(() => {\n'
        '        this.#registry.unregister(objectiveId);',
        '      .finally(() => {\n'
        '        residencyLease.release();\n'
        '        this.#registry.unregister(objectiveId);'
    ),
]
for old, new in replacements:
    count = tail.count(old)
    if count != 1:
        raise SystemExit(f"FlyObjectiveRunnerV1 anchor mismatch count={count}: {old[:80]!r}")
    tail = tail.replace(old, new, 1)
self_path.write_text(prefix + marker + tail)

runtime_path = Path("src/fly/production-runtime.ts")
s = runtime_path.read_text()
replacements = [
    (
        'import { phase0EngineeringReadinessV1 } from "./phase0-readiness.js";',
        'import { phase0EngineeringReadinessV1 } from "./phase0-readiness.js";\n'
        'import { FlyProxyObjectiveResidencyV1 } from "./objective-residency.js";'
    ),
    (
        '  const objectiveRunner =\n',
        '  const objectiveResidency = new FlyProxyObjectiveResidencyV1({\n'
        '    origin: `https://${optional(process.env.FLY_APP_NAME) ?? "sentient-validation-runner"}.fly.dev`,\n'
        '  });\n\n'
        '  const objectiveRunner =\n'
   ),
    (
        '          registry: phase4ExecutorFactory,\n',
        '          registry: phase4ExecutorFactory,\n'
        '          residency: objectiveResidency,\n'
    ),
]
for old, new in replacements:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"production-runtime anchor mismatch count={count}: {old[:80]!r}")
    s = s.replace(old, new, 1)
runtime_path.write_text(s)
