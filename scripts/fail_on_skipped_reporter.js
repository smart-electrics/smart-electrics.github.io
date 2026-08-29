const AUDITED_PLAYWRIGHT_TEST_COUNT = 700;

export default class FailOnSkippedReporter {
  constructor(options = {}) {
    this.violations = [];
    this.report = options.report ?? ((message) => console.error(message));
    this.discoveryViolation = null;
  }

  onBegin(_config, suite) {
    const testCount = suite.allTests().length;
    if (testCount !== AUDITED_PLAYWRIGHT_TEST_COUNT) {
      this.discoveryViolation =
        "Quality policy violation: Playwright discovered an incomplete suite " +
        `(expected=${AUDITED_PLAYWRIGHT_TEST_COUNT}, received=${testCount}).`;
    }
  }

  onTestEnd(test, result) {
    const expectedStatus = test.expectedStatus ?? "passed";
    if (result.status === "passed" && expectedStatus === "passed") return;

    const titlePath = typeof test.titlePath === "function"
      ? test.titlePath().filter(Boolean).join(" > ")
      : test.title ?? "<unknown test>";
    this.violations.push(`${titlePath} [result=${result.status}, expected=${expectedStatus}]`);
  }

  onEnd() {
    if (this.discoveryViolation) this.report(this.discoveryViolation);
    if (this.violations.length === 0 && !this.discoveryViolation) return undefined;

    if (this.violations.length > 0) {
      const heading =
        `Quality policy violation: ${this.violations.length} Playwright test(s) ` +
        "had a non-passing or expected-failure outcome:\n";
      this.report(
        heading + this.violations.map((title) => `- ${title}`).join("\n")
      );
    }
    return { status: "failed" };
  }

  printsToStdio() {
    return false;
  }
}
