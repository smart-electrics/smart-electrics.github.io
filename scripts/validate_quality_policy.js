import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";
import {
  EXPECTED_PLAYWRIGHT_CONFIG_SHA256,
  EXPECTED_PLAYWRIGHT_TEST_COUNT
} from "./playwright_contract.js";

const failures = [];
const AUDITED_PLAYWRIGHT_CONFIG_SHA256 =
  "de1f2bf0cc7c97df5093b47d05bd9b2438260345211c71109d5f96fb4e116203";
const AUDITED_PLAYWRIGHT_TEST_COUNT = 653;
const AUDITED_PLAYWRIGHT_RUNNER_SHA256 =
  "c89cf5ea38a172d3cdfd626e724fa58eb095965d71a1f6a01ff699ba82bbc78c";
const AUDITED_PLAYWRIGHT_REPORTER_SHA256 =
  "de348889f455322c008e67b3c339998302d56125b1517abd157eec1024e599a9";
const AUDITED_CODEQL_WORKFLOW_SHA256 =
  "1a6b466dfcf0dbe50b29e6dfc1b70f2489c4c93efdecd7d3759f1dd8149a4883";
const AUDITED_PAGES_WORKFLOW_SHA256 =
  "e37124b2934be749c7afd17f59a23273e657ac5e32615a988c477b5657990da4";
const repositoryRoot = process.env.SMART_ELECTRICS_POLICY_ROOT
  ? resolve(process.env.SMART_ELECTRICS_POLICY_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);
const pagesWorkflow = readFileSync(
  new URL("../.github/workflows/pages.yml", import.meta.url),
  "utf8"
);
const codeqlWorkflow = readFileSync(
  new URL("../.github/workflows/codeql.yml", import.meta.url),
  "utf8"
);
const codeqlWorkflowDigest = createHash("sha256")
  .update(codeqlWorkflow)
  .digest("hex");
const pagesWorkflowDigest = createHash("sha256")
  .update(pagesWorkflow)
  .digest("hex");
if (
  codeqlWorkflowDigest !== AUDITED_CODEQL_WORKFLOW_SHA256 ||
  pagesWorkflowDigest !== AUDITED_PAGES_WORKFLOW_SHA256
) {
  failures.push(
    "CodeQL and Pages workflows must match their exact audited source digests."
  );
}
const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");
const playwrightContractSource = readFileSync(
  new URL("./playwright_contract.js", import.meta.url),
  "utf8"
);
const playwrightRunnerSource = readFileSync(
  new URL("./run_playwright_tests.js", import.meta.url),
  "utf8"
);
const playwrightReporterSource = readFileSync(
  new URL("./fail_on_skipped_reporter.js", import.meta.url),
  "utf8"
);
const expectedPlaywrightContractSource = [
  "export const EXPECTED_PLAYWRIGHT_CONFIG_SHA256 =",
  `  "${AUDITED_PLAYWRIGHT_CONFIG_SHA256}";`,
  `export const EXPECTED_PLAYWRIGHT_TEST_COUNT = ${AUDITED_PLAYWRIGHT_TEST_COUNT};`,
  ""
].join("\n");
if (
  playwrightContractSource !== expectedPlaywrightContractSource ||
  EXPECTED_PLAYWRIGHT_CONFIG_SHA256 !== AUDITED_PLAYWRIGHT_CONFIG_SHA256 ||
  EXPECTED_PLAYWRIGHT_TEST_COUNT !== AUDITED_PLAYWRIGHT_TEST_COUNT
) {
  failures.push("Playwright digest and 653-test contract must match the independent policy literal.");
}
const playwrightRunnerDigest = createHash("sha256")
  .update(playwrightRunnerSource)
  .digest("hex");
if (playwrightRunnerDigest !== AUDITED_PLAYWRIGHT_RUNNER_SHA256) {
  failures.push(
    "Playwright runner must match its exact audited source digest."
  );
}
const playwrightReporterDigest = createHash("sha256")
  .update(playwrightReporterSource)
  .digest("hex");
if (playwrightReporterDigest !== AUDITED_PLAYWRIGHT_REPORTER_SHA256) {
  failures.push(
    "Playwright reporter must match its exact audited source digest."
  );
}
const playwrightConfigUrl = new URL("../playwright.config.js", import.meta.url);
const playwrightConfigSource = readFileSync(playwrightConfigUrl, "utf8");
const playwrightConfigDigest = createHash("sha256")
  .update(playwrightConfigSource)
  .digest("hex");
let playwrightConfig = {};
if (playwrightConfigDigest !== AUDITED_PLAYWRIGHT_CONFIG_SHA256) {
  failures.push("Playwright config must match the audited source digest before evaluation.");
} else {
  try {
    playwrightConfig = (await import(`${playwrightConfigUrl.href}?quality-policy`)).default;
  } catch (error) {
    failures.push(`Playwright config cannot be evaluated safely: ${error.message}`);
  }
}
const rubyTestLauncher = readFileSync(
  new URL("./run_ruby_test.sh", import.meta.url),
  "utf8"
);

function collectTestSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) return collectTestSourceFiles(entryPath);
    return /\.[cm]?[jt]s$/u.test(entry.name) ? [entryPath] : [];
  });
}

