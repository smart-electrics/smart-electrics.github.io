# frozen_string_literal: true

require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"
require_relative "../../scripts/validate_route_content"

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

  def duplicate_content
    YAML.safe_load(YAML.dump(canonical_content), permitted_classes: [], aliases: false)
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

  def assert_controlled_rejection(content, error)
    with_content(content) do |path|
      _stdout, stderr, status = validate(path)

      refute_predicate status, :success?
      assert_includes stderr, error
      refute_includes stderr, "NoMethodError"
      refute_includes stderr, "stack trace"
    end
  end

  def test_accepts_the_single_ukrainian_route_content_seam
    _stdout, stderr, status = validate

    assert_predicate status, :success?, stderr
    data = canonical_content
    assert_equal ["uk"], data.keys
    assert_equal PROCESS_IDS, data.dig("uk", "process", "journey", "nodes").map { |node| node.fetch("id") }
    assert_equal ABOUT_IDS, data.dig("uk", "about", "journey", "nodes").map { |node| node.fetch("id") }
    %w[process about].each do |route|
      visuals = data.dig("uk", route, "journey", "nodes").map { |node| node.fetch("visual") }
      assert visuals.all? { |visual| visual.fetch("focus").keys.sort == %w[scale x y] && visual.fetch("next").keys.sort == %w[x y] }
      assert_equal visuals.length, visuals.map { |visual| [visual.dig("focus", "x"), visual.dig("focus", "y"), visual.dig("next", "x"), visual.dig("next", "y")] }.uniq.length
    end
  end

  def test_rejects_wrong_localization_shape_or_journey_order
    data = canonical_content
    data["en"] = YAML.safe_load(YAML.dump(data.fetch("uk")), permitted_classes: [], aliases: false)
    assert_rejected(data, "route_content.yml must contain exactly one top-level uk localization")

    data = canonical_content
    data.fetch("uk").fetch("process").fetch("journey").fetch("nodes").reverse!
    assert_rejected(data, "process.journey.nodes must use the exact canonical order")

    data = canonical_content
    data.fetch("uk").fetch("about").fetch("journey").fetch("nodes")[0]["ordinal"] = "01"
    assert_rejected(data, "about.journey.nodes[0] fields must be exactly id, title, input, decision, next, visual")

    data = canonical_content
    data.fetch("uk").fetch("process").fetch("journey").fetch("panel")["focus"] = {}
    assert_rejected(data, "process.journey.panel must provide localized assembled, focus, and reassembled panel copy")

    data = canonical_content
    data.fetch("uk").fetch("process").fetch("journey").fetch("nodes")[0]["visual"]["next"]["x"] = 100
    assert_rejected(data, "process.journey.nodes[0].visual must provide bounded exact focus and next coordinates")
  end

  def test_rejects_detached_fingerprint_drift_for_localized_semantics_and_media
    mutations = {
      "aria label" => lambda { |journey| journey["aria_label"] = "Інший маршрут" },
      "field label" => lambda { |journey| journey.fetch("labels")["input"] = "Інші дані" },
      "action label" => lambda { |journey| journey.fetch("actions")["return"] = "Інша дія" },
      "media copy" => lambda { |journey| journey.fetch("media")["image_alt"] = "Інший опис" }
    }

    mutations.each_value do |mutate|
      data = duplicate_content
      mutate.call(data.fetch("uk").fetch("process").fetch("journey"))
      assert_rejected(data, "process.journey must match the detached canonical fingerprint")
    end
  end

  def test_rejects_nil_journey_structures_with_controlled_contract_errors
    mutations = {
      "nodes" => [
        lambda { |journey| journey["nodes"] = nil },
        "process.journey.nodes must be an ordered array"
      ],
      "visual" => [
        lambda { |journey| journey.fetch("nodes")[0]["visual"] = nil },
        "process.journey.nodes[0].visual must provide bounded exact focus and next coordinates"
      ],
      "media" => [
        lambda { |journey| journey["media"] = nil },
        "process.journey.media fields must be exactly image_1536, image_768, image_alt, image_focus"
      ],
      "labels" => [
        lambda { |journey| journey["labels"] = nil },
        "process.journey.labels fields must be exactly input, decision, next with non-empty copy"
      ],
      "actions" => [
        lambda { |journey| journey["actions"] = nil },
        "process.journey.actions fields must be exactly show_relationship, return with non-empty copy"
      ]
    }

    mutations.each_value do |mutate, error|
      data = duplicate_content
      mutate.call(data.fetch("uk").fetch("process").fetch("journey"))
      assert_controlled_rejection(data, error)
    end
  end

  def test_rejects_nil_utility_body_and_links_with_controlled_contract_errors
    mutations = {
      "projects body" => [
        lambda { |localized| localized.fetch("projects")["body"] = nil },
        "projects.body must be a non-empty static text array"
      ],
      "projects links" => [
        lambda { |localized| localized.fetch("projects")["links"] = nil },
        "projects.links must be a static link array"
      ],
      "contact body" => [
        lambda { |localized| localized.fetch("contact")["body"] = nil },
        "contact.body must be a non-empty static text array"
      ],
      "privacy body" => [
        lambda { |localized| localized.fetch("privacy")["body"] = nil },
        "privacy.body must be a non-empty static text array"
      ]
    }

    mutations.each_value do |mutate, error|
      data = duplicate_content
      mutate.call(data.fetch("uk"))
      assert_controlled_rejection(data, error)
    end
  end

  def test_matches_the_known_code_point_fingerprint_for_astral_localized_copy
    journey = {
      "id" => "process",
      "aria_label" => "Маршрут 🚀",
      "assembled" => { "title" => "Послідовність", "summary" => "Оберіть етап" },
      "panel" => {
        "assembled" => { "label" => "Маршрут", "title" => "Оберіть етап", "summary" => "Деталі етапу" },
        "focus" => { "label" => "Обраний етап" },
        "reassembled" => { "label" => "Наступний зв’язок", "title" => "Перехід" }
      },
      "labels" => { "input" => "Вхід 😀", "decision" => "Рішення", "next" => "Далі" },
      "actions" => { "show_relationship" => "Показати зв’язок", "return" => "Повернутися" },
      "media" => {
        "image_768" => "/assets/768.webp",
        "image_1536" => "/assets/1536.webp",
        "image_alt" => "Візуальна концепція",
        "image_focus" => "50% 50%"
      },
      "nodes" => [
        {
          "id" => "enquiry", "title" => "Звернення", "input" => "Вхід", "decision" => "Рішення", "next" => "Далі",
          "visual" => { "focus" => { "x" => 24, "y" => 68, "scale" => 1.24 }, "next" => { "x" => 46, "y" => 52 } }
        },
        {
          "id" => "clarification", "title" => "Уточнення", "input" => "Вхід", "decision" => "Рішення", "next" => "Далі",
          "visual" => { "focus" => { "x" => 46, "y" => 52, "scale" => 1.29 }, "next" => { "x" => 66, "y" => 40 } }
        }
      ]
    }

    assert_equal "8227252b", RouteContent.route_fingerprint(journey)
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
