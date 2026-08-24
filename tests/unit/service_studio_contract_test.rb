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

  def test_requires_studios_for_lighting_and_low_voltage
    copy_services do |services|
      %w[lighting low-voltage].each do |slug|
        path = File.join(services, "#{slug}.md")
        File.write(path, File.read(path).sub(/\nservice_studio:.*?\n---\n\z/m, "\n---\n"))
      end
      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "lighting.md: service_studio must be a mapping"
      assert_includes stderr, "low-voltage.md: service_studio must be a mapping"
    end
  end

  def test_rejects_duplicate_non_owner_and_forbidden_multi_relation_studio_configuration
    copy_services do |services|
      path = File.join(services, "lighting.md")
      duplicate = File.read(path).sub("    - lighting--outdoor-lighting", "    - lighting--stair-lighting")
      File.write(path, duplicate)
      _stdout, stderr, status = validate(services)
      refute_predicate status, :success?
      assert_includes stderr, "relation_ids must not contain duplicates"
    end

    copy_services do |services|
      path = File.join(services, "lighting.md")
      non_owner = File.read(path).sub("lighting--outdoor-lighting", "low-voltage--cctv")
      File.write(path, non_owner)
      _stdout, stderr, status = validate(services)
      refute_predicate status, :success?
      assert_includes stderr, "relation_ids must be owned by lighting"
    end

    copy_services do |services|
      path = File.join(services, "low-voltage.md")
      forbidden = File.read(path).sub("Логіка зв’язків", "Портал live video")
      File.write(path, forbidden)
      _stdout, stderr, status = validate(services)
      refute_predicate status, :success?
      assert_includes stderr, "must not contain forbidden live-video, vendor, portal, recording, tracking, or guarantee wording"
    end
  end

  def test_rejects_unknown_relation_and_every_forbidden_claim_category
    copy_services do |services|
      path = File.join(services, "lighting.md")
      unknown = File.read(path).sub("lighting--outdoor-lighting", "lighting--invented")
      File.write(path, unknown)
      _stdout, stderr, status = validate(services)
      refute_predicate status, :success?
      assert_includes stderr, "relation_ids must reference the canonical cinematic graph"
    end

    ["live video", "live-video", "портал", "vendor", "вендор", "запис", "recording", "відстеження", "tracking", "гарантія", "guarantee"].each do |wording|
      copy_services do |services|
        path = File.join(services, "low-voltage.md")
        forbidden = File.read(path).sub("Логіка зв’язків", wording)
        File.write(path, forbidden)
        _stdout, stderr, status = validate(services)
        refute_predicate status, :success?
        assert_includes stderr, "must not contain forbidden live-video, vendor, portal, recording, tracking, or guarantee wording"
      end
    end
  end
end
