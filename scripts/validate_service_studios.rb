#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

module ServiceStudioContract
  module_function

  SINGLE_RELATIONS = {
    "electrical-design" => "panels-and-protection--panel-assembly",
    "electrical-installation" => "panels-and-protection--panel-assembly",
    "panels-and-protection" => "panels-and-protection--panel-assembly",
    "backup-power" => "backup-power--backup",
    "diagnostics-and-service" => "diagnostics-and-service--diagnostics"
  }.freeze
  SINGLE_RELATION_STUDIOS = SINGLE_RELATIONS.keys.freeze
  OWNED_RELATIONS = {
    "lighting" => %w[lighting--stair-lighting lighting--outdoor-lighting],
    "low-voltage" => %w[low-voltage--cctv low-voltage--audio],
    "smart-home-integration" => %w[smart-home-integration--climate smart-home-integration--curtains-tulle-roller-shutters]
  }.freeze
  TARGET_SLUGS = (SINGLE_RELATION_STUDIOS + OWNED_RELATIONS.keys).freeze
  STUDIO_FIELDS = %w[direction_id relation_id states].freeze
  MULTI_RELATION_STUDIO_FIELDS = %w[direction_id relation_ids states].freeze
  STATE_IDS = %w[assembled focus reassembled].freeze
  STATE_FIELDS = %w[label title summary].freeze
  FORBIDDEN_WORDING = /(?:live[\s-]*video|жив(?:е|ого)\s+відео|прям(?:е|ого)\s+відео|\bportal\b|портал|\bvendor\b|вендор|запис(?:у|ом|и)?|recording|відстеж(?:ення|увати|ує)|tracking|гарант(?:ія|ує|ований)?|guarantee|поточн[[:alpha:]]*\s+(?:стан|живл)|runtime|час\s+роботи|автоматично\s+(?:працює|керує|виконує)|без\s+участі|виявлен[[:alpha:]]*\s+(?:несправ|авар|помил)|завершен[[:alpha:]]*\s+діагност|тривог[[:alpha:]]*|вимір[[:alpha:]]*\s*\d)/i

  def parse_yaml(path)
    source = File.read(path)
    front_matter = source[/\A---\s*\n(.*?)\n---/m, 1]
    YAML.safe_load(front_matter, permitted_classes: [], aliases: false)
  rescue Errno::ENOENT, Psych::Exception
    nil
  end

  def non_empty_string?(value)
    value.is_a?(String) && !value.strip.empty?
  end

  def validate(services_directory, graph_path)
    graph = YAML.safe_load(File.read(graph_path), permitted_classes: [], aliases: false)
    return ["cinematic_system.yml: must contain a canonical graph"] unless graph.is_a?(Hash)

    direction_ids = graph.fetch("directions", []).filter_map { |direction| direction["id"] if direction.is_a?(Hash) }
    relation_ids = graph.fetch("relations", []).filter_map { |relation| relation["id"] if relation.is_a?(Hash) }
    files = Dir.glob(File.join(services_directory, "*.md")).sort
    records = files.map { |path| [File.basename(path, ".md"), parse_yaml(path)] }.to_h
    errors = []

    TARGET_SLUGS.each do |slug|
      service = records[slug]
      prefix = "#{slug}.md: service_studio"
      unless service.is_a?(Hash) && service["slug"] == slug
        errors << "#{slug}.md: must contain valid service front matter"
        next
      end

      studio = service["service_studio"]
      unless studio.is_a?(Hash)
        errors << "#{prefix} must be a mapping"
        next
      end
      expected_fields = OWNED_RELATIONS.key?(slug) ? MULTI_RELATION_STUDIO_FIELDS : STUDIO_FIELDS
      errors << "#{prefix}: fields must be exactly #{expected_fields.join(', ')}" unless studio.keys.sort == expected_fields.sort
      unless studio["direction_id"] == slug && direction_ids.include?(studio["direction_id"])
        errors << "#{prefix}: direction_id must reference this service in the canonical cinematic graph"
      end
      validate_relations(errors, prefix, slug, studio, relation_ids, graph.fetch("relations", []))
      validate_states(errors, prefix, studio["states"])
      validate_forbidden_wording(errors, prefix, studio["states"])
    end

    records.each do |slug, service|
      next if TARGET_SLUGS.include?(slug) || !service.is_a?(Hash)

      errors << "#{slug}.md: service_studio is reserved for the declared studio routes" if service.key?("service_studio")
    end
    errors
  rescue Errno::ENOENT, Psych::Exception
    ["cinematic_system.yml: must contain a canonical graph"]
  end

  def validate_forbidden_wording(errors, prefix, states)
    return unless states.is_a?(Hash)

    wording = STATE_IDS.filter_map do |state_id|
      state = states[state_id]
      next unless state.is_a?(Hash)

      STATE_FIELDS.filter_map { |field| state[field] if non_empty_string?(state[field]) }
    end.join(" ")
    if wording.match?(FORBIDDEN_WORDING)
      errors << "#{prefix}: states must not contain forbidden live-video, vendor, portal, recording, tracking, or guarantee wording; nor fabricated status, automatic-operation, or diagnosis claims"
    end
  end

  def validate_relations(errors, prefix, slug, studio, relation_ids, relations)
    if OWNED_RELATIONS.key?(slug)
      values = studio["relation_ids"]
      unless values.is_a?(Array) && values.all? { |value| non_empty_string?(value) }
        errors << "#{prefix}: relation_ids must be a non-empty list"
        return
      end
      errors << "#{prefix}: relation_ids must not contain duplicates" unless values.uniq.length == values.length
      errors << "#{prefix}: relation_ids must declare the canonical owned relations" unless values == OWNED_RELATIONS.fetch(slug)
      values.each do |relation_id|
        relation = relations.find { |candidate| candidate.is_a?(Hash) && candidate["id"] == relation_id }
        errors << "#{prefix}: relation_ids must reference the canonical cinematic graph" unless relation_ids.include?(relation_id)
        errors << "#{prefix}: relation_ids must be owned by #{slug}" unless relation.is_a?(Hash) && relation["direction_id"] == slug
      end
      return
    end

    relation_id = studio["relation_id"]
    unless non_empty_string?(relation_id) && relation_ids.include?(relation_id)
      errors << "#{prefix}: relation_id must reference the canonical cinematic graph"
      return
    end
    errors << "#{prefix}: relation_id must declare the canonical relation for #{slug}" unless relation_id == SINGLE_RELATIONS.fetch(slug)
  end

  def validate_states(errors, prefix, states)
    unless states.is_a?(Hash)
      errors << "#{prefix}: states must be a mapping"
      return
    end
    errors << "#{prefix}: states must declare assembled, focus, reassembled" unless states.keys.sort == STATE_IDS.sort
    STATE_IDS.each do |state_id|
      state = states[state_id]
      state_prefix = "#{prefix}.states.#{state_id}"
      unless state.is_a?(Hash)
        errors << "#{state_prefix} must be a mapping"
        next
      end
      errors << "#{state_prefix}: fields must be exactly #{STATE_FIELDS.join(', ')}" unless state.keys.sort == STATE_FIELDS.sort
      STATE_FIELDS.each do |field|
        errors << "#{state_prefix}: #{field} must be a non-empty scalar" unless non_empty_string?(state[field])
      end
    end
  end
end

if $PROGRAM_NAME == __FILE__
  services_directory = File.expand_path(ARGV.fetch(0, File.expand_path("../_services", __dir__)))
  graph_path = File.expand_path(ARGV.fetch(1, File.expand_path("../_data/cinematic_system.yml", __dir__)))
  errors = ServiceStudioContract.validate(services_directory, graph_path)
  if errors.any?
    warn errors.join("\n")
    exit 1
  end

  puts "Service studio contract is valid."
end
