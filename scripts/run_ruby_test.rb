# frozen_string_literal: true

EXPECTED_RESULTS = {
  "integration_config_test.rb" => [4, 9],
  "service_contract_test.rb" => [15, 58],
  "solution_contract_test.rb" => [18, 76],
  "cinematic_solutions_contract_test.rb" => [9, 515],
  "smart_home_contract_test.rb" => [17, 369],
  "cinematic_contract_test.rb" => [21, 252],
  "physical_scene_contract_test.rb" => [7, 1158],
  "service_studio_contract_test.rb" => [13, 250],
  "route_content_contract_test.rb" => [8, 132],
  "cinematic_route_transition_contract_test.rb" => [1, 2],
  "production_assets_contract_test.rb" => [6, 94],
  "public_claims_contract_test.rb" => [14, 382],
  "landing_inline_css_contract_test.rb" => [5, 48]
}.freeze

require "open3"
require "rbconfig"

repository_root = File.expand_path("..", __dir__)
unit_test_root = File.realpath(File.join(repository_root, "tests", "unit"))
test_path = ARGV.length == 1 && File.file?(ARGV.first) ? File.realpath(ARGV.first) : nil
expected_result = test_path && EXPECTED_RESULTS[File.basename(test_path)]
unless test_path&.start_with?("#{unit_test_root}#{File::SEPARATOR}") && expected_result
  warn(
    "Quality policy violation: Ruby test wrapper requires exactly one audited " \
    "tests/unit/*_test.rb file."
  )
  exit 1
end

stdout, stderr, status = Open3.capture3(RbConfig.ruby, "-Itest", test_path)
print stdout
warn stderr unless stderr.empty?

exit(status.exitstatus || 1) unless status.success?

summary_pattern =
  /^(\d+) runs,\s+(\d+) assertions,\s+(\d+) failures,\s+(\d+) errors,\s+(\d+) skips$/
summaries = stdout.scan(summary_pattern)

unless summaries.length == 1
  warn "Quality policy violation: Ruby test output must contain exactly one Minitest summary."
  exit 1
end

runs, assertions, failures, errors, skips = summaries.first.map(&:to_i)
expected_runs, expected_assertions = expected_result
if runs != expected_runs || assertions != expected_assertions ||
   failures.positive? || errors.positive? || skips.positive?
  warn(
    "Quality policy violation: Ruby tests are not fully passing " \
    "(expected_runs=#{expected_runs}, runs=#{runs}, " \
    "expected_assertions=#{expected_assertions}, assertions=#{assertions}, " \
    "failures=#{failures}, errors=#{errors}, skips=#{skips})."
  )
  exit 1
end
