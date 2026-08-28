#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"
require_relative "validate_services"
require_relative "validate_solutions"

module SmartHomeContract
  module_function

  CANONICAL_IDS = %w[morning arrival evening away night heat backup].freeze
  CANONICAL_ZONE_IDS = %w[entry passage living private technical stairs exterior].freeze
  CANONICAL_SYSTEM_IDS = %w[
    lighting climate access security panel low-voltage backup-power audio shading
  ].freeze
  CANONICAL_VISUAL_IDS = CANONICAL_SYSTEM_IDS.freeze
  SYSTEM_ROLES = %w[focus support quiet].freeze
  DIAGNOSTIC_SYSTEM_IDS = %w[panel low-voltage].freeze
  DIAGNOSTIC_FIELDS = %w[observation isolation next_step].freeze
  CONTROL_TYPES = %w[range segment toggle].freeze
  CANONICAL_CONTROL_IDS = {
    "lighting" => %w[brightness layer].freeze,
    "climate" => %w[comfort operation].freeze,
    "access" => %w[arrival_route entry_zone].freeze,
    "security" => %w[coverage event_path view_angle].freeze,
    "panel" => %w[layer priority_groups].freeze,
    "low-voltage" => %w[route topology_focus].freeze,
    "backup-power" => %w[priority_groups restore_intent].freeze,
    "audio" => %w[source zone group volume muted].freeze,
    "shading" => %w[position treatment blind_lift slat_angle].freeze
  }.freeze
  REQUIRED_SCALARS = %w[
    id label eyebrow title event scene_label project_note live_summary
  ].freeze
  OUTCOME_SCALARS = %w[zone response].freeze
  PLACEHOLDER_COPY = /placeholder|lorem ipsum|page-note|coming soon|гот(?:ую|ує)ться до публікації/i
  VENDOR_COPY = /\b(?:knx|loxone|control4|crestron|zigbee|z-wave|matter|homekit|alexa|google home|philips hue)\b/i
  PRICE_COPY = /(?:\bціна\b|\bвартіст\w*|\bкоштує\b|\bбюджет\b|\bкошторис\b|[₴€]|\bгрн\b|\$\s*\d)/i
  CONTACT_COPY = /(?:\bemail\b|\be-mail\b|@|\bнапишіть\b|\bзверніться\b|\bконтакт\w*\b)/i
  PII_COPY = /(?:\+?\d[\d\s()\-]{7,}\d|\bпаспорт\w*\b|\bідентифікаційн\w*\b)/i

  def validate(data_path, repository_root)
    data = parse_data(data_path)
    return ["#{File.basename(data_path)}: must contain valid YAML"] unless data.is_a?(Hash)

    errors = []
    spatial = validate_spatial(errors, data["spatial"], repository_root)
    validate_simulator_copy(errors, data["simulator"])
    validate_presets(errors, data["presets"], spatial)
    errors
  end

  def parse_data(path)
    YAML.safe_load(File.read(path), permitted_classes: [], aliases: false)
  rescue Errno::ENOENT, Psych::Exception
    nil
  end

  def validate_spatial(errors, spatial, repository_root)
    unless spatial.is_a?(Hash)
      errors << "spatial must be a mapping"
      return fallback_spatial
    end

    zone_ids = validate_locations(errors, spatial["zones"], CANONICAL_ZONE_IDS, "zones")
    system_ids = validate_locations(errors, spatial["systems"], CANONICAL_SYSTEM_IDS, "systems")
    system_records = spatial["systems"].is_a?(Array) ? spatial["systems"] : []
    validate_system_metadata(errors, system_records)
    visual_ids = validate_visuals(errors, spatial["visuals"], repository_root)
    {
      zones: zone_ids == CANONICAL_ZONE_IDS ? zone_ids : CANONICAL_ZONE_IDS,
      systems: system_ids == CANONICAL_SYSTEM_IDS ? system_ids : CANONICAL_SYSTEM_IDS,
      visuals: visual_ids == CANONICAL_VISUAL_IDS ? visual_ids : CANONICAL_VISUAL_IDS,
      system_records: system_records
    }
  end

  def fallback_spatial
    { zones: CANONICAL_ZONE_IDS, systems: CANONICAL_SYSTEM_IDS, visuals: CANONICAL_VISUAL_IDS, system_records: [] }
  end

  def validate_locations(errors, records, canonical_ids, name)
    ids = records.is_a?(Array) ? records.map { |record| record.is_a?(Hash) ? record["id"] : nil } : []
    errors << "spatial #{name} must contain exactly the canonical #{canonical_ids.length} IDs in order" unless ids == canonical_ids
    coordinates = []

    Array(records).each_with_index do |record, index|
      prefix = canonical_ids[index] || "#{name.sub(/s\\z/, "")} #{index + 1}"
      unless record.is_a?(Hash)
        errors << "#{prefix}: spatial #{name} entry must be a mapping"
        next
      end

      validate_required_copy(errors, prefix, "spatial #{name} label", record["label"])
      coordinate = %w[x y].map do |axis|
        value = record[axis]
        errors << "#{prefix}: spatial #{name} #{axis} must be a number from 0 to 100" unless value.is_a?(Numeric) && value.between?(0, 100)
        value
      end
      if name == "systems" && !%w[left right center].include?(record["side"])
        errors << "#{prefix}: spatial systems side must be left, right or center"
      end
      coordinates << coordinate if coordinate.all? { |value| value.is_a?(Numeric) && value.between?(0, 100) }
    end
    errors << "spatial #{name} coordinates must be unique" unless coordinates.uniq.length == coordinates.length
    ids
  end

  def validate_system_metadata(errors, systems)
    Array(systems).each_with_index do |system, index|
      prefix = CANONICAL_SYSTEM_IDS[index] || "system #{index + 1}"
      next unless system.is_a?(Hash)

      errors << "#{prefix}: spatial system visual must match its canonical system ID" unless system["visual"] == prefix
      validate_required_copy(errors, prefix, "spatial system summary", system["summary"])
      validate_topology(errors, prefix, system["topology"])
      validate_diagnostics(errors, prefix, system["diagnostics"])
      validate_controls(errors, prefix, system["controls"], CANONICAL_CONTROL_IDS.fetch(prefix))
    end
  end

  def validate_topology(errors, prefix, topology)
    unless topology.is_a?(Hash)
      errors << "#{prefix}: topology must be a mapping"
      return
    end

    %w[label detail].each { |field| validate_required_copy(errors, prefix, "topology #{field}", topology[field]) }
  end

  def validate_diagnostics(errors, prefix, diagnostics)
    unless DIAGNOSTIC_SYSTEM_IDS.include?(prefix)
      errors << "#{prefix}: diagnostics are only allowed for panel and low-voltage" unless diagnostics.nil?
      return
    end

    unless diagnostics.is_a?(Hash) && diagnostics.keys == DIAGNOSTIC_FIELDS
      errors << "#{prefix}: diagnostics must contain exactly #{DIAGNOSTIC_FIELDS.join(', ')} in order"
      return
    end

    DIAGNOSTIC_FIELDS.each { |field| validate_required_copy(errors, prefix, "diagnostics #{field}", diagnostics[field]) }
  end

  def validate_controls(errors, prefix, controls, canonical_ids)
    unless controls.is_a?(Array) && (1..5).cover?(controls.length)
      errors << "#{prefix}: controls must contain 1 to 5 mappings"
      return
    end

    ids = controls.map { |control| control.is_a?(Hash) ? control["id"] : nil }
    errors << "#{prefix}: controls must use unique non-empty IDs" unless ids.all? { |id| non_empty_string?(id) } && ids.uniq.length == ids.length
    errors << "#{prefix}: controls must contain exactly #{canonical_ids.join(', ')} in order" unless ids == canonical_ids

    controls.each_with_index do |control, index|
      control_prefix = "#{prefix}: control #{index + 1}"
      unless control.is_a?(Hash)
        errors << "#{control_prefix} must be a mapping"
        next
      end

      validate_required_copy(errors, prefix, "control #{index + 1} label", control["label"])
      validate_required_copy(errors, prefix, "control #{index + 1} output_label", control["output_label"])
      if control.key?("output_suffix")
        validate_required_copy(errors, prefix, "control #{index + 1} output_suffix", control["output_suffix"])
      end
      validate_control_visibility(errors, prefix, control, controls, control_prefix)

      case control["type"]
      when "range"
        validate_range_control(errors, control_prefix, control)
      when "segment"
        validate_segment_control(errors, control_prefix, control)
      when "toggle"
        validate_toggle_control(errors, control_prefix, control)
      else
        errors << "#{control_prefix} type must be #{CONTROL_TYPES.join(', ')}"
      end
    end
  end

  def validate_control_visibility(errors, system_id, control, controls, prefix)
    return unless control.key?("visible_when")

    visible_when = control["visible_when"]
    unless visible_when.is_a?(Hash) && visible_when.keys.sort == %w[control_id in] && non_empty_string?(visible_when["control_id"]) && visible_when["in"].is_a?(Array) && !visible_when["in"].empty? && visible_when["in"].all? { |value| non_empty_string?(value) } && visible_when["in"].uniq.length == visible_when["in"].length
      errors << "#{prefix} visible_when must be an exact control_id plus unique non-empty in values mapping"
      return
    end
    controller = controls.find { |candidate| candidate.is_a?(Hash) && candidate["id"] == visible_when["control_id"] }
    unless controller.is_a?(Hash) && controller["type"] == "segment"
      errors << "#{prefix} visible_when control_id must reference a declared segment control"
      return
    end
    option_ids = Array(controller["options"]).filter_map { |option| option["id"] if option.is_a?(Hash) }
    errors << "#{prefix} visible_when in values must reference declared segment options" unless (visible_when["in"] - option_ids).empty?
    errors << "#{prefix} visible_when is only supported by shading" unless system_id == "shading"
  end

  def validate_range_control(errors, prefix, control)
    %w[min max step].each do |field|
      errors << "#{prefix} #{field} must be numeric" unless control[field].is_a?(Numeric)
    end
    return unless %w[min max step].all? { |field| control[field].is_a?(Numeric) }

    errors << "#{prefix} range must have min lower than max and a positive step within that span" unless control["min"] < control["max"] && control["step"].positive? && control["step"] <= control["max"] - control["min"]
  end

  def validate_segment_control(errors, prefix, control)
    options = control["options"]
    unless options.is_a?(Array) && (2..5).cover?(options.length)
      errors << "#{prefix} options must contain 2 to 5 mappings"
      return
    end

    ids = options.map { |option| option.is_a?(Hash) ? option["id"] : nil }
    errors << "#{prefix} options must use unique non-empty IDs" unless ids.all? { |id| non_empty_string?(id) } && ids.uniq.length == ids.length
    options.each_with_index do |option, index|
      next unless option.is_a?(Hash)

      validate_required_copy(errors, prefix, "option #{index + 1} label", option["label"])
    end
  end

  def validate_toggle_control(errors, prefix, control)
    errors << "#{prefix} toggle must not define range bounds or options" if %w[min max step options].any? { |field| control.key?(field) }
    unless %w[on_label off_label].all? { |field| non_empty_string?(control[field]) }
      errors << "#{prefix} toggle must define non-empty on_label and off_label"
    end
  end

  def validate_visuals(errors, visuals, repository_root)
    ids = visuals.is_a?(Array) ? visuals.map { |visual| visual.is_a?(Hash) ? visual["id"] : nil } : []
    errors << "spatial visuals must contain exactly the canonical nine IDs in order" unless ids == CANONICAL_VISUAL_IDS

    Array(visuals).each_with_index do |visual, index|
      prefix = CANONICAL_VISUAL_IDS[index] || "visual #{index + 1}"
      unless visual.is_a?(Hash)
        errors << "#{prefix}: spatial visual must be a mapping"
        next
      end

      expected_base = {
        "lighting" => "/assets/images/home/control-room",
        "access" => "/assets/images/smart-home/exterior",
        "security" => "/assets/images/smart-home/surveillance",
        "low-voltage" => "/assets/images/smart-home/electrical-installation",
        "backup-power" => "/assets/images/smart-home/backup"
      }.fetch(prefix, "/assets/images/smart-home/#{prefix}")
      { "desktop" => "#{expected_base}-1536.webp", "mobile" => "#{expected_base}-768.webp" }.each do |field, expected|
        errors << "#{prefix}: spatial visual #{field} must be #{expected}" unless visual[field] == expected
        asset_path = File.join(repository_root, expected.delete_prefix("/"))
        errors << "#{prefix}: spatial visual #{field} asset must exist" unless File.file?(asset_path)
      end
      validate_required_copy(errors, prefix, "spatial visual alt", visual["alt"])
      errors << "#{prefix}: spatial visual alt must describe the scene meaningfully" if non_empty_string?(visual["alt"]) && visual["alt"].strip.length < 24
    end
    ids
  end

  def validate_simulator_copy(errors, simulator)
    unless simulator.is_a?(Hash)
      errors << "simulator must be a mapping"
      return
    end

    %w[active_connection_label logic_kicker route_label controls_label related_aria_prefix selected_system_prefix].each do |field|
      validate_required_copy(errors, "simulator", field, simulator[field])
    end
  end

  def validate_presets(errors, presets, spatial)
    unless presets.is_a?(Array) && presets.length == CANONICAL_IDS.length
      errors << "presets must contain exactly the canonical seven IDs in order"
      return
    end

    ids = presets.map { |preset| preset.is_a?(Hash) ? preset["id"] : nil }
    errors << "presets must contain exactly the canonical seven IDs in order" unless ids == CANONICAL_IDS

    presets.each_with_index do |scenario, index|
      prefix = CANONICAL_IDS[index]
      unless scenario.is_a?(Hash)
        errors << "#{prefix}: must be a mapping"
        next
      end

      REQUIRED_SCALARS.each do |field|
        value = scenario[field]
        unless non_empty_string?(value)
          errors << "#{prefix}: #{field} must be a non-empty scalar"
          next
        end
        validate_copy(errors, prefix, field, value)
      end

      validate_outcomes(errors, prefix, scenario["outcomes"])
      validate_logic(errors, prefix, scenario["logic"], spatial)
      validate_preset_values(errors, prefix, scenario["values"], spatial)
      validate_related_services(errors, prefix, scenario["related_services"])
      validate_related_solution(errors, prefix, scenario["related_solution"])
    end
  end

  def validate_preset_values(errors, prefix, values, spatial)
    unless values.is_a?(Hash) && values.keys == spatial[:systems]
      errors << "#{prefix}: values must contain exactly the canonical nine system IDs in order"
      return
    end

    system_records = spatial[:system_records]
    return if system_records.length != CANONICAL_SYSTEM_IDS.length

    system_records.each_with_index do |system, index|
      next unless system.is_a?(Hash)

      system_id = CANONICAL_SYSTEM_IDS[index]
      controls = system["controls"]
      next unless controls.is_a?(Array)

      system_values = values[system_id]
      expected_ids = controls.filter_map { |control| control["id"] if control.is_a?(Hash) }
      unless system_values.is_a?(Hash) && system_values.keys == expected_ids
        errors << "#{prefix}: values #{system_id} must contain every control ID in order"
        next
      end

      controls.each do |control|
        next unless control.is_a?(Hash)

        validate_preset_value(errors, prefix, system_id, control, system_values[control["id"]])
      end
    end
  end

  def validate_preset_value(errors, prefix, system_id, control, value)
    control_prefix = "#{prefix}: values #{system_id}.#{control["id"]}"
    case control["type"]
    when "range"
      range_is_valid = %w[min max step].all? { |field| control[field].is_a?(Numeric) } && control["min"] < control["max"] && control["step"].positive?
      unless range_is_valid && value.is_a?(Numeric) && value.between?(control["min"], control["max"]) && ((value - control["min"]) % control["step"]).zero?
        errors << "#{control_prefix} must be a valid range value"
      end
    when "segment"
      option_ids = Array(control["options"]).filter_map { |option| option["id"] if option.is_a?(Hash) }
      errors << "#{control_prefix} must reference a declared segment option" unless option_ids.include?(value)
    when "toggle"
      errors << "#{control_prefix} must be boolean" unless value == true || value == false
    end
  end

  def validate_logic(errors, prefix, logic, spatial)
    unless logic.is_a?(Hash)
      errors << "#{prefix}: logic must be a mapping"
      return
    end

    route = logic["route"]
    unless list_of_non_empty_strings?(route, 2..4)
      errors << "#{prefix}: logic route must contain 2 to 4 non-empty zone IDs"
    else
      errors << "#{prefix}: logic route must not contain duplicate zone IDs" if route.uniq.length != route.length
      errors << "#{prefix}: logic route must only reference canonical zones" if route.any? { |id| !spatial[:zones].include?(id) }
    end

    primary_system = logic["primary_system"]
    unless non_empty_string?(primary_system) && spatial[:systems].include?(primary_system)
      errors << "#{prefix}: logic primary_system must reference a canonical system"
    end

    systems = logic["systems"]
    system_ids = systems.is_a?(Array) ? systems.map { |system| system.is_a?(Hash) ? system["id"] : nil } : []
    unless system_ids == spatial[:systems]
      errors << "#{prefix}: logic systems must contain exactly the canonical nine IDs in order"
      return
    end

    systems.each_with_index do |system, index|
      system_prefix = "#{prefix}: logic system #{index + 1}"
      errors << "#{system_prefix} zone must reference a canonical zone" unless non_empty_string?(system["zone"]) && spatial[:zones].include?(system["zone"])
      errors << "#{system_prefix} role must be focus, support or quiet" unless SYSTEM_ROLES.include?(system["role"])
      validate_required_copy(errors, prefix, "logic system #{index + 1} summary", system["summary"])
      unless non_empty_string?(system["visual"]) && spatial[:visuals].include?(system["visual"])
        errors << "#{system_prefix} visual must reference a canonical visual"
      end
      if system["id"] && system["visual"] && system["visual"] != system["id"]
        errors << "#{system_prefix} visual must match its system ID"
      end
    end

    primary = systems.find { |system| system["id"] == primary_system }
    if spatial[:systems].include?(primary_system) && (!primary || primary["role"] != "focus")
      errors << "#{prefix}: logic primary_system must use the focus role"
    end
  end

  def validate_outcomes(errors, prefix, outcomes)
    unless outcomes.is_a?(Array) && (2..4).cover?(outcomes.length)
      errors << "#{prefix}: outcomes must contain 2 to 4 mappings"
      return
    end

    outcomes.each_with_index do |outcome, index|
      unless outcome.is_a?(Hash)
        errors << "#{prefix}: outcome #{index + 1} must be a mapping"
        next
      end
      OUTCOME_SCALARS.each do |field|
        value = outcome[field]
        unless non_empty_string?(value)
          errors << "#{prefix}: outcome #{index + 1} #{field} must be a non-empty scalar"
          next
        end
        validate_copy(errors, prefix, "outcome #{index + 1} #{field}", value)
      end
    end
  end

  def validate_related_services(errors, prefix, related_services)
    unless list_of_non_empty_strings?(related_services, 2..4)
      errors << "#{prefix}: related_services must contain 2 to 4 non-empty items"
      return
    end
    errors << "#{prefix}: related_services must not contain duplicate slugs" if related_services.uniq.length != related_services.length
    errors << "#{prefix}: related_services must only reference existing service slugs" if related_services.any? { |slug| !ServiceContract::CANONICAL_SLUGS.include?(slug) }
  end

  def validate_related_solution(errors, prefix, related_solution)
    unless non_empty_string?(related_solution)
      errors << "#{prefix}: related_solution must be a non-empty scalar"
      return
    end
    errors << "#{prefix}: related_solution must reference an existing solution slug" unless SolutionContract::CANONICAL_SLUGS.include?(related_solution)
  end

  def validate_copy(errors, prefix, field, value)
    category = if value.match?(PLACEHOLDER_COPY)
                 "placeholder"
               elsif value.match?(VENDOR_COPY)
                 "vendor"
               elsif value.match?(PRICE_COPY)
                 "price"
               elsif value.match?(PII_COPY)
                 "pii"
               elsif value.match?(CONTACT_COPY)
                 "contact"
               end
    errors << "#{prefix}: #{field} must not contain #{category} copy" if category
  end

  def validate_required_copy(errors, prefix, field, value)
    unless non_empty_string?(value)
      errors << "#{prefix}: #{field} must be a non-empty scalar"
      return
    end
    validate_copy(errors, prefix, field, value)
  end

  def non_empty_string?(value)
    value.is_a?(String) && !value.strip.empty?
  end

  def list_of_non_empty_strings?(value, range)
    value.is_a?(Array) && range.cover?(value.length) && value.all? { |item| non_empty_string?(item) }
  end
end

if $PROGRAM_NAME == __FILE__
  default_data_path = File.expand_path("../_data/smart_home.yml", __dir__)
  default_repository_root = File.expand_path("..", __dir__)
  data_path = File.expand_path(ARGV.fetch(0, default_data_path))
  repository_root = File.expand_path(ARGV.fetch(1, default_repository_root))
  errors = SmartHomeContract.validate(data_path, repository_root)
  if errors.any?
    warn errors.join("\n")
    exit 1
  end
  puts "Smart-home collection contract is valid."
end
