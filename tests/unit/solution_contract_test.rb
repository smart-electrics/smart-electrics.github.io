# frozen_string_literal: true

require "fileutils"
require "minitest/autorun"
require "open3"
require "tmpdir"

class SolutionContractTest < Minitest::Test
  SOLUTIONS = [
    ["apartment-comfort-and-control", 1],
    ["private-house-full-automation", 2],
    ["architectural-lighting", 3],
    ["energy-autonomy", 4],
    ["security-and-access-control", 5],
    ["commercial-space", 6]
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

  def with_solutions
    Dir.mktmpdir("smart-electrics-solutions") do |root|
      solutions = File.join(root, "_solutions")
      images = File.join(root, "assets", "images", "solutions")
      FileUtils.mkdir_p([solutions, images])
      SOLUTIONS.each do |slug, order|
        write_images(images, slug)
        File.write(File.join(solutions, "#{slug}.md"), valid_solution(slug, order))
      end
      yield root, solutions
    end
  end

  def validate(solutions, root)
    Open3.capture3(
      "bundle", "exec", "ruby", "scripts/validate_solutions.rb", solutions, root,
      chdir: project_root
    )
  end

  def project_root
    File.expand_path("../..", __dir__)
  end

  def valid_solution(slug, order)
    related_solutions = (SOLUTIONS.map(&:first) - [slug]).first(2)
    related_services = SERVICES.first(3)
    <<~MARKDOWN
      ---
      title: "Рішення #{order}"
      slug: #{slug}
      order: #{order}
      kicker: "Конфігурація #{order}"
      description: "Нейтральний опис конфігурації #{order}."
      audience: "Для типового об’єкта"
      focus: "Узгоджене поєднання електричних систем."
      image_768: /assets/images/solutions/#{slug}-768.webp
      image_1536: /assets/images/solutions/#{slug}-1536.webp
      image_alt: "Візуальна концепція конфігурації #{order}."
      image_focus: "Світлові та електричні системи в просторі."
      systems:
        - "Система один"
        - "Система два"
        - "Система три"
      inputs:
        - "Умова об’єкта один"
        - "Умова об’єкта два"
        - "Умова об’єкта три"
      scenarios:
        - title: "Сценарій один"
          trigger: "Подія один"
          response: "Реакція системи один"
          benefit: "Користь один"
        - title: "Сценарій два"
          trigger: "Подія два"
          response: "Реакція системи два"
          benefit: "Користь два"
      related_services:
        - #{related_services[0]}
        - #{related_services[1]}
        - #{related_services[2]}
      related_solutions:
        - #{related_solutions[0]}
        - #{related_solutions[1]}
      ---

      Змістовний опис без службових позначок.
    MARKDOWN
  end

  def write_images(images, slug)
    %w[768 1536].each do |width|
      File.binwrite(File.join(images, "#{slug}-#{width}.webp"), "RIFF")
    end
  end

  def test_accepts_six_canonical_solutions_with_local_images
    with_solutions do |root, solutions|
      _stdout, stderr, status = validate(solutions, root)

      assert_predicate status, :success?, stderr
    end
  end

  def test_rejects_a_collection_with_a_noncanonical_solution_slug
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      File.write(path, valid_solution("apartment-comfort-and-contorl", 1))

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "must contain exactly the canonical six solution slugs"
    end
  end

  def test_rejects_a_document_filename_that_would_change_its_route
    with_solutions do |root, solutions|
      FileUtils.mv(
        File.join(solutions, "apartment-comfort-and-control.md"),
        File.join(solutions, "other-route.md")
      )

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "must contain exactly the canonical six solution routes"
    end
  end

  def test_rejects_documents_that_swap_canonical_slugs_between_routes
    with_solutions do |root, solutions|
      apartment = File.join(solutions, "apartment-comfort-and-control.md")
      house = File.join(solutions, "private-house-full-automation.md")
      File.write(apartment, valid_solution("private-house-full-automation", 1))
      File.write(house, valid_solution("apartment-comfort-and-control", 2))

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "slug must match the filename-derived solution route"
    end
  end

  def test_rejects_orders_outside_the_canonical_sequence
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      File.write(path, valid_solution("apartment-comfort-and-control", 7))

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "orders must be the unique sequence 1 through 6"
    end
  end

  def test_rejects_a_non_numeric_order_without_crashing
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      File.write(path, valid_solution("apartment-comfort-and-control", 1).sub("order: 1", "order: first"))

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "orders must be the unique sequence 1 through 6"
    end
  end

  def test_rejects_a_solution_without_a_required_scalar_field
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      File.write(path, valid_solution("apartment-comfort-and-control", 1).sub(/^audience:.*\n/, ""))

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "audience must be a non-empty scalar"
    end
  end

  def test_rejects_a_missing_local_image
    with_solutions do |root, solutions|
      FileUtils.rm(File.join(root, "assets", "images", "solutions", "apartment-comfort-and-control-768.webp"))

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "image_768 must reference an existing local image file"
    end
  end

  def test_rejects_systems_outside_the_required_item_range
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      document = valid_solution("apartment-comfort-and-control", 1).sub(
        /systems:\n(?:  - .*\n){3}/,
        "systems:\n  - \"Лише один елемент\"\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "systems must contain 3 to 5 non-empty items"
    end
  end

  def test_rejects_inputs_outside_the_required_item_range
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      document = valid_solution("apartment-comfort-and-control", 1).sub(
        /inputs:\n(?:  - .*\n){3}/,
        "inputs:\n  - \"Лише одна умова\"\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "inputs must contain 3 to 5 non-empty items"
    end
  end

  def test_rejects_scenarios_outside_the_required_item_range
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      document = valid_solution("apartment-comfort-and-control", 1).sub(
        /scenarios:\n(?:  - title:.*\n    trigger:.*\n    response:.*\n    benefit:.*\n){2}/,
        "scenarios:\n  - title: \"Лише один сценарій\"\n    trigger: \"Подія\"\n    response: \"Реакція\"\n    benefit: \"Користь\"\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "scenarios must contain 2 to 4 items"
    end
  end

  def test_rejects_a_malformed_scenario
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      File.write(path, valid_solution("apartment-comfort-and-control", 1).sub(/^    benefit:.*\n/, ""))

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "scenario 1 benefit must be a non-empty scalar"
    end
  end

  def test_rejects_related_services_outside_the_required_item_range
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      document = valid_solution("apartment-comfort-and-control", 1).sub(
        /related_services:\n(?:  - .*\n){3}/,
        "related_services:\n  - electrical-design\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "related_services must contain 3 to 6 non-empty items"
    end
  end

  def test_rejects_duplicate_or_unknown_related_service_slugs
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      document = valid_solution("apartment-comfort-and-control", 1).sub(
        "  - electrical-installation\n  - panels-and-protection\n",
        "  - electrical-design\n  - unavailable-service\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "related_services must not contain duplicate slugs"
      assert_includes stderr, "related_services must only reference existing service slugs"
    end
  end

  def test_rejects_related_solutions_outside_the_required_item_range
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      document = valid_solution("apartment-comfort-and-control", 1).sub(
        /related_solutions:\n(?:  - .*\n){2}/,
        "related_solutions:\n  - private-house-full-automation\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "related_solutions must contain 2 to 3 non-empty items"
    end
  end

  def test_rejects_duplicate_unknown_or_self_related_solution_slugs
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      document = valid_solution("apartment-comfort-and-control", 1).sub(
        "  - private-house-full-automation\n  - architectural-lighting\n",
        "  - apartment-comfort-and-control\n  - apartment-comfort-and-control\n  - unavailable-solution\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "related_solutions must not contain duplicate slugs"
      assert_includes stderr, "related_solutions must only reference existing solution slugs"
      assert_includes stderr, "related_solutions must not link to the same solution"
    end
  end

  def test_rejects_invalid_yaml_front_matter
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      File.write(path, valid_solution("apartment-comfort-and-control", 1).sub('title: "Рішення 1"', "title: [незавершений список"))

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "must contain valid YAML front matter"
    end
  end

  def test_rejects_known_placeholder_copy
    with_solutions do |root, solutions|
      path = File.join(solutions, "apartment-comfort-and-control.md")
      File.write(path, "#{valid_solution("apartment-comfort-and-control", 1)}\nСклад конфігурації готується до публікації.\n")

      _stdout, stderr, status = validate(solutions, root)

      refute_predicate status, :success?
      assert_includes stderr, "must not contain placeholder text"
    end
  end
end
