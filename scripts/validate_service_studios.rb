#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

module ServiceStudioContract
  module_function

  STUDIO_FIELDS = %w[direction_id relation_id states].freeze
  TARGET_STUDIO_FIELDS = %w[direction_id relation_id scene_families states].freeze
  MULTI_RELATION_STUDIO_FIELDS = %w[direction_id relation_ids states].freeze
  STATE_IDS = %w[assembled focus reassembled].freeze
  STATE_FIELDS = %w[label title summary].freeze
  PANEL_FALLBACK_DIRECTION_IDS = %w[electrical-design electrical-installation].freeze
  TARGET_SCENE_FAMILIES = {
    "electrical-design" => {
      "assembled" => "electrical-design-plan",
      "focus" => "electrical-design-groups",
      "reassembled" => "panel"
    },
    "electrical-installation" => {
      "assembled" => "electrical-installation",
      "focus" => "electrical-installation-finish",
      "reassembled" => "panel"
    },
    "panels-and-protection" => {
      "assembled" => "panel-intake",
      "focus" => "panel",
      "reassembled" => "panel-priorities"
    }
  }.freeze
  FORBIDDEN_WORDING = %r{
    (?:
      live[\s-]*video|жив(?:е|ого)\s+відео|прям(?:е|ого)\s+відео|\bportal\b|портал|\bvendor\b|вендор
      |запис(?:у|ом|и)?|recording|відстеж(?:ення|увати|ує)|tracking|гарант(?:ія|ує|ований)?|guarantee
      |поточн[[:alpha:]]*\s+(?:стан|живл)|runtime|час\s+роботи|автоматично\s+(?:працює|керує|виконує)|без\s+участі
      |виявлен[[:alpha:]]*\s+(?:несправ|авар|помил)|завершен[[:alpha:]]*\s+діагност|тривог[[:alpha:]]*|вимір[[:alpha:]]*\s*\d
      |(?<![[:alpha:]])(?:цін[[:alpha:]]*|прайс[[:alpha:]]*)|вартіст[[:alpha:]]*|кошту(?:є|ють|вати|вав|вала|вали)
      |(?<![[:alpha:]])(?:грн\.?|гривн[[:alpha:]]*|долар[[:alpha:]]*|євро)(?![[:alpha:]])|[₴$€£]
      |\b(?:price|cost|usd|eur|uah|dollars?|euros?|pounds?)\b|\b(?:us|u\.s\.)\s+dollars?\b
      |сертифік(?:ат|ован|ац)[[:alpha:]]*|\b(?:certificate|certified|certification)\b
      |(?:(?:реалізован|виконан)(?:о|ий|а|е|і|ого|ому|их|ими|у)?|завершен(?:о|ий|а|е|і))\s+(?:проєкт|об[’']єкт|робот)[[:alpha:]]*
      |\b(?:completed|implemented|finished)\s+(?:project|object|work)\b
    )
  }ix

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

  def validate(services_directory, graph_path, repository_root = File.expand_path("..", __dir__))
    graph = YAML.safe_load(File.read(graph_path), permitted_classes: [], aliases: false)
    return ["cinematic_system.yml: must contain a canonical graph"] unless graph.is_a?(Hash)

    direction_ids = graph.fetch("directions", []).filter_map { |direction| direction["id"] if direction.is_a?(Hash) }
    relation_ids = graph.fetch("relations", []).filter_map { |relation| relation["id"] if relation.is_a?(Hash) }
    studio_relation_ids = canonical_studio_relation_ids(graph, direction_ids, relation_ids)
    return ["cinematic_system.yml: service_studio_relation_ids must satisfy the canonical ownership mapping"] unless studio_relation_ids
    files = Dir.glob(File.join(services_directory, "*.md")).sort
    records = files.map { |path| [File.basename(path, ".md"), parse_yaml(path)] }.to_h
    errors = []

    studio_relation_ids.each do |slug, expected_relation_ids|
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
      expected_fields = if TARGET_SCENE_FAMILIES.key?(slug)
                          TARGET_STUDIO_FIELDS
                        elsif expected_relation_ids.length == 1
                          STUDIO_FIELDS
                        else
                          MULTI_RELATION_STUDIO_FIELDS
                        end
      errors << "#{prefix}: fields must be exactly #{expected_fields.join(', ')}" unless studio.keys.sort == expected_fields.sort
      unless studio["direction_id"] == slug && direction_ids.include?(studio["direction_id"])
        errors << "#{prefix}: direction_id must reference this service in the canonical cinematic graph"
      end
      validate_relations(errors, prefix, slug, studio, expected_relation_ids, relation_ids, graph.fetch("relations", []))
      validate_states(errors, prefix, studio["states"])
      validate_scene_families(errors, prefix, slug, studio, graph, repository_root)
      validate_forbidden_wording(errors, prefix, studio["states"])
    end

    records.each do |slug, service|
      next if studio_relation_ids.key?(slug) || !service.is_a?(Hash)

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
      errors << "#{prefix}: states must not contain forbidden live-video, vendor, portal, recording, tracking, or guarantee wording; nor fabricated status, automatic-operation, diagnosis, price, certificate, or fictional completion claims"
    end
  end

  def canonical_studio_relation_ids(graph, direction_ids, relation_ids)
    values = graph["service_studio_relation_ids"]
    return nil unless values.is_a?(Hash) && values.keys == direction_ids
    return nil unless values.values.all? { |ids| ids.is_a?(Array) && !ids.empty? && ids.all? { |id| non_empty_string?(id) } && ids.uniq.length == ids.length && ids.all? { |id| relation_ids.include?(id) } }
    expected_values = structurally_canonical_studio_relation_ids(direction_ids, graph["relations"])
    return nil unless expected_values && values == expected_values

    values
  end

  def structurally_canonical_studio_relation_ids(direction_ids, relations)
    return nil unless relations.is_a?(Array)

    panel_relations = relations.select do |relation|
      relation.is_a?(Hash) && relation["child"].is_a?(Hash) && relation["child"]["id"] == "panel-assembly"
    end
    return nil unless panel_relations.length == 1 && non_empty_string?(panel_relations.first["id"])

    direction_ids.to_h do |direction_id|
      owned_relations = relations.select do |relation|
        relation.is_a?(Hash) && relation["direction_id"] == direction_id
      end
      if owned_relations.empty?
        return nil unless PANEL_FALLBACK_DIRECTION_IDS.include?(direction_id)

        [direction_id, [panel_relations.first["id"]]]
      else
        relation_ids = owned_relations.map { |relation| relation["id"] }
        return nil unless relation_ids.all? { |relation_id| non_empty_string?(relation_id) }

        [direction_id, relation_ids]
      end
    end
  end

  def validate_relations(errors, prefix, slug, studio, expected_relation_ids, relation_ids, relations)
    if expected_relation_ids.length > 1
      values = studio["relation_ids"]
      unless values.is_a?(Array) && values.all? { |value| non_empty_string?(value) }
        errors << "#{prefix}: relation_ids must be a non-empty list"
        return
      end
      errors << "#{prefix}: relation_ids must not contain duplicates" unless values.uniq.length == values.length
      errors << "#{prefix}: relation_ids must declare the canonical studio relations" unless values == expected_relation_ids
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
    errors << "#{prefix}: relation_id must declare the canonical relation for #{slug}" unless relation_id == expected_relation_ids.first
  end

  def validate_scene_families(errors, prefix, slug, studio, graph, repository_root)
    expected = TARGET_SCENE_FAMILIES[slug]
    return unless expected

    actual = studio["scene_families"]
    unless actual.is_a?(Hash) && actual.keys.sort == STATE_IDS.sort
      errors << "#{prefix}: scene_families must declare assembled, focus, reassembled"
      return
    end

    STATE_IDS.each do |state_id|
      family = actual[state_id]
      errors << "#{prefix}.scene_families.#{state_id} must be a non-empty scalar" unless non_empty_string?(family)
    end
    errors << "#{prefix}: scene_families must use the canonical state media" unless actual == expected
    errors << "#{prefix}: scene_families must be distinct within the route" unless actual.values.uniq.length == STATE_IDS.length

    focus_family = graph.fetch("directions", []).find { |direction| direction.is_a?(Hash) && direction["id"] == slug }.to_h["focus_scene_family"]
    unless actual["focus"] == focus_family
      errors << "#{prefix}: focus scene family must equal the canonical cinematic direction focus_scene_family"
    end

    actual.each_value do |family|
      next unless non_empty_string?(family)

      [768, 1536].each do |width|
        path = File.join(repository_root, "assets", "images", "smart-home", "#{family}-#{width}.webp")
        errors << "#{prefix}: scene family #{family} is missing the #{width}px WebP pair member" unless File.file?(path)
      end
    end
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
  repository_root = File.expand_path(ARGV.fetch(2, File.expand_path("..", __dir__)))
  errors = ServiceStudioContract.validate(services_directory, graph_path, repository_root)
  if errors.any?
    warn errors.join("\n")
    exit 1
  end

  puts "Service studio contract is valid."
end
