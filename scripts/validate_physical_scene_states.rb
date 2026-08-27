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
  ROOT_FIELDS = %w[systems svg].freeze
  SYSTEM_FIELDS = %w[id scene_key controls initial_state scenes].freeze
  CONTROL_FIELDS = %w[id label choices].freeze
  CHOICE_FIELDS = %w[id label].freeze
  SCENE_FIELDS = %w[state src_768 src_1536 alt].freeze
  SVG_SYSTEMS = [
    { "id" => "room", "controls" => { "lighting" => { "type" => "segment", "values" => %w[off route evening full] }, "window_treatment" => { "type" => "segment", "values" => %w[open tulle blinds blackout curtains] } } },
    { "id" => "stairs", "controls" => { "stair_lighting" => { "type" => "segment", "values" => %w[off route full] } } },
    { "id" => "exterior", "controls" => { "exterior_lighting" => { "type" => "segment", "values" => %w[approach evening reduced-night] } } },
    { "id" => "lighting", "controls" => { "brightness" => { "type" => "range", "min" => 0, "max" => 100 }, "layer" => { "type" => "segment", "values" => %w[route evening full] } } },
    { "id" => "climate", "controls" => { "comfort" => { "type" => "segment", "values" => %w[warm balanced cool] }, "operation" => { "type" => "segment", "values" => %w[auto heating cooling] } } },
    { "id" => "access", "controls" => { "arrival_route" => { "type" => "toggle" }, "entry_zone" => { "type" => "segment", "values" => %w[gate entry garage] } } },
    { "id" => "security", "controls" => { "coverage" => { "type" => "segment", "values" => %w[entry perimeter quiet] }, "event_path" => { "type" => "segment", "values" => %w[video sensors quiet] } } },
    { "id" => "panel", "controls" => { "layer" => { "type" => "segment", "values" => %w[protection groups priorities] }, "priority_groups" => { "type" => "toggle" } } },
    { "id" => "low-voltage", "controls" => { "route" => { "type" => "segment", "values" => %w[network video signals] }, "topology_focus" => { "type" => "segment", "values" => %w[routes points interfaces] } } },
    { "id" => "backup-power", "controls" => { "priority_groups" => { "type" => "toggle" }, "restore_intent" => { "type" => "segment", "values" => %w[essential staged manual] } } },
    { "id" => "audio", "controls" => { "source" => { "type" => "segment", "values" => %w[local media scenario] }, "zone" => { "type" => "segment", "values" => %w[living terrace private] }, "group" => { "type" => "segment", "values" => %w[single shared floor] }, "muted" => { "type" => "toggle" } } },
    { "id" => "shading", "controls" => { "position" => { "type" => "range", "min" => 0, "max" => 100 }, "treatment" => { "type" => "segment", "values" => %w[tulle blinds curtains rollers] } } }
  ].freeze
  SVG_EFFECTS = %w[glow zone tulle blind curtain roller route node thermal topology coverage audio].freeze
  SVG_GEOMETRIES = %w[ellipse circle rect line path polygon].freeze
  SVG_PARAMETER = /\A[a-z][a-z0-9_]*\z/.freeze

  def validate(path, repository_root)
    data = YAML.safe_load(File.read(path), permitted_classes: [], aliases: false)
    return ["#{File.basename(path)}: must contain valid YAML"] unless data.is_a?(Hash)

    errors = []
    errors << "physical scene data: fields must be exactly #{ROOT_FIELDS.join(', ')}" unless data.keys.sort == ROOT_FIELDS.sort
    validate_systems(errors, data["systems"], repository_root)
    validate_svg(errors, data["svg"])
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

  def validate_svg(errors, svg)
    unless svg.is_a?(Hash)
      errors << "svg must be a mapping"
      return
    end
    errors << "svg: fields must be exactly systems, view_box" unless svg.keys.sort == %w[systems view_box]
    errors << "svg: view_box must be exactly 1536 by 1024" unless svg["view_box"] == { "width" => 1536, "height" => 1024 }
    systems = svg["systems"]
    unless systems.is_a?(Array)
      errors << "svg: systems must be a list"
      return
    end
    errors << "svg: systems must contain the canonical 12 IDs in order" unless systems.map { |system| system.is_a?(Hash) ? system["id"] : nil } == SVG_SYSTEMS.map { |system| system["id"] }

    seen_layers = {}
    systems.each_with_index do |system, index|
      expected = SVG_SYSTEMS[index]
      prefix = "svg system #{index + 1}"
      unless system.is_a?(Hash) && expected
        errors << "#{prefix}: must be a canonical mapping"
        next
      end
      errors << "#{prefix}: fields must be exactly id, layers" unless system.keys.sort == %w[id layers]
      layers = system["layers"]
      unless layers.is_a?(Array) && !layers.empty?
        errors << "#{prefix}: layers must be a non-empty list"
        next
      end
      coverage = Hash.new { |hash, key| hash[key] = { "range" => [], "segment" => [], "toggle" => [] } }
      layers.each_with_index do |layer, layer_index|
        validate_svg_layer(errors, layer, expected, coverage, seen_layers, "#{prefix} layer #{layer_index + 1}")
      end
      validate_svg_coverage(errors, coverage, expected, prefix)
    end
  end

  def validate_svg_layer(errors, layer, expected_system, coverage, seen_layers, prefix)
    unless layer.is_a?(Hash) && scalar?(layer["id"])
      errors << "#{prefix}: must contain a non-empty ID"
      return
    end
    allowed_fields = %w[id geometry binding bindings visible_when effect]
    errors << "#{prefix}: fields are unsupported" unless (layer.keys - allowed_fields).empty?
    layer_id = layer["id"]
    errors << "#{prefix}: layer IDs must be globally unique" if seen_layers.key?(layer_id)
    seen_layers[layer_id] = true
    unless scalar?(layer["effect"]) && SVG_EFFECTS.include?(layer["effect"])
      errors << "#{prefix}: effect must be one canonical production effect"
    end
    validate_svg_geometry(errors, layer["geometry"], "#{prefix} geometry")

    has_binding = layer.key?("binding")
    has_bindings = layer.key?("bindings")
    if has_binding == has_bindings
      errors << "#{prefix}: must have exactly one binding or bindings"
      return
    end
    bindings = has_binding ? [layer["binding"]] : layer["bindings"]
    unless bindings.is_a?(Array) && !bindings.empty?
      errors << "#{prefix}: bindings must be a non-empty list"
      return
    end
    parameters = {}
    bindings.each_with_index do |binding, index|
      parameter = binding.is_a?(Hash) ? binding["parameter"] : nil
      errors << "#{prefix} binding #{index + 1}: parameters must be unique" if scalar?(parameter) && parameters.key?(parameter)
      parameters[parameter] = true if scalar?(parameter)
      validate_svg_binding(errors, binding, expected_system, coverage, "#{prefix} binding #{index + 1}")
    end
    validate_svg_visible_when(errors, layer["visible_when"], expected_system, coverage, "#{prefix} visible_when") if layer.key?("visible_when")
  end

  def validate_svg_geometry(errors, geometry, prefix)
    unless geometry.is_a?(Hash) && SVG_GEOMETRIES.include?(geometry["kind"])
      errors << "#{prefix}: kind must be one of #{SVG_GEOMETRIES.join(', ')}"
      return
    end
    case geometry["kind"]
    when "ellipse"
      errors << "#{prefix}: ellipse fields must be exact" unless geometry.keys.sort == %w[cx cy kind rx ry]
      cx, cy, rx, ry = %w[cx cy rx ry].map { |key| geometry[key] }
      errors << "#{prefix}: ellipse must be finite, non-zero, and bounded" unless finite?(cx) && finite?(cy) && finite?(rx) && finite?(ry) && rx.positive? && ry.positive? && cx - rx >= 0 && cx + rx <= 1536 && cy - ry >= 0 && cy + ry <= 1024
    when "circle"
      errors << "#{prefix}: circle fields must be exact" unless geometry.keys.sort == %w[cx cy kind r]
      cx, cy, radius = %w[cx cy r].map { |key| geometry[key] }
      errors << "#{prefix}: circle must be finite, non-zero, and bounded" unless finite?(cx) && finite?(cy) && finite?(radius) && radius.positive? && cx - radius >= 0 && cx + radius <= 1536 && cy - radius >= 0 && cy + radius <= 1024
    when "rect"
      errors << "#{prefix}: rect fields must be exact" unless geometry.keys.sort == %w[height kind width x y]
      x, y, width, height = %w[x y width height].map { |key| geometry[key] }
      errors << "#{prefix}: rect must be finite, non-zero, and bounded" unless finite?(x) && finite?(y) && finite?(width) && finite?(height) && width.positive? && height.positive? && x >= 0 && y >= 0 && x + width <= 1536 && y + height <= 1024
    when "line"
      errors << "#{prefix}: line fields must be exact" unless geometry.keys.sort == %w[kind x1 x2 y1 y2]
      x1, y1, x2, y2 = %w[x1 y1 x2 y2].map { |key| geometry[key] }
      errors << "#{prefix}: line must be finite, non-zero, and bounded" unless [x1, y1, x2, y2].all? { |value| finite?(value) } && x1.between?(0, 1536) && x2.between?(0, 1536) && y1.between?(0, 1024) && y2.between?(0, 1024) && (x1 != x2 || y1 != y2)
    when "path", "polygon"
      errors << "#{prefix}: #{geometry['kind']} fields must be exact" unless geometry.keys.sort == %w[kind points]
      points = geometry["points"]
      minimum = geometry["kind"] == "polygon" ? 3 : 2
      unless points.is_a?(Array) && points.length >= minimum && points.all? { |point| point.is_a?(Array) && point.length == 2 && point.all? { |value| finite?(value) } && point[0].between?(0, 1536) && point[1].between?(0, 1024) }
        errors << "#{prefix}: #{geometry['kind']} points must be finite and bounded"
        return
      end
      if geometry["kind"] == "path"
        errors << "#{prefix}: path must have non-zero length" unless points.each_cons(2).any? { |left, right| left != right }
      else
        twice_area = points.each_with_index.sum { |point, index| next_point = points[(index + 1) % points.length]; point[0] * next_point[1] - next_point[0] * point[1] }
        errors << "#{prefix}: polygon must have non-zero area" if twice_area.zero?
      end
    end
  end

  def validate_svg_binding(errors, binding, expected_system, coverage, prefix)
    unless binding.is_a?(Hash) && scalar?(binding["control_id"]) && scalar?(binding["parameter"])
      errors << "#{prefix}: must identify a canonical control and parameter"
      return
    end
    errors << "#{prefix}: parameter must be a safe SVG CSS variable name" unless binding["parameter"].match?(SVG_PARAMETER)
    control_id = binding["control_id"]
    expected = expected_system.fetch("controls")[control_id]
    unless expected
      errors << "#{prefix}: control_id must be canonical for #{expected_system.fetch('id')}"
      return
    end
    case binding["type"]
    when "range"
      errors << "#{prefix}: range fields must be exact" unless binding.keys.sort == %w[control_id input output parameter type]
      errors << "#{prefix}: range control must match its public type" unless expected["type"] == "range"
      input, output = binding["input"], binding["output"]
      errors << "#{prefix}: range input must match public bounds" unless input == expected.slice("min", "max")
      errors << "#{prefix}: range output must have distinct finite bounds" unless input.is_a?(Hash) && output.is_a?(Hash) && input.keys.sort == %w[max min] && output.keys.sort == %w[max min] && output.values.all? { |value| finite?(value) } && output["min"] != output["max"]
      coverage[control_id]["range"] << input if expected["type"] == "range" && input == expected.slice("min", "max")
    when "segment"
      errors << "#{prefix}: segment fields must be exact" unless binding.keys.sort == %w[control_id output parameter type]
      errors << "#{prefix}: segment control must match its public type" unless expected["type"] == "segment"
      output = binding["output"]
      errors << "#{prefix}: segment output values must be canonical, finite, and visibly distinct" unless output.is_a?(Hash) && output.keys.sort == expected.fetch("values").sort && output.values.all? { |value| finite?(value) } && output.values.uniq.length > 1
      coverage[control_id]["segment"].concat(output.keys) if expected["type"] == "segment" && output.is_a?(Hash)
    when "toggle"
      errors << "#{prefix}: toggle fields must be exact" unless binding.keys.sort == %w[control_id output parameter type]
      errors << "#{prefix}: toggle control must match its public type" unless expected["type"] == "toggle"
      output = binding["output"]
      errors << "#{prefix}: toggle output must be exact, finite, and visibly distinct for false and true" unless output.is_a?(Hash) && output.keys.sort == %w[false true] && output.values.all? { |value| finite?(value) } && output["false"] != output["true"]
      coverage[control_id]["toggle"] << true if expected["type"] == "toggle" && output.is_a?(Hash) && output.keys.sort == %w[false true]
    else
      errors << "#{prefix}: type must be range, segment, or toggle"
    end
  end

  def validate_svg_visible_when(errors, visible_when, expected_system, coverage, prefix)
    unless visible_when.is_a?(Hash) && visible_when.keys.sort == %w[control_id equals] && scalar?(visible_when["control_id"]) && scalar?(visible_when["equals"])
      errors << "#{prefix}: must identify one segment control value"
      return
    end
    expected = expected_system.fetch("controls")[visible_when["control_id"]]
    unless expected && expected["type"] == "segment" && expected.fetch("values").include?(visible_when["equals"])
      errors << "#{prefix}: must reference one known segment value"
      return
    end
    coverage[visible_when["control_id"]]["segment"] << visible_when["equals"]
  end

  def validate_svg_coverage(errors, coverage, expected_system, prefix)
    expected_controls = expected_system.fetch("controls")
    errors << "#{prefix}: bindings must cover every canonical control" unless coverage.keys.sort == expected_controls.keys.sort
    expected_controls.each do |control_id, expected|
      actual = coverage[control_id]
      if expected["type"] == "range"
        errors << "#{prefix}: #{control_id} must bind the exact public range" unless actual["range"].any?
      elsif expected["type"] == "toggle"
        errors << "#{prefix}: #{control_id} must bind native false and true" unless actual["toggle"].any?
      else
        errors << "#{prefix}: #{control_id} must cover every public segment value" unless actual["segment"].uniq.sort == expected.fetch("values").sort
      end
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

  def finite?(value)
    value.is_a?(Numeric) && value.finite?
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