function walkSyntax(node, visit, parent = null) {
  if (!node || typeof node.type !== "string") return;

  visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (["type", "start", "end", "loc", "range"].includes(key)) continue;

    if (Array.isArray(value)) {
      for (const child of value) walkSyntax(child, visit, node);
    } else {
      walkSyntax(value, visit, node);
    }
  }
}

function unwrapChain(node) {
  return node?.type === "ChainExpression" ? unwrapChain(node.expression) : node;
}

function memberRoot(node) {
  let current = unwrapChain(node);

  while (current?.type === "MemberExpression") {
    current = unwrapChain(current.object);
  }

  return current?.type === "Identifier" ? current : null;
}

function staticMemberName(node) {
  if (node.type !== "MemberExpression") return null;
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (node.computed && node.property.type === "Literal" && typeof node.property.value === "string") {
    return node.property.value;
  }
  if (
    node.computed &&
    node.property.type === "TemplateLiteral" &&
    node.property.expressions.length === 0
  ) {
    return node.property.quasis[0]?.value.cooked ?? null;
  }

  return null;
}

function testRunnerBindings(ast) {
  const bindings = new Set();

  walkSyntax(ast, (node) => {
    if (node.type !== "ImportDeclaration") return;

    const source = node.source.value;
    const isPlaywright = source === "@playwright/test";
    const isNodeTest = source === "node:test" || source === "node:test/promises";
    if (!isPlaywright && !isNodeTest) return;

    for (const specifier of node.specifiers) {
      if (specifier.type === "ImportNamespaceSpecifier") {
        bindings.add(specifier.local.name);
        continue;
      }

      if (specifier.type === "ImportDefaultSpecifier") {
        bindings.add(specifier.local.name);
        continue;
      }

      if (specifier.type !== "ImportSpecifier") continue;
      const importedName = specifier.imported.name ?? specifier.imported.value;
      const supportedNames = isPlaywright
        ? new Set(["default", "test"])
        : new Set(["default", "test", "describe", "it", "suite"]);
      if (supportedNames.has(importedName)) bindings.add(specifier.local.name);
    }
  });

  return bindings;
}

