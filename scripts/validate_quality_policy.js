import playwrightConfig from "../playwright.config.js";

const failures = [];

if (playwrightConfig.retries !== 0) {
  failures.push(
    `Playwright retries must be 0 so every failed test makes the quality gate fail (received ${playwrightConfig.retries}).`
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exitCode = 1;
} else {
  console.log("Quality policy is fail-closed.");
}
