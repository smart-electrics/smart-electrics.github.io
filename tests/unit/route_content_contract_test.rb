# frozen_string_literal: true

require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"

class RouteContentContractTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  PROCESS_IDS = %w[
    enquiry
    clarification
    site-assessment
    design-and-agreement
    estimation
    installation-and-commissioning
    handover-and-service
  ].freeze
  ABOUT_IDS = %w[object-context system-logic coordination handover].freeze

  def validate(data_path = File.join(ROOT, "_data", "route_content.yml"))
    Open3.capture3("bundle", "exec", "ruby", "scripts/validate_route_content.rb", data_path, chdir: ROOT)
  end

  def canonical_content
    YAML.safe_load_file(File.join(ROOT, "_data", "route_content.yml"), permitted_classes: [], aliases: false)
  end

  def with_content(content)
    Dir.mktmpdir("smart-electrics-route-content") do |directory|
      path = File.join(directory, "route_content.yml")
      File.write(path, YAML.dump(content))
      yield path
    end
  end

  def assert_rejected(content, error)
    with_content(content) do |path|
      _stdout, stderr, status = validate(path)

      refute_predicate status, :success?
      assert_includes stderr, error
    end
  end

  def test_accepts_the_single_ukrainian_route_content_seam
    _stdout, stderr, status = validate

    assert_predicate status, :success?, stderr
    data = canonical_content
    assert_equal ["uk"], data.keys
    assert_equal PROCESS_IDS, data.dig("uk", "process", "journey", "nodes").map { |node| node.fetch("id") }
    assert_equal ABOUT_IDS, data.dig("uk", "about", "journey", "nodes").map { |node| node.fetch("id") }
  end

  def test_rejects_wrong_localization_shape_or_journey_order
    data = canonical_content
    data["en"] = data.fetch("uk").dup
    assert_rejected(data, "route_content.yml must contain exactly one top-level uk localization")

    data = canonical_content
    data.fetch("uk").fetch("process").fetch("journey").fetch("nodes").reverse!
    assert_rejected(data, "process.journey.nodes must use the exact canonical order")

    data = canonical_content
    data.fetch("uk").fetch("about").fetch("journey").fetch("nodes")[0]["ordinal"] = "01"
    assert_rejected(data, "about.journey.nodes[0] fields must be exactly id, title, input, decision, next")
  end

  def test_rejects_untruthful_copy_and_broken_static_links
    data = canonical_content
    data.fetch("uk").fetch("projects").fetch("body") << "Відгук клієнта про завершений об’єкт"
    assert_rejected(data, "projects must not claim a case, review, statistic, or completed work")

    data = canonical_content
    data.fetch("uk").fetch("process").fetch("journey").fetch("nodes")[0]["decision"] = "Гарантуємо ціну 24 000 грн"
    assert_rejected(data, "process.journey.nodes[0] contains forbidden commercial or outcome claim")

    data = canonical_content
    data.fetch("uk").fetch("not_found").fetch("links")[0]["url"] = "/invented/"
    assert_rejected(data, "not_found.links[0].url must point to a generated internal route")
  end

  def test_rejects_route_documents_that_compete_with_data_owned_copy
    _stdout, stderr, status = validate

    assert_predicate status, :success?, stderr
  end
end
