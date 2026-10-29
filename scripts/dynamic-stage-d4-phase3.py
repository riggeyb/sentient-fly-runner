from pathlib import Path

def rep(path, old, new):
    p=Path(path); s=p.read_text(); n=s.count(old)
    if n != 1:
        raise SystemExit(f"{path}: expected one anchor, got {n}: {old[:100]!r}")
    p.write_text(s.replace(old,new,1))

rep("sentient/src/phase3/cognitive-components.ts",
'''import { selectSkills } from "../retrieval/skills.js";
import type { PinnedSkillRegistry } from "../retrieval/contracts.js";''',
'''import { selectSkills } from "../retrieval/skills.js";
import type { PinnedSkillRegistry } from "../retrieval/contracts.js";
import type { Phase1InvocationControlV1 } from "../phase1/core-runtime.js";''')

rep("sentient/src/phase3/cognitive-components.ts",
'''export interface HfPortV1{classify<L extends string>(input:{component:CognitiveComponentV1;text:string;allowedLabels:readonly L[]}):Promise<HfPredictionV1<L>>}''',
'''export interface HfPortV1{classify<L extends string>(input:{component:CognitiveComponentV1;text:string;allowedLabels:readonly L[];invocationControl?:Phase1InvocationControlV1}):Promise<HfPredictionV1<L>>}''')

rep("sentient/src/model/providers/atlas-hybrid-adapters.ts",
'''  public async classify<L extends string>(input: {
    component: CognitiveComponentV1;
    text: string;
    allowedLabels: readonly L[];
  }): Promise<HfPredictionV1<L>> {
    if (!input.allowedLabels.length) throw new Error("phase3_labels_required");
    const labels = new Set<string>(input.allowedLabels);
    const result = await this.#router.cognition({''',
'''  public async classify<L extends string>(input: {
    component: CognitiveComponentV1;
    text: string;
    allowedLabels: readonly L[];
    invocationControl?: Phase1InvocationControlV1;
  }): Promise<HfPredictionV1<L>> {
    if (!input.allowedLabels.length) throw new Error("phase3_labels_required");
    if (
      input.invocationControl
      && (input.invocationControl.signal.aborted || Date.now() >= input.invocationControl.absoluteDeadlineMs)
    ) throw new Error("phase3_invocation_unavailable");
    const labels = new Set<string>(input.allowedLabels);
    const remaining = input.invocationControl === undefined
      ? undefined
      : Math.max(1, input.invocationControl.absoluteDeadlineMs - Date.now());
    const result = await this.#router.cognition({''')

rep("sentient/src/model/providers/atlas-hybrid-adapters.ts",
'''      userPrompt: input.text,
      maxOutputTokens: 32,
      requiredTextValidator: (text) => labels.has(text.trim()),
    });
    if (!result.ok) throw new Error("phase3_hybrid_cognition_unavailable");''',
'''      userPrompt: input.text,
      maxInputTokens: Math.min(512, input.invocationControl?.maxInputTokens ?? 512),
      maxOutputTokens: Math.min(32, input.invocationControl?.maxOutputTokens ?? 32),
      ...(input.invocationControl?.maxCostMicros === undefined ? {} : { maxCostMicros: input.invocationControl.maxCostMicros }),
      ...(remaining === undefined ? {} : { timeoutMs: remaining }),
      ...(input.invocationControl?.signal === undefined ? {} : { signal: input.invocationControl.signal }),
      requiredTextValidator: (text) => labels.has(text.trim()),
    });
    if (
      input.invocationControl
      && (input.invocationControl.signal.aborted || Date.now() >= input.invocationControl.absoluteDeadlineMs)
    ) throw new Error("phase3_late_output_rejected");
    if (!result.ok) throw new Error("phase3_hybrid_cognition_unavailable");''')

print("phase3 D4 patch ready")
