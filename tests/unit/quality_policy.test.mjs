import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import FailOnSkippedReporter from "../../scripts/fail_on_skipped_reporter.js";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const checkoutPin = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const codeqlPin = "db488ddef3bf6cb639b32c2e9a7c0a7ea8271d28";
const pullRequestHeadRef = /ref:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*&&\s*github\.event\.pull_request\.head\.sha\s*\|\|\s*github\.sha\s*\}\}/u;
const configDigestFailure = /audited source digest/iu;

function runPolicyAgainstWorkflowEdits(edits, mutateFixture = null) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "smart-electrics-quality-policy-"));

  try {
    for (const path of [".github", "Makefile", ".nvmrc", "package.json", "playwright.config.js", "tests", "scripts"]) {
      cpSync(join(repositoryRoot, path), join(fixtureRoot, path), { recursive: true });
    }
    symlinkSync(join(repositoryRoot, "node_modules"), join(fixtureRoot, "node_modules"), "dir");

    for (const [path, edit] of Object.entries(edits)) {
      const filePath = join(fixtureRoot, path);
      const source = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
      writeFileSync(filePath, edit(source));
    }
    mutateFixture?.(fixtureRoot);

    return spawnSync(process.execPath, ["scripts/validate_quality_policy.js"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: { ...process.env, SMART_ELECTRICS_POLICY_ROOT: fixtureRoot }
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function runBrowserGateAfterInitialPolicyEdits(edits) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "smart-electrics-browser-policy-"));

  try {
    const fixturePaths = [
      ".github",
      "Makefile",
      ".nvmrc",
      "package.json",
      "playwright.config.js",
      "tests",
      "scripts"
    ];
    for (const path of fixturePaths) {
      cpSync(join(repositoryRoot, path), join(fixtureRoot, path), { recursive: true });
    }
    symlinkSync(join(repositoryRoot, "node_modules"), join(fixtureRoot, "node_modules"), "dir");
    const fixtureEnvironment = {
      ...process.env,
      SMART_ELECTRICS_POLICY_ROOT: fixtureRoot
    };
    const forbiddenEnvironment = [
      "NODE_OPTIONS",
      "NODE_PATH",
      "NODE_TEST_CONTEXT",
      "PLAYWRIGHT_BASE_URL"
    ];
    for (const name of forbiddenEnvironment) {
      delete fixtureEnvironment[name];
    }
    const initialPolicy = spawnSync(
      process.execPath,
      ["scripts/validate_quality_policy.js"],
      { cwd: fixtureRoot, encoding: "utf8", env: fixtureEnvironment }
    );
    assert.equal(initialPolicy.status, 0, initialPolicy.stderr);

    for (const [path, edit] of Object.entries(edits)) {
      const filePath = join(fixtureRoot, path);
      writeFileSync(filePath, edit(readFileSync(filePath, "utf8")));
    }

    return spawnSync(process.execPath, ["scripts/run_playwright_tests.js"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: fixtureEnvironment
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test("full Quality runs only through the canonical local Make gate", () => {
  const workflowEntries = readdirSync(join(repositoryRoot, ".github", "workflows")).sort();
  const makefile = read("Makefile");

  assert.deepEqual(workflowEntries, ["codeql.yml", "pages.yml"]);
  assert.match(read(".nvmrc").trim(), /^24\./u);
  assert.match(
    makefile,
    /^check:.*\btest-browser\b.*## Повний локальний quality gate$/mu
  );
  assert.match(
    makefile,
    /^test-browser:.*\n\tnode scripts\/validate_quality_policy\.js\n\tnode scripts\/run_playwright_tests\.js$/mu
  );

  const strippedCheckTarget = runPolicyAgainstWorkflowEdits({
    "Makefile": (source) => source.replace(/^check:.*$/mu, "check: ## stripped local gate")
  });
  assert.notEqual(strippedCheckTarget.status, 0, "the external policy preflight must reject a stripped check target");
  assert.match(strippedCheckTarget.stderr, /Make target check must retain its exact ordered prerequisite graph/iu);
});

test("the quality policy rejects any remote Quality workflow alias", () => {
  for (const path of [
    ".github/workflows/quality.yml",
    ".github/workflows/pr-quality.yml",
    ".github/workflows/quality.yaml"
  ]) {
    const remoteQuality = runPolicyAgainstWorkflowEdits({
      [path]: () => [
        "name: Quality",
        "on:",
        "  pull_request:",
        "jobs:",
        "  quality:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: make -f Makefile check",
        ""
      ].join("\n")
    });
    assert.notEqual(remoteQuality.status, 0, `${path} must not restore remote full Quality`);
    assert.match(remoteQuality.stderr, /only CodeQL and Pages.*Quality runs locally only/iu);
  }

  const symlinkedQuality = runPolicyAgainstWorkflowEdits({}, (fixtureRoot) => {
    symlinkSync(
      "codeql.yml",
      join(fixtureRoot, ".github", "workflows", "quality.yml")
    );
  });
  assert.notEqual(symlinkedQuality.status, 0, "a symlink must not restore remote Quality");
  assert.match(symlinkedQuality.stderr, /only CodeQL and Pages.*Quality runs locally only/iu);
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
  const path = ".github/workflows/codeql.yml";
  const missingRef = runPolicyAgainstWorkflowEdits({
    [path]: (source) => source.replace(/^\s+ref:.*\n/mu, "")
  });
  assert.notEqual(missingRef.status, 0, "CodeQL must fail when checkout ref is removed");
  assert.match(missingRef.stderr, /CodeQL.*pull-request.*head SHA/iu);

  const unsafeRef = runPolicyAgainstWorkflowEdits({
    [path]: (source) => source.replace(pullRequestHeadRef, "ref: ${{ github.sha }}")
  });
  assert.notEqual(unsafeRef.status, 0, "CodeQL must fail when PR checkout falls back to github.sha");
  assert.match(unsafeRef.stderr, /CodeQL.*pull-request.*head SHA/iu);
});

test("the local gate retains production assets, public claims, and exactly one dedicated project for each final journey", () => {
  const makefile = read("Makefile");
  const packageJson = JSON.parse(read("package.json"));
  const playwright = read("playwright.config.js");

  assert.match(makefile, /^validate-production-assets:.*\n\tbundle exec ruby scripts\/validate_production_assets\.rb$/mu);
  assert.match(makefile, /^validate-public-claims: build(?:\s+##.*)?$/mu);
  assert.match(makefile, /^check:.*\bvalidate-production-assets\b.*\bvalidate-public-claims\b.*\btest-browser\b/mu);
  assert.match(makefile, /^\tsh scripts\/run_ruby_test\.sh tests\/unit\/production_assets_contract_test\.rb$/mu);
  assert.match(makefile, /^\tsh scripts\/run_ruby_test\.sh tests\/unit\/public_claims_contract_test\.rb$/mu);
  assert.match(playwright, /name: "final-acceptance"/u);
  assert.match(playwright, /testMatch: finalAcceptanceFile/u);
  assert.match(playwright, /const motionChoreographyFile = \/motion_choreography\\\.spec\\\.js\/u;/u);
  assert.match(playwright, /name: "motion-choreography"[\s\S]*testMatch: motionChoreographyFile/u);
  assert.match(playwright, /testIgnore: \[responsiveMatrixFile, finalAcceptanceFile, motionChoreographyFile\]/u);
  assert.equal(packageJson.scripts["test:unit"], "node scripts/run_node_tests.js");
  assert.equal(packageJson.scripts.test, "node scripts/run_playwright_tests.js");
  assert.equal(packageJson.scripts["test:browser"], "node scripts/run_playwright_tests.js");
  assert.equal(packageJson.devDependencies.acorn, "8.18.0");
  assert.equal(playwright.match(/\["\.\/scripts\/fail_on_skipped_reporter\.js"\]/gu)?.length, 1);
  assert.match(makefile, /^test-js-unit:.*\n\tnode scripts\/run_node_tests\.js$/mu);
  assert.match(
    makefile,
    /^test-browser:.*\n\tnode scripts\/validate_quality_policy\.js\n\tnode scripts\/run_playwright_tests\.js$/mu
  );
});

test("runtime reporters turn skipped Playwright and Node tests into failures", () => {
  const messages = [];
  const reporter = new FailOnSkippedReporter({ report: (message) => messages.push(message) });

  reporter.onTestEnd(
    { expectedStatus: "skipped", titlePath: () => ["project", "hidden test"] },
    { status: "skipped" }
  );
  assert.deepEqual(reporter.onEnd({ status: "passed" }), { status: "failed" });
  assert.match(messages.join("\n"), /1 Playwright test\(s\).*non-passing/iu);

  const expectedFailureReporter = new FailOnSkippedReporter({
    report: (message) => messages.push(message)
  });
  expectedFailureReporter.onTestEnd(
    { expectedStatus: "failed", title: "masked regression" },
    { status: "failed" }
  );
  assert.deepEqual(expectedFailureReporter.onEnd({ status: "passed" }), { status: "failed" });

  const cleanReporter = new FailOnSkippedReporter({ report: (message) => messages.push(message) });
  cleanReporter.onBegin({}, { allTests: () => Array.from({ length: 683 }) });
  cleanReporter.onTestEnd({ title: "executed test" }, { status: "passed" });
  assert.equal(cleanReporter.onEnd({ status: "passed" }), undefined);

  const incompleteReporter = new FailOnSkippedReporter({
    report: (message) => messages.push(message)
  });
  incompleteReporter.onBegin({}, { allTests: () => Array.from({ length: 5 }) });
  assert.deepEqual(incompleteReporter.onEnd({ status: "passed" }), { status: "failed" });
  assert.match(messages.join("\n"), /incomplete suite.*expected=683, received=5/iu);

  const fixtureRoot = mkdtempSync(join(tmpdir(), "smart-electrics-node-skip-"));
  const rubyFixtureRoot = mkdtempSync(
    join(repositoryRoot, "tests", "unit", ".quality-policy-ruby-")
  );
  const fixturePath = join(fixtureRoot, "skipped.test.mjs");
  const nestedNodeEnvironment = { ...process.env };
  delete nestedNodeEnvironment.NODE_OPTIONS;
  delete nestedNodeEnvironment.NODE_TEST_CONTEXT;

  try {
    writeFileSync(
      fixturePath,
      [
        'import test from "node:test";',
        'test.skip("hidden", () => {});',
        'test.todo("unfinished");'
      ].join("\n")
    );
    const skippedRun = spawnSync(
      process.execPath,
      ["scripts/run_node_tests.js", fixturePath],
      { cwd: repositoryRoot, encoding: "utf8", env: nestedNodeEnvironment }
    );
    assert.notEqual(skippedRun.status, 0);
    assert.match(skippedRun.stderr, /1 skipped and 1 todo test/iu);

    for (const option of ["--test-only", "--test-shard=999/999"]) {
      const selectionOverride = spawnSync(
        process.execPath,
        ["scripts/run_node_tests.js", option, fixturePath],
        { cwd: repositoryRoot, encoding: "utf8", env: nestedNodeEnvironment }
      );
      assert.notEqual(selectionOverride.status, 0);
      assert.match(selectionOverride.stderr, /Node test options and inherited test controls are forbidden/iu);
    }

    const inheritedSelection = spawnSync(
      process.execPath,
      ["scripts/run_node_tests.js", fixturePath],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...nestedNodeEnvironment,
          NODE_OPTIONS: "--test-name-pattern=__no_matching_test__"
        }
      }
    );
    assert.notEqual(inheritedSelection.status, 0);
    assert.match(inheritedSelection.stderr, /NODE_OPTIONS/iu);

    const selectedPlaywrightRun = spawnSync(
      process.execPath,
      ["scripts/run_playwright_tests.js", "--project=mobile-375"],
      { cwd: repositoryRoot, encoding: "utf8", env: nestedNodeEnvironment }
    );
    assert.notEqual(selectedPlaywrightRun.status, 0);
    assert.match(selectedPlaywrightRun.stderr, /Playwright arguments.*are forbidden/iu);

    const emptyNodeFixturePath = join(fixtureRoot, "empty.test.mjs");
    writeFileSync(emptyNodeFixturePath, "");
    const emptyNodeRun = spawnSync(
      process.execPath,
      ["scripts/run_node_tests.js", emptyNodeFixturePath],
      { cwd: repositoryRoot, encoding: "utf8", env: nestedNodeEnvironment }
    );
    assert.notEqual(emptyNodeRun.status, 0);
    assert.match(emptyNodeRun.stderr, /incomplete suite.*expected=71, received=1/iu);

    const rubyFixturePath = join(rubyFixtureRoot, "integration_config_test.rb");
    writeFileSync(
      rubyFixturePath,
      [
        'require "minitest/autorun"',
        "class SkippedProbeTest < Minitest::Test",
        "  def test_hidden",
        '    skip "hidden"',
        "  end",
        "end"
      ].join("\n")
    );
    const skippedRubyRun = spawnSync(
      "sh",
      ["scripts/run_ruby_test.sh", rubyFixturePath],
      { cwd: repositoryRoot, encoding: "utf8" }
    );
    assert.notEqual(skippedRubyRun.status, 0);
    assert.match(skippedRubyRun.stderr, /skips=1/iu);

    const maliciousRubyPath = join(fixtureRoot, "rubyopt_probe.rb");
    writeFileSync(
      maliciousRubyPath,
      [
        "module Minitest",
        "  class Test; end",
        "end",
        "module Kernel",
        "  alias_method :quality_original_require, :require",
        "  def require(path)",
        '    return true if path == "minitest/autorun"',
        "    quality_original_require(path)",
        "  end",
        "end",
        'at_exit { puts "4 runs, 9 assertions, 0 failures, 0 errors, 0 skips" }'
      ].join("\n")
    );
    const rubyPreloadRun = spawnSync(
      "sh",
      ["scripts/run_ruby_test.sh", rubyFixturePath],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, RUBYOPT: `-r${maliciousRubyPath}` }
      }
    );
    assert.notEqual(rubyPreloadRun.status, 0);
    assert.match(rubyPreloadRun.stderr, /Ruby execution controls are forbidden.*RUBYOPT/iu);

    for (const makeFlags of ["-n", "-i"]) {
      const controlledMakeRun = spawnSync("make", ["-f", "Makefile", "test-unit"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, MAKEFLAGS: makeFlags }
      });
      assert.notEqual(controlledMakeRun.status, 0);
      assert.match(
        controlledMakeRun.stderr,
        /refuses inherited Make, Node, Ruby, or Playwright execution controls/iu
      );
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(rubyFixtureRoot, { recursive: true, force: true });
  }
});

test("the quality policy retains both runtime skipped-test gates", () => {
  const missingPlaywrightReporter = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) =>
      source.replace(/,?\n\s*\["\.\/scripts\/fail_on_skipped_reporter\.js"\]/u, "")
  });
  assert.notEqual(missingPlaywrightReporter.status, 0);
  assert.match(missingPlaywrightReporter.stderr, configDigestFailure);

  for (const [path, tokens] of [
    [
      "scripts/run_playwright_tests.js",
      [
        "const AUDITED_PLAYWRIGHT_CONFIG_SHA256 =",
        '["scripts/validate_quality_policy.js"]',
        "configDigest !== AUDITED_PLAYWRIGHT_CONFIG_SHA256"
      ]
    ],
    [
      "scripts/fail_on_skipped_reporter.js",
      [
        "const AUDITED_PLAYWRIGHT_TEST_COUNT = 683;",
        "testCount !== AUDITED_PLAYWRIGHT_TEST_COUNT"
      ]
    ]
  ]) {
    const commentTokenNoOp = runPolicyAgainstWorkflowEdits({
      [path]: () => ["process.exit(0);", "/*", ...tokens, "*/", ""].join("\n")
    });
    assert.notEqual(commentTokenNoOp.status, 0, `${path} must not pass as a comment-token no-op`);
    assert.match(commentTokenNoOp.stderr, /exact audited source digest/iu);
  }

  for (const path of [
    "scripts/run_node_tests.js",
    "scripts/run_ruby_test.rb",
    "scripts/verify_agent_skills.rb",
    "scripts/validate_integrations.rb",
    "scripts/validate_production_assets.rb",
    "scripts/validate_public_claims.rb",
    "scripts/validate_route_content.rb",
    "scripts/validate_services.rb",
    "scripts/validate_service_studios.rb",
    "scripts/validate_solutions.rb",
    "scripts/validate_cinematic_solutions.rb",
    "scripts/validate_smart_home.rb",
    "scripts/validate_cinematic_system.rb",
    "scripts/validate_physical_scene_states.rb",
    "scripts/validate_cinematic_route_transitions.rb"
  ]) {
    const bypassedEntrypoint = runPolicyAgainstWorkflowEdits({
      [path]: () => path.endsWith(".js") ? "process.exit(0);\n" : "exit 0\n"
    });
    assert.notEqual(bypassedEntrypoint.status, 0, `${path} must not become a successful no-op`);
    assert.match(bypassedEntrypoint.stderr, /must match its exact audited source digest/iu);
  }

  const missingNodeWrapper = runPolicyAgainstWorkflowEdits({
    "package.json": (source) =>
      source.replace("node scripts/run_node_tests.js", "node --test")
  });
  assert.notEqual(missingNodeWrapper.status, 0);
  assert.match(missingNodeWrapper.stderr, /fail-closed Node test wrapper/iu);

  const selectedNodeRecipe = runPolicyAgainstWorkflowEdits({
    "Makefile": (source) =>
      source.replace("\tnode scripts/run_node_tests.js\n", "\tnode scripts/run_node_tests.js --test-shard=999/999\n")
  });
  assert.notEqual(selectedNodeRecipe.status, 0);
  assert.match(selectedNodeRecipe.stderr, /exact Node test gate|exact fail-closed recipe/iu);

  const selectedBrowserScript = runPolicyAgainstWorkflowEdits({
    "package.json": (source) =>
      source.replace(
        '"test": "node scripts/run_playwright_tests.js"',
        '"test": "node scripts/run_playwright_tests.js --grep=one"'
      )
  });
  assert.notEqual(selectedBrowserScript.status, 0);
  assert.match(selectedBrowserScript.stderr, /complete Playwright suite/iu);

  const selectedBrowserRecipe = runPolicyAgainstWorkflowEdits({
    "Makefile": (source) =>
      source.replace(
        "\tnode scripts/run_playwright_tests.js\n",
        "\tnode scripts/run_playwright_tests.js --project=mobile-375\n"
      )
  });
  assert.notEqual(selectedBrowserRecipe.status, 0);
  assert.match(selectedBrowserRecipe.stderr, /exact Playwright gate/iu);

  const selectedBrowserConfig = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) =>
      source.replace("fullyParallel: false,", "fullyParallel: false,\n  grep: /one passing test/u,")
  });
  assert.notEqual(selectedBrowserConfig.status, 0);
  assert.match(selectedBrowserConfig.stderr, configDigestFailure);

  const incompleteProjectMatrix = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) =>
      source.replace('name: "desktop-1980"', 'name: "desktop-wide"')
  });
  assert.notEqual(incompleteProjectMatrix.status, 0);
  assert.match(incompleteProjectMatrix.stderr, configDigestFailure);

  const narrowedRegularProject = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) =>
      source.replace(
        "testIgnore: [responsiveMatrixFile, finalAcceptanceFile, motionChoreographyFile],",
        "testIgnore: [responsiveMatrixFile, finalAcceptanceFile, motionChoreographyFile, /site\\.spec\\.js/u],"
      )
  });
  assert.notEqual(narrowedRegularProject.status, 0);
  assert.match(narrowedRegularProject.stderr, configDigestFailure);

  const projectDirectoryOverride = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) =>
      source.replace(
        'name: "mobile-375",',
        'name: "mobile-375",\n      testDir: "./tests/browser/subset",'
      )
  });
  assert.notEqual(projectDirectoryOverride.status, 0);
  assert.match(projectDirectoryOverride.stderr, configDigestFailure);

  const gitIgnoreSelection = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) =>
      source.replace("fullyParallel: false,", "fullyParallel: false,\n  respectGitIgnore: true,")
  });
  assert.notEqual(gitIgnoreSelection.status, 0);
  assert.match(gitIgnoreSelection.stderr, configDigestFailure);

  const duplicateMakeTarget = runPolicyAgainstWorkflowEdits({
    "Makefile": (source) => `${source}\n\ntest-js-unit:\n\t@true\n`
  });
  assert.notEqual(duplicateMakeTarget.status, 0);
  assert.match(duplicateMakeTarget.stderr, /exactly one definition/iu);

  const includedMakeOverride = runPolicyAgainstWorkflowEdits({
    "Makefile": (source) => `${source}\n\n-include quality-override.mk\n`
  });
  assert.notEqual(includedMakeOverride.status, 0);
  assert.match(includedMakeOverride.stderr, /must not include external makefiles/iu);

  const shellOverride = runPolicyAgainstWorkflowEdits({
    "Makefile": (source) => `${source}\nSHELL := /bin/true\n`
  });
  assert.notEqual(shellOverride.status, 0);
  assert.match(shellOverride.stderr, /shell or error semantics|introduce variables/iu);

  const removedEnvironmentGuard = runPolicyAgainstWorkflowEdits({
    "Makefile": (source) =>
      source.replace(/^ifneq \([\s\S]*?^endif\n\n/mu, "")
  });
  assert.notEqual(removedEnvironmentGuard.status, 0);
  assert.match(removedEnvironmentGuard.stderr, /reject inherited controls/iu);

  const dynamicMakeOverride = runPolicyAgainstWorkflowEdits({
    "Makefile": (source) => `${source}\n$(eval $(QUALITY_TARGET): ; @true)\n`
  });
  assert.notEqual(dynamicMakeOverride.status, 0);
  assert.match(dynamicMakeOverride.stderr, /must not evaluate dynamic functions/iu);

  const patternSpecificShell = runPolicyAgainstWorkflowEdits({
    "Makefile": (source) => `${source}\n%: SHELL := /usr/bin/true\n`
  });
  assert.notEqual(patternSpecificShell.status, 0);
  assert.match(patternSpecificShell.stderr, /pattern, suffix, special, or unaudited target rules/iu);

  const alternateEntrypoint = runPolicyAgainstWorkflowEdits({
    GNUmakefile: () => "check:\n\t@true\n"
  });
  assert.notEqual(alternateEntrypoint.status, 0);
  assert.match(alternateEntrypoint.stderr, /must not contain .*override an audited quality entrypoint/iu);

  const npmShellOverride = runPolicyAgainstWorkflowEdits({
    ".npmrc": () => "script-shell=/usr/bin/true\n"
  });
  assert.notEqual(npmShellOverride.status, 0);
  assert.match(npmShellOverride.stderr, /must not contain \.npmrc/iu);

  const bypassedRubyRecipe = runPolicyAgainstWorkflowEdits({
    "Makefile": (source) =>
      source.replace(
        "\tsh scripts/run_ruby_test.sh tests/unit/production_assets_contract_test.rb\n",
        "\t@true\n"
      )
  });
  assert.notEqual(bypassedRubyRecipe.status, 0);
  assert.match(bypassedRubyRecipe.stderr, /exact fail-closed recipe/iu);

  const reorderedCheck = runPolicyAgainstWorkflowEdits({
    "Makefile": (source) =>
      source.replace(
        "check: verify-skills validate-quality-policy test-unit",
        "check: verify-skills test-unit validate-quality-policy"
      )
  });
  assert.notEqual(reorderedCheck.status, 0);
  assert.match(reorderedCheck.stderr, /exact ordered prerequisite graph/iu);

  const lifecycleHook = runPolicyAgainstWorkflowEdits({
    "package.json": (source) =>
      source.replace(
        '"test": "node scripts/run_playwright_tests.js",',
        '"pretest": "true",\n    "test": "node scripts/run_playwright_tests.js",'
      )
  });
  assert.notEqual(lifecycleHook.status, 0);
  assert.match(lifecycleHook.stderr, /exact lifecycle-free quality command map/iu);

  const noOpPolicyScript = runPolicyAgainstWorkflowEdits({
    "package.json": (source) =>
      source.replace(
        '"validate:quality-policy": "node scripts/validate_quality_policy.js"',
        '"validate:quality-policy": "true"'
      )
  });
  assert.notEqual(noOpPolicyScript.status, 0);
  assert.match(noOpPolicyScript.stderr, /exact lifecycle-free quality command map/iu);
});

