import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const checkoutPin = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const codeqlPin = "db488ddef3bf6cb639b32c2e9a7c0a7ea8271d28";

test("Quality is a pinned pull-request gate with dispatch and retained success evidence", () => {
  const workflow = read(".github/workflows/quality.yml");

  assert.match(workflow, /^on:\n  pull_request:\n    branches: \[main\]\n  workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^  push:/mu);
  assert.match(workflow, /^  quality:\n    name: quality$/mu);
  assert.match(workflow, /^    timeout-minutes: 45$/mu);
  assert.match(workflow, new RegExp(`uses: actions/checkout@${checkoutPin}`));
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

test("CodeQL remains an automatic and manual gate with every action pinned", () => {
  const workflow = read(".github/workflows/codeql.yml");

  assert.match(
    workflow,
    /^on:\n  push:\n    branches: \[main\]\n  pull_request:\n    branches: \[main\]\n  workflow_dispatch:\n  schedule:/mu
  );
  assert.match(workflow, new RegExp(`uses: actions/checkout@${checkoutPin}`));
  assert.match(workflow, new RegExp(`uses: github/codeql-action/init@${codeqlPin}`));
  assert.match(workflow, new RegExp(`uses: github/codeql-action/analyze@${codeqlPin}`));
  assert.doesNotMatch(workflow, /uses:\s+[^\n]+@v\d+/u);
});

test("the local quality validator approves the final PR-gate policy", () => {
  const result = spawnSync(process.execPath, ["scripts/validate_quality_policy.js"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Quality policy is fail-closed and blocks pull requests/u);
});
