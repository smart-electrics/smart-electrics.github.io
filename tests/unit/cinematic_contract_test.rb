# frozen_string_literal: true

require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"

class CinematicContractTest < Minitest::Test
  def project_root
    File.expand_path("../..", __dir__)
  end

  def validate(path = File.join(project_root, "_data/cinematic_system.yml"))
    Open3.capture3(
      "bundle", "exec", "ruby", "scripts/validate_cinematic_system.rb", path, project_root,
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

    assert_rejected(graph, "direction 1: fields must be exactly id, service_slug, label, description")
  end

  def test_rejects_duplicate_or_blank_direction_ids
    graph = canonical_graph
    graph.fetch("directions")[1]["id"] = graph.fetch("directions").first.fetch("id")
    assert_rejected(graph, "directions must not contain duplicate IDs")

    graph = canonical_graph
    graph.fetch("directions").first["id"] = " "
    assert_rejected(graph, "direction 1: id must be a non-empty scalar")
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
end
