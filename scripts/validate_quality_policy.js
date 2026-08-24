import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import playwrightConfig from "../playwright.config.js";

const failures = [];
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);
const qualityWorkflow = readFileSync(
  new URL("../.github/workflows/quality.yml", import.meta.url),
  "utf8"
);
const pagesWorkflow = readFileSync(
  new URL("../.github/workflows/pages.yml", import.meta.url),
  "utf8"
);
const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");

function collectPlaywrightSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) return collectPlaywrightSourceFiles(entryPath);
    return /\.[cm]?[jt]s$/u.test(entry.name) ? [entryPath] : [];
  });
}

function targetPrerequisites(target) {
  const targetPattern = new RegExp(`^${target}:\\s*(.+)$`, "m");
  return makefile.match(targetPattern)?.[1].trim().split(/\s+/u) ?? [];
}

function targetRecipe(target) {
  const targetPattern = new RegExp(`^${target}:.*\\n((?:\\t.*\\n?)*)`, "m");
  return targetPattern.exec(makefile)?.[1] ?? "";
}

function assertPrerequisites(target, requiredPrerequisites) {
  const prerequisites = targetPrerequisites(target);

  for (const prerequisite of requiredPrerequisites) {
    if (!prerequisites.includes(prerequisite)) {
      failures.push(
        `Make target ${target} must run ${prerequisite} so the local quality gate remains fail-closed.`
      );
    }
  }
}

function workflowTriggers(workflow) {
  const triggerBlock = workflow.match(
    /^on:\n([\s\S]*?)^(?:permissions|concurrency|jobs):/mu
  )?.[1];

  return [...(triggerBlock ?? "").matchAll(/^ {2}([a-z_]+):/gmu)].map(
    ([, trigger]) => trigger
  );
}

const qualityTriggers = workflowTriggers(qualityWorkflow);
const automaticQualityTriggers = qualityTriggers.filter(
  (trigger) => trigger !== "workflow_dispatch"
);
const pagesTriggers = workflowTriggers(pagesWorkflow);

if (!qualityTriggers.includes("workflow_dispatch") || automaticQualityTriggers.length > 0) {
  failures.push("Quality must be manual-only with workflow_dispatch as its sole trigger.");
}

if (qualityTriggers.some((trigger) => ["push", "pull_request"].includes(trigger))) {
  failures.push("Quality must not start automatically from push or pull_request.");
}

if (!/^\s+run:\s+make check\s*$/mu.test(qualityWorkflow)) {
  failures.push("Manual Quality must still execute the real make check gate.");
}

if (!/^on:\n\s+push:\n\s+branches:\s*\[main\]/mu.test(pagesWorkflow)) {
  failures.push("Pages must start directly on pushes to main.");
}

if (pagesTriggers.length !== 1 || pagesTriggers[0] !== "push") {
  failures.push("Pages must use push as its sole trigger.");
}

if (/^\s+workflow_run:/mu.test(pagesWorkflow)) {
  failures.push("Pages must not depend on workflow_run from Quality.");
}

if (!/ref:\s*\$\{\{ github\.sha \}\}/u.test(pagesWorkflow)) {
  failures.push("Pages must check out the exact pushed SHA.");
}

assertPrerequisites("test", ["test-unit", "test-browser"]);
assertPrerequisites("check", [
  "test-unit",
  "validate-quality-policy",
  "html",
  "test-browser",
]);

if (!targetRecipe("test-unit").includes("$(MAKE) test-js-unit")) {
  failures.push(
    "Make target test-unit must run test-js-unit so JavaScript unit failures remain blocking."
  );
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
  console.log("Local quality policy is fail-closed; GitHub Quality is manual-only.");
}
