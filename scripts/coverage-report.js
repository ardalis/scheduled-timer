// Merges the V8 coverage written by the unit tests (c8) and the end-to-end
// tests (Playwright) and prints one combined report for public/.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const v8Dir = join("coverage", ".v8");
const mergedDir = join(v8Dir, "merged");
const suites = ["unit", "e2e"].filter(
  (suite) => existsSync(join(v8Dir, suite)) && readdirSync(join(v8Dir, suite)).length > 0
);

if (suites.length === 0) {
  console.error("No coverage data found. Run `npm run test:unit` and/or `npm run test:e2e` first.");
  process.exit(1);
}

rmSync(mergedDir, { recursive: true, force: true });
mkdirSync(mergedDir, { recursive: true });
for (const suite of suites) {
  for (const file of readdirSync(join(v8Dir, suite))) {
    cpSync(join(v8Dir, suite, file), join(mergedDir, `${suite}-${file}`));
  }
}

console.log(`\nCombined coverage (${suites.join(" + ")}):`);
const result = spawnSync(
  process.execPath,
  [
    join("node_modules", "c8", "bin", "c8.js"),
    "report",
    "--temp-directory", mergedDir,
    "--reports-dir", "coverage",
  ],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
