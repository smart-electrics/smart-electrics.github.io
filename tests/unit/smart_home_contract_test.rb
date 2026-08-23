# frozen_string_literal: true

require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"

class SmartHomeContractTest < Minitest::Test
  SCENARIOS = %w[morning arrival evening away night heat backup].freeze
  ZONES = %w[entry passage living private technical stairs exterior].freeze
  SYSTEMS = %w[lighting climate access security panel low-voltage backup-power audio shading].freeze
  VISUALS = %w[interior shading stairs exterior climate].freeze
  REQUIRED_SCALAR_FIELDS = %w[id label eyebrow title event scene_label project_note live_summary].freeze

  def project_root
    File.expand_path("../..", __dir__)
  end

  def valid_contract
    YAML.safe_load(
      File.read(File.join(project_root, "_data/smart_home.yml")),
      permitted_classes: [],
      aliases: false
    )
  end

  def with_contract(contract = valid_contract)
    Dir.mktmpdir("smart-electrics-smart-home") do |directory|
      path = File.join(directory, "smart_home.yml")
      File.write(path, YAML.dump(contract))
      yield path
    end
  end

  def validate(path)
    Open3.capture3(
      "bundle", "exec", "ruby", "scripts/validate_smart_home.rb", path, project_root,
      chdir: project_root
    )
  end

  def scenario(contract, id = "morning")
    contract.fetch("scenarios").find { |candidate| candidate.fetch("id") == id }
  end

  def assert_rejected(contract, expected_error)
    with_contract(contract) do |path|
      _stdout, stderr, status = validate(path)

      refute_predicate status, :success?
      assert_includes stderr, expected_error
    end
  end

  def test_accepts_the_complete_seven_scenario_spatial_contract
    contract = valid_contract
    assert_equal SCENARIOS, contract.fetch("scenarios").map { |item| item.fetch("id") }
    assert_equal ZONES, contract.dig("spatial", "zones").map { |item| item.fetch("id") }
    assert_equal SYSTEMS, contract.dig("spatial", "systems").map { |item| item.fetch("id") }
    assert_equal VISUALS, contract.dig("spatial", "visuals").map { |item| item.fetch("id") }

    with_contract(contract) do |path|
      _stdout, stderr, status = validate(path)
      assert_predicate status, :success?, stderr
    end
  end

  def test_rejects_missing_or_reordered_scenario_zone_system_or_visual_ids
    contract = valid_contract
    contract["scenarios"].reverse!
    assert_rejected(contract, "scenarios must contain exactly the canonical seven IDs in order")

    contract = valid_contract
    contract.dig("spatial", "zones").last["id"] = "yard"
    assert_rejected(contract, "spatial zones must contain exactly the canonical 7 IDs in order")

    contract = valid_contract
    contract.dig("spatial", "systems").last["id"] = "blinds"
    assert_rejected(contract, "spatial systems must contain exactly the canonical 9 IDs in order")

    contract = valid_contract
    contract.dig("spatial", "visuals").reverse!
    assert_rejected(contract, "spatial visuals must contain exactly the canonical five IDs in order")
  end

  def test_rejects_duplicate_or_invalid_spatial_coordinates
    contract = valid_contract
    contract.dig("spatial", "zones")[1]["x"] = contract.dig("spatial", "zones")[0]["x"]
    contract.dig("spatial", "zones")[1]["y"] = contract.dig("spatial", "zones")[0]["y"]
    assert_rejected(contract, "spatial zones coordinates must be unique")

    contract = valid_contract
    contract.dig("spatial", "systems")[0]["x"] = 101
    assert_rejected(contract, "lighting: spatial systems x must be a number from 0 to 100")
  end

  def test_rejects_wrong_visual_asset_paths_or_missing_truthful_alt
    contract = valid_contract
    contract.dig("spatial", "visuals")[1]["desktop"] = "/assets/images/smart-home/wrong-1536.webp"
    assert_rejected(contract, "shading: spatial visual desktop must be /assets/images/smart-home/shading-1536.webp")

    contract = valid_contract
    contract.dig("spatial", "visuals")[0]["alt"] = " "
    assert_rejected(contract, "interior: spatial visual alt must be a non-empty scalar")
  end

  def test_rejects_missing_or_blank_required_scenario_and_simulator_copy
    REQUIRED_SCALAR_FIELDS.each do |field|
      contract = valid_contract
      scenario(contract).delete(field)
      assert_rejected(contract, "morning: #{field} must be a non-empty scalar")
    end

    contract = valid_contract
    contract.fetch("simulator")["controls_label"] = ""
    assert_rejected(contract, "simulator: controls_label must be a non-empty scalar")
  end

  def test_rejects_route_primary_and_every_logic_system_detail_violation
    contract = valid_contract
    scenario(contract).dig("logic", "route")[1] = "unknown-zone"
    assert_rejected(contract, "morning: logic route must only reference canonical zones")

    contract = valid_contract
    scenario(contract).dig("logic", "route")[1] = "private"
    assert_rejected(contract, "morning: logic route must not contain duplicate zone IDs")

    contract = valid_contract
    scenario(contract).dig("logic", "primary_system").replace("audio")
    assert_rejected(contract, "morning: logic primary_system must use the focus role")

    contract = valid_contract
    detail = scenario(contract).dig("logic", "systems").first
    detail["zone"] = "unknown-zone"
    assert_rejected(contract, "morning: logic system 1 zone must reference a canonical zone")

    contract = valid_contract
    detail = scenario(contract).dig("logic", "systems").first
    detail["role"] = "primary"
    assert_rejected(contract, "morning: logic system 1 role must be focus, support or quiet")

    contract = valid_contract
    detail = scenario(contract).dig("logic", "systems").first
    detail["summary"] = ""
    assert_rejected(contract, "morning: logic system 1 summary must be a non-empty scalar")

    contract = valid_contract
    detail = scenario(contract).dig("logic", "systems").first
    detail["visual"] = "unknown-visual"
    assert_rejected(contract, "morning: logic system 1 visual must reference a canonical visual")

    contract = valid_contract
    scenario(contract).dig("logic", "systems").pop
    assert_rejected(contract, "morning: logic systems must contain exactly the canonical nine IDs in order")
  end

  def test_rejects_invalid_outcomes_and_related_references
    contract = valid_contract
    scenario(contract)["outcomes"] = [scenario(contract).fetch("outcomes").first]
    assert_rejected(contract, "morning: outcomes must contain 2 to 4 mappings")

    contract = valid_contract
    scenario(contract)["related_services"] = ["lighting", "unknown-service"]
    assert_rejected(contract, "morning: related_services must only reference existing service slugs")

    contract = valid_contract
    scenario(contract)["related_solution"] = "unknown-solution"
    assert_rejected(contract, "morning: related_solution must reference an existing solution slug")
  end

  def test_rejects_forbidden_or_invalid_yaml_copy
    contract = valid_contract
    scenario(contract)["title"] = "Працює з KNX без обмежень."
    assert_rejected(contract, "morning: title must not contain vendor copy")

    Dir.mktmpdir("smart-electrics-smart-home") do |directory|
      path = File.join(directory, "smart_home.yml")
      File.write(path, "scenarios: [\n")
      _stdout, stderr, status = validate(path)
      refute_predicate status, :success?
      assert_includes stderr, "smart_home.yml: must contain valid YAML"
    end
  end

  def test_simulator_source_requires_one_shot_motion_and_an_opaque_architectural_control_spine
    layout = File.read(File.join(project_root, "_layouts/smart-home.html"))
    script = File.read(File.join(project_root, "assets/js/smart-home-simulator.js"))
    styles = File.read(File.join(project_root, "_sass/_components.scss"))
    spine = styles.match(/\.smart-home__control-spine\s*\{(?<rules>.*?)^\}/m)
    motion_styles = styles[styles.index("@keyframes smart-home-assemble-a")..]
    motion_declarations = styles.scan(/\banimation:\s*smart-home-[^;]+;/)

    assert_includes layout, "smart-home__control-spine"
    refute_includes layout, "smart-home__control-glass"
    assert_includes script, "data-outgoing-snapshot"
    assert_includes script, "animationend"
    refute_match(/(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/, script)
    assert_includes styles, '@keyframes smart-home-disassemble'
    refute_match(/infinite/, motion_styles)
    refute_empty motion_declarations
    motion_declarations.each do |declaration|
      duration = declaration.scan(/(\d+)ms/).flatten.map(&:to_i).sum
      assert_operator duration, :>=, 760, declaration
      assert_operator duration, :<=, 1100, declaration
    end
    refute_nil spine, "the simulator needs a central architectural control spine"
    assert_match(/background:\s*#[0-9a-f]{3,8}/i, spine[:rules])
    assert_match(/clip-path:/, spine[:rules])
    assert_match(/border-radius:\s*0;/, spine[:rules])
    refute_match(/(?:backdrop-filter|gradient|rgba)/i, spine[:rules])
    refute_match(/backdrop-filter/, styles[/\.smart-home__scene-label\s*\{.*?^\}/m])
  end
end
