import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const sentientRoot = process.env.SENTIENT_ROOT;
if (!sentientRoot) throw new Error("sentient_root_required");

const builder = await import(
  pathToFileURL(join(sentientRoot, "dist/src/runtime/autonomous-sandbox-software-builder-v1.js")).href
);
const fixture = await import(
  pathToFileURL(join(sentientRoot, "dist/test/semantic-compression-v1-fixture.js")).href
);

const temp = mkdtempSync(join(tmpdir(), "sentient-stage7-"));
const repo = join(temp, "repo");

function git(args: string[], options: Record<string, unknown> = {}) {
  return execFileSync("git", args, { ...options, encoding: "utf8" as const });
}

git(["init", repo], { stdio: "ignore" });
git(["-C", repo, "config", "user.email", "s7@example.invalid"]);
git(["-C", repo, "config", "user.name", "Sentient Stage7"]);
writeFileSync(join(repo, "calc.mjs"), "export const add=(a,b)=>a-b;\n");
writeFileSync(
  join(repo, "verify.mjs"),
  "import{add}from'./calc.mjs';const v=add(2,3);console.log('PASSED='+(v===5?1:0));console.log('FAILED='+(v===5?0:1));console.log('EXPECTED_VALUE=5');console.log('ACTUAL_VALUE='+v);if(v!==5)process.exitCode=1;\n",
);
git(["-C", repo, "add", "."]);
git(["-C", repo, "commit", "-m", "broken fixture"], { stdio: "ignore" });

const commitSha = git(["-C", repo, "rev-parse", "HEAD"]).trim();
const treeSha = git(["-C", repo, "rev-parse", "HEAD{tree}"]).trim();
const original = readFileSync(join(repo, "calc.mjs"), "utf8");

const workItem = {
  taskId: "stage7",
  workItemId: "repo-github-test",
  kind: "NOVEL_IMPLEMTATION",
  description: "repair and verify repository in isolated branch",
  cognitiveLeverage: "HIGH",
  consequence: "LOW",
  ambiguity: "MEDIUM",
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

const sources = [
  "export const add=(a,b)=>a*b;\n",
  "export const add=(a,b)=>a+b;\n",
];

let planCount = 0;
const planner = {
  async plan(context: any) {
    if (context.cycle > 0) {
      assert.equal(context.compiledResults.at(-1)?.status, "FAIL");
    }
    const cycle = Math.min(context.cycle, 1);
    planCount += 1;
    return {
      planId: `stage7-${cycle}`,
      workItem,
      steps: [
        {
          stepId: "branch",
          command: "git",
          args: ["switch", "-c", `sentient-test-${cycle}`],
        },
        {
          stepId: "modify",
          command: process.execPath,
          args: [
            "-e",
            `require('node:fs').writeFileSync('calc.mjs',${JSON.stringify(sources[cycle])})`,
          ],
        },
        { stepId: "test", command: process.execPath, args: ["verify.mjs"] },
        {
          stepId: "diff",
          command: "git",
          args: ["diff", "--binary", "--no-ext-diff", "--", "calc.mjs"],
        },
      ],
      expectedArtifacts: [{ name: "calc", path: "calc.mjs", required: true }],
    };
  },
};

const { task } = await fixture.makeSemanticTask("coding");

try {
  const result = await builder.runAutonomousSandboxSoftwareBuilderV1({
    objectiveId: "stage7-repo-github",
    objective:
      "Repair add(2,3) to 5 in an isolated branch, test, produce a reviewable diff, and repair a failed first attempt.",
    task,
    repository: {
      repositoryId: "stage7-fixture",
      localPath: repo,
      commitSha,
      treeSha,
      allowedWorkspacePaths: ["calc.mjs"],
    },
    planner,
    maxCycles: 3,
    maxRuntimeMsPerCycle: 5_000,
  });

  assert.equal(result.verified, true);
  assert.equal(result.terminal, "VERIFIED");
  assert.equal(result.repairCycles, 1);
  assert.equal(planCount, 2);

  // The accepted Action Fabric executor uses writeback NONE.
  assert.equal(readFileSync(join(repo, "calc.mjs"), "utf8"), original);
  assert.equal(git(["-C", repo, "branch", "--list", "sentient-test-*"]).trim(), "");

  const last = result.cycles.at(-1);
  assert.ok(last);
  assert.equal(last.route.route, "PRIMARY_COGNITION");

  const commands = last.action.execution?.commands ?? [];
  const branch = commands.find((command: any) => command.stepId === "branch");
  const testCommand = commands.find((command: any) => command.stepId === "test");
  const diffCommand = commands.find((command: any) => command.stepId === "diff");

  assert.equal(branch?.exitStatus, 0);
  assert.equal(testCommand?.exitStatus, 0);
  assert.equal(diffCommand?.exitStatus, 0);
  assert.match(
    diffCommand?.stdout ?? "",
    /\+export const add=\(a,b\)=>a\+b;/,
  );
  assert.ok(
    last.action.execution?.postExecution?.dirtyPaths.includes("calc.mjs"),
  );

  const receipt = {
    STAGE: "REPOSITORY_GITHUB_TEST_EXECUTION_V1",
    SENTIENT_SHA: process.env.SENTIENT_SHA,
    SENTIENT_TREE: process.env.SENTIENT_TREE,
    REPOSITORY_INSPECTED: true,
    ISOLATED_BRANCH_CREATED: true,
    MODIFIED: true,
    TEST_PASSED: true,
    REVIEWABLE_DIFF_PRODUCED: true,
    RECURSIVE_REPAIR: true,
    REPAIR_CYCLES: result.repairCycles,
    CI_EXECUTION_ENVIRONMENT: process.env.GITHUB_ACTIONS === "true",
    GITHUB_REMOTE_MUTATION: false,
    TEST_PR_CREATED: false,
    MERGE_RELEASE: false,
    PRODUCTION_MUTATION: result.invariants.productionMutation,
    AUTHORITY_EXPANSION: result.invariants.authorityExpanded,
    GOVERNOR_BYPASS: result.invariants.governorBypass,
    WRITEBACK_POLICY: result.invariants.writebackPolicy,
    PROVIDER_CALLS: result.invariants.providerCalls,
  };

  assert.equal(receipt.CI_EXECUTION_ENVIRONMENT, true);
  assert.equal(receipt.GITHUB_REMOTE_MUTATION, false);
  assert.equal(receipt.PRODUCTION_MUTATION, false);
  assert.equal(receipt.AUTHORITY_EXPANSION, false);
  assert.equal(receipt.GOVERNOR_BYPASS, false);
  assert.equal(receipt.WRITEBACK_POLICY, "NONE");
  assert.equal(receipt.PROVIDER_CALLS, 0);

  console.log(
    "REPOSITORY_GITHUB_TEST_EXECUTION_V1_ACCEPTANCE>" +
      JSON.stringify(receipt),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
