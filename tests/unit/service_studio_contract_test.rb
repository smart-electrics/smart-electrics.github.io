# frozen_string_literal: true

require "fileutils"
require "minitest/autorun"
require "open3"
require "tmpdir"

class ServiceStudioContractTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  TARGETS = %w[electrical-design electrical-installation panels-and-protection].freeze

  def validate(services)
    Open3.capture3("bundle", "exec", "ruby", "scripts/validate_service_studios.rb", services, chdir: ROOT)
  end

  def copy_services
    Dir.mktmpdir("smart-electrics-service-studios") do |root|
      services = File.join(root, "_services")
      FileUtils.cp_r(File.join(ROOT, "_services"), services)
      yield services
    end
  end

  def test_accepts_the_three_declared_service_studios
    copy_services do |services|
      _stdout, stderr, status = validate(services)

      assert_predicate status, :success?, stderr
    end
  end

  def test_rejects_a_studio_relation_outside_the_canonical_graph
    copy_services do |services|
      path = File.join(services, "electrical-design.md")
      document = File.read(path).sub(
        "relation_id: panels-and-protection--panel-assembly",
        "relation_id: electrical-design--invented"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "relation_id must reference the canonical cinematic graph"
    end
  end
end
