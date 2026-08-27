import { spawnSync } from "node:child_process";

const EXPECTED_NODE_TEST_COUNT = 71;
const forwardedArguments = process.argv.slice(2);
const forbiddenArguments = forwardedArguments.filter((argument) => argument.startsWith("-"));
const forbiddenEnvironment = ["NODE_OPTIONS", "NODE_TEST_CONTEXT"].filter(
  (name) => (process.env[name] ?? "").trim() !== ""
);

if (forbiddenArguments.length > 0 || forbiddenEnvironment.length > 0) {
  console.error(
    "Quality policy violation: Node test options and inherited test controls are forbidden " +
    `(${[...forbiddenArguments, ...forbiddenEnvironment].join(", ")}).`
  );
  process.exitCode = 1;
} else {
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=tap", ...forwardedArguments],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    }
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.error(`Unable to run the Node test gate: ${result.error.message}`);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    const summaryNames = ["tests", "pass", "fail", "cancelled", "skipped", "todo"];
    const summaries = new Map(
      summaryNames.map((name) => [
        name,
        [...result.stdout.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gmu"))]
      ])
    );

    if ([...summaries.values()].some((matches) => matches.length !== 1)) {
      console.error(
        "Quality policy violation: Node test summary must contain exactly one complete result count."
      );
      process.exitCode = 1;
    } else {
      const count = (name) => Number(summaries.get(name)[0][1]);
      const tests = count("tests");
      const passed = count("pass");
      const failed = count("fail");
      const cancelled = count("cancelled");
      const skipped = count("skipped");
      const todo = count("todo");

      if (skipped > 0 || todo > 0) {
        console.error(
          `Quality policy violation: Node tests reported ${skipped} skipped and ${todo} todo test(s).`
        );
        process.exitCode = 1;
      } else if (tests !== EXPECTED_NODE_TEST_COUNT) {
        console.error(
          "Quality policy violation: Node test discovery returned an incomplete suite " +
          `(expected=${EXPECTED_NODE_TEST_COUNT}, received=${tests}).`
        );
        process.exitCode = 1;
      } else if (passed !== tests || failed > 0 || cancelled > 0) {
        console.error(
          "Quality policy violation: Node test summary is not fully passing " +
          `(tests=${tests}, pass=${passed}, fail=${failed}, cancelled=${cancelled}).`
        );
        process.exitCode = 1;
      }
    }
  }
}