function analyzeForbiddenTestAnnotations(source, filePath) {
  let ast;

  try {
    ast = parse(source, {
      allowHashBang: true,
      ecmaVersion: "latest",
      locations: true,
      sourceType: "module"
    });
  } catch (error) {
    failures.push(
      `${relative(repositoryRoot, filePath)} cannot be parsed for skipped-test policy: ${error.message}`
    );
    return;
  }

  const bindings = testRunnerBindings(ast);
  const parents = new WeakMap();
  const forbiddenNames = new Set(["skip", "fixme", "only", "todo", "fail"]);
  const reported = new Set();
  const report = (node, detail) => {
    const key = `${node.start}:${detail}`;
    if (reported.has(key)) return;
    reported.add(key);
    failures.push(
      `${relative(repositoryRoot, filePath)}:${node.loc.start.line} ${detail} ` +
      "so the test suite can avoid the real quality state."
    );
  };

  walkSyntax(ast, (node, parent) => {
    if (parent) parents.set(node, parent);
  });

  const semanticParent = (node) => {
    let parent = parents.get(node);
    while (parent?.type === "ChainExpression") parent = parents.get(parent);
    return parent;
  };

  walkSyntax(ast, (node) => {
    if (
      node.type === "ImportDeclaration" &&
      (node.source.value === "node:module" || node.source.value === "module")
    ) {
      report(node, `uses unsupported module loader ${node.source.value}`);
      return;
    }

    const moduleSource =
      node.type === "ImportExpression"
        ? node.source
        : node.type === "CallExpression" &&
            node.callee.type === "Identifier" &&
            node.callee.name === "require" &&
            node.arguments.length === 1
          ? node.arguments[0]
          : null;
    const moduleName =
      moduleSource?.type === "Literal" && typeof moduleSource.value === "string"
        ? moduleSource.value
        : null;
    if (
      moduleName === "@playwright/test" ||
      moduleName === "node:test" ||
      moduleName === "node:test/promises" ||
      moduleName === "node:module" ||
      moduleName === "module"
    ) {
      report(node, `uses unsupported dynamic test runner import ${moduleName}`);
      return;
    }

    if (node.type === "MemberExpression") {
      const root = memberRoot(node);
      if (!root || !bindings.has(root.name)) return;

      const memberName = staticMemberName(node);
      if (node.computed) {
        report(node, `uses computed access on test runner ${root.name}`);
      }
      if (forbiddenNames.has(memberName)) {
        report(node, `uses forbidden test annotation ${memberName}`);
      }

      const parent = semanticParent(node);
      const continuesMemberChain =
        parent?.type === "MemberExpression" && unwrapChain(parent.object) === node;
      const isDirectCall =
        (parent?.type === "CallExpression" || parent?.type === "NewExpression") &&
        unwrapChain(parent.callee) === node;
      if (!continuesMemberChain && !isDirectCall) {
        report(node, `aliases test runner member ${memberName ?? "<dynamic>"}`);
      }
      return;
    }

    if (node.type !== "Identifier" || !bindings.has(node.name)) return;
    const parent = semanticParent(node);
    if (!parent) return;

    const isImportBinding = [
      "ImportSpecifier",
      "ImportDefaultSpecifier",
      "ImportNamespaceSpecifier"
    ].includes(parent.type);
    const isStaticProperty =
      ((parent.type === "MemberExpression" && parent.property === node && !parent.computed) ||
        (parent.type === "Property" && parent.key === node && parent.value !== node && !parent.computed) ||
        ((parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") &&
          parent.key === node &&
          !parent.computed));
    const isMemberRoot =
      parent.type === "MemberExpression" && unwrapChain(parent.object) === node;
    const isDirectCall =
      (parent.type === "CallExpression" || parent.type === "NewExpression") &&
      unwrapChain(parent.callee) === node;

    if (isImportBinding || isStaticProperty || isMemberRoot || isDirectCall) return;
    report(node, `aliases or passes test runner binding ${node.name}`);
  });
}

function targetPrerequisites(target) {
  const targetPattern = new RegExp(`^${target}:\\s*(.+)$`, "m");
  const declaration = makefile.match(targetPattern)?.[1].split(/\s*##(?:\s+|$)/u)[0].trim();
  return declaration ? declaration.split(/\s+/u) : [];
}

function targetRecipe(target) {
  const targetPattern = new RegExp(`^${target}:.*\\n((?:\\t.*\\n?)*)`, "m");
  return targetPattern.exec(makefile)?.[1] ?? "";
}

function normalizedTargetRecipe(target) {
  return targetRecipe(target)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function namedMakeTargetCounts() {
  const counts = new Map();

  for (const line of makefile.split("\n")) {
    if (/^\s*(?:#|$)/u.test(line) || /^\t/u.test(line)) continue;

    const colon = line.indexOf(":");
    if (colon < 0 || line[colon + 1] === "=") continue;

    const targetList = line.slice(0, colon).trim();
    if (targetList.startsWith(".") || targetList.includes("=")) continue;

    for (const target of targetList.split(/\s+/u)) {
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(target)) continue;
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
  }

  return counts;
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

const PULL_REQUEST_HEAD_REF = /^\s*ref:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*&&\s*github\.event\.pull_request\.head\.sha\s*\|\|\s*github\.sha\s*\}\}\s*$/mu;

function assertPullRequestCheckoutRef(workflow, workflowName) {
  const checkoutStep = workflow.match(
    /^[ \t]*-[ \t]+name:[^\n]*\n[ \t]+uses:[ \t]+actions\/checkout@[^\n]+\n([\s\S]*?)(?=^[ \t]*-[ \t]+name:|$(?![\s\S]))/mu
  )?.[1] ?? "";

  if (!PULL_REQUEST_HEAD_REF.test(checkoutStep)) {
    failures.push(
      `${workflowName} checkout must use the pull-request head SHA and github.sha only for non-PR events.`
    );
  }
}

const pagesTriggers = workflowTriggers(pagesWorkflow);
const codeqlTriggers = workflowTriggers(codeqlWorkflow);
const workflowEntries = readdirSync(
  new URL("../.github/workflows/", import.meta.url),
  { withFileTypes: true }
)
  .map((entry) => entry.name)
  .sort();
if (workflowEntries.join(",") !== "codeql.yml,pages.yml") {
  failures.push(
    "GitHub workflows must contain only CodeQL and Pages; full Quality runs locally only."
  );
}

for (const [workflowName, workflow] of [
  ["CodeQL", codeqlWorkflow],
  ["Pages", pagesWorkflow]
]) {
  if (
    /^\s{2,}quality:\s*$/mu.test(workflow) ||
    /^\s+name:\s*quality\s*$/imu.test(workflow) ||
    /make\s+(?:-f\s+Makefile\s+)?check/u.test(workflow)
  ) {
    failures.push(
      `${workflowName} must not embed the local-only full Quality gate.`
    );
  }
}

if (codeqlTriggers.join(",") !== "push,pull_request,workflow_dispatch,schedule") {
  failures.push("CodeQL must retain push, pull_request, workflow_dispatch, and schedule triggers.");
}

if (!/^on:\n  push:\n    branches: \[main\]\n  pull_request:\n    branches: \[main\]\n  workflow_dispatch:\n  schedule:/mu.test(codeqlWorkflow)) {
  failures.push("CodeQL push and pull_request triggers must target main exactly.");
}

assertPinnedActions(codeqlWorkflow, "CodeQL");
assertWorkflowHasAction(codeqlWorkflow, "CodeQL", "actions/checkout", "3d3c42e5aac5ba805825da76410c181273ba90b1");
assertPullRequestCheckoutRef(codeqlWorkflow, "CodeQL");
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
  failures.push("Pages must not depend on another workflow.");
}

if (!/ref:\s*\$\{\{ github\.sha \}\}/u.test(pagesWorkflow)) {
  failures.push("Pages must check out the exact pushed SHA.");
}

assertPinnedActions(pagesWorkflow, "Pages");
assertWorkflowHasAction(pagesWorkflow, "Pages", "actions/checkout", "3d3c42e5aac5ba805825da76410c181273ba90b1");

const repositoryEntries = new Set(readdirSync(repositoryRoot));
for (const forbiddenPath of ["GNUmakefile", "makefile", ".npmrc"]) {
  if (repositoryEntries.has(forbiddenPath)) {
    failures.push(
      `Repository must not contain ${forbiddenPath}, which can override an audited quality entrypoint.`
    );
  }
}

for (const [target, count] of namedMakeTargetCounts()) {
  if (count > 1) {
    failures.push(
      `Make target ${target} must have exactly one definition so a later recipe cannot override the gate.`
    );
  }
}

if (/^\s*(?:-?include|sinclude)\b/mu.test(makefile)) {
  failures.push("Makefile must not include external makefiles that can override quality recipes.");
}

if (
  /^\s*(?:(?:override|export|unexport)\s+)?(?:SHELL|\.SHELLFLAGS|MAKEFLAGS|MAKE|\.RECIPEPREFIX)\s*[:+?]?=/mu.test(makefile) ||
  /^\s*\.(?:ONESHELL|IGNORE|SILENT|POSIX|EXPORT_ALL_VARIABLES)\s*:/mu.test(makefile)
) {
  failures.push("Makefile must not override the shell or error semantics used by the quality gate.");
}

const makeAssignments = makefile
  .split("\n")
  .filter((line) => !/^\t/u.test(line))
  .filter((line) =>
    /^\s*(?:(?:override|export|unexport|private)\s+)?[A-Za-z_.][A-Za-z0-9_.-]*\s*(?::=|::=|\?=|\+=|!=|=)/u.test(line)
  );
if (makeAssignments.join("\n") !== ".DEFAULT_GOAL := help") {
  failures.push("Makefile must not introduce variables that can alter quality command execution.");
}
if (/^\s*(?:export|unexport|override|private|define|undefine|vpath)\b/mu.test(makefile)) {
  failures.push("Makefile must not introduce directives that can alter quality command execution.");
}

const expectedMakeEnvironmentGuard = [
  "ifneq ($(strip $(MAKEFLAGS)$(MFLAGS)$(GNUMAKEFLAGS)$(MAKEFILES)$(NODE_OPTIONS)$(NODE_PATH)$(NODE_TEST_CONTEXT)$(RUBYOPT)$(RUBYLIB)$(TESTOPTS)$(PLAYWRIGHT_BASE_URL)),)",
  "$(error Quality gate refuses inherited Make, Node, Ruby, or Playwright execution controls)",
  "endif",
  ""
].join("\n");
if (!makefile.startsWith(expectedMakeEnvironmentGuard)) {
  failures.push("Makefile must reject inherited controls before parsing any quality target.");
}
const makeConditionalLines = makefile
  .split("\n")
  .filter((line) => /^(?:ifn?eq|ifdef|ifndef|else|endif)\b/u.test(line));
if (makeConditionalLines.join("\n") !== [
  "ifneq ($(strip $(MAKEFLAGS)$(MFLAGS)$(GNUMAKEFLAGS)$(MAKEFILES)$(NODE_OPTIONS)$(NODE_PATH)$(NODE_TEST_CONTEXT)$(RUBYOPT)$(RUBYLIB)$(TESTOPTS)$(PLAYWRIGHT_BASE_URL)),)",
  "endif"
].join("\n")) {
  failures.push("Makefile must not add conditional paths around quality targets.");
}

const allowedTopLevelMakeFunctions = new Set([
  "ifneq ($(strip $(MAKEFLAGS)$(MFLAGS)$(GNUMAKEFLAGS)$(MAKEFILES)$(NODE_OPTIONS)$(NODE_PATH)$(NODE_TEST_CONTEXT)$(RUBYOPT)$(RUBYLIB)$(TESTOPTS)$(PLAYWRIGHT_BASE_URL)),)",
  "$(error Quality gate refuses inherited Make, Node, Ruby, or Playwright execution controls)"
]);
const unauthorizedTopLevelMakeFunctions = makefile
  .split("\n")
  .filter((line) => !/^\t/u.test(line))
  .filter((line) => (/\$\(|\$\{/u.test(line) && !allowedTopLevelMakeFunctions.has(line)));
if (unauthorizedTopLevelMakeFunctions.length > 0) {
  failures.push("Makefile must not evaluate dynamic functions outside audited recipes.");
}

const expectedRubyTestLauncher = [
  "#!/bin/sh",
  "",
  "set -eu",
  "",
  'if [ -n "${RUBYOPT:-}" ] || [ -n "${RUBYLIB:-}" ] || [ -n "${TESTOPTS:-}" ]; then',
  '  echo "Quality policy violation: Ruby execution controls are forbidden (RUBYOPT, RUBYLIB, TESTOPTS)." >&2',
  "  exit 1",
  "fi",
  "",
  'exec bundle exec ruby "$(dirname "$0")/run_ruby_test.rb" "$@"',
  ""
].join("\n");
if (rubyTestLauncher !== expectedRubyTestLauncher) {
  failures.push("Ruby test launcher must reject pre-interpreter execution controls exactly.");
}

const expectedPhonyTargets = [
  "help",
  "install",
  "install-ruby",
  "install-node",
  "install-browser",
  "build",
  "serve",
  "test",
  "test-unit",
  "test-js-unit",
  "test-browser",
  "verify-skills",
  "validate",
  "validate-production-assets",
  "validate-public-claims",
  "validate-route-content",
  "validate-services",
  "validate-service-studios",
  "validate-solutions",
  "validate-cinematic-solutions",
  "validate-smart-home",
  "validate-cinematic-system",
  "validate-physical-scene-states",
  "validate-cinematic-route-transitions",
  "validate-quality-policy",
  "html",
  "check",
  "clean"
];
const phonyTargets = makefile.match(/^\.PHONY:\s*(.+)$/mu)?.[1].trim().split(/\s+/u) ?? [];
if (phonyTargets.join(",") !== expectedPhonyTargets.join(",")) {
  failures.push("Makefile must retain the exact phony target inventory for every quality recipe.");
}

const namedTargets = [...namedMakeTargetCounts().keys()];
if (namedTargets.join(",") !== expectedPhonyTargets.join(",")) {
  failures.push("Makefile must define only the exact audited named target inventory.");
}
const allowedMakeRuleHeads = new Set([".PHONY", ...expectedPhonyTargets]);
const unauditedMakeRules = makefile
  .split("\n")
  .filter((line) => !/^\s*(?:#|$)/u.test(line) && !/^\t/u.test(line))
  .filter((line) => {
    const colon = line.indexOf(":");
    if (colon < 0 || line[colon + 1] === "=") return false;
    const ruleHeads = line.slice(0, colon).trim().split(/\s+/u);
    return ruleHeads.some((head) => !allowedMakeRuleHeads.has(head));
  });
if (unauditedMakeRules.length > 0) {
  failures.push("Makefile must not define pattern, suffix, special, or unaudited target rules.");
}

const expectedMakePrerequisites = new Map(expectedPhonyTargets.map((target) => [target, []]));
expectedMakePrerequisites.set("install", ["install-ruby", "install-node", "install-browser"]);
expectedMakePrerequisites.set("build", ["validate"]);
expectedMakePrerequisites.set("test", ["test-unit", "test-browser"]);
expectedMakePrerequisites.set("validate-public-claims", ["build"]);
expectedMakePrerequisites.set("html", ["validate-public-claims"]);
expectedMakePrerequisites.set("check", [
  "verify-skills",
  "validate-quality-policy",
  "test-unit",
  "validate-production-assets",
  "validate-public-claims",
  "validate-route-content",
  "validate-services",
  "validate-service-studios",
  "validate-solutions",
  "validate-cinematic-solutions",
  "validate-smart-home",
  "validate-cinematic-system",
  "validate-physical-scene-states",
  "validate-cinematic-route-transitions",
  "html",
  "test-browser"
]);
for (const [target, expectedPrerequisites] of expectedMakePrerequisites) {
  if (targetPrerequisites(target).join(",") !== expectedPrerequisites.join(",")) {
    failures.push(`Make target ${target} must retain its exact ordered prerequisite graph.`);
  }
}

const rubyUnitTestFiles = [
  "integration_config_test.rb",
  "service_contract_test.rb",
  "solution_contract_test.rb",
  "cinematic_solutions_contract_test.rb",
  "smart_home_contract_test.rb",
  "cinematic_contract_test.rb",
  "physical_scene_contract_test.rb",
  "service_studio_contract_test.rb",
  "route_content_contract_test.rb",
  "cinematic_route_transition_contract_test.rb",
  "production_assets_contract_test.rb",
  "public_claims_contract_test.rb"
];
const expectedMakeRecipes = new Map([
  ["install-node", ["npm ci --ignore-scripts"]],
  ["build", ["JEKYLL_ENV=production bundle exec jekyll build --trace"]],
  [
    "test-unit",
    [
      ...rubyUnitTestFiles.map(
        (fileName) => `sh scripts/run_ruby_test.sh tests/unit/${fileName}`
      ),
      "node scripts/run_node_tests.js"
    ]
  ],
  ["test-js-unit", ["node scripts/run_node_tests.js"]],
  [
    "test-browser",
    [
      "node scripts/validate_quality_policy.js",
      "node scripts/run_playwright_tests.js"
    ]
  ],
  ["test", []],
  ["verify-skills", ["bundle exec ruby scripts/verify_agent_skills.rb"]],
  ["validate", ["bundle exec ruby scripts/validate_integrations.rb"]],
  ["validate-production-assets", ["bundle exec ruby scripts/validate_production_assets.rb"]],
  ["validate-public-claims", ["bundle exec ruby scripts/validate_public_claims.rb"]],
  ["validate-route-content", ["bundle exec ruby scripts/validate_route_content.rb"]],
  ["validate-services", ["bundle exec ruby scripts/validate_services.rb"]],
  ["validate-service-studios", ["bundle exec ruby scripts/validate_service_studios.rb"]],
  ["validate-solutions", ["bundle exec ruby scripts/validate_solutions.rb"]],
  ["validate-cinematic-solutions", ["bundle exec ruby scripts/validate_cinematic_solutions.rb"]],
  ["validate-smart-home", ["bundle exec ruby scripts/validate_smart_home.rb"]],
  ["validate-cinematic-system", ["bundle exec ruby scripts/validate_cinematic_system.rb"]],
  ["validate-physical-scene-states", ["bundle exec ruby scripts/validate_physical_scene_states.rb"]],
  ["validate-cinematic-route-transitions", ["bundle exec ruby scripts/validate_cinematic_route_transitions.rb"]],
  ["validate-quality-policy", ["node scripts/validate_quality_policy.js"]],
  ["html", ["bundle exec htmlproofer ./_site --disable-external --no-enforce-https"]],
  ["check", []]
]);
for (const [target, expectedRecipe] of expectedMakeRecipes) {
  if (normalizedTargetRecipe(target).join("\n") !== expectedRecipe.join("\n")) {
    failures.push(`Make target ${target} must retain its exact fail-closed recipe.`);
  }
}

assertPrerequisites("test", ["test-unit", "test-browser"]);
assertPrerequisites("check", [
  "test-unit",
  "validate-quality-policy",
  "validate-production-assets",
  "validate-public-claims",
  "html",
  "test-browser",
]);

if (!targetRecipe("test-unit").includes("node scripts/run_node_tests.js")) {
  failures.push(
    "Make target test-unit must run the Node unit gate directly so inherited Make flags cannot bypass it."
  );
}

if (targetRecipe("test-js-unit").trim() !== "node scripts/run_node_tests.js") {
  failures.push(
    "Make target test-js-unit must run the exact Node test gate without selection arguments."
  );
}

if (
  normalizedTargetRecipe("test-browser").join("\n") !==
  "node scripts/validate_quality_policy.js\nnode scripts/run_playwright_tests.js"
) {
  failures.push(
    "Make target test-browser must revalidate policy immediately before the exact Playwright gate."
  );
}

if (!targetRecipe("test-unit").includes("scripts/run_ruby_test.sh tests/unit/production_assets_contract_test.rb")) {
  failures.push(
    "Make target test-unit must run the production asset contract so stale media metadata remains blocking."
  );
}

if (!targetRecipe("test-unit").includes("scripts/run_ruby_test.sh tests/unit/public_claims_contract_test.rb")) {
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

const expectedPackageScripts = {
  test: "node scripts/run_playwright_tests.js",
  "test:unit": "node scripts/run_node_tests.js",
  "test:browser": "node scripts/run_playwright_tests.js",
  "test:browser:headed": "playwright test --headed",
  "test:browser:update": "playwright test --update-snapshots",
  "validate:quality-policy": "node scripts/validate_quality_policy.js"
};
const sortedScriptEntries = (scripts) =>
  Object.entries(scripts ?? {}).sort(([left], [right]) => left.localeCompare(right));

if (
  JSON.stringify(sortedScriptEntries(packageJson.scripts)) !==
  JSON.stringify(sortedScriptEntries(expectedPackageScripts))
) {
  failures.push(
    "package.json scripts must retain the exact lifecycle-free quality command map."
  );
}

if (packageJson.scripts?.["test:unit"] !== "node scripts/run_node_tests.js") {
  failures.push(
    "npm test:unit must use the fail-closed Node test wrapper so skipped/todo tests block delivery."
  );
}

if (
  packageJson.scripts?.test !== "node scripts/run_playwright_tests.js" ||
  packageJson.scripts?.["test:browser"] !== "node scripts/run_playwright_tests.js"
) {
  failures.push(
    "npm browser test scripts must execute the complete Playwright suite without selection arguments."
  );
}

if (playwrightConfig.forbidOnly !== true) {
  failures.push("Playwright forbidOnly must be true in every local and CI run.");
}

const skippedTestReporters = (playwrightConfig.reporter ?? []).filter(
  ([reporter]) => reporter === "./scripts/fail_on_skipped_reporter.js"
);
if (skippedTestReporters.length !== 1) {
  failures.push(
    "Playwright must retain exactly one fail-on-skipped reporter so skipped/fixme tests block delivery."
  );
}

if (playwrightConfig.retries !== 0) {
  failures.push(
    `Playwright retries must be 0 so every failed test makes the quality gate fail (received ${playwrightConfig.retries}).`
  );
}

if (playwrightConfig.actionTimeout !== 10_000) {
  failures.push(
    `Playwright action timeout must be 10_000ms so a missing control fails promptly without extending the global test timeout (received ${playwrightConfig.actionTimeout}).`
  );
}

if (playwrightConfig.timeout !== undefined) {
  failures.push(
    `Playwright must not define a global test timeout (received ${playwrightConfig.timeout}).`
  );
}

if (playwrightConfig.workers !== 1) {
  failures.push(
    `Playwright workers must remain 1 so local and CI acceptance observe the same deterministic browser load (received ${playwrightConfig.workers}).`
  );
}

const expectedProjectNames = [
  "mobile-375",
  "tablet-768",
  "desktop-1024",
  "desktop-1440",
  "desktop-1980",
  "responsive-matrix",
  "final-acceptance",
  "motion-choreography"
];
const expectedRegularProjects = new Map([
  ["mobile-375", { width: 375, height: 812 }],
  ["tablet-768", { width: 768, height: 1024 }],
  ["desktop-1024", { width: 1024, height: 768 }],
  ["desktop-1440", { width: 1440, height: 1000 }],
  ["desktop-1980", { width: 1980, height: 1200 }]
]);
const expectedSpecializedProjects = new Map([
  ["responsive-matrix", {
    testMatch: "responsive_matrix\\.spec\\.js",
    testIgnore: ["final_acceptance\\.spec\\.js"],
    viewport: { width: 1980, height: 1200 }
  }],
  ["final-acceptance", {
    testMatch: "final_acceptance\\.spec\\.js",
    testIgnore: [],
    viewport: { width: 1980, height: 1200 }
  }],
  ["motion-choreography", {
    testMatch: "motion_choreography\\.spec\\.js",
    testIgnore: [],
    viewport: { width: 1440, height: 1000 }
  }]
]);
const expectedRegularIgnores = [
  "responsive_matrix\\.spec\\.js",
  "final_acceptance\\.spec\\.js",
  "motion_choreography\\.spec\\.js"
];
const patternSources = (value) =>
  (value === undefined ? [] : Array.isArray(value) ? value : [value]).map(
    (pattern) => pattern?.source ?? String(pattern)
  );
const sameViewport = (actual, expected) =>
  actual?.width === expected.width && actual?.height === expected.height;

const expectedGlobalConfigKeys = [
  "actionTimeout",
  "fullyParallel",
  "forbidOnly",
  "outputDir",
  "projects",
  "reporter",
  "retries",
  "testDir",
  "use",
  "webServer",
  "workers"
];
if (Object.keys(playwrightConfig).sort().join(",") !== expectedGlobalConfigKeys.sort().join(",")) {
  failures.push("Playwright global config must expose only the audited execution surface.");
}

const expectedGlobalUse = {
  baseURL: "http://127.0.0.1:4000",
  browserName: "chromium",
  colorScheme: "dark",
  locale: "uk-UA",
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
  video: "retain-on-failure"
};
if (JSON.stringify(playwrightConfig.use) !== JSON.stringify(expectedGlobalUse)) {
  failures.push("Playwright global use options must retain the exact local Chromium contract.");
}

const expectedReporters = [
  ["list"],
  ["html", { open: "never", outputFolder: "artifacts/playwright-report" }],
  ["./scripts/fail_on_skipped_reporter.js"]
];
if (JSON.stringify(playwrightConfig.reporter) !== JSON.stringify(expectedReporters)) {
  failures.push("Playwright must retain the exact fail-closed reporter topology.");
}

if (
  playwrightConfig.testDir !== "./tests/browser" ||
  playwrightConfig.outputDir !== "artifacts/playwright-results" ||
  playwrightConfig.fullyParallel !== false ||
  playwrightConfig.globalTimeout !== undefined ||
  playwrightConfig.grep !== undefined ||
  playwrightConfig.grepInvert !== undefined ||
  playwrightConfig.testMatch !== undefined ||
  playwrightConfig.testIgnore !== undefined ||
  playwrightConfig.respectGitIgnore !== undefined ||
  playwrightConfig.shard !== undefined ||
  (playwrightConfig.repeatEach ?? 1) !== 1 ||
  (playwrightConfig.maxFailures ?? 0) !== 0 ||
  playwrightConfig.use?.browserName !== "chromium"
) {
  failures.push(
    "Playwright global config must retain the complete unfiltered Chromium test matrix."
  );
}

const projectNames = (playwrightConfig.projects ?? []).map(({ name }) => name);
if (projectNames.join(",") !== expectedProjectNames.join(",")) {
  failures.push(
    `Playwright projects must retain the exact acceptance matrix (received ${projectNames.join(",")}).`
  );
}

for (const project of playwrightConfig.projects ?? []) {
  const regularViewport = expectedRegularProjects.get(project.name);
  const expectedProjectKeys = regularViewport
    ? ["name", "testIgnore", "use"]
    : project.name === "responsive-matrix"
      ? ["name", "testIgnore", "testMatch", "use"]
      : ["name", "testMatch", "use"];
  if (Object.keys(project).sort().join(",") !== expectedProjectKeys.sort().join(",")) {
    failures.push(
      `Playwright project ${project.name ?? "<unnamed>"} must expose only its exact audited fields.`
    );
  }
  if (Object.keys(project.use ?? {}).join(",") !== "viewport") {
    failures.push(
      `Playwright project ${project.name ?? "<unnamed>"} may override only its viewport.`
    );
  }

  if (
    project.grep !== undefined ||
    project.grepInvert !== undefined ||
    project.testDir !== undefined ||
    project.respectGitIgnore !== undefined ||
    project.dependencies !== undefined ||
    project.teardown !== undefined ||
    project.outputDir !== undefined ||
    project.fullyParallel !== undefined ||
    project.repeatEach !== undefined ||
    project.workers !== undefined ||
    project.shard !== undefined ||
    project.use?.browserName !== undefined
  ) {
    failures.push(
      `Playwright project ${project.name ?? "<unnamed>"} must not narrow browser execution.`
    );
  }

  if (regularViewport) {
    if (
      project.testMatch !== undefined ||
      patternSources(project.testIgnore).join(",") !== expectedRegularIgnores.join(",") ||
      !sameViewport(project.use?.viewport, regularViewport)
    ) {
      failures.push(
        `Playwright project ${project.name} must retain its complete regular-suite contract.`
      );
    }
    continue;
  }

  const specialized = expectedSpecializedProjects.get(project.name);
  if (
    !specialized ||
    patternSources(project.testMatch).join(",") !== specialized.testMatch ||
    patternSources(project.testIgnore).join(",") !== specialized.testIgnore.join(",") ||
    !sameViewport(project.use?.viewport, specialized.viewport)
  ) {
    failures.push(
      `Playwright project ${project.name ?? "<unnamed>"} must retain its specialized-suite contract.`
    );
  }
}

for (const project of playwrightConfig.projects ?? []) {
  const effectiveRetries = project.retries ?? playwrightConfig.retries;

  if (project.timeout !== undefined) {
    failures.push(
      `Playwright project ${project.name ?? "<unnamed>"} must not define a project-level test timeout (received ${project.timeout}).`
    );
  }

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

const allowedScopedTimeouts = new Map([
  ["tests/browser/final_acceptance.spec.js:600_000", 1],
  ["tests/browser/final_acceptance.spec.js:5_000", 1],
  ["tests/browser/motion_choreography.spec.js:45_000", 1]
]);
const actualScopedTimeouts = new Map();
let auditedDescribeConfigureCount = 0;
for (const filePath of collectTestSourceFiles(join(repositoryRoot, "tests", "browser"))) {
  const source = readFileSync(filePath, "utf8");
  const timeoutApiSurface = source
    .replace(/\btest\.setTimeout\(\s*[^)]*?\s*\)/gu, "")
    .replace(/\bwindow\.setTimeout\b/gu, "")
    .replace(/\bsetTimeout\(\s*resolveDelay\s*,\s*60\s*\)/gu, "");
  const auditedDescribeConfigure = /\btest\.describe\.configure\(\{ mode: "serial" \}\);/gu;
  auditedDescribeConfigureCount += [...source.matchAll(auditedDescribeConfigure)].length;
  const configureApiSurface = source.replace(auditedDescribeConfigure, "");
  const slowApi = /(?:\.\s*slow|\[\s*["']slow["']\s*\])/u;
  const alternateSetTimeoutApi = /\bsetTimeout\b/u;
  const unauditedConfigureApi = /\bconfigure\b/u;

  if (slowApi.test(source) || alternateSetTimeoutApi.test(timeoutApiSurface) || unauditedConfigureApi.test(configureApiSurface)) {
    failures.push(`${relative(repositoryRoot, filePath)} uses an unaudited Playwright timeout API.`);
  }

  for (const match of source.matchAll(/\btest\.setTimeout\(\s*([^)]*?)\s*\)/gu)) {
    const key = `${relative(repositoryRoot, filePath)}:${match[1]}`;
    actualScopedTimeouts.set(key, (actualScopedTimeouts.get(key) ?? 0) + 1);
  }
}

if (auditedDescribeConfigureCount !== 1) {
  failures.push(`Playwright must retain exactly one audited serial describe configuration (received ${auditedDescribeConfigureCount}).`);
}

if (actualScopedTimeouts.get("tests/browser/motion_choreography.spec.js:45_000") !== 1) {
  failures.push("Playwright must retain the measured 45_000ms choreography test timeout.");
}

for (const [key, count] of actualScopedTimeouts) {
  if (allowedScopedTimeouts.get(key) !== count) {
    failures.push(`Playwright may use only measured test-scoped timeout exceptions (received ${key} x${count}).`);
  }
}
for (const [key, count] of allowedScopedTimeouts) {
  if (actualScopedTimeouts.get(key) !== count) {
    failures.push(`Playwright must retain the audited test-scoped timeout ${key} x${count}.`);
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

for (const filePath of collectTestSourceFiles(join(repositoryRoot, "tests"))) {
  const source = readFileSync(filePath, "utf8");
  analyzeForbiddenTestAnnotations(source, filePath);
}

const webServerCommands = Array.isArray(playwrightConfig.webServer)
  ? playwrightConfig.webServer.map(({ command }) => command)
  : [playwrightConfig.webServer?.command];

for (const command of webServerCommands) {
  if (
    command !==
    "bundle exec jekyll serve --no-watch --host 127.0.0.1 --port 4000 --trace"
  ) {
    failures.push(
      "Playwright must start the exact deterministic no-watch Jekyll server."
    );
  }
}

if (
  Array.isArray(playwrightConfig.webServer) ||
  Object.keys(playwrightConfig.webServer ?? {}).sort().join(",") !==
    "command,reuseExistingServer,timeout,url" ||
  playwrightConfig.webServer?.url !== "http://127.0.0.1:4000" ||
  playwrightConfig.webServer?.reuseExistingServer !== false ||
  playwrightConfig.webServer?.timeout !== 120_000 ||
  playwrightConfig.use?.baseURL !== "http://127.0.0.1:4000"
) {
  failures.push(
    "Playwright must own one fresh local Jekyll server at the canonical loopback URL."
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exitCode = 1;
} else {
  console.log("Local quality policy is fail-closed; GitHub PR Quality is disabled.");
}
