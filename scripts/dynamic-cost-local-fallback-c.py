from pathlib import Path
p=Path("sentient/src/application/production-collaboration.ts")
s=p.read_text()
start=s.index("function deterministicVerifier()")
end=s.index("function targets()", start)
new=r'''function deterministicVerifier(): SpawnDeterministicVerifierV1 {
  return {
    verifierId: "sentient-deterministic-convergence",
    async verify({ result }): Promise<SpawnVerificationResultV1> {
      const output = typeof result.output === "string" ? result.output : null;
      const receipt = objectRecord(result.providerReceipt);
      const expectedDigest = output === null ? null : sha256Text(output);
      const costBounded =
        result.costMicros === null
        || (Number.isInteger(result.costMicros) && result.costMicros >= 0 && result.costMicros <= 25_000);

      const hybridBinding =
        result.identity.backendId === ATLAS_HYBRID_SPAWN_BACKEND_ID_V1
        && result.identity.provider === ATLAS_HYBRID_PROVIDER_ID_V1
        && result.identity.model === ATLAS_HYBRID_ROUTE_MODEL_ID_V1
        && result.identity.targetRevision === "v1";
      const actualProvider = typeof receipt.actualProvider === "string" ? receipt.actualProvider : null;
      const actualModel = typeof receipt.actualModel === "string" ? receipt.actualModel : null;
      const actualModelValid =
        actualProvider === "atlascloud"
          ? actualModel !== null && actualModel.length > 0
          : actualProvider === LOCAL_HF_PROVIDER_V1 && actualModel === LOCAL_HF_MODEL_V1;
      const hybridReceiptValid =
        hybridBinding
        && receipt.executionId === result.identity.executionId
        && receipt.routeProvider === ATLAS_HYBRID_PROVIDER_ID_V1
        && actualModelValid
        && receipt.modelOutputIsAuthority === false
        && receipt.sentientOwnsAcceptance === true
        && receipt.governorOwnsEffectAuthority === true;

      const localBinding =
        result.identity.backendId === HUGGINGFACE_LOCAL_SPAWN_BACKEND_ID_V1
        && result.identity.provider === LOCAL_HF_PROVIDER_V1
        && result.identity.model === LOCAL_HF_MODEL_V1
        && result.identity.targetRevision === LOCAL_HF_MODEL_REVISION_V1;
      const localReceiptValid =
        localBinding
        && result.costMicros === 0
        && receipt.executionId === result.identity.executionId
        && receipt.provider === LOCAL_HF_PROVIDER_V1
        && receipt.model === LOCAL_HF_MODEL_V1
        && receipt.revision === LOCAL_HF_MODEL_REVISION_V1
        && receipt.transport === "LOCAL"
        && receipt.costPolicy === "local-zero-cost"
        && receipt.modelOutputIsAuthority === false;

      const accepted =
        result.terminalStatus === "succeeded"
        && costBounded
        && output !== null
        && output.trim().length > 0
        && (hybridReceiptValid || localReceiptValid)
        && expectedDigest !== null
        && receipt.outputSha256 === expectedDigest
        && result.evidenceRefs.some((ref) => ref.includes(expectedDigest));
      return {
        verifierId: "sentient-deterministic-convergence",
        deterministic: true,
        outcome: accepted ? "accept" : "reject",
        reasonCodes: [accepted ? "verified_spawn_evidence" : "spawn_evidence_invalid"],
        evidenceRefs: accepted ? [...result.evidenceRefs] : [],
        checkedAt: new Date().toISOString(),
      };
    },
  };
}
'''
p.write_text(s[:start]+new+s[end:])
