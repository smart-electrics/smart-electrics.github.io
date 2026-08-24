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

  def test_accepts_all_twenty_canonical_room_media_pairs
    _stdout, stderr, status = validate
    assert_predicate status, :success?, stderr
  end

  def test_rejects_an_absent_cross_axis_mapping
    data = canonical_data
    data.fetch("scenes").pop
    assert_rejected(data, "scenes must contain exactly one mapping for every lighting and window-treatment pair")
  end

  def test_rejects_an_untruthful_media_filename_or_missing_alt
    data = canonical_data
    data.fetch("scenes").first["src_1536"] = "/assets/images/cinematic/residence/room-wrong-1536.webp"
    assert_rejected(data, "scene 1: src_1536 must match its lighting/window-treatment pair")

    data = canonical_data
    data.fetch("scenes").first["alt"] = " "
    assert_rejected(data, "scene 1: alt must be a non-empty scalar")
  end

  def test_rejects_a_missing_or_empty_mapped_production_file
    data = canonical_data
    Dir.mktmpdir("smart-electrics-physical-media") do |repository_root|
      data.fetch("scenes").each do |scene|
        %w[src_768 src_1536].each do |field|
          path = File.join(repository_root, scene.fetch(field).sub(%r{\A/}, ""))
          FileUtils.mkdir_p(File.dirname(path))
          File.write(path, "fixture")
        end
      end
      data_path = File.join(repository_root, "physical_scene_states.yml")
      File.write(data_path, YAML.dump(data))
      _stdout, stderr, status = validate(data_path, repository_root)
      assert_predicate status, :success?, stderr

      missing = File.join(repository_root, data.fetch("scenes").first.fetch("src_768").sub(%r{\A/}, ""))
      File.delete(missing)
      _stdout, stderr, status = validate(data_path, repository_root)
      refute_predicate status, :success?
      assert_includes stderr, "scene 1: mapped production file must exist and be non-empty"

      File.write(missing, "")
      _stdout, stderr, status = validate(data_path, repository_root)
      refute_predicate status, :success?
      assert_includes stderr, "scene 1: mapped production file must exist and be non-empty"
    end
  end
end
