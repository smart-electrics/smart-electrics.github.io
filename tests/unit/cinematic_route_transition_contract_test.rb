# frozen_string_literal: true

require "minitest/autorun"
require "open3"

class CinematicRouteTransitionContractTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)

  def validate
    Open3.capture3("bundle", "exec", "ruby", "scripts/validate_cinematic_route_transitions.rb", chdir: ROOT)
  end

  def test_accepts_the_bounded_opt_in_route_transition_contract
    _stdout, stderr, status = validate

    assert_predicate status, :success?, stderr
  end
end
