import { readFileSync } from "node:fs";
import playwrightConfig from "../playwright.config.js";

const failures = [];
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);

if (playwrightConfig.retries !== 0) {
  failures.push(
    `Playwright retries must be 0 so every failed test makes the quality gate fail (received ${playwrightConfig.retries}).`
  );
}

for (const project of playwrightConfig.projects ?? []) {
  const effectiveRetries = project.retries ?? playwrightConfig.retries;

  if (effectiveRetries !== 0) {
    failures.push(
      `Playwright project ${project.name ?? "<unnamed>"} must use 0 retries (received ${effectiveRetries}).`
    );
  }
}

for (const scriptName of ["test", "test:browser"]) {
  const command = packageJson.scripts?.[scriptName] ?? "";
  const retryOverride = command.match(/--retries(?:=|\s+)(\d+)/u);

  if (retryOverride && Number(retryOverride[1]) !== 0) {
    failures.push(
      `npm script ${scriptName} overrides Playwright with ${retryOverride[1]} retries.`
    );
  }
}

const webServerCommands = Array.isArray(playwrightConfig.webServer)
  ? playwrightConfig.webServer.map(({ command }) => command)
  : [playwrightConfig.webServer?.command];

for (const command of webServerCommands) {
  if (typeof command !== "string" || !command.includes("--no-watch")) {
    failures.push(
      "Playwright Jekyll servers must use --no-watch so test artifacts cannot trigger partial rebuilds."
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exitCode = 1;
} else {
  console.log("Quality policy is fail-closed.");
}
