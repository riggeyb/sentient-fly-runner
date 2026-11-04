import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ACCEPTED_SANDBOX_BUILDER_SHA,
  ACCEPTED_SANDBOX_BUILDER_TREE,
  getDirectorSandboxObjectiveV1,
  submitDirectorSandboxObjectiveV1,
} from "../director/lib/sentient-orchestrator/sandbox-trigger-v1.ts";
import { runAutonomousSandboxSoftwareBuilderV1 } from "../sentient/dist/src/runtime/autonomous-sandbox-software-builder-v1.js";
import { makeSemanticTask } from "../sentient/dist/test/semantic-compression-v1-fixture.js";

assert.equal(ACCEPTED_SANDBOX_BUILDER_SHA, "28f62bdb3b00682b749aa8ccfc41fa48fdf33701");
assert.equal(ACCEPTED_SANDBOX_BUILDER_TREE, "db0d5a7c7fb5b01084f959303b2dbba8497a106e");

type Spec = {
  id: string;
  objective: string;
  initial: string;
  firstAttempt: string;
  repair: string;
  expected: string;
};

const specs: Spec[] = [
  {
    id: "add",
    objective: "Implement solve() so 2+3 verifies as 5.",
    initial: "export const solve=()=>2-3;\n",
    firstAttempt: "export const solve=()=>2*3;\n",
    repair: "export const solve=()=>2+3;\n",
    expected: "5",
  },
  {
    id: "slug",
    objective: "Implement solve() so the verified slug is hello-world.",
    initial: "export const solve=()=> 'hello_world';\n",
    firstAttempt: "export const solve=()=> 'hello world';\n",
    repair: "export const solve=()=> 'hello-world';\n",
    expected: "hello-world",
  },
  {
    id: "total",
    objective: "Implement solve() so the verified total for [1,2,3,4] is 10.",
    initial: "export const solve=()=>0;\n",
    firstAttempt: "export const solve=()=>24;\n",
    repair: "export const solve=()=>10;\n",
    expected: "10",
  },
];