test("remaining remote workflows cannot embed the local full Quality gate", () => {
  const reusableWorkflowSha = "0123456789abcdef0123456789abcdef01234567";
  for (const [path, job] of [
    [
      ".github/workflows/codeql.yml",
      [
        "  hidden-audit:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: make --file=Makefile check"
      ]
    ],
    [
      ".github/workflows/pages.yml",
      [
        "  hidden-browser:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: node scripts/run_playwright_tests.js"
      ]
    ],
    [
      ".github/workflows/codeql.yml",
      [
        "  hidden-npm:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: npm run test"
      ]
    ],
    [
      ".github/workflows/pages.yml",
      [
        "  hidden-reusable:",
        `    uses: acme/quality/.github/workflows/full.yml@${reusableWorkflowSha}`
      ]
    ]
  ]) {
    const embeddedQuality = runPolicyAgainstWorkflowEdits({
      [path]: (source) => source.replace(
        "jobs:\n",
        ["jobs:", ...job, ""].join("\n")
      )
    });
    assert.notEqual(embeddedQuality.status, 0, `${path} must not embed full Quality`);
    assert.match(embeddedQuality.stderr, /exact audited source digests/iu);
  }
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
  assert.match(unsafeGlobalTimeout.stderr, /global test timeout|audited source digest/iu);

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
  assert.match(projectTimeout.stderr, /project.*test timeout|audited source digest/iu);

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

test("the quality policy rejects skipped-test annotations and aliases", () => {
  const playwrightCall = (...parts) => parts.join("");

  for (const [label, injection] of [
    ["direct test skip", playwrightCall("test", ".skip", '("hidden", () => {});')],
    ["direct describe fixme", playwrightCall("test.describe", ".fixme", '("hidden", () => {});')],
    ["direct node todo", playwrightCall("test", ".todo", '("hidden");')],
    ["direct expected failure", playwrightCall("test", ".fail", '("hidden", () => {});')],
    ["comment-separated test skip", playwrightCall("test", " /* bypass */ .skip", '("hidden", () => {});')],
    ["parenthesized test only", playwrightCall("(", "test", ")", ".only", '("focused", () => {});')],
    ["bound test skip", playwrightCall("const hiddenTest = ", "test", ".skip.bind(test); hiddenTest", '("hidden", () => {});')],
    ["assigned computed test fixme", playwrightCall("const hiddenTest = ", "test", '["fixme"]', "; hiddenTest", '("hidden", () => {});')],
    ["escaped computed test skip", playwrightCall("test", '["\\x73kip"]', '("hidden", () => {});')],
    ["dynamic computed test skip", playwrightCall('const annotation = "skip"; ', "test", "[annotation]", '("hidden", () => {});')],
    ["aliased test fixme", playwrightCall("const suite = ", "test", "; suite.fixme", '("hidden", () => {});')],
    ["destructured test skip", playwrightCall("const { skip: hiddenTest } = ", "test", "; hiddenTest", '("hidden", () => {});')],
    ["computed test skip", playwrightCall("test", '["skip"]', '("hidden", () => {});')],
    ["computed test fixme", playwrightCall("test", "['fixme']", '("hidden", () => {});')],
    ["computed test only", playwrightCall("test", "[`only`]", '("focused", () => {});')],
    ["computed describe skip", playwrightCall("test.describe", '["skip"]', '("hidden", () => {});')],
    ["computed test.describe fixme", playwrightCall("test", '["describe"]', '["fixme"]', '("hidden", () => {});')],
    ["optional test skip", playwrightCall("test", "?.skip", '("hidden", () => {});')],
    ["optional annotation call", playwrightCall("test.fixme", "?.", '("hidden", () => {});')],
    ["optional computed describe annotation", playwrightCall("test", "?.describe", '?.["skip"]', "?.", '("hidden", () => {});')]
  ]) {
    const bypass = runPolicyAgainstWorkflowEdits({
      "tests/browser/smart_home.spec.js": (source) =>
        source.replace('test("upgrades', `${injection}\n\ntest("upgrades`)
    });
    assert.notEqual(bypass.status, 0, `the policy must reject ${label}`);
    assert.match(bypass.stderr, /avoid the real quality state/iu);
  }

  const importAliasBypass = runPolicyAgainstWorkflowEdits({
    "tests/browser/smart_home.spec.js": (source) =>
      source
        .replace('import { expect, test } from "@playwright/test";', 'import { expect, test as runner } from "@playwright/test";')
        .replace('test("upgrades', `${playwrightCall("runner", ".skip", '("hidden", () => {});')}\n\ntest("upgrades`)
  });
  assert.notEqual(importAliasBypass.status, 0, "the policy must follow an imported test binding alias");
  assert.match(importAliasBypass.stderr, /forbidden test annotation skip/iu);

  const namespaceImportBypass = runPolicyAgainstWorkflowEdits({
    "tests/browser/smart_home.spec.js": (source) =>
      source
        .replace(
          'import { expect, test } from "@playwright/test";',
          'import * as playwright from "@playwright/test";\nimport { expect, test } from "@playwright/test";'
        )
        .replace(
          'test("upgrades',
          `${playwrightCall(
            "playwright.test",
            ".fail",
            '("hidden", () => { throw new Error("masked"); });'
          )}\n\ntest("upgrades`
        )
  });
  assert.notEqual(namespaceImportBypass.status, 0, "the policy must follow namespace imports");
  assert.match(namespaceImportBypass.stderr, /forbidden test annotation fail/iu);

  const defaultImportBypass = runPolicyAgainstWorkflowEdits({
    "tests/browser/smart_home.spec.js": (source) =>
      source
        .replace(
          'import { expect, test } from "@playwright/test";',
          'import playwright from "@playwright/test";\nimport { expect, test } from "@playwright/test";'
        )
        .replace(
          'test("upgrades',
          `${playwrightCall(
            "playwright.test",
            ".fail",
            '("hidden", () => { throw new Error("masked"); });'
          )}\n\ntest("upgrades`
        )
  });
  assert.notEqual(defaultImportBypass.status, 0, "the policy must follow default imports");
  assert.match(defaultImportBypass.stderr, /forbidden test annotation fail/iu);

  for (const [label, loader] of [
    ["CommonJS", 'const playwright = require("@playwright/test");'],
    ["dynamic", 'const playwright = await import("@playwright/test");']
  ]) {
    const nonStaticImport = runPolicyAgainstWorkflowEdits({
      "tests/browser/smart_home.spec.js": (source) =>
        source.replace('test("upgrades', `${loader}\n\ntest("upgrades`)
    });
    assert.notEqual(nonStaticImport.status, 0, `the policy must reject ${label} runner imports`);
    assert.match(nonStaticImport.stderr, /unsupported dynamic test runner import/iu);
  }

  const createRequireBypass = runPolicyAgainstWorkflowEdits({
    "tests/browser/smart_home.spec.js": (source) =>
      source
        .replace(
          'import { expect, test } from "@playwright/test";',
          'import { createRequire } from "node:module";\nimport { expect, test } from "@playwright/test";'
        )
        .replace(
          'test("upgrades',
          'const localRequire = createRequire(import.meta.url);\n' +
            'const { test: runner } = localRequire("@playwright/test");\n' +
            'runner.skip("hidden", () => {});\n\n' +
            'test("upgrades'
        )
  });
  assert.notEqual(createRequireBypass.status, 0, "the policy must reject createRequire loaders");
  assert.match(createRequireBypass.stderr, /unsupported module loader/iu);

  const inertExamples = runPolicyAgainstWorkflowEdits({
    "tests/browser/smart_home.spec.js": (source) =>
      source.replace(
        'test("upgrades',
        `const policyExample = ${JSON.stringify("test.skip('example')")};\n` +
          `/* ${playwrightCall("test", ".fixme", "('example')")} */\n\n` +
          'test("upgrades'
      )
  });
  assert.equal(inertExamples.status, 0, inertExamples.stderr);
});

test("the quality policy keeps local browser execution deterministic", () => {
  const playwright = read("playwright.config.js");

  assert.match(playwright, /^  workers: 1,$/mu);
  assert.match(playwright, /^    reuseExistingServer: false,$/mu);

  const unsafeWorkers = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) => source.replace("workers: 1", "workers: 4")
  });
  assert.notEqual(unsafeWorkers.status, 0, "the policy must reject parallel browser workers");
  assert.match(unsafeWorkers.stderr, /worker/iu);

  const staleServerReuse = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": (source) =>
      source.replace("reuseExistingServer: false", "reuseExistingServer: true")
  });
  assert.notEqual(staleServerReuse.status, 0, "the policy must reject stale local server reuse");
  assert.match(staleServerReuse.stderr, /must own one fresh local Jekyll server/iu);

  for (const [label, override] of [
    ["base URL", 'baseURL: "https://attacker.example",'],
    ["remote browser", 'connectOptions: { wsEndpoint: "wss://attacker.example" },']
  ]) {
    const projectExecutionOverride = runPolicyAgainstWorkflowEdits({
      "playwright.config.js": (source) =>
        source.replace(
          'use: { viewport: { width: 375, height: 812 } }',
          `use: { ${override} viewport: { width: 375, height: 812 } }`
        )
    });
    assert.notEqual(projectExecutionOverride.status, 0, `the policy must reject project ${label}`);
    assert.match(projectExecutionOverride.stderr, configDigestFailure);
  }

  const contextDependentSource = playwright
    .replace(
      "const responsiveMatrixFile",
      'const runtimeOnlySelection = process.argv[1]?.endsWith("validate_quality_policy.js") ? {} : { grep: /homepage/u };\nconst responsiveMatrixFile'
    )
    .replace("export default defineConfig({", "export default defineConfig({\n  ...runtimeOnlySelection,");
  const contextDependentDigest = createHash("sha256")
    .update(contextDependentSource)
    .digest("hex");
  const contextDependentConfig = runPolicyAgainstWorkflowEdits({
    "playwright.config.js": () => contextDependentSource,
    "scripts/playwright_contract.js": (source) =>
      source.replace(
        /[0-9a-f]{64}/u,
        contextDependentDigest
      )
  });
  assert.notEqual(contextDependentConfig.status, 0);
  assert.match(
    contextDependentConfig.stderr,
    /independent policy literal|audited source digest/iu
  );
  const postPolicyMutation = runBrowserGateAfterInitialPolicyEdits({
    "playwright.config.js": () => contextDependentSource,
    "scripts/playwright_contract.js": (source) =>
      source
        .replace(/[0-9a-f]{64}/u, contextDependentDigest)
        .replace(
          "EXPECTED_PLAYWRIGHT_TEST_COUNT = 683",
          "EXPECTED_PLAYWRIGHT_TEST_COUNT = 5"
        )
  });
  assert.notEqual(postPolicyMutation.status, 0);
  assert.match(
    `${postPolicyMutation.stdout}\n${postPolicyMutation.stderr}`,
    /independent policy literal|audited source digest|final Playwright policy check failed/iu
  );

  const erasedTestInventory = runPolicyAgainstWorkflowEdits({
    "scripts/playwright_contract.js": (source) =>
      source.replace("EXPECTED_PLAYWRIGHT_TEST_COUNT = 683", "EXPECTED_PLAYWRIGHT_TEST_COUNT = 0")
  });
  assert.notEqual(erasedTestInventory.status, 0);
  assert.match(erasedTestInventory.stderr, /digest and 683-test contract.*independent policy literal/iu);

  for (const [label, property] of [
    ["working directory", 'cwd: "/tmp",'],
    ["environment", 'env: { JEKYLL_ENV: "development" },']
  ]) {
    const hiddenWebServerSource = playwright.replace(
      "  webServer: {\n",
      `  webServer: {\n    ${property}\n`
    );
    const hiddenWebServerDigest = createHash("sha256")
      .update(hiddenWebServerSource)
      .digest("hex");
    const hiddenWebServerControl = runPolicyAgainstWorkflowEdits({
      "playwright.config.js": () => hiddenWebServerSource,
      "scripts/playwright_contract.js": (source) =>
        source.replace(/[0-9a-f]{64}/u, hiddenWebServerDigest),
      "scripts/run_playwright_tests.js": (source) =>
        source.replace(/[0-9a-f]{64}/u, hiddenWebServerDigest),
      "scripts/validate_quality_policy.js": (source) =>
        source.replace(/[0-9a-f]{64}/u, hiddenWebServerDigest)
    });
    assert.notEqual(
      hiddenWebServerControl.status,
      0,
      `the policy must reject hidden web-server ${label}`
    );
    assert.match(hiddenWebServerControl.stderr, /must own one fresh local Jekyll server/iu);
  }
});

test("the local quality validator approves the local-only full gate policy", () => {
  const result = spawnSync(process.execPath, ["scripts/validate_quality_policy.js"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Local quality policy is fail-closed; GitHub PR Quality is disabled/iu
  );
});
