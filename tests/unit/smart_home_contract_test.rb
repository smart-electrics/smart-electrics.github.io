# frozen_string_literal: true

require "fileutils"
require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"

class SmartHomeContractTest < Minitest::Test
  SCENARIOS = [
    "arrival",
    "evening",
    "away",
    "night",
    "backup"
  ].freeze

  SERVICES = %w[
    electrical-design
    electrical-installation
    panels-and-protection
    lighting
    low-voltage
    backup-power
    smart-home-integration
    diagnostics-and-service
  ].freeze
  SOLUTIONS = %w[
    apartment-comfort-and-control
    private-house-full-automation
    architectural-lighting
    energy-autonomy
    security-and-access-control
    commercial-space
  ].freeze
  REQUIRED_SCALAR_FIELDS = %w[
    id label eyebrow title event scene_label project_note live_summary
  ].freeze

  def project_root
    File.expand_path("../..", __dir__)
  end

  def with_contract(contract = valid_contract)
    Dir.mktmpdir("smart-electrics-smart-home") do |directory|
      path = File.join(directory, "smart_home.yml")
      File.write(path, YAML.dump(contract))
      yield path
    end
  end

  def validate(path)
    Open3.capture3(
      "bundle", "exec", "ruby", "scripts/validate_smart_home.rb", path, project_root,
      chdir: project_root
    )
  end

  def valid_contract
    {
      "scenarios" => SCENARIOS.each_with_index.map do |id, index|
        {
          "id" => id,
          "label" => ["Повернення", "Вечір", "Вихід", "Нічний контур", "Резерв"][index],
          "eyebrow" => "Сценарій #{index + 1}",
          "title" => "Узгоджений сценарій #{index + 1}",
          "event" => "Подія для сценарію #{index + 1}",
          "scene_label" => "Сцена #{index + 1}",
          "outcomes" => [
            { "zone" => "Вхід", "response" => "Можлива реакція системи після налаштування." },
            { "zone" => "Основна зона", "response" => "Логіка уточнюється для об’єкта." }
          ],
          "project_note" => "Для електромонтажного проєкту уточнюємо групи, точки та логіку.",
          "live_summary" => "Обрано сценарій #{index + 1}.",
          "related_services" => SERVICES.first(2),
          "related_solution" => SOLUTIONS[index]
        }
      end
    }
  end

  def scenario(contract, id = "arrival")
    contract.fetch("scenarios").find { |candidate| candidate.fetch("id") == id }
  end

  def assert_rejected(contract, expected_error)
    with_contract(contract) do |path|
      _stdout, stderr, status = validate(path)

      refute_predicate status, :success?
      assert_includes stderr, expected_error
    end
  end

  def test_accepts_exactly_the_five_canonical_scenarios_with_complete_data
    with_contract do |path|
      _stdout, stderr, status = validate(path)

      assert_predicate status, :success?, stderr
    end
  end

  def test_rejects_missing_or_blank_required_scenario_fields
    REQUIRED_SCALAR_FIELDS.each do |field|
      contract = valid_contract
      scenario(contract).delete(field)
      assert_rejected(contract, "arrival: #{field} must be a non-empty scalar")

      contract = valid_contract
      scenario(contract)[field] = "  "
      assert_rejected(contract, "arrival: #{field} must be a non-empty scalar")
    end
  end

  def test_rejects_any_noncanonical_id_or_canonical_order_change
    contract = valid_contract
    contract["scenarios"].pop
    assert_rejected(contract, "scenarios must contain exactly the canonical five IDs in order")

    contract = valid_contract
    scenario(contract)["id"] = "returning-home"
    assert_rejected(contract, "scenarios must contain exactly the canonical five IDs in order")

    contract = valid_contract
    contract["scenarios"].reverse!
    assert_rejected(contract, "scenarios must contain exactly the canonical five IDs in order")

    contract = valid_contract
    scenario(contract, "evening")["id"] = "arrival"
    assert_rejected(contract, "scenarios must contain exactly the canonical five IDs in order")
  end

  def test_rejects_outcomes_outside_the_required_cardinality
    contract = valid_contract
    scenario(contract)["outcomes"] = [scenario(contract).fetch("outcomes").first]
    assert_rejected(contract, "arrival: outcomes must contain 2 to 4 mappings")

    contract = valid_contract
    scenario(contract)["outcomes"] = Array.new(5) { |index| { "zone" => "Зона #{index}", "response" => "Реакція #{index}" } }
    assert_rejected(contract, "arrival: outcomes must contain 2 to 4 mappings")
  end

  def test_rejects_outcomes_without_complete_zone_and_response_copy
    contract = valid_contract
    scenario(contract)["outcomes"][0].delete("zone")
    assert_rejected(contract, "arrival: outcome 1 zone must be a non-empty scalar")

    contract = valid_contract
    scenario(contract)["outcomes"][1]["response"] = ""
    assert_rejected(contract, "arrival: outcome 2 response must be a non-empty scalar")
  end

  def test_rejects_related_services_with_wrong_cardinality_duplicates_or_unknown_slugs
    contract = valid_contract
    scenario(contract)["related_services"] = ["lighting"]
    assert_rejected(contract, "arrival: related_services must contain 2 to 4 non-empty items")

    contract = valid_contract
    scenario(contract)["related_services"] = SERVICES.first(5)
    assert_rejected(contract, "arrival: related_services must contain 2 to 4 non-empty items")

    contract = valid_contract
    scenario(contract)["related_services"] = ["lighting", "lighting"]
    assert_rejected(contract, "arrival: related_services must not contain duplicate slugs")

    contract = valid_contract
    scenario(contract)["related_services"] = ["lighting", "unknown-service"]
    assert_rejected(contract, "arrival: related_services must only reference existing service slugs")
  end

  def test_rejects_missing_blank_or_unknown_related_solution
    contract = valid_contract
    scenario(contract).delete("related_solution")
    assert_rejected(contract, "arrival: related_solution must be a non-empty scalar")

    contract = valid_contract
    scenario(contract)["related_solution"] = " "
    assert_rejected(contract, "arrival: related_solution must be a non-empty scalar")

    contract = valid_contract
    scenario(contract)["related_solution"] = "unknown-solution"
    assert_rejected(contract, "arrival: related_solution must reference an existing solution slug")
  end

  def test_rejects_placeholder_vendor_price_contact_and_pii_like_copy
    {
      "placeholder" => "Сторінка готується до публікації.",
      "vendor" => "Працює з KNX без обмежень.",
      "price" => "Вартість від 2 000 грн.",
      "contact" => "Напишіть на hello@example.com.",
      "pii" => "Зателефонуйте за номером +380 67 123 45 67."
    }.each do |kind, forbidden_copy|
      contract = valid_contract
      scenario(contract)["title"] = forbidden_copy
      assert_rejected(contract, "arrival: title must not contain #{kind} copy")
    end
  end

  def test_rejects_invalid_yaml
    Dir.mktmpdir("smart-electrics-smart-home") do |directory|
      path = File.join(directory, "smart_home.yml")
      File.write(path, "scenarios: [\n")
      _stdout, stderr, status = validate(path)

      refute_predicate status, :success?
      assert_includes stderr, "smart_home.yml: must contain valid YAML"
    end
  end
end
