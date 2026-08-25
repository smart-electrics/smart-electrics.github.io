# frozen_string_literal: true

require "fileutils"
require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"

class CinematicSolutionsContractTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  EXPECTED_SLUGS = %w[
    apartment-comfort-and-control
    private-house-full-automation
    architectural-lighting
    energy-autonomy
    security-and-access-control
    commercial-space
  ].freeze

  def validate(data_path = File.join(ROOT, "_data", "cinematic_solutions.yml"), solutions = File.join(ROOT, "_solutions"))
    Open3.capture3(
      "bundle", "exec", "ruby", "scripts/validate_cinematic_solutions.rb", data_path,
      File.join(ROOT, "_data", "cinematic_system.yml"), solutions,
      chdir: ROOT
    )
  end

  def canonical_mapping
    YAML.safe_load(File.read(File.join(ROOT, "_data", "cinematic_solutions.yml")), permitted_classes: [], aliases: false)
  end

  def with_mapping(mapping)
    Dir.mktmpdir("smart-electrics-cinematic-solutions") do |directory|
      path = File.join(directory, "cinematic_solutions.yml")
      File.write(path, YAML.dump(mapping))
      yield path
    end
  end

  def copy_solutions
    Dir.mktmpdir("smart-electrics-cinematic-solutions") do |directory|
      solutions = File.join(directory, "_solutions")
      FileUtils.cp_r(File.join(ROOT, "_solutions"), solutions)
      yield solutions
    end
  end

  def assert_solution_copy_rejected(replacement)
    copy_solutions do |solutions|
      path = File.join(solutions, "energy-autonomy.md")
      source = File.read(path)
      File.write(path, source.sub("Для власника об’єкта", replacement))
      _stdout, stderr, status = validate(File.join(ROOT, "_data", "cinematic_solutions.yml"), solutions)

      refute_predicate status, :success?
      assert_includes stderr, "energy-autonomy.md: must not contain forbidden claims"
    end
  end

  def assert_solution_copy_accepted(replacement)
    copy_solutions do |solutions|
      path = File.join(solutions, "energy-autonomy.md")
      source = File.read(path)
      File.write(path, source.sub("Для власника об’єкта", replacement))
      _stdout, stderr, status = validate(File.join(ROOT, "_data", "cinematic_solutions.yml"), solutions)

      assert_predicate status, :success?, stderr
    end
  end

  def assert_rejected(mapping, expected_error)
    with_mapping(mapping) do |path|
      _stdout, stderr, status = validate(path)

      refute_predicate status, :success?
      assert_includes stderr, expected_error
    end
  end

  def test_accepts_the_exact_six_solution_mapping
    _stdout, stderr, status = validate

    assert_predicate status, :success?, stderr
  end

  def test_rejects_an_extra_or_misordered_solution_mapping
    mapping = canonical_mapping
    mapping["invented-solution"] = {
      "direction_ids" => mapping.fetch("commercial-space").fetch("direction_ids").dup,
      "relation_id" => mapping.fetch("commercial-space").fetch("relation_id")
    }
    assert_rejected(mapping, "cinematic_solutions.yml must contain exactly the six solution slugs in canonical order")

    mapping = canonical_mapping
    entries = mapping.to_a
    swapped = Hash[[entries[1], entries[0], *entries.drop(2)]]
    assert_rejected(swapped, "cinematic_solutions.yml must contain exactly the six solution slugs in canonical order")
  end

  def test_rejects_wrong_mapping_schema_and_direction_order
    mapping = canonical_mapping
    mapping.fetch("apartment-comfort-and-control")["relation_ids"] = ["smart-home-integration--climate"]
    assert_rejected(mapping, "apartment-comfort-and-control: fields must be exactly direction_ids, relation_id")

    mapping = canonical_mapping
    mapping.fetch("architectural-lighting").fetch("direction_ids").reverse!
    assert_rejected(mapping, "architectural-lighting: direction_ids must equal the canonical ordered service IDs")
  end

  def test_rejects_unknown_duplicate_or_non_owner_relations
    mapping = canonical_mapping
    mapping.fetch("energy-autonomy")["relation_id"] = "backup-power--invented"
    assert_rejected(mapping, "energy-autonomy: relation_id must reference the canonical cinematic graph")

    mapping = canonical_mapping
    mapping.fetch("private-house-full-automation")["direction_ids"] << "backup-power"
    assert_rejected(mapping, "private-house-full-automation: direction_ids must not contain duplicates")

    mapping = canonical_mapping
    mapping.fetch("apartment-comfort-and-control")["relation_id"] = "backup-power--backup"
    assert_rejected(mapping, "apartment-comfort-and-control: relation_id owner must be included in direction_ids")

    mapping = canonical_mapping
    mapping.fetch("energy-autonomy")["relation_id"] = "smart-home-integration--climate"
    assert_rejected(mapping, "cinematic_solutions.yml must match the canonical mapping integrity fingerprint")
  end

  def test_rejects_front_matter_that_competes_with_the_central_mapping
    copy_solutions do |solutions|
      path = File.join(solutions, "security-and-access-control.md")
      File.write(path, File.read(path).sub("  - low-voltage\n", "  - lighting\n"))
      _stdout, stderr, status = validate(File.join(ROOT, "_data", "cinematic_solutions.yml"), solutions)

      refute_predicate status, :success?
      assert_includes stderr, "security-and-access-control.md: related_services must equal cinematic_solutions.direction_ids"
    end
  end

  def test_rejects_an_image_focus_value_that_cannot_be_safely_rendered_as_css
    copy_solutions do |solutions|
      path = File.join(solutions, "architectural-lighting.md")
      File.write(path, File.read(path).sub("image_focus: 50% 50%", "image_focus: \"50%; color: red\""))
      _stdout, stderr, status = validate(File.join(ROOT, "_data", "cinematic_solutions.yml"), solutions)

      refute_predicate status, :success?
      assert_includes stderr, "architectural-lighting.md: image_focus must be a CSS-safe percentage pair"
    end
  end

  def test_rejects_solution_front_matter_that_tries_to_own_the_atlas_topology
    copy_solutions do |solutions|
      path = File.join(solutions, "commercial-space.md")
      File.write(path, File.read(path).sub("related_solutions:\n", "cinematic_solution_relation_id: smart-home-integration--climate\nrelated_solutions:\n"))
      _stdout, stderr, status = validate(File.join(ROOT, "_data", "cinematic_solutions.yml"), solutions)

      refute_predicate status, :success?
      assert_includes stderr, "commercial-space.md: cinematic topology must live only in _data/cinematic_solutions.yml"
    end
  end

  def test_rejects_solution_specific_claims_without_rejecting_neutral_planning_copy
    [
      "Відгук клієнта для власника об’єкта",
      "Рейтинг рішення для власника об’єкта",
      "Testimonial клієнта для власника об’єкта",
      "Кейс клієнта з результатом для власника об’єкта",
      "Клієнт отримав результат для власника об’єкта",
      "Систему встановлено для власника об’єкта",
      "Щит змонтовано для власника об’єкта",
      "Реалізовано керування освітленням для власника об’єкта",
      "Сумісний з протоколом виробника для власника об’єкта",
      "Compatible with a vendor protocol для власника об’єкта",
      "Підтримує протокол KNX для власника об’єкта",
      "Площа 120 м² для власника об’єкта",
      "12 шт. груп для власника об’єкта",
      "24 точки для власника об’єкта",
      "3 зони для власника об’єкта",
      "1 день для власника об’єкта",
      "24 години для власника об’єкта",
      "5 кВт для власника об’єкта",
      "5 Вт для власника об’єкта",
      "80% для власника об’єкта",
      "Ціна реалізованого проєкту для власника об’єкта"
    ].each { |replacement| assert_solution_copy_rejected(replacement) }

    [
      "Встановлення точок планують для власника об’єкта",
      "Сумісне планування етапів для власника об’єкта"
    ].each { |replacement| assert_solution_copy_accepted(replacement) }

    _stdout, stderr, status = validate
    assert_predicate status, :success?, stderr
  end
end
