#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

module PhysicalSceneStatesContract
  module_function

  LIGHTING_IDS = %w[off route evening full].freeze
  WINDOW_TREATMENT_IDS = %w[open tulle blinds blackout curtains].freeze
  ROOT_FIELDS = %w[lighting window_treatments initial_state scenes].freeze
  CHOICE_FIELDS = %w[id label].freeze
  INITIAL_FIELDS = %w[lighting_id window_treatment_id].freeze
  SCENE_FIELDS = %w[lighting_id window_treatment_id src_768 src_1536 alt].freeze

  def validate(path, repository_root)
    data = YAML.safe_load(File.read(path), permitted_classes: [], aliases: false)
    return ["#{File.basename(path)}: must contain valid YAML"] unless data.is_a?(Hash)

    errors = []
    errors << "physical scene data: fields must be exactly #{ROOT_FIELDS.join(', ')}" unless data.keys.sort == ROOT_FIELDS.sort
    validate_choices(errors, data["lighting"], "lighting", LIGHTING_IDS)
    validate_choices(errors, data["window_treatments"], "window_treatments", WINDOW_TREATMENT_IDS)
    validate_initial_state(errors, data["initial_state"])
    validate_scenes(errors, data["scenes"], repository_root)
    errors
  rescue Errno::ENOENT, Psych::Exception
    ["#{File.basename(path)}: must contain valid YAML"]
  end

  def validate_choices(errors, choices, name, expected_ids)
    unless choices.is_a?(Array)
      errors << "#{name} must be a list"
      return
    end
    ids = choices.map { |choice| choice.is_a?(Hash) ? choice["id"] : nil }
    errors << "#{name} must contain exactly the canonical IDs" unless ids == expected_ids
    choices.each_with_index do |choice, index|
      prefix = "#{name} #{index + 1}"
      unless choice.is_a?(Hash)
        errors << "#{prefix}: must be a mapping"
        next
      end
      errors << "#{prefix}: fields must be exactly #{CHOICE_FIELDS.join(', ')}" unless choice.keys.sort == CHOICE_FIELDS.sort
      CHOICE_FIELDS.each { |field| errors << "#{prefix}: #{field} must be a non-empty scalar" unless scalar?(choice[field]) }
    end
  end

  def validate_initial_state(errors, initial)
    unless initial.is_a?(Hash)
      errors << "initial_state must be a mapping"
      return
    end
    errors << "initial_state: fields must be exactly #{INITIAL_FIELDS.join(', ')}" unless initial.keys.sort == INITIAL_FIELDS.sort
    errors << "initial_state: must be evening/open" unless initial["lighting_id"] == "evening" && initial["window_treatment_id"] == "open"
  end

  def validate_scenes(errors, scenes, repository_root)
    unless scenes.is_a?(Array)
      errors << "scenes must be a list"
      return
    end
    pairs = []
    scenes.each_with_index do |scene, index|
      prefix = "scene #{index + 1}"
      unless scene.is_a?(Hash)
        errors << "#{prefix}: must be a mapping"
        next
      end
      errors << "#{prefix}: fields must be exactly #{SCENE_FIELDS.join(', ')}" unless scene.keys.sort == SCENE_FIELDS.sort
      SCENE_FIELDS.each { |field| errors << "#{prefix}: #{field} must be a non-empty scalar" unless scalar?(scene[field]) }
      lighting_id = scene["lighting_id"]
      window_treatment_id = scene["window_treatment_id"]
      pairs << [lighting_id, window_treatment_id]
      errors << "#{prefix}: lighting_id must be canonical" unless LIGHTING_IDS.include?(lighting_id)
      errors << "#{prefix}: window_treatment_id must be canonical" unless WINDOW_TREATMENT_IDS.include?(window_treatment_id)
      expected_768 = "/assets/images/cinematic/residence/room-#{lighting_id}-#{window_treatment_id}-768.webp"
      expected_1536 = "/assets/images/cinematic/residence/room-#{lighting_id}-#{window_treatment_id}-1536.webp"
      errors << "#{prefix}: src_768 must match its lighting/window-treatment pair" unless scene["src_768"] == expected_768
      errors << "#{prefix}: src_1536 must match its lighting/window-treatment pair" unless scene["src_1536"] == expected_1536
      validate_mapped_file(errors, prefix, scene["src_768"], repository_root)
      validate_mapped_file(errors, prefix, scene["src_1536"], repository_root)
    end
    expected_pairs = LIGHTING_IDS.product(WINDOW_TREATMENT_IDS)
    errors << "scenes must contain exactly one mapping for every lighting and window-treatment pair" unless pairs == expected_pairs
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
