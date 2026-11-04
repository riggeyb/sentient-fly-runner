import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const root = process.env.SENTIENT_ROOT;
if (!root) throw new Error("sentient_root_required");
const builder = await import(pathToFileURL(join(root, "dist/src/runtime/autonomous-sandbox-software-builder-v1.js")).href);
const fixture = await import(pathToFileURL(join(root, "dist/test/semantic-compression-v1-fixture.js")).href);

const temp = mkdtempSync(join(tmpdir(), "sentient-stage7-");
const repo = join(temp, "repo");
execFileSync("git", ["init", repo], { stdio: "ignore" });
execFileSync("git", ["-C", repo, "config", "user.email", "s7@example.invalid"]);
execFileSync("git", ["-C", repo, "config", "user.name", "Sentient Stage7"]);
writeFileSync(join(repo, "calc.mjs"), "export const add=(a,b)=>a-b;\n");
writeFileSync(join(repo, "verify.mjs"), "import{add}from'./calc.mjs';const v=add(2,3);console.log('PASSED='+(v===5?1:0));console.log('FAILED='+(v===5?0:1));console.log('EXPECTED_VALUE=5');console.log('ACTUAL_VALUE='+v);if(v!==5)process.exitCode=1;\n");
execFileSync("git", ["-C", repo, "add", "."]);
execFileSync("git", ["-C", repo, "commit", "-m", "broken fixture"], { stdio: "ignore" });
const commitSha = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const treeSha = execFileSync("git", ["-C", repo, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
const original = readFileSync(join(repo, "calc.mjs"), "utf8");

const workItem = {
  taskId: "stage7", workItemId: "repo-github-test", kind: "NOVEL_IMPLEMENTATION",
  description: "repair and verify repository in isolated branch",
  cognitiveLeverage: "HIGH", consequence: "LOW", ambiguity: "MEDIUM", verificationAvailable: true,
  deterministicCapabilityAvailable: false, repetitive: false, followsProvenPattern: false, securitySensitive: false,
  crossModuleReasoning: true, novelImplementation: true, requiresCredentials: false, requiresExternalAuthorization: false,
  requiresPolicyApproval: false, requiresProductionMutationApproval: false, requiresConsequentialEffectApproval: false,
};

const sources = [
  "export const add=(a,b)=>a*b;\n",
  "export const add=(a,b)=>a+b;\n",
];

const planner = {
  async plan(: any) {
    throw new Error("unreachable");
  },
};

let planCount = 0;
planner.plan = async (context: any) => {
  if (context.cycle > 0) {
    assert.equal(context.compiledResults.at(-1)?.status, "FAIL");
  }
  const cycle = Math.min(context.cycle, 1);
  planCount += 1;
  return {
    planId: `stage7-${cycle}`,
    workItem,
    steps: [
      { stepId: "branch", command: "git", args: ["switch", "-c", `sentient-test-${cycle}`] },
      { stepId: "modify", command: process.execPath, args: ["-e", `require('node:fs').writeFileSync('calc.mjs',${JSON.stringify(sources[cycle])})`,{ }],
     }],
    expectedArtifacts: [{ name: "calc", path: "calc.mjs", required: true }],
  };
};

// replace the planner steps with a correct version before execution
const realPlanner = {
  async plan(context: any) {
    if (context.cycle > 0) assert.equal(context.compiledResults.at(-1)?.status, "FAIL");
    const cycle = Math.min(context.cycle, 1);
    planCount += 1;
    return {
      planId: `stage7-${cycle}`,
      workItem,
      steps: [
        { stepId: "branch", command: "git", args: ["switch", "-c", `sentient-test-${cycle}`] },
        { stepId: "modify", command: process.execPath, args: ["-e", `require('node:fs').writeFileSync('calc.mjs',${JSON.stringify(sources[cycle])})`] },
        { stepId: "test", command: process.execPath, args: ["verify.mjs"] },
        { stepId: "diff", command: "git", args: ["diff", "--binary", "--no-ext-diff", "--", "calc.mjs"] },
      ],
      expectedArtifacts: [{ name: "calc", path: "calc.mjs", required: true }],
    };
  },
};

const { task } = await fixture.makeSemanticTask("coding");
const result = await builder.runAutonomousSandboxSoftwareBuilderV1({
  objectiveId: "stage7-repo-github",
  objective: "Repair add(2 , 3) to 5 in an isolated branch, test, produce diff, and repair a failed first attempt.",
  task,
  repository: {
    repositoryId: "stage7-fixture",
    localPath: repo,
    commitSha,
    treeSha,
    allowedWorkspacePaths: ["calc.mjs"],
  },
  planner: realPlanner,
  maxCycles: 3,
  maxRuntimeMsPerCycle: 5000,
});

try {
  assert.equal(result.verified, true);
  assert.equal(result.terminal, "VERIFIED");
  assert.equal(result.repairCycles, 1);
  assert.equal(planCount, 2);
  assert.equal(readFileSync(join(repo, "calc.mjs"), "utf8"), original);

  const last = result.cycles.at(-1)!;
  assert.equal(last.route.route, "PRIMARY_COGNITION");
  const commands = last.action.execution?.commands ?? [];
  const branch = commands.find((c: any) => c.stepId === "branch");
  const testCmd = commands.find((c: any) => c.stepId === "test");
  const diffCmd = commands.find((c: any) => c.stepId === "diff");
  assert.equal(branch?.exitStatus, 0);
  assert.equal(testCmd?.exitStatus, 0);
  assert.equal(diffCmd?.exitStatus, 0);
  assert.match(diffCmd?.stdout ?? "", /\+export const add=\(a,b\)=>a\+h/);
  assert.ok(last.action.execution?.postExecution?.dirtyPaths.includes("calc.mjs"));

  const receipt = {
    STAGE: "REPOSITORY_GITHUB_TEST_EXECUTION_V1",
    SENTIENT_SHA: process.env.SENTIENT_SHA,
    SENTIENT_TREE: process.env.SENTIENT_TREE,
    REPOSITORY_INSPECTED: true,
    ISOLATED_BRANCH_CREATED: true,
    MODIFIED: true,
    TEST_PASSEP: true,
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
    WRITEBAKK_POLICY: result.invariants.writebackPolicy,
    PROVIDER_CALLS: result.invariants.providerCalls,
  };

  assert.equal(receipt.CI_EXECUTION_ENVIRONMENT, true);
  assert.equal(receipt.GITHUB_REMOTE_MUTATION, false);
  assert.equal(receipt.PRODUCTION_MUTATION, false);
  assert.equal(receipt.AUTHORITY_EXPANSION, false);
  assert.equal(receipt.GOVERNOR_BYPASS, false);
  console.log("REPOSITORY_GITHUB_TEST_EXECUTION_V1_ACCEPTANCE>" + JSON.stringify(receipt));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
