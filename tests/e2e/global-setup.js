import { rmSync } from "node:fs";

// Start each end-to-end run with fresh coverage data.
export default function globalSetup() {
  rmSync("coverage/.v8/e2e", { recursive: true, force: true });
}
