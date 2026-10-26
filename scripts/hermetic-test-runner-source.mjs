import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const testDir = join(process.cwd(), "dist", "test");
const integrationTests = new Set([
  "permanent-continuation-http.test.js",
  "permanent-continuation-multiprocess.test.js",
]);
const files = readdirSync(testDir).filter((file) => file.endsWith(".test.js")).sort();
for (const file of integrationTests) {
  if (!files.includes(file)) throw new Error(`expected integration test missing: ${file}`);
}
const discoveredDbTests = files
  .filter((file) => readFileSync(join(testDir, file), "utf8").includes("SENTIENT_TEST_DATABASE_URL"))
  .sort();
const expectedDbTests = [...integrationTests].sort();
if (JSON.stringify(discoveredDbTests) !== JSON.stringify(expectedDbTests)) {
  throw new Error(`database test classification drift: ${JSON.stringify(discoveredDbTests)}`);
}
const hermeticTests = files.filter((file) => !integrationTests.has(file));
if (hermeticTests.length === 0) throw new Error("hermetic test set is empty");
console.log(`HERMETIC_TEST_FILES=${hermeticTests.length}`);
console.log(`DB_INTEGRATION_TEST_FILES=${expectedDbTests.length}`);
const result = spawnSync(process.execPath, ["--test", ...hermeticTests.map((file) => join(testDir, file))], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`hermetic test process terminated by ${result.signal}`);
process.exit(result.status ?? 1);
