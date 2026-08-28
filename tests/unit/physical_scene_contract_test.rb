# frozen_string_literal: true

require "minitest/autorun"
require "fileutils"
require "open3"
require "tmpdir"
require "yaml"

class PhysicalSceneContractTest < Minitest::Test
  def project_root
    File.expand_path("../..", __dir__)
  end

  def validate(path = File.join(project_root, "_data/physical_scene_states.yml"), repository_root = project_root)
    Open3.capture3("bundle", "exec", "ruby", "scripts/validate_physical_scene_states.rb", path, repository_root, chdir: project_root)
  end

  def canonical_data
    YAML.safe_load(File.read(File.join(project_root, "_data/physical_scene_states.yml")), permitted_classes: [], aliases: false)
  end

  def assert_rejected(data, expected_error)
    Dir.mktmpdir("smart-electrics-physical-scene") do |directory|
      path = File.join(directory, "physical_scene_states.yml")
      File.write(path, YAML.dump(data))
      _stdout, stderr, status = validate(path)
      refute_predicate status, :success?
      assert_includes stderr, expected_error
    end
  end

  def systems(data)
    data.fetch("systems")
  end

  def room(data)
    systems(data).fetch(0)
  end

  def stairs(data)
    systems(data).fetch(1)
  end

  def test_accepts_room_stair_and_exterior_canonical_media_mappings
    _stdout, stderr, status = validate
    assert_predicate status, :success?, stderr
  end

  def test_rejects_an_absent_cross_axis_mapping
    data = canonical_data
    room(data).fetch("scenes").pop
    assert_rejected(data, "system 1: scenes must contain exactly one mapping for every control combination")

    data = canonical_data
    stairs(data).fetch("scenes").pop
    assert_rejected(data, "system 2: scenes must contain exactly one mapping for every control combination")
  end

  def test_rejects_an_untruthful_media_filename_or_missing_alt
    data = canonical_data
    stairs(data).fetch("scenes").first["src_1536"] = "/assets/images/cinematic/residence/stairs-wrong-1536.webp"
    assert_rejected(data, "system 2 scene 1: src_1536 must match its physical state")

    data = canonical_data
    systems(data).fetch(2).fetch("scenes").first["alt"] = " "
    assert_rejected(data, "system 3 scene 1: alt must be a non-empty scalar or mapping")
  end

  def test_rejects_a_missing_or_empty_mapped_production_file
    data = canonical_data
    Dir.mktmpdir("smart-electrics-physical-media") do |repository_root|
      systems(data).each do |system|
        system.fetch("scenes").each do |scene|
          %w[src_768 src_1536].each do |field|
            path = File.join(repository_root, scene.fetch(field).sub(%r{\A/}, ""))
            FileUtils.mkdir_p(File.dirname(path))
            File.write(path, "fixture")
          end
        end
      end
      data_path = File.join(repository_root, "physical_scene_states.yml")
      File.write(data_path, YAML.dump(data))
      _stdout, stderr, status = validate(data_path, repository_root)
      assert_predicate status, :success?, stderr

      missing = File.join(repository_root, stairs(data).fetch("scenes").first.fetch("src_768").sub(%r{\A/}, ""))
      File.delete(missing)
      _stdout, stderr, status = validate(data_path, repository_root)
      refute_predicate status, :success?
      assert_includes stderr, "system 2 scene 1: mapped production file must exist and be non-empty"

      File.write(missing, "")
      _stdout, stderr, status = validate(data_path, repository_root)
      refute_predicate status, :success?
      assert_includes stderr, "system 2 scene 1: mapped production file must exist and be non-empty"
    end
  end

  def test_rejects_an_svg_layer_without_a_contextual_effect
    data = canonical_data
    data.fetch("svg").fetch("systems").first.fetch("layers").first.delete("effect")
    assert_rejected(data, "svg system 1 layer 1: effect must be one canonical production effect")

    data = canonical_data
    data.fetch("svg").fetch("systems").first.fetch("layers").first.fetch("binding")["parameter"] = "background-image"
    assert_rejected(data, "parameter must be a safe SVG CSS variable name")

    data = canonical_data
    output = data.fetch("svg").fetch("systems").first.fetch("layers").first.fetch("binding").fetch("output")
    output.keys.each { |key| output[key] = 0 }
    assert_rejected(data, "segment output values must be canonical, finite, and visibly distinct")
  end

  def test_requires_one_canonical_svg_model_for_every_public_physical_control
    data = canonical_data
    smart_home = YAML.safe_load(
      File.read(File.join(project_root, "_data/smart_home.yml")),
      permitted_classes: [],
      aliases: false
    )
    raster_systems = systems(data)
    assert_equal %w[room stairs exterior], raster_systems.map { |system| system.fetch("id") },
                 "the existing raster systems remain the canonical WebP source association"
    raster_controls = raster_systems.to_h do |system|
      controls = system.fetch("controls").map do |control|
        [control.fetch("id"), { "type" => "segment", "values" => control.fetch("choices").map { |choice| choice.fetch("id") } }]
      end
      initial = system.fetch("scenes").find { |scene| scene.fetch("state") == system.fetch("initial_state") }
      assert initial, "#{system.fetch('id')}: raster scenes must retain the initial WebP source"
      [system.fetch("id"), { "controls" => controls.to_h, "asset" => initial.slice("src_768", "src_1536") }]
    end
    smart_home_visuals = smart_home.fetch("spatial").fetch("visuals").to_h do |visual|
      [visual.fetch("id"), { "src_768" => visual.fetch("mobile"), "src_1536" => visual.fetch("desktop") }]
    end
    smart_home_controls = smart_home.fetch("spatial").fetch("systems").to_h do |system|
      controls = system.fetch("controls").map do |control|
        definition = case control.fetch("type")
                     when "range"
                       { "type" => "range", "min" => control.fetch("min"), "max" => control.fetch("max"), "step" => control.fetch("step") }
                     when "segment"
                       { "type" => "segment", "values" => control.fetch("options").map { |option| option.fetch("id") } }
                     when "toggle"
                       { "type" => "toggle", "values" => %w[false true] }
                     else
                       flunk("#{system.fetch('id')}: unknown public control type #{control.fetch('type')}")
                     end
        [control.fetch("id"), definition]
      end
      [system.fetch("id"), { "controls" => controls.to_h, "asset" => smart_home_visuals.fetch(system.fetch("visual")) }]
    end
    expected_systems = raster_controls.merge(smart_home_controls)
    expected_ids = %w[room stairs exterior lighting climate access security panel low-voltage backup-power audio shading]

    expected_systems.each do |id, contract|
      assert_equal %w[src_1536 src_768], contract.fetch("asset").keys.sort, "#{id}: responsive WebP association is derived from the existing raster source"
      assert_match(%r{\A/assets/images/.+-768\.webp\z}, contract.fetch("asset").fetch("src_768"), "#{id}: compact WebP association")
      assert_match(%r{\A/assets/images/.+-1536\.webp\z}, contract.fetch("asset").fetch("src_1536"), "#{id}: desktop WebP association")
    end

    assert data.key?("svg"), "physical_scene_states.yml must add a top-level svg profile without replacing its raster systems"
    svg = data.fetch("svg")
    assert_equal %w[systems view_box], svg.keys.sort, "SVG profile must contain only its view_box and systems"
    assert_equal({ "width" => 1536, "height" => 1024 }, svg.fetch("view_box"), "SVG viewBox must align to the shared 1536×1024 WebP family")
    svg_systems = svg.fetch("systems")
    assert_equal expected_ids, svg_systems.map { |system| system.fetch("id") }, "SVG profile must cover room, stairs, exterior, and all nine smart-home systems exactly once"

    all_layer_ids = []
    svg_systems.each do |svg_system|
      id = svg_system.fetch("id")
      assert_equal %w[id layers], svg_system.keys.sort, "#{id}: SVG system schema"
      layers = svg_system.fetch("layers")
      refute_empty layers, "#{id}: SVG system needs visible layers"
      actual_controls = Hash.new { |hash, key| hash[key] = { "range" => [], "segment" => [], "toggle" => [] } }

      layers.each do |layer|
        allowed = %w[binding bindings effect geometry id visible_when]
        assert (layer.keys - allowed).empty?, "#{id}: #{layer.fetch('id')} has unsupported SVG layer fields"
        assert_includes %w[glow zone tulle blind curtain roller route node thermal topology coverage audio climate-comfort-field climate-heating-floor climate-cooling-air security-camera-body security-camera-view equipment-panel equipment-low-voltage equipment-backup audio-source audio-zone-field audio-speaker], layer.fetch("effect"), "#{id}: #{layer.fetch('id')} needs one contextual visual effect"
        assert_equal 1, [layer.key?("binding"), layer.key?("bindings")].count(true), "#{id}: #{layer.fetch('id')} needs exactly one binding or bindings"
        bindings = layer.key?("binding") ? [layer.fetch("binding")] : layer.fetch("bindings")
        refute_empty bindings, "#{id}: #{layer.fetch('id')} bindings cannot be empty"
        all_layer_ids << layer.fetch("id")

        geometry = layer.fetch("geometry")
        kind = geometry.fetch("kind")
        points = case kind
                 when "ellipse"
                   cx, cy, rx, ry = %w[cx cy rx ry].map { |key| geometry.fetch(key) }
                   assert_operator rx, :>, 0
                   assert_operator ry, :>, 0
                   [[cx - rx, cy - ry], [cx + rx, cy + ry]]
                 when "circle"
                   cx, cy, radius = %w[cx cy r].map { |key| geometry.fetch(key) }
                   assert_operator radius, :>, 0
                   [[cx - radius, cy - radius], [cx + radius, cy + radius]]
                 when "rect"
                   x, y, width, height = %w[x y width height].map { |key| geometry.fetch(key) }
                   assert_operator width, :>, 0
                   assert_operator height, :>, 0
                   [[x, y], [x + width, y + height]]
                 when "line"
                   [[geometry.fetch("x1"), geometry.fetch("y1")], [geometry.fetch("x2"), geometry.fetch("y2")]]
                 when "path", "polygon"
                   geometry.fetch("points")
                 else
                   flunk("#{id}: #{layer.fetch('id')} uses unsupported geometry #{kind}")
                 end
        assert points.length >= (kind == "polygon" ? 3 : 2), "#{id}: #{layer.fetch('id')} geometry needs visible extent"
        assert points.flatten.all? { |value| value.is_a?(Numeric) && value.finite? }, "#{id}: #{layer.fetch('id')} geometry must be finite"
        assert points.all? { |x, y| x.between?(0, 1536) && y.between?(0, 1024) }, "#{id}: #{layer.fetch('id')} geometry must stay inside the viewBox"

        bindings.each do |binding|
          control_id = binding.fetch("control_id")
          if binding.fetch("type") == "range"
            assert_equal %w[control_id input output parameter type], binding.keys.sort, "#{id}: #{control_id} range binding schema"
            actual_controls[control_id]["range"] << binding.fetch("input")
          elsif binding.fetch("type") == "segment"
            assert_equal "segment", binding.fetch("type"), "#{id}: #{control_id} binding type"
            assert_equal %w[control_id output parameter type], binding.keys.sort, "#{id}: #{control_id} segment binding schema"
            actual_controls[control_id]["segment"].concat(binding.fetch("output").keys)
          else
            assert_equal "toggle", binding.fetch("type"), "#{id}: #{control_id} binding type"
            assert_equal %w[control_id output parameter type], binding.keys.sort, "#{id}: #{control_id} toggle binding schema"
            assert_equal %w[false true], binding.fetch("output").keys.sort, "#{id}: #{control_id} toggle must bind both native boolean values"
            actual_controls[control_id]["toggle"].concat(binding.fetch("output").keys)
          end
        end
        if layer.key?("visible_when")
          visible_when = layer.fetch("visible_when")
          assert_equal %w[control_id equals], visible_when.keys.sort, "#{id}: #{layer.fetch('id')} visibility schema"
          actual_controls[visible_when.fetch("control_id")]["segment"] << visible_when.fetch("equals")
        end
      end

      expected_controls = expected_systems.fetch(id).fetch("controls")
      assert_equal expected_controls.keys.sort, actual_controls.keys.sort, "#{id}: every public control must be bound by an SVG layer"
      expected_controls.each do |control_id, expected|
        actual = actual_controls.fetch(control_id)
        if expected.fetch("type") == "range"
          assert actual.fetch("range").all? { |input| input == expected.slice("min", "max") }, "#{id}: #{control_id} range must preserve public bounds"
          refute_empty actual.fetch("range"), "#{id}: #{control_id} range needs a geometry binding"
        elsif expected.fetch("type") == "toggle"
          assert_equal expected.fetch("values").sort, actual.fetch("toggle").uniq.sort, "#{id}: #{control_id} must bind both public boolean values exactly"
        else
          assert_equal expected.fetch("values").sort, actual.fetch("segment").uniq.sort, "#{id}: #{control_id} must bind every public value exactly"
        end
      end
    end
    assert_equal all_layer_ids.uniq, all_layer_ids, "SVG layer IDs must be unique across the shared profile"
    blind_layers = svg_systems.flat_map { |system| system.fetch("layers") }.select { |layer| layer.fetch("effect") == "blind" }
    assert blind_layers.all? { |layer| layer.fetch("geometry").fetch("kind") == "rect" }, "blind systems must use a window-area pattern, not a single decorative line"

    by_system = svg_systems.to_h { |system| [system.fetch("id"), system.fetch("layers")] }
    %w[panel low-voltage backup-power climate].each do |id|
      layers = by_system.fetch(id)
      refute layers.any? { |layer| %w[line path circle].include?(layer.fetch("geometry").fetch("kind")) }, "#{id}: physical scene must not regress to abstract wires, paths, or circles"
    end
    %w[panel low-voltage backup-power].each do |id|
      refute by_system.fetch(id).any? { |layer| layer.fetch("id").match?(/(?:topology|node)/) }, "#{id}: equipment layers must not use topology/node HUD vocabulary"
    end

    climate_ids = by_system.fetch("climate").map { |layer| layer.fetch("id") }
    assert_includes climate_ids, "climate-heating-floor-field"
    assert_includes climate_ids, "climate-cooling-air-field"
    security_ids = by_system.fetch("security").map { |layer| layer.fetch("id") }
    assert_includes security_ids, "security-camera-body"
    assert_includes security_ids, "security-camera-view"
    security_kinds = by_system.fetch("security").map { |layer| layer.fetch("geometry").fetch("kind") }
    assert_includes security_kinds, "rect"
    assert_includes security_kinds, "polygon"
    refute_includes security_kinds, "ellipse", "security must not fall back to an ellipse-only HUD"
    audio_ids = by_system.fetch("audio").map { |layer| layer.fetch("id") }
    assert_includes audio_ids, "audio-source-field"
    assert_includes audio_ids, "audio-zone-field"
    assert_operator audio_ids.count { |layer_id| layer_id.start_with?("audio-speaker-") }, :>=, 2
    audio_layers = by_system.fetch("audio")
    audio_kinds = audio_layers.map { |layer| layer.fetch("geometry").fetch("kind") }
    assert_includes audio_kinds, "rect"
    assert_includes audio_kinds, "polygon"
    assert audio_layers.select { |layer| layer.fetch("geometry").fetch("kind") == "ellipse" }
      .all? { |layer| layer.fetch("id").start_with?("audio-speaker-") }, "audio ellipses must be exact physical speaker points"

    shading = by_system.fetch("shading")
    shading_ids = shading.map { |layer| layer.fetch("id") }
    %w[shading-tulle-left shading-tulle-right shading-blind-slats].each { |id| assert_includes shading_ids, id }
    tulle = shading.select { |layer| layer.fetch("id").start_with?("shading-tulle-") }
    assert_equal 2, tulle.length, "tulle must be a pair of laterally moving panels"
    tulle.each do |layer|
      bindings = layer.key?("bindings") ? layer.fetch("bindings") : [layer.fetch("binding")]
      assert_includes bindings.map { |binding| binding.fetch("parameter") }, "translate_x", "#{layer.fetch('id')}: tulle must bind translation rather than only opacity"
    end
    blind = shading.find { |layer| layer.fetch("id") == "shading-blind-slats" }
    assert_equal %w[blind_lift slat_angle], blind.fetch("bindings").map { |binding| binding.fetch("control_id") }.sort, "blinds need independent lift and slat-angle controls"
  end
end
