# frozen_string_literal: true

require "minitest/autorun"
require "fileutils"
require "open3"
require "tmpdir"
require "yaml"

class PhysicalSceneContractTest < Minitest::Test
  def project_root
    File.expand_path("../..", __dir__)
  end

  def validate(path = File.join(project_root, "_data/physical_scene_states.yml"), repository_root = project_root)
    Open3.capture3("bundle", "exec", "ruby", "scripts/validate_physical_scene_states.rb", path, repository_root, chdir: project_root)
  end

  def canonical_data
    YAML.safe_load(File.read(File.join(project_root, "_data/physical_scene_states.yml")), permitted_classes: [], aliases: false)
  end

  def assert_rejected(data, expected_error)
    Dir.mktmpdir("smart-electrics-physical-scene") do |directory|
      path = File.join(directory, "physical_scene_states.yml")
      File.write(path, YAML.dump(data))
      _stdout, stderr, status = validate(path)
      refute_predicate status, :success?
      assert_includes stderr, expected_error
    end
  end

  def systems(data)
    data.fetch("systems")
  end

  def room(data)
    systems(data).fetch(0)
  end

  def stairs(data)
    systems(data).fetch(1)
  end

  def test_accepts_room_stair_and_exterior_canonical_media_mappings
    _stdout, stderr, status = validate
    assert_predicate status, :success?, stderr
  end

  def test_rejects_an_absent_cross_axis_mapping
    data = canonical_data
    room(data).fetch("scenes").pop
    assert_rejected(data, "system 1: scenes must contain exactly one mapping for every control combination")

    data = canonical_data
    stairs(data).fetch("scenes").pop
    assert_rejected(data, "system 2: scenes must contain exactly one mapping for every control combination")
  end

  def test_rejects_an_untruthful_media_filename_or_missing_alt
    data = canonical_data
    stairs(data).fetch("scenes").first["src_1536"] = "/assets/images/cinematic/residence/stairs-wrong-1536.webp"
    assert_rejected(data, "system 2 scene 1: src_1536 must match its physical state")

    data = canonical_data
    systems(data).fetch(2).fetch("scenes").first["alt"] = " "
    assert_rejected(data, "system 3 scene 1: alt must be a non-empty scalar or mapping")
  end

  def test_rejects_a_missing_or_empty_mapped_production_file
    data = canonical_data
    Dir.mktmpdir("smart-electrics-physical-media") do |repository_root|
      systems(data).each do |system|
        system.fetch("scenes").each do |scene|
          %w[src_768 src_1536].each do |field|
            path = File.join(repository_root, scene.fetch(field).sub(%r{\A/}, ""))
            FileUtils.mkdir_p(File.dirname(path))
            File.write(path, "fixture")
          end
        end
      end
      data_path = File.join(repository_root, "physical_scene_states.yml")
      File.write(data_path, YAML.dump(data))
      _stdout, stderr, status = validate(data_path, repository_root)
      assert_predicate status, :success?, stderr

      missing = File.join(repository_root, stairs(data).fetch("scenes").first.fetch("src_768").sub(%r{\A/}, ""))
      File.delete(missing)
      _stdout, stderr, status = validate(data_path, repository_root)
      refute_predicate status, :success?
      assert_includes stderr, "system 2 scene 1: mapped production file must exist and be non-empty"

      File.write(missing, "")
      _stdout, stderr, status = validate(data_path, repository_root)
      refute_predicate status, :success?
      assert_includes stderr, "system 2 scene 1: mapped production file must exist and be non-empty"
    end
  end
end
