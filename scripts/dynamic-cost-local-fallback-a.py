from pathlib import Path

def rep(path, old, new, label):
    p=Path(path); s=p.read_text()
    if s.count(old)!=1: raise SystemExit(f"{label}:{s.count(old)}")
    p.write_text(s.replace(old,new,1))

rep("sentient/src/model/providers/atlas-hybrid-adapters.ts",
'''        totalTokens: true,
        costMicros: true,
        runtimeMs: true,''',
'''        totalTokens: true,
        costMicros: false,
        runtimeMs: true,''',
"hybrid-cost")

rep("sentient/src/spawn/backends/huggingface.ts",
'''    if (budget.maxCostMicros !== 0) {
      return failure("failed", "local_hf_requires_zero_cost_budget", false);
    }
''',"","local-cost")

rep("sentient/src/fly/production-runtime.ts",
'''import {
  EngineeringObjectiveRegistryV1,''',
'''import { LocalHuggingFaceSpawnExecutionBackendV1 } from "../spawn/backends/huggingface.js";
import {
  EngineeringObjectiveRegistryV1,''',
"runtime-import")

rep("sentient/src/fly/production-runtime.ts",
'''  const spawnBackends = [
    new AtlasHybridSpawnExecutionBackendV1(hybridRouter),
  ];''',
'''  const spawnBackends = [
    new AtlasHybridSpawnExecutionBackendV1(hybridRouter),
    new LocalHuggingFaceSpawnExecutionBackendV1(localHfRuntime),
  ];''',
"runtime-register")

rep("sentient/src/spawn/selection.ts",
'''function constraintAllows(value: string | null, constraint: SpawnTargetConstraintV1): boolean {
  if (value === null) return constraint.allowed.length === 0;
  if (constraint.denied.includes(value)) return false;
  return constraint.allowed.length === 0 || constraint.allowed.includes(value);
}''',
'''function constraintAllows(value: string | null, constraint: SpawnTargetConstraintV1): boolean {
  if (value === null) return constraint.allowed.length === 0;
  if (constraint.denied.includes(value)) return false;
  return constraint.allowed.length === 0 || constraint.allowed.includes(value);
}
function supportsAllowedDataHandlingMode(
  supported: readonly string[],
  allowed: readonly string[],
): boolean {
  return allowed.length === 0 || supported.some((mode) => allowed.includes(mode));
}''',
"privacy-helper")

rep("sentient/src/spawn/selection.ts",
'''    || !containsAll(
      target.privacy.dataHandlingModes,
      request.privacyPolicy.allowedDataHandlingModes,
    )''',
'''    || !supportsAllowedDataHandlingMode(
      target.privacy.dataHandlingModes,
      request.privacyPolicy.allowedDataHandlingModes,
    )''',
"privacy-match")
