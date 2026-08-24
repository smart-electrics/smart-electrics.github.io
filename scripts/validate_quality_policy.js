import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import playwrightConfig from "../playwright.config.js";

const failures = [];
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);

function collectPlaywrightSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) return collectPlaywrightSourceFiles(entryPath);
    return /\.[cm]?[jt]s$/u.test(entry.name) ? [entryPath] : [];
  });
}

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

for (const filePath of collectPlaywrightSourceFiles(join(repositoryRoot, "tests/browser"))) {
  const source = readFileSync(filePath, "utf8");
  const forbiddenAnnotation = /\b(?:test|testInfo)\s*(?:\.\s*describe\s*)?\.\s*(?:skip|fixme)\s*\(/gu;

  for (const match of source.matchAll(forbiddenAnnotation)) {
    const line = source.slice(0, match.index).split("\n").length;
    failures.push(
      `${relative(repositoryRoot, filePath)}:${line} uses ${match[0].replace(/\s+/gu, "")} ` +
      "so the test suite can report a non-executed check instead of the real quality state."
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
