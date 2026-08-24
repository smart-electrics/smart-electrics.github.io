# frozen_string_literal: true

require "fileutils"
require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"

class ServiceStudioContractTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  TARGETS = %w[
    electrical-design
    electrical-installation
    panels-and-protection
    lighting
    low-voltage
    backup-power
    smart-home-integration
    diagnostics-and-service
  ].freeze

  def validate(services, graph_path = File.join(ROOT, "_data", "cinematic_system.yml"))
    Open3.capture3("bundle", "exec", "ruby", "scripts/validate_service_studios.rb", services, graph_path, chdir: ROOT)
  end

  def copy_services
    Dir.mktmpdir("smart-electrics-service-studios") do |root|
      services = File.join(root, "_services")
      FileUtils.cp_r(File.join(ROOT, "_services"), services)
      yield services
    end
  end

  def copy_graph
    Dir.mktmpdir("smart-electrics-cinematic-system") do |root|
      graph = File.join(root, "cinematic_system.yml")
      FileUtils.cp(File.join(ROOT, "_data", "cinematic_system.yml"), graph)
      yield graph
    end
  end

  def test_accepts_the_eight_declared_service_studios
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

  def test_requires_the_exact_declared_relation_for_each_single_relation_studio
    {
      "backup-power" => ["backup-power--backup", "panels-and-protection--panel-assembly"],
      "diagnostics-and-service" => ["diagnostics-and-service--diagnostics", "low-voltage--cctv"]
    }.each do |slug, (declared_relation, wrong_relation)|
      copy_services do |services|
        path = File.join(services, "#{slug}.md")
        File.write(path, File.read(path).sub(declared_relation, wrong_relation))
        _stdout, stderr, status = validate(services)

        refute_predicate status, :success?
        assert_includes stderr, "relation_id must declare the canonical relation for #{slug}"
      end
    end

    copy_services do |services|
      _stdout, stderr, status = validate(services)

      assert_predicate status, :success?, stderr
    end
  end

  def test_derives_single_relation_contracts_from_the_canonical_graph_mapping
    copy_services do |services|
      copy_graph do |graph_path|
        graph = YAML.safe_load(File.read(graph_path), permitted_classes: [], aliases: false)
        graph.fetch("service_studio_relation_ids")["backup-power"] = ["diagnostics-and-service--diagnostics"]
        File.write(graph_path, YAML.dump(graph))

        _stdout, stderr, status = validate(services, graph_path)

        refute_predicate status, :success?
        assert_includes stderr, "backup-power.md: service_studio: relation_id must declare the canonical relation for backup-power"
      end
    end
  end

  def test_requires_studios_for_every_declared_service_route
    copy_services do |services|
      TARGETS.each do |slug|
        path = File.join(services, "#{slug}.md")
        File.write(path, File.read(path).sub(/\nservice_studio:.*?\n---\n\z/m, "\n---\n"))
      end
      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      TARGETS.each do |slug|
        assert_includes stderr, "#{slug}.md: service_studio must be a mapping"
      end
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

  def test_validates_the_new_owned_relations_schema_and_specific_forbidden_claims
    copy_services do |services|
      path = File.join(services, "smart-home-integration.md")
      invalid_schema = File.read(path).sub("relation_ids:", "relation_id:")
      File.write(path, invalid_schema)
      _stdout, stderr, status = validate(services)
      refute_predicate status, :success?
      assert_includes stderr, "fields must be exactly direction_id, relation_ids, states"
    end

    {
      "smart-home-integration" => [
        ["smart-home-integration--curtains-tulle-roller-shutters", "smart-home-integration--invented", "relation_ids must reference the canonical cinematic graph"],
        ["smart-home-integration--curtains-tulle-roller-shutters", "smart-home-integration--climate", "relation_ids must not contain duplicates"],
        ["smart-home-integration--climate", "lighting--outdoor-lighting", "relation_ids must be owned by smart-home-integration"]
      ]
    }.each do |slug, cases|
      cases.each do |from, to, expected_error|
        copy_services do |services|
          path = File.join(services, "#{slug}.md")
          File.write(path, File.read(path).sub(from, to))
          _stdout, stderr, status = validate(services)
          refute_predicate status, :success?
          assert_includes stderr, expected_error
        end
      end
    end

    [
      ["backup-power", "Що має залишатися в роботі", "поточний стан runtime"],
      ["smart-home-integration", "Зони та функції", "автоматично керує"],
      ["diagnostics-and-service", "З чого починається перевірка", "виявлена аварія"],
      ["diagnostics-and-service", "Як звужують ділянку", "завершена діагностика"],
      ["diagnostics-and-service", "Що перевіряти далі", "вимір 12"]
    ].each do |slug, original_title, wording|
      copy_services do |services|
        path = File.join(services, "#{slug}.md")
        File.write(path, File.read(path).sub("title: #{original_title}", "title: #{wording}"))
        _stdout, stderr, status = validate(services)
        refute_predicate status, :success?
        assert_includes stderr, "must not contain forbidden live-video, vendor, portal, recording, tracking, or guarantee wording"
      end
    end
  end

  def test_rejects_price_certificate_and_fictional_completion_claims_in_all_new_studios
    [
      ["backup-power", "Що має залишатися в роботі", "ціна"],
      ["backup-power", "Що має залишатися в роботі", "вартість"],
      ["backup-power", "Що має залишатися в роботі", "₴"],
      ["smart-home-integration", "Зони та функції", "сертифікат"],
      ["diagnostics-and-service", "З чого починається перевірка", "реалізований проєкт"],
      ["diagnostics-and-service", "З чого починається перевірка", "виконаний об’єкт"],
      ["backup-power", "Що має залишатися в роботі", "price"],
      ["smart-home-integration", "Зони та функції", "certificate"],
      ["diagnostics-and-service", "З чого починається перевірка", "completed project"]
    ].each do |slug, original_title, wording|
      copy_services do |services|
        path = File.join(services, "#{slug}.md")
        File.write(path, File.read(path).sub("title: #{original_title}", "title: #{wording}"))
        _stdout, stderr, status = validate(services)

        refute_predicate status, :success?
        assert_includes stderr, "must not contain forbidden live-video, vendor, portal, recording, tracking, or guarantee wording"
      end
    end
  end
end
