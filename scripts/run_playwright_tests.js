import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const AUDITED_PLAYWRIGHT_CONFIG_SHA256 =
  "de1f2bf0cc7c97df5093b47d05bd9b2438260345211c71109d5f96fb4e116203";

const forbiddenEnvironment = [
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_TEST_CONTEXT",
  "PLAYWRIGHT_BASE_URL"
].filter((name) => (process.env[name] ?? "").trim() !== "");

if (process.argv.length !== 2 || forbiddenEnvironment.length > 0) {
  console.error(
    "Quality policy violation: Playwright arguments and inherited execution controls are forbidden " +
    `(${forbiddenEnvironment.join(", ") || "arguments"}).`
  );
  process.exitCode = 1;
} else {
  const policyResult = spawnSync(
    process.execPath,
    ["scripts/validate_quality_policy.js"],
    { stdio: "inherit" }
  );

  if (policyResult.error || policyResult.status !== 0) {
    console.error(
      policyResult.error
        ? `Unable to run the final Playwright policy check: ${policyResult.error.message}`
        : "Quality policy violation: the final Playwright policy check failed."
    );
    process.exitCode = 1;
  } else {
    const configSource = readFileSync(new URL("../playwright.config.js", import.meta.url));
    const configDigest = createHash("sha256").update(configSource).digest("hex");

    if (configDigest !== AUDITED_PLAYWRIGHT_CONFIG_SHA256) {
      console.error(
        "Quality policy violation: Playwright config does not match the audited source digest."
      );
      process.exitCode = 1;
    } else {
      const result = spawnSync(
        process.execPath,
        ["node_modules/@playwright/test/cli.js", "test"],
        { stdio: "inherit" }
      );
      process.exitCode = result.error ? 1 : (result.status ?? 1);
      if (result.error) {
        console.error(`Unable to run the Playwright gate: ${result.error.message}`);
      }
    }
  }
}
