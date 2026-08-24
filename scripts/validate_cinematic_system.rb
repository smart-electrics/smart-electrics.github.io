#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

module CinematicSystemContract
  module_function

  REQUIRED_CHILD_IDS = %w[
    cctv climate audio curtains-tulle-roller-shutters stair-lighting outdoor-lighting
    panel-assembly backup diagnostics
  ].freeze
  RELATION_SCENE_FAMILY_BY_CHILD_ID = {
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
  FOCUS_SCENE_FAMILY_BY_DIRECTION_ID = {
    "electrical-design" => "stairs",
    "electrical-installation" => "electrical-installation",
    "panels-and-protection" => "panel",
    "lighting" => "stairs",
    "low-voltage" => "surveillance",
    "backup-power" => "backup",
    "smart-home-integration" => "climate",
    "diagnostics-and-service" => "diagnostics"
  }.freeze
  SCENE_FAMILIES = (RELATION_SCENE_FAMILY_BY_CHILD_ID.values + FOCUS_SCENE_FAMILY_BY_DIRECTION_ID.values).uniq.freeze
  DISTINCT_FOCUS_SCENE_PAIRS = [%w[electrical-installation panels-and-protection]].freeze
  REQUIRED_DIRECTION_FIELDS = %w[id focus_scene_family service_slug label description].freeze
  REQUIRED_RELATION_FIELDS = %w[id direction_id scene_family child related_direction_ids].freeze
  REQUIRED_CHILD_FIELDS = %w[id label description].freeze
  REQUIRED_GRAPH_FIELDS = %w[directions relations service_studio_relation_ids].freeze
  PANEL_FALLBACK_DIRECTION_IDS = %w[electrical-design electrical-installation].freeze

  def validate(data_path, repository_root)
    graph = parse_yaml(data_path)
    return ["#{File.basename(data_path)}: must contain valid YAML"] unless graph.is_a?(Hash)

    service_slugs = current_service_slugs(repository_root)
    return ["_services: must contain a parseable ordered service collection"] unless service_slugs

    errors = []
    unless graph.keys.sort == REQUIRED_GRAPH_FIELDS.sort
      errors << "#{File.basename(data_path)}: fields must be exactly #{REQUIRED_GRAPH_FIELDS.join(', ')}"
    end
    directions = graph["directions"]
    direction_ids = validate_directions(errors, directions, service_slugs)
    relation_ids = validate_relations(errors, graph["relations"], direction_ids)
    validate_service_studio_relation_ids(errors, graph["service_studio_relation_ids"], direction_ids, relation_ids, graph["relations"])
    validate_scene_assets(errors, directions, graph["relations"], repository_root)
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
    focus_scene_families = {}
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
      validate_focus_scene_family(errors, prefix, direction)
      ids << direction["id"] if non_empty_string?(direction["id"])
      focus_scene_families[direction["id"]] = direction["focus_scene_family"] if non_empty_string?(direction["id"]) && non_empty_string?(direction["focus_scene_family"])
    end

    errors << "directions must not contain duplicate IDs" unless ids.uniq.length == ids.length
    validate_distinct_focus_scene_pairs(errors, focus_scene_families)
    ids
  end

  def validate_relations(errors, relations, direction_ids)
    unless relations.is_a?(Array)
      errors << "relations must be a list"
      return []
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
    relation_ids
  end

  def validate_service_studio_relation_ids(errors, studio_relation_ids, direction_ids, relation_ids, relations)
    unless studio_relation_ids.is_a?(Hash)
      errors << "service_studio_relation_ids must be a mapping"
      return
    end

    unless studio_relation_ids.keys == direction_ids
      errors << "service_studio_relation_ids must contain exactly the graph direction IDs in canonical order"
    end

    studio_relation_ids.each do |direction_id, ids|
      prefix = "service_studio_relation_ids.#{direction_id}"
      unless ids.is_a?(Array) && !ids.empty? && ids.all? { |relation_id| non_empty_string?(relation_id) }
        errors << "#{prefix} must be a non-empty list of relation IDs"
        next
      end
      errors << "#{prefix} must not contain duplicate relation IDs" unless ids.uniq.length == ids.length
      errors << "#{prefix} must reference graph relation IDs" if ids.any? { |relation_id| !relation_ids.include?(relation_id) }
    end

    validate_service_studio_relation_topology(errors, studio_relation_ids, direction_ids, relations)
  end

  def validate_service_studio_relation_topology(errors, studio_relation_ids, direction_ids, relations)
    return unless relations.is_a?(Array)

    panel_relations = relations.select do |relation|
      relation.is_a?(Hash) && relation["child"].is_a?(Hash) && relation["child"]["id"] == "panel-assembly"
    end
    unless panel_relations.length == 1 && non_empty_string?(panel_relations.first["id"])
      errors << "service_studio_relation_ids: panel-assembly fallback must resolve to exactly one relation"
      return
    end

    direction_ids.each do |direction_id|
      owned_relations = relations.select do |relation|
        relation.is_a?(Hash) && relation["direction_id"] == direction_id
      end
      if owned_relations.empty?
        unless PANEL_FALLBACK_DIRECTION_IDS.include?(direction_id)
          errors << "service_studio_relation_ids.#{direction_id} may use the panel-assembly fallback only for #{PANEL_FALLBACK_DIRECTION_IDS.join(', ')}"
          next
        end
        expected_relation_ids = [panel_relations.first["id"]]
      else
        expected_relation_ids = owned_relations.map { |relation| relation["id"] }
      end

      unless studio_relation_ids[direction_id] == expected_relation_ids
        errors << "service_studio_relation_ids.#{direction_id} must equal the canonical owned relation IDs"
      end
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
    if child_id && RELATION_SCENE_FAMILY_BY_CHILD_ID[child_id] != scene_family
      errors << "#{prefix}: scene_family must match the canonical child mapping"
    end
  end

  def validate_focus_scene_family(errors, prefix, direction)
    scene_family = direction["focus_scene_family"]
    unless non_empty_string?(scene_family)
      errors << "#{prefix}: focus_scene_family must be a non-empty scalar"
      return
    end
    errors << "#{prefix}: focus_scene_family must belong to the declared family set" unless SCENE_FAMILIES.include?(scene_family)
    direction_id = direction["id"]
    if non_empty_string?(direction_id) && FOCUS_SCENE_FAMILY_BY_DIRECTION_ID[direction_id] != scene_family
      errors << "#{prefix}: focus_scene_family must match the canonical direction mapping"
    end
  end

  def validate_distinct_focus_scene_pairs(errors, focus_scene_families)
    DISTINCT_FOCUS_SCENE_PAIRS.each do |left_id, right_id|
      next unless focus_scene_families[left_id] && focus_scene_families[right_id]
      next unless focus_scene_families[left_id] == focus_scene_families[right_id]

      errors << "focus scene mappings must keep #{left_id} distinct from #{right_id}"
    end
  end

  def validate_scene_assets(errors, directions, relations, repository_root)
    scene_families = []
    scene_families.concat(directions.filter_map { |direction| direction.is_a?(Hash) ? direction["focus_scene_family"] : nil }) if directions.is_a?(Array)
    scene_families.concat(relations.filter_map { |relation| relation.is_a?(Hash) ? relation["scene_family"] : nil }) if relations.is_a?(Array)

    scene_families.select { |family| non_empty_string?(family) && SCENE_FAMILIES.include?(family) }.uniq.each do |family|
      [768, 1536].each do |width|
        path = File.join(repository_root, "assets", "images", "smart-home", "#{family}-#{width}.webp")
        errors << "scene family #{family}: missing #{width}px asset" unless File.file?(path)
      end
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
