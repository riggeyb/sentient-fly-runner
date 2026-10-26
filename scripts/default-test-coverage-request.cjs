const request = {
  repo: "rigggeyb/sentient",
  branch: "sentient-production-composition-20261017",
  expectedHead: "fdab101aeef2275a3f9333384d6e8445799366a3",
  expectedTree: "c06b0c927efbfdd0cdfa2fc2ae1c8f6c26f2b11e",
  objectiveId: "SENTIENT_ROUTINE_HERMETIC_DEFAULT_TEST_SUITE_V1",
  actionId: "default-test-hermetic-suite-v1",
  authorizedPaths: ["package.json", "scripts/run-hermetic-tests.mjs"],
  authorizationIdentity: "sentient:objective:SENTIENT_ROUTINE_HERMETIC_DEFAULT_TEST_SUITE_V1",
  authorizationReason: "Routine bounded reliability work: make default npm test cover the complete hermetic suite while preserving PostgreSQL-backed continuation tests as an explicit integration path. No deployment, resource change, paid compute, policy mutation, or certification change.",
  policyVersion: "sentient-capability-tier/v1",
  idempotencyKey: "default-test-hermetic-fdab101a-v1-resident",
  objective: "Normalize this metadata envelope into the reviewed hermetic default-test command set before Governor submission.",
  commands: [],
  commitMessage: "test: run hermetic suite by default",
  timeoutMs: 1800000
};
process.stdout.write(JSON.stringify(request));
