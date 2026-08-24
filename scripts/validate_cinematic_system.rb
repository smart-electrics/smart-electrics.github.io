#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

module CinematicSystemContract
  module_function

  REQUIRED_CHILD_IDS = %w[
    cctv climate audio curtains-tulle-roller-shutters stair-lighting outdoor-lighting
    panel-assembly backup diagnostics
  ].freeze
  SCENE_FAMILY_BY_CHILD_ID = {
    "panel-assembly" => "panel",
    "stair-lighting" => "stairs",
    "outdoor-lighting" => "exterior",
    "cctv" => "surveillance",
    "audio" => "audio",
    "backup" => "backup",
    "climate" => "climate",
    "curtains-tulle-roller-shutters" => "shading",
    "diagnostics" => "diagnostics"
  }.freeze
  SCENE_FAMILIES = SCENE_FAMILY_BY_CHILD_ID.values.freeze
  REQUIRED_DIRECTION_FIELDS = %w[id service_slug label description].freeze
  REQUIRED_RELATION_FIELDS = %w[id direction_id scene_family child related_direction_ids].freeze
  REQUIRED_CHILD_FIELDS = %w[id label description].freeze

  def validate(data_path, repository_root)
    graph = parse_yaml(data_path)
    return ["#{File.basename(data_path)}: must contain valid YAML"] unless graph.is_a?(Hash)

    service_slugs = current_service_slugs(repository_root)
    return ["_services: must contain a parseable ordered service collection"] unless service_slugs

    errors = []
    direction_ids = validate_directions(errors, graph["directions"], service_slugs)
    validate_relations(errors, graph["relations"], direction_ids)
    errors
  end

  def parse_yaml(path)
    YAML.safe_load(File.read(path), permitted_classes: [], aliases: false)
  rescue Errno::ENOENT, Psych::Exception
    nil
  end

  def current_service_slugs(repository_root)
    records = Dir.glob(File.join(repository_root, "_services", "*.md")).map do |path|
      front_matter = File.read(path)[/\A---\s*\n(.*?)\n---/m, 1]
      data = YAML.safe_load(front_matter, permitted_classes: [], aliases: false)
      next unless data.is_a?(Hash) && non_empty_string?(data["slug"]) && data["order"].is_a?(Numeric)

      { "slug" => data["slug"], "order" => data["order"] }
    rescue Errno::ENOENT, Psych::Exception
      nil
    end

    return nil if records.empty? || records.any?(&:nil?)

    orders = records.map { |record| record.fetch("order") }
    return nil unless orders.uniq.length == orders.length

    records.sort_by { |record| record.fetch("order") }.map { |record| record.fetch("slug") }
  end

  def validate_directions(errors, directions, service_slugs)
    unless directions.is_a?(Array)
      errors << "directions must be a list"
      return []
    end

    slugs = directions.map { |direction| direction.is_a?(Hash) ? direction["service_slug"] : nil }
    unless slugs == service_slugs && slugs.uniq.length == slugs.length
      errors << "directions must contain exactly the current service slugs in canonical order"
    end

    ids = []
    directions.each_with_index do |direction, index|
      prefix = "direction #{index + 1}"
      unless direction.is_a?(Hash)
        errors << "#{prefix}: must be a mapping"
        next
      end

      unless direction.keys.sort == REQUIRED_DIRECTION_FIELDS.sort
        errors << "#{prefix}: fields must be exactly #{REQUIRED_DIRECTION_FIELDS.join(', ')}"
      end
      REQUIRED_DIRECTION_FIELDS.each do |field|
        errors << "#{prefix}: #{field} must be a non-empty scalar" unless non_empty_string?(direction[field])
      end
      if non_empty_string?(direction["id"]) && non_empty_string?(direction["service_slug"]) && direction["id"] != direction["service_slug"]
        errors << "#{prefix}: id must match service_slug"
      end
      ids << direction["id"] if non_empty_string?(direction["id"])
    end

    errors << "directions must not contain duplicate IDs" unless ids.uniq.length == ids.length
    ids
  end

  def validate_relations(errors, relations, direction_ids)
    unless relations.is_a?(Array)
      errors << "relations must be a list"
      return
    end

    relation_ids = []
    child_ids = []
    relations.each_with_index do |relation, index|
      prefix = "relation #{index + 1}"
      unless relation.is_a?(Hash)
        errors << "#{prefix}: must be a mapping"
        next
      end

      unless relation.keys.sort == REQUIRED_RELATION_FIELDS.sort
        errors << "#{prefix}: fields must be exactly #{REQUIRED_RELATION_FIELDS.join(', ')}"
      end
      errors << "#{prefix}: id must be a non-empty scalar" unless non_empty_string?(relation["id"])
      relation_ids << relation["id"] if non_empty_string?(relation["id"])
      validate_relation_owner(errors, prefix, relation, direction_ids)
      child_id = validate_child(errors, prefix, relation["child"])
      child_ids << child_id if child_id
      validate_relation_topology(errors, prefix, relation, child_id)
      validate_related_directions(errors, prefix, relation, direction_ids)
      validate_scene_family(errors, prefix, relation, child_id)
    end

    errors << "relations must not contain duplicate IDs" unless relation_ids.uniq.length == relation_ids.length
    errors << "relations must not contain duplicate child IDs" unless child_ids.uniq.length == child_ids.length
    unless child_ids.sort == REQUIRED_CHILD_IDS.sort && child_ids.uniq.length == child_ids.length
      errors << "relations must contain exactly the required selectable child IDs"
    end
  end

  def validate_relation_owner(errors, prefix, relation, direction_ids)
    unless non_empty_string?(relation["direction_id"]) && direction_ids.include?(relation["direction_id"])
      errors << "#{prefix}: direction_id must reference a graph direction"
    end
  end

  def validate_child(errors, prefix, child)
    unless child.is_a?(Hash)
      errors << "#{prefix}: child must be a mapping"
      return nil
    end
    unless child.keys.sort == REQUIRED_CHILD_FIELDS.sort
      errors << "#{prefix}: child fields must be exactly #{REQUIRED_CHILD_FIELDS.join(', ')}"
    end
    REQUIRED_CHILD_FIELDS.each do |field|
      errors << "#{prefix}: child #{field} must be a non-empty scalar" unless non_empty_string?(child[field])
    end
    child["id"] if non_empty_string?(child["id"])
  end

  def validate_relation_topology(errors, prefix, relation, child_id)
    return unless non_empty_string?(relation["id"]) && non_empty_string?(relation["direction_id"]) && child_id

    expected_id = "#{relation.fetch('direction_id')}--#{child_id}"
    errors << "#{prefix}: id must equal direction_id--child.id" unless relation["id"] == expected_id
  end

  def validate_related_directions(errors, prefix, relation, direction_ids)
    related = relation["related_direction_ids"]
    unless related.is_a?(Array) && related.length.between?(1, 3) && related.all? { |id| non_empty_string?(id) }
      errors << "#{prefix}: related_direction_ids must contain 1 to 3 non-empty direction IDs"
      return
    end
    errors << "#{prefix}: related_direction_ids must not contain duplicate IDs" unless related.uniq.length == related.length
    errors << "#{prefix}: related_direction_ids must reference graph directions" if related.any? { |id| !direction_ids.include?(id) }
    errors << "#{prefix}: related_direction_ids must not include direction_id" if related.include?(relation["direction_id"])
  end

  def validate_scene_family(errors, prefix, relation, child_id)
    scene_family = relation["scene_family"]
    unless non_empty_string?(scene_family)
      errors << "#{prefix}: scene_family must be a non-empty scalar"
      return
    end
    errors << "#{prefix}: scene_family must belong to the declared family set" unless SCENE_FAMILIES.include?(scene_family)
    if child_id && SCENE_FAMILY_BY_CHILD_ID[child_id] != scene_family
      errors << "#{prefix}: scene_family must match the canonical child mapping"
    end
  end

  def non_empty_string?(value)
    value.is_a?(String) && !value.strip.empty?
  end
end

if $PROGRAM_NAME == __FILE__
  default_data_path = File.expand_path("../_data/cinematic_system.yml", __dir__)
  default_repository_root = File.expand_path("..", __dir__)
  data_path = File.expand_path(ARGV.fetch(0, default_data_path))
  repository_root = File.expand_path(ARGV.fetch(1, default_repository_root))
  errors = CinematicSystemContract.validate(data_path, repository_root)

  if errors.any?
    warn errors.join("\n")
    exit 1
  end

  puts "Cinematic system graph is valid."
end
