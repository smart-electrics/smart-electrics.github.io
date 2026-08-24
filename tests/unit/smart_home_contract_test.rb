# frozen_string_literal: true

require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"

class SmartHomeContractTest < Minitest::Test
  PRESETS = %w[morning arrival evening away night heat backup].freeze
  ZONES = %w[entry passage living private technical stairs exterior].freeze
  SYSTEMS = %w[lighting climate access security panel low-voltage backup-power audio shading].freeze
  VISUALS = %w[lighting climate access security panel low-voltage backup-power audio shading].freeze
  CONTROL_IDS = {
    "lighting" => %w[brightness layer],
    "climate" => %w[comfort operation],
    "access" => %w[arrival_route entry_zone],
    "security" => %w[coverage event_path],
    "panel" => %w[layer priority_groups],
    "low-voltage" => %w[route topology_focus],
    "backup-power" => %w[priority_groups restore_intent],
    "audio" => %w[level source zone muted],
    "shading" => %w[position treatment]
  }.freeze
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

  def preset(contract, id = "morning")
    contract.fetch("presets").find { |candidate| candidate.fetch("id") == id }
  end

  def assert_rejected(contract, expected_error)
    with_contract(contract) do |path|
      _stdout, stderr, status = validate(path)

      refute_predicate status, :success?
      assert_includes stderr, expected_error
    end
  end

  def test_accepts_the_complete_seven_preset_phone_contract
    contract = valid_contract
    assert_equal PRESETS, contract.fetch("presets").map { |item| item.fetch("id") }
    assert_equal ZONES, contract.dig("spatial", "zones").map { |item| item.fetch("id") }
    assert_equal SYSTEMS, contract.dig("spatial", "systems").map { |item| item.fetch("id") }
    assert_equal VISUALS, contract.dig("spatial", "visuals").map { |item| item.fetch("id") }

    with_contract(contract) do |path|
      _stdout, stderr, status = validate(path)
      assert_predicate status, :success?, stderr
    end
  end

  def test_each_system_has_a_unique_scene_topology_and_manual_control_contract
    contract = valid_contract
    systems = contract.dig("spatial", "systems")

    assert_equal VISUALS, systems.map { |system| system.fetch("visual") }
    assert_equal VISUALS, contract.dig("spatial", "visuals").map { |visual| visual.fetch("id") }
    systems.each do |system|
      refute_empty system.fetch("summary")
      assert_equal %w[label detail], system.fetch("topology").keys
      assert_equal CONTROL_IDS.fetch(system.fetch("id")), system.fetch("controls").map { |control| control.fetch("id") }
    end

    diagnostics = systems.filter_map { |system| system.fetch("id") if system.key?("diagnostics") }
    assert_equal %w[panel low-voltage], diagnostics
    systems.select { |system| diagnostics.include?(system.fetch("id")) }.each do |system|
      assert_equal %w[observation isolation next_step], system.fetch("diagnostics").keys
    end
  end

  def test_each_preset_provides_canonical_values_for_every_manual_control
    contract = valid_contract
    control_ids = contract.dig("spatial", "systems").to_h do |system|
      [system.fetch("id"), system.fetch("controls").map { |control| control.fetch("id") }]
    end

    contract.fetch("presets").each do |item|
      assert_equal SYSTEMS, item.fetch("values").keys
      control_ids.each do |system_id, ids|
        assert_equal ids, item.fetch("values").fetch(system_id).keys
      end
    end
  end

  def test_rejects_missing_or_reordered_scenario_zone_system_or_visual_ids
    contract = valid_contract
    contract["presets"].reverse!
    assert_rejected(contract, "presets must contain exactly the canonical seven IDs in order")

    contract = valid_contract
    contract.dig("spatial", "zones").last["id"] = "yard"
    assert_rejected(contract, "spatial zones must contain exactly the canonical 7 IDs in order")

    contract = valid_contract
    contract.dig("spatial", "systems").last["id"] = "blinds"
    assert_rejected(contract, "spatial systems must contain exactly the canonical 9 IDs in order")

    contract = valid_contract
    contract.dig("spatial", "visuals").reverse!
    assert_rejected(contract, "spatial visuals must contain exactly the canonical nine IDs in order")
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
    contract.dig("spatial", "visuals")[5]["desktop"] = "/assets/images/smart-home/wrong-1536.webp"
    assert_rejected(contract, "low-voltage: spatial visual desktop must be /assets/images/smart-home/electrical-installation-1536.webp")

    contract = valid_contract
    contract.dig("spatial", "visuals")[0]["alt"] = " "
    assert_rejected(contract, "lighting: spatial visual alt must be a non-empty scalar")
  end

  def test_rejects_missing_or_blank_required_scenario_and_simulator_copy
    REQUIRED_SCALAR_FIELDS.each do |field|
      contract = valid_contract
      preset(contract).delete(field)
      assert_rejected(contract, "morning: #{field} must be a non-empty scalar")
    end

    contract = valid_contract
    contract.fetch("simulator")["controls_label"] = ""
    assert_rejected(contract, "simulator: controls_label must be a non-empty scalar")
  end

  def test_rejects_route_primary_and_every_logic_system_detail_violation
    contract = valid_contract
    preset(contract).dig("logic", "route")[1] = "unknown-zone"
    assert_rejected(contract, "morning: logic route must only reference canonical zones")

    contract = valid_contract
    preset(contract).dig("logic", "route")[1] = "private"
    assert_rejected(contract, "morning: logic route must not contain duplicate zone IDs")

    contract = valid_contract
    preset(contract).dig("logic", "primary_system").replace("audio")
    assert_rejected(contract, "morning: logic primary_system must use the focus role")

    contract = valid_contract
    detail = preset(contract).dig("logic", "systems").first
    detail["zone"] = "unknown-zone"
    assert_rejected(contract, "morning: logic system 1 zone must reference a canonical zone")

    contract = valid_contract
    detail = preset(contract).dig("logic", "systems").first
    detail["role"] = "primary"
    assert_rejected(contract, "morning: logic system 1 role must be focus, support or quiet")

    contract = valid_contract
    detail = preset(contract).dig("logic", "systems").first
    detail["summary"] = ""
    assert_rejected(contract, "morning: logic system 1 summary must be a non-empty scalar")

    contract = valid_contract
    detail = preset(contract).dig("logic", "systems").first
    detail["visual"] = "unknown-visual"
    assert_rejected(contract, "morning: logic system 1 visual must reference a canonical visual")

    contract = valid_contract
    detail = preset(contract).dig("logic", "systems").first
    detail["visual"] = "climate"
    assert_rejected(contract, "morning: logic system 1 visual must match its system ID")

    contract = valid_contract
    preset(contract).dig("logic", "systems").pop
    assert_rejected(contract, "morning: logic systems must contain exactly the canonical nine IDs in order")
  end

  def test_rejects_invalid_outcomes_and_related_references
    contract = valid_contract
    preset(contract)["outcomes"] = [preset(contract).fetch("outcomes").first]
    assert_rejected(contract, "morning: outcomes must contain 2 to 4 mappings")

    contract = valid_contract
    preset(contract)["related_services"] = ["lighting", "unknown-service"]
    assert_rejected(contract, "morning: related_services must only reference existing service slugs")

    contract = valid_contract
    preset(contract)["related_solution"] = "unknown-solution"
    assert_rejected(contract, "morning: related_solution must reference an existing solution slug")
  end

  def test_rejects_forbidden_or_invalid_yaml_copy
    contract = valid_contract
    preset(contract)["title"] = "Працює з KNX без обмежень."
    assert_rejected(contract, "morning: title must not contain vendor copy")

    Dir.mktmpdir("smart-electrics-smart-home") do |directory|
      path = File.join(directory, "smart_home.yml")
      File.write(path, "scenarios: [\n")
      _stdout, stderr, status = validate(path)
      refute_predicate status, :success?
      assert_includes stderr, "smart_home.yml: must contain valid YAML"
    end
  end

  def test_rejects_invalid_manual_control_shapes
    contract = valid_contract
    contract.dig("spatial", "systems")[0].fetch("controls")[0]["type"] = "dial"
    assert_rejected(contract, "lighting: control 1 type must be range, segment, toggle")

    contract = valid_contract
    contract.dig("spatial", "systems")[0].fetch("controls")[0]["step"] = 0
    assert_rejected(contract, "lighting: control 1 range must have min lower than max and a positive step within that span")

    contract = valid_contract
    contract.dig("spatial", "systems")[1].fetch("controls")[0]["options"] = []
    assert_rejected(contract, "climate: control 1 options must contain 2 to 5 mappings")

    contract = valid_contract
    contract.dig("spatial", "systems")[2].fetch("controls")[0]["min"] = 0
    assert_rejected(contract, "access: control 1 toggle must not define range bounds or options")

    contract = valid_contract
    contract.dig("spatial", "systems").find { |system| system.fetch("id") == "audio" }.fetch("controls")[1]["id"] = "input"
    assert_rejected(contract, "audio: controls must contain exactly level, source, zone, muted in order")

    contract = valid_contract
    contract.dig("spatial", "systems").find { |system| system.fetch("id") == "panel" }.fetch("diagnostics").delete("next_step")
    assert_rejected(contract, "panel: diagnostics must contain exactly observation, isolation, next_step in order")
  end

  def test_rejects_missing_or_invalid_preset_control_values
    contract = valid_contract
    preset(contract).fetch("values")["lighting"].delete("layer")
    assert_rejected(contract, "morning: values lighting must contain every control ID in order")

    contract = valid_contract
    preset(contract).fetch("values")["lighting"]["brightness"] = 101
    assert_rejected(contract, "morning: values lighting.brightness must be a valid range value")

    contract = valid_contract
    preset(contract).fetch("values")["climate"]["comfort"] = "unknown"
    assert_rejected(contract, "morning: values climate.comfort must reference a declared segment option")

    contract = valid_contract
    preset(contract).fetch("values")["access"]["arrival_route"] = "yes"
    assert_rejected(contract, "morning: values access.arrival_route must be boolean")
  end
end
