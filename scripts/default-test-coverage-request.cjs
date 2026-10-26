const request = {
  repo: "riggeyb/sentient",
  branch: "sentient-production-composition-20261017",
  expectedHead: "fdab101aeef2275a3f9333384d6e8445799366a3",
  expectedTree: "c06b0c927efbfdd0cdfa2fc2ae1c8f6c26f2b11e",
  objectiveId: "SENTIENT_ROUTINE_HERMETIC_DEFAULT_TEST_SUITE_V1",
  actionId: "default-test-hermetic-isolated-v2",
  authorizedPaths: ["package.json", "scripts/run-hermetic-tests.mjs"],
  authorizationIdentity: "sentient:objective:SENTIENT_ROUTINE_HERMETIC_DEFAULT_TEST_SUITE_V1",
  authorizationReason: "Replacement for failed-safe aggregate hermetic test attempt. Execute each hermetic compiled test file in a separate sequential Node process to avoid verified aggregate resource/timing contention while preserving explicit PostgreSQL integration tests. No deployment, resource change, paid compute, policy mutation, or certification change.",
  policyVersion: "sentient-capability-tier/v1",
  idempotencyKey: "default-test-hermetic-isolated-fdab101a-v2-resident",
  objective: "Normalize this metadata envelope into the reviewed isolated hermetic default-test command set before Governor submission.",
  commands: [],
  commitMessage: "test: run isolated hermetic suite by default",
  timeoutMs: 1800000
};
process.stdout.write(JSON.stringify(request));
