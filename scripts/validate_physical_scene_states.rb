#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

module PhysicalSceneStatesContract
  module_function

  SYSTEMS = [
    { "id" => "room", "scene_key" => "assembled", "controls" => { "lighting" => %w[off route evening full], "window_treatment" => %w[open tulle blinds blackout curtains] }, "initial_state" => { "lighting" => "evening", "window_treatment" => "open" } },
    { "id" => "stairs", "scene_key" => "relation:lighting--stair-lighting", "controls" => { "stair_lighting" => %w[off route full] }, "initial_state" => { "stair_lighting" => "off" } },
    { "id" => "exterior", "scene_key" => "relation:lighting--outdoor-lighting", "controls" => { "exterior_lighting" => %w[approach evening reduced-night] }, "initial_state" => { "exterior_lighting" => "approach" } }
  ].freeze
  ROOT_FIELDS = %w[systems].freeze
  SYSTEM_FIELDS = %w[id scene_key controls initial_state scenes].freeze
  CONTROL_FIELDS = %w[id label choices].freeze
  CHOICE_FIELDS = %w[id label].freeze
  SCENE_FIELDS = %w[state src_768 src_1536 alt].freeze

  def validate(path, repository_root)
    data = YAML.safe_load(File.read(path), permitted_classes: [], aliases: false)
    return ["#{File.basename(path)}: must contain valid YAML"] unless data.is_a?(Hash)

    errors = []
    errors << "physical scene data: fields must be exactly #{ROOT_FIELDS.join(', ')}" unless data.keys.sort == ROOT_FIELDS.sort
    validate_systems(errors, data["systems"], repository_root)
    errors
  rescue Errno::ENOENT, Psych::Exception
    ["#{File.basename(path)}: must contain valid YAML"]
  end

  def validate_systems(errors, systems, repository_root)
    unless systems.is_a?(Array)
      errors << "systems must be a list"
      return
    end
    errors << "systems must contain room, stairs, and exterior in canonical order" unless systems.map { |system| system.is_a?(Hash) ? system["id"] : nil } == SYSTEMS.map { |system| system["id"] }
    systems.each_with_index do |system, index|
      expected = SYSTEMS[index]
      prefix = "system #{index + 1}"
      unless system.is_a?(Hash) && expected
        errors << "#{prefix}: must be a canonical mapping"
        next
      end
      errors << "#{prefix}: fields must be exactly #{SYSTEM_FIELDS.join(', ')}" unless system.keys.sort == SYSTEM_FIELDS.sort
      errors << "#{prefix}: scene_key must be canonical" unless system["scene_key"] == expected["scene_key"]
      validate_controls(errors, system["controls"], expected, prefix)
      validate_initial_state(errors, system["initial_state"], expected, prefix)
      validate_scenes(errors, system, expected, prefix, repository_root)
    end
  end

  def validate_controls(errors, controls, expected, prefix)
    unless controls.is_a?(Array)
      errors << "#{prefix}: controls must be a list"
      return
    end
    expected_ids = expected.fetch("controls").keys
    errors << "#{prefix}: controls must contain canonical IDs in order" unless controls.map { |control| control.is_a?(Hash) ? control["id"] : nil } == expected_ids
    controls.each_with_index do |control, index|
      control_prefix = "#{prefix} control #{index + 1}"
      unless control.is_a?(Hash)
        errors << "#{control_prefix}: must be a mapping"
        next
      end
      errors << "#{control_prefix}: fields must be exactly #{CONTROL_FIELDS.join(', ')}" unless control.keys.sort == CONTROL_FIELDS.sort
      errors << "#{control_prefix}: label must be a non-empty scalar" unless scalar?(control["label"])
      choices = control["choices"]
      unless choices.is_a?(Array)
        errors << "#{control_prefix}: choices must be a list"
        next
      end
      expected_choice_ids = expected.fetch("controls").fetch(control["id"], [])
      errors << "#{control_prefix}: choices must contain canonical IDs in order" unless choices.map { |choice| choice.is_a?(Hash) ? choice["id"] : nil } == expected_choice_ids
      choices.each_with_index do |choice, choice_index|
        choice_prefix = "#{control_prefix} choice #{choice_index + 1}"
        errors << "#{choice_prefix}: fields must be exactly #{CHOICE_FIELDS.join(', ')}" unless choice.is_a?(Hash) && choice.keys.sort == CHOICE_FIELDS.sort
        errors << "#{choice_prefix}: ID and label must be non-empty scalars" unless choice.is_a?(Hash) && scalar?(choice["id"]) && scalar?(choice["label"])
      end
    end
  end

  def validate_initial_state(errors, initial_state, expected, prefix)
    unless initial_state.is_a?(Hash)
      errors << "#{prefix}: initial_state must be a mapping"
      return
    end
    errors << "#{prefix}: initial_state must be canonical" unless initial_state == expected["initial_state"]
  end

  def validate_scenes(errors, system, expected, prefix, repository_root)
    scenes = system["scenes"]
    unless scenes.is_a?(Array)
      errors << "#{prefix}: scenes must be a list"
      return
    end
    control_ids = expected.fetch("controls").keys
    expected_states = cartesian_states(control_ids, expected.fetch("controls"))
    states = scenes.map { |scene| scene.is_a?(Hash) ? scene["state"] : nil }
    errors << "#{prefix}: scenes must contain exactly one mapping for every control combination" unless states == expected_states
    scenes.each_with_index do |scene, index|
      scene_prefix = "#{prefix} scene #{index + 1}"
      unless scene.is_a?(Hash)
        errors << "#{scene_prefix}: must be a mapping"
        next
      end
      errors << "#{scene_prefix}: fields must be exactly #{SCENE_FIELDS.join(', ')}" unless scene.keys.sort == SCENE_FIELDS.sort
      SCENE_FIELDS.each { |field| errors << "#{scene_prefix}: #{field} must be a non-empty scalar or mapping" unless field == "state" ? scene[field].is_a?(Hash) : scalar?(scene[field]) }
      expected_stem = media_stem(expected.fetch("id"), scene["state"])
      errors << "#{scene_prefix}: src_768 must match its physical state" unless scene["src_768"] == "/assets/images/cinematic/residence/#{expected_stem}-768.webp"
      errors << "#{scene_prefix}: src_1536 must match its physical state" unless scene["src_1536"] == "/assets/images/cinematic/residence/#{expected_stem}-1536.webp"
      validate_mapped_file(errors, scene_prefix, scene["src_768"], repository_root)
      validate_mapped_file(errors, scene_prefix, scene["src_1536"], repository_root)
    end
  end

  def cartesian_states(control_ids, controls, index = 0, state = {})
    return [state] if index == control_ids.length

    control_id = control_ids.fetch(index)
    controls.fetch(control_id).flat_map { |value| cartesian_states(control_ids, controls, index + 1, state.merge(control_id => value)) }
  end

  def media_stem(system_id, state)
    return "room-#{state['lighting']}-#{state['window_treatment']}" if system_id == "room"
    return "stairs-#{state['stair_lighting']}" if system_id == "stairs"

    "exterior-#{state['exterior_lighting']}"
  end

  def validate_mapped_file(errors, prefix, public_path, repository_root)
    path = File.expand_path(public_path.to_s.sub(%r{\A/}, ""), repository_root)
    errors << "#{prefix}: mapped production file must exist and be non-empty" unless File.file?(path) && File.size?(path)
  end

  def scalar?(value)
    value.is_a?(String) && !value.strip.empty?
  end
end

if $PROGRAM_NAME == __FILE__
  default_repository_root = File.expand_path("..", __dir__)
  path = File.expand_path(ARGV.fetch(0, File.join(default_repository_root, "_data/physical_scene_states.yml")))
  repository_root = File.expand_path(ARGV.fetch(1, default_repository_root))
  errors = PhysicalSceneStatesContract.validate(path, repository_root)
  if errors.any?
    warn errors.join("\n")
    exit 1
  end
  puts "Physical scene state mappings are valid."
end
