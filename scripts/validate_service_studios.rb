#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

module ServiceStudioContract
  module_function

  TARGET_SLUGS = %w[electrical-design electrical-installation panels-and-protection].freeze
  STUDIO_FIELDS = %w[direction_id relation_id states].freeze
  STATE_IDS = %w[assembled focus reassembled].freeze
  STATE_FIELDS = %w[label title summary].freeze

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
      errors << "#{prefix}: fields must be exactly #{STUDIO_FIELDS.join(', ')}" unless studio.keys.sort == STUDIO_FIELDS.sort
      unless studio["direction_id"] == slug && direction_ids.include?(studio["direction_id"])
        errors << "#{prefix}: direction_id must reference this service in the canonical cinematic graph"
      end
      unless relation_ids.include?(studio["relation_id"])
        errors << "#{prefix}: relation_id must reference the canonical cinematic graph"
      end
      validate_states(errors, prefix, studio["states"])
    end

    records.each do |slug, service|
      next if TARGET_SLUGS.include?(slug) || !service.is_a?(Hash)

      errors << "#{slug}.md: service_studio is reserved for the three declared studio routes" if service.key?("service_studio")
    end
    errors
  rescue Errno::ENOENT, Psych::Exception
    ["cinematic_system.yml: must contain a canonical graph"]
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
