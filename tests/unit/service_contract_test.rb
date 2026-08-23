# frozen_string_literal: true

require "fileutils"
require "minitest/autorun"
require "open3"
require "tmpdir"

class ServiceContractTest < Minitest::Test
  SERVICES = [
    ["electrical-design", 1],
    ["electrical-installation", 2],
    ["panels-and-protection", 3],
    ["lighting", 4],
    ["low-voltage", 5],
    ["backup-power", 6],
    ["smart-home-integration", 7],
    ["diagnostics-and-service", 8]
  ].freeze

  def with_services
    Dir.mktmpdir("smart-electrics-services") do |root|
      services = File.join(root, "_services")
      FileUtils.mkdir_p(services)
      SERVICES.each do |slug, order|
        File.write(File.join(services, "#{slug}.md"), valid_service(slug, order))
      end
      yield root, services
    end
  end

  def validate(services)
    Open3.capture3("bundle", "exec", "ruby", "scripts/validate_services.rb", services, chdir: project_root)
  end

  def project_root
    File.expand_path("../..", __dir__)
  end

  def valid_service(slug, order)
    related = (SERVICES.map(&:first) - [slug]).first(2)
    <<~MARKDOWN
      ---
      title: "Напрям #{order}"
      slug: #{slug}
      order: #{order}
      kicker: "Етап #{order}"
      description: "Нейтральний опис напряму #{order}."
      role: "Роль напряму #{order} у цілісній системі."
      when_to_involve: "Узгодити на відповідному етапі робіт."
      scope:
        - "Пункт обсягу один"
        - "Пункт обсягу два"
        - "Пункт обсягу три"
      inputs:
        - "Вихідні дані один"
        - "Вихідні дані два"
      related_services:
        - #{related[0]}
        - #{related[1]}
      ---

      Змістовний опис напряму без службових позначок.
    MARKDOWN
  end

  def test_accepts_the_eight_service_collection_in_canonical_order
    with_services do |root, _services|
      _stdout, stderr, status = validate(_services)

      assert_predicate status, :success?, stderr
    end
  end

  def test_rejects_a_collection_with_a_noncanonical_service_route
    with_services do |root, services|
      path = File.join(services, "electrical-design.md")
      File.write(path, valid_service("electrical-desgin", 1))

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "must contain exactly the canonical eight service slugs"
    end
  end

  def test_rejects_a_document_filename_that_would_change_its_route
    with_services do |_root, services|
      FileUtils.mv(
        File.join(services, "electrical-design.md"),
        File.join(services, "other-route.md")
      )

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "must contain exactly the canonical eight service routes"
    end
  end

  def test_rejects_documents_that_swap_canonical_slugs_between_routes
    with_services do |_root, services|
      design = File.join(services, "electrical-design.md")
      installation = File.join(services, "electrical-installation.md")
      File.write(design, valid_service("electrical-installation", 1))
      File.write(installation, valid_service("electrical-design", 2))

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "slug must match the filename-derived service route"
    end
  end

  def test_rejects_orders_outside_the_canonical_sequence
    with_services do |_root, services|
      path = File.join(services, "electrical-design.md")
      File.write(path, valid_service("electrical-design", 9))

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "orders must be the unique sequence 1 through 8"
    end
  end

  def test_rejects_a_non_numeric_order_without_crashing
    with_services do |_root, services|
      path = File.join(services, "electrical-design.md")
      File.write(path, valid_service("electrical-design", 1).sub("order: 1", "order: first"))

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "orders must be the unique sequence 1 through 8"
    end
  end

  def test_rejects_a_service_without_a_required_scalar_field
    with_services do |_root, services|
      path = File.join(services, "electrical-design.md")
      File.write(path, valid_service("electrical-design", 1).sub(/^role:.*\n/, ""))

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "role must be a non-empty scalar"
    end
  end

  def test_rejects_scope_outside_its_required_item_range
    with_services do |_root, services|
      path = File.join(services, "electrical-design.md")
      document = valid_service("electrical-design", 1).sub(
        /scope:\n(?:  - .*\n){3}/,
        "scope:\n  - \"Лише один пункт\"\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "scope must contain 3 to 5 non-empty items"
    end
  end

  def test_rejects_inputs_outside_its_required_item_range
    with_services do |_root, services|
      path = File.join(services, "electrical-design.md")
      document = valid_service("electrical-design", 1).sub(
        /inputs:\n(?:  - .*\n){2}/,
        "inputs:\n  - \"Лише одні вихідні дані\"\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "inputs must contain 2 to 4 non-empty items"
    end
  end

  def test_rejects_related_services_outside_its_required_item_range
    with_services do |_root, services|
      path = File.join(services, "electrical-design.md")
      document = valid_service("electrical-design", 1).sub(
        /related_services:\n(?:  - .*\n){2}/,
        "related_services:\n  - electrical-installation\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "related_services must contain 2 to 5 non-empty items"
    end
  end

  def test_rejects_duplicate_related_service_slugs
    with_services do |_root, services|
      path = File.join(services, "electrical-design.md")
      document = valid_service("electrical-design", 1).sub(
        /related_services:\n(?:  - .*\n){2}/,
        "related_services:\n  - electrical-installation\n  - electrical-installation\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "related_services must not contain duplicate slugs"
    end
  end

  def test_rejects_a_related_slug_that_does_not_exist
    with_services do |_root, services|
      path = File.join(services, "electrical-design.md")
      document = valid_service("electrical-design", 1).sub(
        "  - electrical-installation\n",
        "  - unavailable-service\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "related_services must only reference existing service slugs"
    end
  end

  def test_rejects_a_service_that_links_to_itself
    with_services do |_root, services|
      path = File.join(services, "electrical-design.md")
      document = valid_service("electrical-design", 1).sub(
        "  - electrical-installation\n",
        "  - electrical-design\n"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "related_services must not link to the same service"
    end
  end

  def test_rejects_invalid_yaml_front_matter
    with_services do |_root, services|
      path = File.join(services, "electrical-design.md")
      document = valid_service("electrical-design", 1).sub(
        'title: "Напрям 1"',
        "title: [незавершений список"
      )
      File.write(path, document)

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "must contain valid YAML front matter"
    end
  end

  def test_rejects_the_known_prelaunch_placeholder_phrase
    with_services do |_root, services|
      path = File.join(services, "electrical-design.md")
      File.write(path, "#{valid_service("electrical-design", 1)}\nСклад послуги й перелік вихідних даних готуються до публікації.\n")

      _stdout, stderr, status = validate(services)

      refute_predicate status, :success?
      assert_includes stderr, "must not contain placeholder text"
    end
  end
end
