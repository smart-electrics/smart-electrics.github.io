import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const checkoutPin = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const codeqlPin = "db488ddef3bf6cb639b32c2e9a7c0a7ea8271d28";
const pullRequestHeadRef = /ref:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*&&\s*github\.event\.pull_request\.head\.sha\s*\|\|\s*github\.sha\s*\}\}/u;

function runPolicyAgainstWorkflowEdits(edits) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "smart-electrics-quality-policy-"));

  try {
    for (const path of [".github", "Makefile", ".nvmrc", "package.json", "playwright.config.js", "tests", "scripts"]) {
      cpSync(join(repositoryRoot, path), join(fixtureRoot, path), { recursive: true });
    }
    symlinkSync(join(repositoryRoot, "node_modules"), join(fixtureRoot, "node_modules"), "dir");

    for (const [path, edit] of Object.entries(edits)) {
      const filePath = join(fixtureRoot, path);
      const source = readFileSync(filePath, "utf8");
      writeFileSync(filePath, edit(source));
    }

    return spawnSync(process.execPath, ["scripts/validate_quality_policy.js"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: { ...process.env, SMART_ELECTRICS_POLICY_ROOT: fixtureRoot }
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test("Quality is a pinned pull-request gate with dispatch and retained success evidence", () => {
  const workflow = read(".github/workflows/quality.yml");

  assert.match(workflow, /^on:\n  pull_request:\n    branches: \[main\]\n  workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^  push:/mu);
  assert.match(workflow, /^  quality:\n    name: quality$/mu);
  assert.match(workflow, /^    timeout-minutes: 60$/mu);
  assert.match(workflow, new RegExp(`uses: actions/checkout@${checkoutPin}`));
  assert.match(workflow, pullRequestHeadRef, "Quality must check out the exact PR head SHA while retaining github.sha for dispatch.");
  assert.match(workflow, /uses: ruby\/setup-ruby@[0-9a-f]{40}/u);
  assert.match(workflow, /uses: actions\/setup-node@[0-9a-f]{40}/u);
  assert.match(workflow, /^          node-version-file: \.nvmrc$/mu);
  assert.match(read(".nvmrc").trim(), /^24\./u);
  assert.match(workflow, /^        run: make check$/mu);
  assert.match(
    workflow,
    /if: success\(\)[\s\S]*uses: actions\/upload-artifact@[0-9a-f]{40}[\s\S]*path: artifacts\/final-evidence\/[\s\S]*if-no-files-found: error/u
  );
});

test("the quality policy requires the bounded 60-minute hosted-runner budget", () => {
  const sufficientBudget = runPolicyAgainstWorkflowEdits({
    ".github/workflows/quality.yml": (source) =>
      source.replace(/timeout-minutes: \d+/u, "timeout-minutes: 60")
  });
  assert.equal(sufficientBudget.status, 0, sufficientBudget.stderr);

  for (const minutes of [59, 61]) {
    const unsafeBudget = runPolicyAgainstWorkflowEdits({
      ".github/workflows/quality.yml": (source) =>
        source.replace(/timeout-minutes: \d+/u, `timeout-minutes: ${minutes}`)
    });
    assert.notEqual(
      unsafeBudget.status,
      0,
      `Quality must reject a ${minutes}-minute execution budget`
    );
    assert.match(unsafeBudget.stderr, /60-minute final acceptance gate/iu);
  }
});

test("CodeQL remains an automatic and manual gate with every action pinned", () => {
  const workflow = read(".github/workflows/codeql.yml");

  assert.match(
    workflow,
    /^on:\n  push:\n    branches: \[main\]\n  pull_request:\n    branches: \[main\]\n  workflow_dispatch:\n  schedule:/mu
  );
  assert.match(workflow, new RegExp(`uses: actions/checkout@${checkoutPin}`));
  assert.match(workflow, pullRequestHeadRef, "CodeQL must check out the exact PR head SHA while retaining github.sha for non-PR runs.");
  assert.match(workflow, new RegExp(`uses: github/codeql-action/init@${codeqlPin}`));
  assert.match(workflow, new RegExp(`uses: github/codeql-action/analyze@${codeqlPin}`));
  assert.doesNotMatch(workflow, /uses:\s+[^\n]+@v\d+/u);
});

test("the quality policy rejects a missing or unsafe pull-request checkout ref", () => {
  for (const [path, label] of [
    [".github/workflows/quality.yml", "Quality"],
    [".github/workflows/codeql.yml", "CodeQL"]
  ]) {
    const missingRef = runPolicyAgainstWorkflowEdits({
      [path]: (source) => source.replace(/^\s+ref:.*\n/mu, "")
    });
    assert.notEqual(missingRef.status, 0, `${label} must fail when checkout ref is removed`);
    assert.match(missingRef.stderr, new RegExp(`${label}.*pull-request.*head SHA`, "iu"));

    const unsafeRef = runPolicyAgainstWorkflowEdits({
      [path]: (source) => source.replace(pullRequestHeadRef, "ref: ${{ github.sha }}")
    });
    assert.notEqual(unsafeRef.status, 0, `${label} must fail when PR checkout falls back to github.sha`);
    assert.match(unsafeRef.stderr, new RegExp(`${label}.*pull-request.*head SHA`, "iu"));
  }
});

test("the local gate retains production assets, public claims, and exactly one dedicated project for each final journey", () => {
  const makefile = read("Makefile");
  const playwright = read("playwright.config.js");

  assert.match(makefile, /^validate-production-assets:.*\n\tbundle exec ruby scripts\/validate_production_assets\.rb$/mu);
  assert.match(makefile, /^validate-public-claims: build(?:\s+##.*)?$/mu);
  assert.match(makefile, /^check:.*\bvalidate-production-assets\b.*\bvalidate-public-claims\b.*\btest-browser\b/mu);
  assert.match(makefile, /^\tbundle exec ruby -Itest tests\/unit\/production_assets_contract_test\.rb$/mu);
  assert.match(makefile, /^\tbundle exec ruby -Itest tests\/unit\/public_claims_contract_test\.rb$/mu);
  assert.match(playwright, /name: "final-acceptance"/u);
  assert.match(playwright, /testMatch: finalAcceptanceFile/u);
  assert.match(playwright, /const motionChoreographyFile = \/motion_choreography\\\.spec\\\.js\/u;/u);
  assert.match(playwright, /name: "motion-choreography"[\s\S]*testMatch: motionChoreographyFile/u);
  assert.match(playwright, /testIgnore: \[responsiveMatrixFile, finalAcceptanceFile, motionChoreographyFile\]/u);
});

test("the quality policy bounds every action and permits only the measured choreography timeout", () => {
  const playwright = read("playwright.config.js");
  const choreography = read("tests/browser/motion_choreography.spec.js");

  assert.match(playwright, /^  actionTimeout: 10_000,$/mu);
  assert.doesNotMatch(playwright, /^  timeout:/mu);
  assert.equal(choreography.match(/test\.setTimeout\(45_000\);/gu)?.length, 1);

  const unsafeActionTimeout = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) => source.replace("actionTimeout: 10_000", "actionTimeout: 0")
  });
  assert.notEqual(unsafeActionTimeout.status, 0, "the policy must reject an unbounded action timeout");
  assert.match(unsafeActionTimeout.stderr, /action timeout/iu);

  const unsafeGlobalTimeout = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) => source.replace("actionTimeout: 10_000,", "actionTimeout: 10_000,\n  timeout: 60_000,")
  });
  assert.notEqual(unsafeGlobalTimeout.status, 0, "the policy must reject a global test timeout");
  assert.match(unsafeGlobalTimeout.stderr, /global test timeout/iu);

  const unmeasuredChoreographyTimeout = runPolicyAgainstWorkflowEdits({
    "tests/browser/motion_choreography.spec.js": (source) => source.replace("test.setTimeout(45_000);", "test.setTimeout(44_000);")
  });
  assert.notEqual(unmeasuredChoreographyTimeout.status, 0, "the policy must reject an unmeasured choreography timeout");
  assert.match(unmeasuredChoreographyTimeout.stderr, /45_000ms choreography test timeout/iu);

  const unrelatedScopedTimeout = runPolicyAgainstWorkflowEdits({
    "tests/browser/smart_home.spec.js": (source) => source.replace('test("upgrades', 'test.setTimeout(45_000);\n\ntest("upgrades')
  });
  assert.notEqual(unrelatedScopedTimeout.status, 0, "the policy must reject scoped timeout exceptions outside the measured choreography test");
  assert.match(unrelatedScopedTimeout.stderr, /only measured test-scoped timeout/iu);

  const projectTimeout = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) => source.replace('name: "motion-choreography",', 'name: "motion-choreography",\n      timeout: 60_000,')
  });
  assert.notEqual(projectTimeout.status, 0, "the policy must reject project-level test timeouts");
  assert.match(projectTimeout.stderr, /project.*test timeout/iu);

  for (const [label, injection] of [
    ["test.slow", "test.slow();"],
    ["testInfo.setTimeout", "testInfo.setTimeout(90_000);"],
    ["computed test timeout", 'test["setTimeout"](90_000);'],
    ["bound test timeout", "const extendTestBudget = test.setTimeout.bind(test); extendTestBudget(90_000);"],
    ["describe timeout", "test.describe.configure({ timeout: 90_000 });"],
    ["quoted describe timeout", 'test.describe.configure({ "timeout": 90_000 });'],
    ["computed describe retries", 'test.describe.configure({ ["retries"]: 1 });']
  ]) {
    const bypass = runPolicyAgainstWorkflowEdits({
      "tests/browser/smart_home.spec.js": (source) => source.replace('test("upgrades', `${injection}\n\ntest("upgrades`)
    });
    assert.notEqual(bypass.status, 0, `the policy must reject ${label}`);
    assert.match(bypass.stderr, /unaudited Playwright timeout API/iu);
  }
});

test("the quality policy keeps local and CI browser execution deterministic", () => {
  const playwright = read("playwright.config.js");

  assert.match(playwright, /^  workers: 1,$/mu);

  const unsafeWorkers = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) => source.replace("workers: 1", "workers: 4")
  });
  assert.notEqual(unsafeWorkers.status, 0, "the policy must reject parallel browser workers");
  assert.match(unsafeWorkers.stderr, /worker/iu);
});

test("the local quality validator approves the final PR-gate policy", () => {
  const result = spawnSync(process.execPath, ["scripts/validate_quality_policy.js"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Quality policy is fail-closed and blocks pull requests/u);
});
