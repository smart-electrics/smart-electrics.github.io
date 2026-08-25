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
const codeqlWorkflow = readFileSync(
  new URL("../.github/workflows/codeql.yml", import.meta.url),
  "utf8"
);
const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");
const nodeVersion = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();

function collectTestSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) return collectTestSourceFiles(entryPath);
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

function assertPinnedActions(workflow, workflowName) {
  for (const [, action, revision] of workflow.matchAll(/^\s*uses:\s+([^@\s]+)@([^\s#]+)/gmu)) {
    if (!/^[0-9a-f]{40}$/u.test(revision)) {
      failures.push(`${workflowName} must pin ${action} to an immutable full SHA.`);
    }
  }
}

function assertWorkflowHasAction(workflow, workflowName, action, revision) {
  if (!workflow.includes(`uses: ${action}@${revision}`)) {
    failures.push(`${workflowName} must use ${action}@${revision}.`);
  }
}

const qualityTriggers = workflowTriggers(qualityWorkflow);
const pagesTriggers = workflowTriggers(pagesWorkflow);
const codeqlTriggers = workflowTriggers(codeqlWorkflow);

if (qualityTriggers.join(",") !== "pull_request,workflow_dispatch") {
  failures.push("Quality must trigger only for pull requests to main and workflow_dispatch.");
}

if (!/^on:\n  pull_request:\n    branches: \[main\]\n  workflow_dispatch:/mu.test(qualityWorkflow)) {
  failures.push("Quality pull_request trigger must target main exactly.");
}

if (!/^\s+run:\s+make check\s*$/mu.test(qualityWorkflow)) {
  failures.push("Quality must execute the real make check gate.");
}

if (!/^  quality:\n    name: quality$/mu.test(qualityWorkflow)) {
  failures.push("Quality must retain the required quality job/context name.");
}

if (!/^    timeout-minutes: 45$/mu.test(qualityWorkflow)) {
  failures.push("Quality must allow the bounded 45-minute final acceptance gate.");
}

if (!/^          node-version-file: \.nvmrc$/mu.test(qualityWorkflow) || !/^24\./u.test(nodeVersion)) {
  failures.push("Quality must resolve Node 24 from .nvmrc.");
}

if (!/if: success\(\)[\s\S]*path: artifacts\/final-evidence\/[\s\S]*if-no-files-found: error/u.test(qualityWorkflow)) {
  failures.push("Quality must retain the successful final-evidence artifact and fail when it is missing.");
}

assertPinnedActions(qualityWorkflow, "Quality");
assertWorkflowHasAction(qualityWorkflow, "Quality", "actions/checkout", "3d3c42e5aac5ba805825da76410c181273ba90b1");

if (codeqlTriggers.join(",") !== "push,pull_request,workflow_dispatch,schedule") {
  failures.push("CodeQL must retain push, pull_request, workflow_dispatch, and schedule triggers.");
}

if (!/^on:\n  push:\n    branches: \[main\]\n  pull_request:\n    branches: \[main\]\n  workflow_dispatch:\n  schedule:/mu.test(codeqlWorkflow)) {
  failures.push("CodeQL push and pull_request triggers must target main exactly.");
}

assertPinnedActions(codeqlWorkflow, "CodeQL");
assertWorkflowHasAction(codeqlWorkflow, "CodeQL", "actions/checkout", "3d3c42e5aac5ba805825da76410c181273ba90b1");
assertWorkflowHasAction(codeqlWorkflow, "CodeQL", "github/codeql-action/init", "db488ddef3bf6cb639b32c2e9a7c0a7ea8271d28");
assertWorkflowHasAction(codeqlWorkflow, "CodeQL", "github/codeql-action/analyze", "db488ddef3bf6cb639b32c2e9a7c0a7ea8271d28");

const codeqlLanguages = [...codeqlWorkflow.matchAll(/^\s*- language: ([a-z-]+)$/gmu)].map(([, language]) => language);
if (codeqlLanguages.join(",") !== "actions,javascript-typescript,python,ruby") {
  failures.push("CodeQL must retain the actions, JavaScript, Python, and Ruby matrix.");
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

assertPinnedActions(pagesWorkflow, "Pages");
assertWorkflowHasAction(pagesWorkflow, "Pages", "actions/checkout", "3d3c42e5aac5ba805825da76410c181273ba90b1");

assertPrerequisites("test", ["test-unit", "test-browser"]);
assertPrerequisites("check", [
  "test-unit",
  "validate-quality-policy",
  "validate-production-assets",
  "validate-public-claims",
  "html",
  "test-browser",
]);

if (!targetRecipe("test-unit").includes("$(MAKE) test-js-unit")) {
  failures.push(
    "Make target test-unit must run test-js-unit so JavaScript unit failures remain blocking."
  );
}

if (!targetRecipe("test-unit").includes("tests/unit/production_assets_contract_test.rb")) {
  failures.push(
    "Make target test-unit must run the production asset contract so stale media metadata remains blocking."
  );
}

if (!targetRecipe("test-unit").includes("tests/unit/public_claims_contract_test.rb")) {
  failures.push(
    "Make target test-unit must run the public claims contract so source and built copy remain blocking."
  );
}

if (!targetRecipe("validate-production-assets").includes("scripts/validate_production_assets.rb")) {
  failures.push("Make target validate-production-assets must execute the production WebP validator.");
}

if (!targetRecipe("validate-public-claims").includes("scripts/validate_public_claims.rb")) {
  failures.push("Make target validate-public-claims must execute the public claims validator.");
}

if (packageJson.scripts?.["test:unit"] !== "node --test") {
  failures.push("npm test:unit must auto-discover every JavaScript unit test with node --test.");
}

if (playwrightConfig.forbidOnly !== true) {
  failures.push("Playwright forbidOnly must be true in every local and CI run.");
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

const finalAcceptanceProjects = (playwrightConfig.projects ?? []).filter(
  (project) => project.name === "final-acceptance"
);
if (finalAcceptanceProjects.length !== 1 || !finalAcceptanceProjects[0].testMatch?.test("final_acceptance.spec.js")) {
  failures.push(
    "Playwright must run final_acceptance.spec.js exactly once in the final-acceptance project."
  );
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

for (const filePath of collectTestSourceFiles(join(repositoryRoot, "tests"))) {
  const source = readFileSync(filePath, "utf8");
  const forbiddenAnnotation = /\b(?:test|describe|testInfo)\s*(?:\.\s*describe\s*)?\.\s*(?:skip|fixme|only)\s*\(/gu;

  for (const match of source.matchAll(forbiddenAnnotation)) {
    const line = source.slice(0, match.index).split("\n").length;
    failures.push(
      `${relative(repositoryRoot, filePath)}:${line} uses ${match[0].replace(/\s+/gu, "")} ` +
      "so the test suite can avoid the real quality state."
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
  console.log("Quality policy is fail-closed and blocks pull requests.");
}