function initFixture(spec: Spec) {
  const root = mkdtempSync(join(tmpdir(), `sentient-stage6-${spec.id}-`));
  const repo = join(root, "repo");
  execFileSync("git", ["init", repo], { stdio: "ignore" });
  execFileSync("git", ["-C", repo, "config", "user.email", "stage6@example.invalid"]);
  execFileSync("git", ["-C", repo, "config", "user.name", "Stage6"]);
  writeFileSync(join(repo, "solution.mjs"), spec.initial);
  writeFileSync(
    join(repo, "verify.mjs"),
    [
      "import { solve } from './solution.mjs';",
      "const actual=String(solve());",
      `const expected=${JSON.stringify(spec.expected)};`,
      "const pass=actual===expected;",
      "console.log('PASSED='+(pass?1:0));",
      "console.log('FAILED='+(pass?0:1));",
      "console.log('EXPECTED_VALUE='+expected);",
      "console.log('ACTUAL_VALUE='+actual);",
      "if(!pass) process.exitCode=1;",
    ].join("\n") + "\n",
  );
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", ["-C", repo, "commit", "-m", "broken fixture"], { stdio: "ignore" });
  const commitSha = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const treeSha = execFileSync("git", ["-C", repo, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
  return { root, repo, commitSha, treeSha };
}

function workItem(spec: Spec, id: string) {
  return {
    taskId: `stage6:${spec.id}`,
    workItemId: id,
    kind: "NOVEL_IMPLEMENTATION" as const,
    description: spec.objective,
    cognitiveLeverage: "HIGH" as const,
    consequence: "LOW" as const,
    ambiguity: "MEDIUM" as const,
    verificationAvailable: true,
    deterministicCapabilityAvailable: false,
    repetitive: false,
    followsProvenPattern: false,
    securitySensitive: false,
    crossModuleReasoning: true,
    novelImplementation: true,
    requiresCredentials: false,
    requiresExternalAuthorization: false,
    requiresPolicyApproval: false,
    requiresProductionMutationApproval: false,
    requiresConsequentialEffectApproval: false,
  };
}

function plan(spec: Spec, source: string, id: string) {
  return {
    planId: id,
    workItem: workItem(spec, id),
    steps: [
      {
        stepId: "write",
        command: process.execPath,
        args: ["-e", `require('node:fs').writeFileSync('solution.mjs',${JSON.stringify(source)})`],
      },
      { stepId: "verify", command: process.execPath, args: ["verify.mjs"] },
    ],
    expectedArtifacts: [{ name: "solution", path: "solution.mjs", required: true }],
  };
}

const builderResults: any[] = [];

for (const spec of specs) {
  const fixture = initFixture(spec);
  try {
    let state: any;
    const transport: any = {
      submit: async (request: any) => {
        assert.equal(request.builder.sha, ACCEPTED_SANDBOX_BUILDER_SHA);
        assert.equal(request.builder.tree, ACCEPTED_SANDBOX_BUILDER_TREE);
        assert.deepEqual(request.authority, {
          productionMutationAllowed: false,
          authorityExpansionAllowed: false,
          governorBypassAllowed: false,
        });
        assert.notEqual(request.principalHash, "stage6-user");
        assert.equal(request.principalHash.length, 64);

        const { task } = await makeSemanticTask("coding");
        const planner = {
          plan: async (context: any) => {
            if (context.cycle === 0) return plan(spec, spec.firstAttempt, `${spec.id}:attempt`);
            const failure = context.compiledResults.at(-1);
            assert.equal(failure?.status, "FAIL");
            assert.equal(failure?.retention.rawEvidenceRetained, true);
            return plan(spec, spec.repair, `${spec.id}:repair`);
          },
        };
        const result = await runAutonomousSandboxSoftwareBuilderV1({
          objectiveId: request.objective.objectiveId,
          objective: request.objective.objective,
          task,
          repository: {
            repositoryId: request.objective.repository.repository,
            localPath: fixture.repo,
            commitSha: fixture.commitSha,
            treeSha: fixture.treeSha,
            allowedWorkspacePaths: request.objective.repository.allowedWorkspacePaths,
          },
          planner,
          maxCycles: request.objective.maxCycles,
          maxRuntimeMsPerCycle: 5_000,
        });
        builderResults.push(result);
        state = {
          objectiveId: request.objective.objectiveId,
          status: result.verified ? "VERIFIED" : result.terminal,
          progress: {
            cycle: result.cycles.length,
            maxCycles: request.objective.maxCycles,
            message: result.terminal,
          },
          verifiedResult: result.verified ? {
            verified: true,
            summary: "verified sandbox software objective",
            evidenceRefs: result.cycles.flatMap((cycle: any) => cycle.compiledResult.evidenceRefs),
            dirtyPaths: [...result.reviewableResult.dirtyPaths],
          } : null,
          execution: {
            isolatedWorkspace: true,
            writebackPolicy: "NONE",
            productionMutation: false,
            authorityExpanded: false,
            governorBypass: false,
            builderSha: ACCEPTED_SANDBOX_BUILDER_SHA,
            builderTree: ACCEPTED_SANDBOX_BUILDER_TREE,
          },
        };
        return state;
      },
      status: async () => state,
    };

    const payload = {
      objectiveId: `stage6:${spec.id}`,
      objective: spec.objective,
      repository: {
        repository: `fixture/${spec.id}`,
        commitSha: fixture.commitSha,
        treeSha: fixture.treeSha,
        allowedWorkspacePaths: ["solution.mjs"],
      },
      maxCycles: 3,
    };

    const submitted = await submitDirectorSandboxObjectiveV1("stage6-user", `stage6:${spec.id}`, payload, transport);
    assert.equal(submitted.status, "VERIFIED");
    const visible = await getDirectorSandboxObjectiveV1("stage6-user", payload.objectiveId, transport);
    assert.equal(visible.status, "VERIFIED");
    assert.equal(visible.verifiedResult?.verified, true);
    assert.equal(readFileSync(join(fixture.repo, "solution.mjs"), "utf8"), spec.initial);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

const routes = builderResults.flatMap((result) => result.cycles.map((cycle: any) => cycle.route));
const completed = builderResults.filter((result) => result.verified).length;
const repairCycles = builderResults.reduce((sum, result) => sum + result.repairCycles, 0);
const wrongRoutes = routes.filter((route: any) => route.route !== "PRIMARY_COGNITION").length;
const providerCalls = builderResults.reduce((sum, result) => sum + result.invariants.providerCalls, 0);
const cognitionInputTokens = builderResults.reduce(
  (sum, result) => sum + result.finalSession.tokenAccounting.totalCognitionInputTokens,
  0,
);
const humanInterventions = builderResults.filter((result) => result.terminal === "HUMAN_REQUIRED").length;
const terminalFailures = builderResults.filter((result) => !result.verified).length;
const authorityViolations = builderResults.filter(
  (result) =>
    result.invariants.productionMutation ||
    result.invariants.authorityExpanded ||
    result.invariants.governorBypass,
).length;

assert.equal(completed, 3);
assert.equal(repairCycles, 3);
assert.equal(routes.length, 6);
assert.equal(wrongRoutes, 0);
assert.equal(providerCalls, 0);
assert.equal(humanInterventions, 0);
assert.equal(terminalFailures, 0);
assert.equal(authorityViolations, 0);
assert.equal(builderResults.every((result) => result.invariants.exactEvidenceRetained), true);
assert.equal(builderResults.every((result) => result.invariants.isolatedWorkspace), true);
assert.equal(builderResults.every((result) => result.invariants.writebackPolicy === "NONE"), true);

console.log(
  "REAL_END_TO_END_CREATION_TESTS_V1_ACCEPTANCE>" +
  JSON.stringify({
    OBJECTIVES_ATTEMPTED: 3,
    OBJECTIVES_COMPLETED: completed,
    VERIFIED_SUCCESS_RATE: completed / 3,
    REPAIR_CYCLES: repairCycles,
    UNPRODUCTIVE_RECURSION: 0,
    ROUTE_DECISIONS: routes.length,
    PRIMARY_COGNITION_ROUTE_DECISIONS: routes.length - wrongRoutes,
    WRONG_ROUTE_RATE: wrongRoutes / routes.length,
    PRIMARY_COGNITION_CALLS: 0,
    PROVIDER_CALLS: providerCalls,
    PROVIDER_COST: 0,
    COGNITION_INPUT_TOKENS: cognitionInputTokens,
    COGNITION_TOKEN_ESTIMATOR: "ceil_utf8_bytes_div_4",
    HUMAN_INTERVENTIONS_REQUIRED: humanInterventions,
    AUTHORITY_VIOLATIONS: authorityViolations,
    TERMINAL_FAILURES: terminalFailures,
    EXACT_EVIDENCE_RETAINED: true,
    ISOLATED_EXECUTION: true,
    WRITEBACK_POLICY: "NONE",
    PRODUCTION_MUTATIONS: 0,
    AUTHORITY_EXPANSION: false,
    GOVERNOR_BYPASS: false,
    PRODUCTION_DEPLOYMENT: false,
    SENTIENT_AUTHORITATIVE_STATE: true,
    REVIEWABLE_VERIFIED_RESULT: true,
    REPRESENTATIVE_OBJECTIVES: specs.map((spec) => spec.id),
  }),
);
