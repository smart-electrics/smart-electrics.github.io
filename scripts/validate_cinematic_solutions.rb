#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"
require_relative "validate_service_studios"
require_relative "validate_solutions"

module CinematicSolutionsContract
  module_function

  CANONICAL_SLUGS = SolutionContract::CANONICAL_SLUGS.freeze
  CANONICAL_MAPPING_FINGERPRINT = "6c46d53a"
  ENTRY_FIELDS = %w[direction_ids relation_id].freeze
  TOPOLOGY_FIELDS = %w[cinematic_solution cinematic_solutions cinematic_solution_relation_id direction_ids relation_id].freeze

  def parse_yaml(path)
    YAML.safe_load(File.read(path), permitted_classes: [], aliases: false)
  rescue Errno::ENOENT, Psych::Exception
    nil
  end

  def non_empty_string?(value)
    value.is_a?(String) && !value.strip.empty?
  end

  def validate(data_path, graph_path, solutions_directory)
    mapping = parse_yaml(data_path)
    graph = parse_yaml(graph_path)
    errors = []
    validate_graph(errors, graph)
    validate_mapping(errors, mapping, graph, solutions_directory)
    validate_solution_documents(errors, mapping, solutions_directory)
    errors
  end

  def validate_graph(errors, graph)
    unless graph.is_a?(Hash) && graph["directions"].is_a?(Array) && graph["relations"].is_a?(Array)
      errors << "cinematic_system.yml: must contain a canonical graph"
      return
    end

    direction_ids = graph.fetch("directions").filter_map { |direction| direction["id"] if direction.is_a?(Hash) }
    relation_ids = graph.fetch("relations").filter_map { |relation| relation["id"] if relation.is_a?(Hash) }
    errors << "cinematic_system.yml: graph direction IDs must be unique" unless direction_ids.length == graph.fetch("directions").length && direction_ids.uniq.length == direction_ids.length
    errors << "cinematic_system.yml: graph relation IDs must be unique" unless relation_ids.length == graph.fetch("relations").length && relation_ids.uniq.length == relation_ids.length
  end

  def validate_mapping(errors, mapping, graph, solutions_directory)
    unless mapping.is_a?(Hash)
      errors << "cinematic_solutions.yml must be a mapping"
      return
    end
    unless mapping.keys == CANONICAL_SLUGS
      errors << "cinematic_solutions.yml must contain exactly the six solution slugs in canonical order"
    end

    direction_ids, relations_by_id = graph_indexes(graph)
    CANONICAL_SLUGS.each do |slug|
      entry = mapping[slug]
      prefix = slug
      unless entry.is_a?(Hash)
        errors << "#{prefix}: mapping must be a mapping"
        next
      end
      errors << "#{prefix}: fields must be exactly #{ENTRY_FIELDS.join(', ')}" unless entry.keys.sort == ENTRY_FIELDS.sort
      solution = SolutionContract.front_matter(File.join(solutions_directory, "#{slug}.md"))
      expected_direction_ids = solution.is_a?(Hash) ? solution["related_services"] : nil
      validate_direction_ids(errors, prefix, entry["direction_ids"], expected_direction_ids, direction_ids)
      validate_relation_id(errors, prefix, entry["relation_id"], entry["direction_ids"], relations_by_id)
    end
    unless mapping_fingerprint(mapping) == CANONICAL_MAPPING_FINGERPRINT
      errors << "cinematic_solutions.yml must match the canonical mapping integrity fingerprint"
    end
  end

  def graph_indexes(graph)
    return [[], {}] unless graph.is_a?(Hash)

    directions = graph.fetch("directions", [])
    relations = graph.fetch("relations", [])
    direction_ids = directions.filter_map { |direction| direction["id"] if direction.is_a?(Hash) }
    relations_by_id = relations.filter_map do |relation|
      next unless relation.is_a?(Hash) && non_empty_string?(relation["id"])

      [relation["id"], relation]
    end.to_h
    [direction_ids, relations_by_id]
  end

  def validate_direction_ids(errors, prefix, values, expected, graph_direction_ids)
    unless values.is_a?(Array) && !values.empty? && values.all? { |value| non_empty_string?(value) }
      errors << "#{prefix}: direction_ids must be a non-empty list of direction IDs"
      return
    end
    errors << "#{prefix}: direction_ids must not contain duplicates" unless values.uniq.length == values.length
    errors << "#{prefix}: direction_ids must reference the canonical cinematic graph" if values.any? { |value| !graph_direction_ids.include?(value) }
    errors << "#{prefix}: direction_ids must equal the canonical ordered service IDs" unless values == expected
  end

  def validate_relation_id(errors, prefix, value, direction_ids, relations_by_id)
    unless non_empty_string?(value) && relations_by_id.key?(value)
      errors << "#{prefix}: relation_id must reference the canonical cinematic graph"
      return
    end
    relation = relations_by_id.fetch(value)
    unless direction_ids.is_a?(Array) && direction_ids.include?(relation["direction_id"])
      errors << "#{prefix}: relation_id owner must be included in direction_ids"
    end
  end

  def validate_solution_documents(errors, mapping, solutions_directory)
    return unless mapping.is_a?(Hash)

    CANONICAL_SLUGS.each do |slug|
      path = File.join(solutions_directory, "#{slug}.md")
      solution = SolutionContract.front_matter(path)
      unless solution.is_a?(Hash)
        errors << "#{slug}.md: must contain valid solution front matter"
        next
      end
      if solution["related_services"] != mapping.dig(slug, "direction_ids")
        errors << "#{slug}.md: related_services must equal cinematic_solutions.direction_ids"
      end
      unless solution["image_focus"].is_a?(String) && solution["image_focus"].match?(%r{\A(?:100|[1-9]?\d)%\s+(?:100|[1-9]?\d)%\z})
        errors << "#{slug}.md: image_focus must be a CSS-safe percentage pair"
      end
      conflicting_fields = solution.keys & TOPOLOGY_FIELDS
      unless conflicting_fields.empty?
        errors << "#{slug}.md: cinematic topology must live only in _data/cinematic_solutions.yml"
      end
      validate_forbidden_claims(errors, slug, path)
    end
  end

  def mapping_fingerprint(mapping)
    return nil unless mapping.is_a?(Hash) && mapping.keys == CANONICAL_SLUGS

    serialized = CANONICAL_SLUGS.map do |slug|
      entry = mapping[slug]
      return nil unless entry.is_a?(Hash) && entry["direction_ids"].is_a?(Array) && entry["direction_ids"].all? { |id| non_empty_string?(id) } && non_empty_string?(entry["relation_id"])

      "#{slug}:#{entry.fetch('direction_ids').join(',')}:#{entry.fetch('relation_id')}"
    end.join("|")
    hash = 0x811c9dc5
    serialized.each_byte { |byte| hash = ((hash ^ byte) * 0x01000193) & 0xffffffff }
    format("%08x", hash)
  end

  def validate_forbidden_claims(errors, slug, path)
    source = File.read(path)
    return unless source.match?(ServiceStudioContract::FORBIDDEN_WORDING)

    errors << "#{slug}.md: must not contain forbidden claims"
  rescue Errno::ENOENT
    errors << "#{slug}.md: must contain valid solution front matter"
  end
end

if $PROGRAM_NAME == __FILE__
  data_path = File.expand_path(ARGV.fetch(0, File.expand_path("../_data/cinematic_solutions.yml", __dir__)))
  graph_path = File.expand_path(ARGV.fetch(1, File.expand_path("../_data/cinematic_system.yml", __dir__)))
  solutions_directory = File.expand_path(ARGV.fetch(2, File.expand_path("../_solutions", __dir__)))
  errors = CinematicSolutionsContract.validate(data_path, graph_path, solutions_directory)

  if errors.any?
    warn errors.join("\n")
    exit 1
  end

  puts "Cinematic solutions contract is valid."
end
