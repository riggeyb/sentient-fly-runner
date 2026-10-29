from pathlib import Path

def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected 1 match, found {count}")
    p.write_text(text.replace(old, new, 1))

replace_once("src/phase1/core-runtime.ts",
'''  const proposal = Object.freeze({
    text: candidate.text,
    provider: candidate.provider,
    model: candidate.model,
    revision: candidate.revision,
  });
  const policy = options.acceptancePolicy;''',
'''  const proposal = Object.freeze({
    text: candidate.text,
    provider: candidate.provider,
    model: candidate.model,
    revision: candidate.revision,
  });
  const invocation = options.invocationControl;
  if (invocation && (invocation.signal.aborted || Date.now() >= invocation.absoluteDeadlineMs)) {
    return result(requirements, "COGNITION_UNAVAILABLE", null, {
      kind: "MODEL_RESULT",
      accepted: false,
      provider: candidate.provider,
      model: candidate.model,
      revision: candidate.revision,
      rejectionReason: "Model result became late before Sentient acceptance.",
    });
  }
  const policy = options.acceptancePolicy;''')

replace_once("src/phase1/core-runtime.ts",
'''    try {
      decision = await policy.evaluate(requirements, proposal);
    } catch {''',
'''    try {
      decision = await policy.evaluate(requirements, proposal);
      if (invocation && (invocation.signal.aborted || Date.now() >= invocation.absoluteDeadlineMs)) {
        return result(requirements, "COGNITION_UNAVAILABLE", null, {
          kind: "MODEL_RESULT",
          accepted: false,
          provider: candidate.provider,
          model: candidate.model,
          revision: candidate.revision,
          acceptancePolicyId: policyId,
          rejectionReason: "Model result became late during Sentient acceptance.",
        });
      }
    } catch {''')

replace_once("src/phase1/core-runtime.ts",
'''  return result(requirements, "RESPONDED", candidate.text, {
    kind: "MODEL_RESULT",''',
'''  if (invocation && (invocation.signal.aborted || Date.now() >= invocation.absoluteDeadlineMs)) {
    return result(requirements, "COGNITION_UNAVAILABLE", null, {
      kind: "MODEL_RESULT",
      accepted: false,
      provider: candidate.provider,
      model: candidate.model,
      revision: candidate.revision,
      acceptancePolicyId: policyId ?? undefined,
      rejectionReason: "Late model output cannot become an authoritative Sentient result.",
    });
  }
  return result(requirements, "RESPONDED", candidate.text, {
    kind: "MODD_RESULT",''')

replace_once("src/spawn/policy.ts",
'''  if (
    parent.remainingBudgets.maxInputTokens <= 0
    || parent.remainingBudgets.maxOutputTokens <= 0
    || parent.remainingBudgets.maxTotalTokens <= 0
  ) {
    pushSpawnReasonV1(reasons, "token_budget_exhausted");
  }''',
'''  if (
    parent.remainingBudgets.maxInputTokens <= 0
    || parent.remainingBudgets.maxOutputTokens <= 0
    || parent.remainingBudgets.maxTotalTokens <= 0
    || request.budgets.maxInputTokens > parent.remainingBudgets.maxInputTokens
    || request.budgets.maxOutputTokens > parent.remainingBudgets.maxOutputTokens
    || request.budgets.maxTotalTokens > parent.remainingBudgets.maxTotalTokens
  ) {
    pushSpawnReasonV1(reasons, "token_budget_exhausted");
  }''')

replace_once("src/spawn/policy.ts",
'''  if (
    request.budgets.maxCostMicros > 0
    && parent.remainingBudgets.maxCostMicros <= 0
  ) {
    pushSpawnReasonV1(reasons, "cost_budget_exhausted");
  }
  if (parent.remainingBudgets.maxRuntimeMs <= 0) {
    pushSpawnReasonV1(reasons, "runtime_budget_exhausted");
  }''',
'''  if (
    request.budgets.maxCostMicros > parent.remainingBudgets.maxCostMicros
    || (
      request.budgets.maxCostMicros > 0
      && parent.remainingBudgets.maxCostMicros <= 0
     )
  ) {
    pushSpawnReasonV1(reasons, "cost_budget_exhausted");
  }
  if (
    parent.remainingBudgets.maxRuntimeMs <= 0
    || request.budgets.maxRuntimeMs > parent.remainingBudgets.maxRuntimeMs
  ) {
    pushSpawnReasonV1(reasons, "runtime_budget_exhausted");
  }''')

replace_once("src/spawn/policy.ts",
'''      request.budgets.maxToolRounds > 0
      && parent.remainingBudgets.maxToolRounds <= 0
    )
    || (
      request.budgets.maxToolActions > 0
      && parent.remainingBudgets.maxToolActions <= 0
    )''',
'''      request.budgets.maxToolRounds > parent.remainingBudgets.maxToolRounds
    )
    || (
      request.budgets.maxToolActions > parent.remainingBudgets.maxToolActions
    )''')
