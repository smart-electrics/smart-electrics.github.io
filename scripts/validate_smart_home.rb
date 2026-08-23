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
  CANONICAL_VISUAL_IDS = %w[interior shading stairs exterior climate].freeze
  SYSTEM_ROLES = %w[focus support quiet].freeze
  REQUIRED_SCALARS = %w[
    id label eyebrow title event scene_label project_note live_summary
  ].freeze
  OUTCOME_SCALARS = %w[zone response].freeze
  PLACEHOLDER_COPY = /placeholder|lorem ipsum|page-note|coming soon|гот(?:ую|ує)ться до публікації/i
  VENDOR_COPY = /\b(?:knx|loxone|control4|crestron|zigbee|z-wave|matter|homekit|alexa|google home|philips hue)\b/i
  PRICE_COPY = /(?:\bціна\b|\bвартіст\w*|\bкоштує\b|\bбюджет\b|\bкошторис\b|[₴€]|\bгрн\b|\$\s*\d)/i
  CONTACT_COPY = /(?:\bemail\b|\be-mail\b|@|\bнапишіть\b|\bзверніться\b|\bконтакт\w*\b)/i
  PII_COPY = /(?:\+?\d[\d\s()\-]{7,}\d|\bпаспорт\w*\b|\bідентифікаційн\w*\b)/i

  def validate(data_path, _repository_root)
    data = parse_data(data_path)
    return ["#{File.basename(data_path)}: must contain valid YAML"] unless data.is_a?(Hash)

    errors = []
    spatial = validate_spatial(errors, data["spatial"])
    validate_simulator_copy(errors, data["simulator"])
    validate_scenarios(errors, data["scenarios"], spatial)
    errors
  end

  def parse_data(path)
    YAML.safe_load(File.read(path), permitted_classes: [], aliases: false)
  rescue Errno::ENOENT, Psych::Exception
    nil
  end

  def validate_spatial(errors, spatial)
    unless spatial.is_a?(Hash)
      errors << "spatial must be a mapping"
      return fallback_spatial
    end

    zone_ids = validate_locations(errors, spatial["zones"], CANONICAL_ZONE_IDS, "zones")
    system_ids = validate_locations(errors, spatial["systems"], CANONICAL_SYSTEM_IDS, "systems")
    visual_ids = validate_visuals(errors, spatial["visuals"])
    {
      zones: zone_ids == CANONICAL_ZONE_IDS ? zone_ids : CANONICAL_ZONE_IDS,
      systems: system_ids == CANONICAL_SYSTEM_IDS ? system_ids : CANONICAL_SYSTEM_IDS,
      visuals: visual_ids == CANONICAL_VISUAL_IDS ? visual_ids : CANONICAL_VISUAL_IDS
    }
  end

  def fallback_spatial
    { zones: CANONICAL_ZONE_IDS, systems: CANONICAL_SYSTEM_IDS, visuals: CANONICAL_VISUAL_IDS }
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

  def validate_visuals(errors, visuals)
    ids = visuals.is_a?(Array) ? visuals.map { |visual| visual.is_a?(Hash) ? visual["id"] : nil } : []
    errors << "spatial visuals must contain exactly the canonical five IDs in order" unless ids == CANONICAL_VISUAL_IDS

    Array(visuals).each_with_index do |visual, index|
      prefix = CANONICAL_VISUAL_IDS[index] || "visual #{index + 1}"
      unless visual.is_a?(Hash)
        errors << "#{prefix}: spatial visual must be a mapping"
        next
      end

      expected_base = prefix == "interior" ? "/assets/images/home/control-room" : "/assets/images/smart-home/#{prefix}"
      { "desktop" => "#{expected_base}-1536.webp", "mobile" => "#{expected_base}-768.webp" }.each do |field, expected|
        errors << "#{prefix}: spatial visual #{field} must be #{expected}" unless visual[field] == expected
      end
      validate_required_copy(errors, prefix, "spatial visual alt", visual["alt"])
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

  def validate_scenarios(errors, scenarios, spatial)
    unless scenarios.is_a?(Array) && scenarios.length == CANONICAL_IDS.length
      errors << "scenarios must contain exactly the canonical seven IDs in order"
      return
    end

    ids = scenarios.map { |scenario| scenario.is_a?(Hash) ? scenario["id"] : nil }
    errors << "scenarios must contain exactly the canonical seven IDs in order" unless ids == CANONICAL_IDS

    scenarios.each_with_index do |scenario, index|
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
      validate_related_services(errors, prefix, scenario["related_services"])
      validate_related_solution(errors, prefix, scenario["related_solution"])
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
