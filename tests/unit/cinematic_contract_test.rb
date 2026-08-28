# frozen_string_literal: true

require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"
require "fileutils"

class CinematicContractTest < Minitest::Test
  def project_root
    File.expand_path("../..", __dir__)
  end

  def validate(path = File.join(project_root, "_data/cinematic_system.yml"), repository_root = project_root)
    Open3.capture3(
      "bundle", "exec", "ruby", "scripts/validate_cinematic_system.rb", path, repository_root,
      chdir: project_root
    )
  end

  def canonical_graph
    YAML.safe_load(
      File.read(File.join(project_root, "_data/cinematic_system.yml")),
      permitted_classes: [],
      aliases: false
    )
  end

  def with_graph(graph)
    Dir.mktmpdir("smart-electrics-cinematic") do |directory|
      path = File.join(directory, "cinematic_system.yml")
      File.write(path, YAML.dump(graph))
      yield path
    end
  end

  def with_raw_graph(contents)
    Dir.mktmpdir("smart-electrics-cinematic") do |directory|
      path = File.join(directory, "cinematic_system.yml")
      File.write(path, contents)
      yield path
    end
  end

  def with_repository_missing_scene_asset(family, width)
    Dir.mktmpdir("smart-electrics-cinematic-repository") do |directory|
      FileUtils.cp_r(File.join(project_root, "_services"), directory)
      assets_directory = File.join(directory, "assets", "images", "smart-home")
      FileUtils.mkdir_p(assets_directory)
      omitted = "#{family}-#{width}.webp"
      Dir.glob(File.join(project_root, "assets", "images", "smart-home", "*.webp")).each do |source|
        next if File.basename(source) == omitted

        FileUtils.cp(source, assets_directory)
      end
      yield directory
    end
  end

  def assert_rejected(graph, expected_error)
    with_graph(graph) do |path|
      _stdout, stderr, status = validate(path)

      refute_predicate status, :success?
      assert_includes stderr, expected_error
    end
  end

  def test_accepts_the_canonical_cinematic_graph
    _stdout, stderr, status = validate

    assert_predicate status, :success?, stderr
  end

  def test_rejects_a_direction_that_is_not_a_current_service_slug
    graph = canonical_graph
    graph.fetch("directions").first["service_slug"] = "invented-service"

    assert_rejected(graph, "directions must contain exactly the current service slugs in canonical order")
  end

  def test_rejects_a_direction_sequence_that_breaks_the_service_collection_order
    graph = canonical_graph
    graph.fetch("directions").first(2).reverse!.each_with_index do |direction, index|
      graph.fetch("directions")[index] = direction
    end

    assert_rejected(graph, "directions must contain exactly the current service slugs in canonical order")
  end

  def test_rejects_direction_fields_outside_the_canonical_contract
    graph = canonical_graph
    graph.fetch("directions").first["extra"] = "not part of the graph contract"

    assert_rejected(graph, "direction 1: fields must be exactly id, focus_scene_family, service_slug, label, description")
  end

  def test_rejects_top_level_fields_outside_the_canonical_graph_contract
    graph = canonical_graph
    graph["service_studio_relation_idz"] = graph.fetch("service_studio_relation_ids").transform_values(&:dup)

    assert_rejected(graph, "cinematic_system.yml: fields must be exactly directions, relations, service_studio_relation_ids")
  end

  def test_rejects_duplicate_or_blank_direction_ids
    graph = canonical_graph
    graph.fetch("directions")[1]["id"] = graph.fetch("directions").first.fetch("id")
    assert_rejected(graph, "directions must not contain duplicate IDs")

    graph = canonical_graph
    graph.fetch("directions").first["id"] = " "
    assert_rejected(graph, "direction 1: id must be a non-empty scalar")
  end

  def test_rejects_missing_unknown_or_duplicate_focus_scene_mappings
    graph = canonical_graph
    graph.fetch("directions").first.delete("focus_scene_family")
    assert_rejected(graph, "direction 1: focus_scene_family must be a non-empty scalar")

    graph = canonical_graph
    graph.fetch("directions").first["focus_scene_family"] = "unknown"
    assert_rejected(graph, "direction 1: focus_scene_family must belong to the declared family set")

    graph = canonical_graph
    graph.fetch("directions").find { |direction| direction.fetch("id") == "electrical-installation" }["focus_scene_family"] = "panel"
    assert_rejected(graph, "focus scene mappings must keep electrical-installation distinct from panels-and-protection")
  end

  def test_rejects_a_missing_responsive_focus_scene_asset
    graph = canonical_graph
    with_graph(graph) do |path|
      with_repository_missing_scene_asset("electrical-installation-finish", 768) do |repository_root|
        _stdout, stderr, status = validate(path, repository_root)

        refute_predicate status, :success?
        assert_includes stderr, "scene family electrical-installation-finish: missing 768px asset"
      end
    end
  end

  def test_rejects_relation_ids_that_do_not_match_their_owner_and_child
    graph = canonical_graph
    graph.fetch("relations").first["id"] = "lighting--panel-assembly"

    assert_rejected(graph, "relation 1: id must equal direction_id--child.id")
  end

  def test_rejects_duplicate_relation_ids_and_children
    graph = canonical_graph
    graph.fetch("relations")[1]["id"] = graph.fetch("relations").first.fetch("id")
    assert_rejected(graph, "relations must not contain duplicate IDs")

    graph = canonical_graph
    graph.fetch("relations")[1].fetch("child")["id"] = graph.fetch("relations").first.dig("child", "id")
    graph.fetch("relations")[1]["id"] = "lighting--panel-assembly"
    assert_rejected(graph, "relations must not contain duplicate child IDs")
  end

  def test_rejects_unknown_relation_references
    graph = canonical_graph
    graph.fetch("relations").first["direction_id"] = "unknown"
    assert_rejected(graph, "relation 1: direction_id must reference a graph direction")

    graph = canonical_graph
    graph.fetch("relations").first["related_direction_ids"] = ["unknown"]
    assert_rejected(graph, "relation 1: related_direction_ids must reference graph directions")
  end

  def test_rejects_a_missing_or_unexpected_selectable_child
    graph = canonical_graph
    graph.fetch("relations").first.fetch("child")["id"] = "unexpected"
    graph.fetch("relations").first["id"] = "panels-and-protection--unexpected"

    assert_rejected(graph, "relations must contain exactly the required selectable child IDs")
  end

  def test_rejects_an_absent_or_wrong_scene_family
    graph = canonical_graph
    graph.fetch("relations").first.delete("scene_family")
    assert_rejected(graph, "relation 1: scene_family must be a non-empty scalar")

    graph = canonical_graph
    graph.fetch("relations").first["scene_family"] = "exterior"
    assert_rejected(graph, "relation 1: scene_family must match the canonical child mapping")
  end

  def test_rejects_invalid_yaml
    with_raw_graph("directions: [unterminated") do |path|
      _stdout, stderr, status = validate(path)

      refute_predicate status, :success?
      assert_includes stderr, "cinematic_system.yml: must contain valid YAML"
    end
  end

  def test_requires_exact_service_studio_relation_mapping_shape
    graph = canonical_graph
    graph.delete("service_studio_relation_ids")
    assert_rejected(graph, "service_studio_relation_ids must be a mapping")

    graph = canonical_graph
    graph.fetch("service_studio_relation_ids").delete("backup-power")
    assert_rejected(graph, "service_studio_relation_ids must contain exactly the graph direction IDs in canonical order")

    graph = canonical_graph
    graph.fetch("service_studio_relation_ids")["backup-power"] = []
    assert_rejected(graph, "service_studio_relation_ids.backup-power must be a non-empty list of relation IDs")

    graph = canonical_graph
    graph.fetch("service_studio_relation_ids")["lighting"] = ["lighting--stair-lighting", "lighting--stair-lighting"]
    assert_rejected(graph, "service_studio_relation_ids.lighting must not contain duplicate relation IDs")

    graph = canonical_graph
    graph.fetch("service_studio_relation_ids")["diagnostics-and-service"] = ["invented-relation"]
    assert_rejected(graph, "service_studio_relation_ids.diagnostics-and-service must reference graph relation IDs")
  end

  def test_requires_service_studio_mappings_to_follow_owned_graph_relations_in_graph_order
    graph = canonical_graph
    graph.fetch("service_studio_relation_ids")["backup-power"] = ["diagnostics-and-service--diagnostics"]
    assert_rejected(graph, "service_studio_relation_ids.backup-power must equal the canonical owned relation IDs")

    graph = canonical_graph
    graph.fetch("service_studio_relation_ids")["lighting"].reverse!
    assert_rejected(graph, "service_studio_relation_ids.lighting must equal the canonical owned relation IDs")

    graph = canonical_graph
    graph.fetch("relations").reject! { |relation| relation["direction_id"] == "backup-power" }
    graph.fetch("service_studio_relation_ids")["backup-power"] = ["panels-and-protection--panel-assembly"]
    assert_rejected(graph, "service_studio_relation_ids.backup-power may use the panel-assembly fallback only for electrical-design, electrical-installation")

    graph = canonical_graph
    graph.fetch("relations").first.fetch("child")["id"] = "missing-panel-assembly"
    assert_rejected(graph, "service_studio_relation_ids: panel-assembly fallback must resolve to exactly one relation")

    graph = canonical_graph
    graph.fetch("relations")[1].fetch("child")["id"] = "panel-assembly"
    assert_rejected(graph, "service_studio_relation_ids: panel-assembly fallback must resolve to exactly one relation")
  end

  def test_keeps_relationship_connectors_on_cinematic_compositions_but_not_service_studios
    templates = {
      "_includes/cinematic-stage.html" => "data-cinematic-relationship-connector",
      "_includes/cinematic-solutions.html" => "data-cinematic-solutions-relationship-connector"
    }
    templates.each do |path, connector|
      source = File.read(File.join(project_root, path))
      assert_includes source, connector, "#{path} must expose an aria-hidden SVG relationship connector"
      assert_includes source, "pathLength=\"1\"", "#{path} connector must be drawable"
    end

    service_studio = File.read(File.join(project_root, "_includes/service-studio.html"))
    refute_includes service_studio, "data-service-studio-relationship-connector", "service studios must not render a decorative relationship line"

    %w[cinematic-stage service-studio cinematic-solutions route-journey].each do |adapter|
      source = File.read(File.join(project_root, "assets/js/#{adapter}.js"))
      assert_includes source, "createCinematicMotion", "#{adapter} must run the shared bounded motion lifecycle"
    end

    styles = File.read(File.join(project_root, "_sass/_cinematic-solutions.scss"))
    assert_match(/@media \(max-width: 47\.999rem\)[\s\S]*?\.cinematic-solutions__selector\s*\{[\s\S]*?display:\s*grid;/, styles)
    assert_match(/@media \(max-width: 47\.999rem\)[\s\S]*?\.cinematic-solutions__selector\s*\{[\s\S]*?overflow:\s*visible;/, styles)
  end

  def test_residence_physical_picture_exposes_one_preload_safe_responsive_candidate_list
    template = File.read(File.join(project_root, "_includes", "cinematic-stage.html"))
    physical_layer = template[/<div class="residence-spine__physical-layer"[^>]*data-cinematic-physical-layer[^>]*>/]

    refute_nil physical_layer
    assert_match(/\baria-hidden="true"/, physical_layer, "the physical pixel overlay must remain decorative while the causal image carries its synchronized alt")
    refute_includes template, '<source data-cinematic-physical-source'
    refute_includes template, '<source media="(max-width: 767px)" srcset="{{ \'/assets/images/smart-home/\' | append: relation.scene_family | append: \'-768.webp\' | relative_url }}"'
    assert_includes template, '<img data-cinematic-physical-image src="{{ initial_physical_scene.src_768 | relative_url }}" srcset="{{ initial_physical_scene.src_768 | relative_url }} 768w, {{ initial_physical_scene.src_1536 | relative_url }} 1536w"'
    assert_includes template, 'sizes="(max-width: 767px) 100vw, 52vw"'
  end

  def test_physical_scene_adapter_updates_one_responsive_candidate_list
    adapter = File.read(File.join(project_root, "assets", "js", "physical-scene-controls.js"))

    refute_includes adapter, 'source[data-cinematic-physical-source]'
    refute_includes adapter, 'source[data-smart-home-physical-source]'
    refute_includes adapter, 'causalSource.srcset = scene.src768'
    refute_includes adapter, 'source.srcset = scene.src768'
    assert_includes adapter, 'return `${scene.src768} 768w, ${scene.src1536} 1536w`'
  end

  def test_keeps_panel_and_type_choreography_masked_without_opacity_or_filter_keyframes
    keyframes = {
      "_sass/_cinematic.scss" => %w[residence-spine-panel-exit residence-spine-panel-reveal residence-spine-type-reveal],
      "_sass/_service-studio.scss" => %w[service-studio-panel-exit service-studio-panel-reveal service-studio-type-reveal],
      "_sass/_cinematic-solutions.scss" => %w[cinematic-solutions-panel-exit cinematic-solutions-panel-reveal cinematic-solutions-type-reveal],
      "_sass/_route-journey.scss" => %w[route-journey-panel-exit route-journey-panel-reveal route-journey-type-reveal]
    }
    keyframes.each do |path, names|
      source = File.read(File.join(project_root, path))
      names.each do |name|
        keyframe = source[/@keyframes #{Regexp.escape(name)}\s*\{[\s\S]*?\n\}/]
        refute_nil keyframe, "#{path} must retain #{name}"
        refute_match(/(?:opacity|filter)\s*:/, keyframe, "#{name} must use masked clip-path/transform choreography only")
      end
    end
  end

  def test_requires_a_reusable_data_driven_decorative_inline_svg_physical_scene_overlay
    overlay_path = File.join(project_root, "_includes", "physical-scene-svg-overlay.html")
    assert File.file?(overlay_path), "the reusable physical-scene SVG overlay include must exist"
    return unless File.file?(overlay_path)

    overlay = File.read(overlay_path)
    cinematic_stage = File.read(File.join(project_root, "_includes", "cinematic-stage.html"))
    smart_home = File.read(File.join(project_root, "_layouts", "smart-home.html"))

    assert_equal 1, overlay.scan(/<svg\b/).size, "the overlay include must expose one inline SVG root"
    svg_root = overlay[/<svg\b[^>]*>/]
    refute_nil svg_root
    assert_match(/\baria-hidden="true"/, svg_root)
    assert_match(/\bfocusable="false"/, svg_root)
    %w[data-physical-scene-svg-overlay data-physical-scene-svg-system data-physical-scene-svg-layer data-physical-scene-svg-shape].each do |hook|
      assert_includes overlay, hook, "the reusable SVG needs a stable #{hook} hook"
    end
    assert_includes overlay, "site.data.physical_scene_states.svg"
    assert_includes overlay, "{% for layer in"
    assert_includes overlay, "data-physical-scene-svg-profile"
    assert_includes overlay, "| jsonify"
    %w[linearGradient pattern filter clipPath].each do |definition|
      assert_match(/<#{definition}\b[^>]*\bid="[^\"]*(?:include\.instance_id|overlay_instance)[^\"]*"/, overlay, "#{definition} IDs must be scoped to the overlay instance")
    end
    refute_match(/\b(?:if|case)\s+include\.system/, overlay, "the overlay must render generic data instead of hard-coded system branches")

    assert_includes cinematic_stage, "{% include physical-scene-svg-overlay.html", "the cinematic residence stage must mount the reusable overlay"
    assert_includes smart_home, "{% include physical-scene-svg-overlay.html", "the smart-home layout must mount the reusable overlay"
    assert_operator smart_home.scan("{% include physical-scene-svg-overlay.html").size, :>=, 2, "the phone-controlled scene and the shared stairs/exterior stage each need an overlay"
    assert_includes smart_home, "data-scenario-scene"
    assert_includes smart_home, "data-smart-home-physical-stage"
  end
end
