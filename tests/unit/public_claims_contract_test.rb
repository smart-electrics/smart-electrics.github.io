# frozen_string_literal: true

require "fileutils"
require "minitest/autorun"
require "open3"
require "tmpdir"

class PublicClaimsContractTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  CLAIMS = {
    "telemetry/status" => "Онлайн-статус системи та телеметрія доступні в реальному часі.",
    "portal/account/control" => "Особистий кабінет дає віддалене керування об’єктом.",
    "vendor compatibility" => "Рішення сумісне з KNX і підтримує протокол виробника.",
    "price" => "Ціна електромонтажного проєкту — 24 000 грн.",
    "guarantee" => "Гарантуємо результат для кожного об’єкта.",
    "certificate" => "Сертифіковане рішення для житлового простору.",
    "review" => "Відгук клієнта підтверджує якість робіт.",
    "client project as fact" => "Реалізований клієнтський проєкт у приватному будинку."
  }.freeze
  MIXED_DISCLOSURE_CLAIMS = [
    ["price", "Ми не публікуємо цін, але ціна електромонтажного проєкту — 24 000 грн."],
    ["price", "Не публікуємо ціну і ціна системи — 24 000 грн."],
    ["client project as fact", "Це не підтверджений клієнтський кейс, але реалізований проєкт вже завершено."],
    ["telemetry/status", "Не заявляємо, а поточний статус системи доступний."],
    ["review", "Не публікуємо, а рейтинг клієнтів підтверджує якість робіт."],
    ["vendor compatibility", "Не заявляємо, а compatibility with protocol доступна."],
    ["telemetry/status", "Ми не публікуємо телеметрії і телеметрії доступні в реальному часі."],
    ["review", "Ми не публікуємо відгуків і відгуки клієнтів це підтверджують."],
    ["vendor compatibility", "Ми не публікуємо тверджень про сумісність і сумісність із протоколом доступна."],
    ["telemetry/status", "Не публікуємо live-status системи є."],
    ["guarantee", "Не надаємо гарантій, гарантія діє."],
    ["certificate", "Без сертифікатів, сертифікат додається."],
    ["guarantee", "Не гарантуємо результат, гарантія діє."],
    ["certificate", "Не публікуємо сертифіковане рішення, сертифікат додається."],
    ["client project as fact", "Не публікуємо проєктів, власник отримав результат."]
  ].freeze
  CLIENT_PROJECT_CLAIMS = [
    "Реалізований клієнтський проєкт у приватному будинку.",
    "Виконана система автоматизації працює у демонстраційній конфігурації.",
    "Кейс клієнта описує погоджений підхід.",
    "Власник отримав результат для свого об’єкта."
  ].freeze
  COMPACT_CATEGORY_TAILS = [
    ["telemetry/status", "Не публікуємо; телеметрія."],
    ["telemetry/status", "Не публікуємо, телеметрія."],
    ["portal/account/control", "Не публікуємо, портал: особистий кабінет."],
    ["vendor compatibility", "Не заявляємо; сумісність із конкретним виробником."],
    ["price", "Не публікуємо; ціна: значення."],
    ["guarantee", "Не надаємо; гарантія: гарантія діє."],
    ["certificate", "Без; сертифікат: сертифікат додається."],
    ["review", "Не публікуємо; відгуки, рейтинг."],
    ["client project as fact", "Не публікуємо; кейс клієнта."]
  ].freeze
  ORDERED_ATTRIBUTE_CLAIMS = [
    ["price", '<div title="Ціна електромонтажного проєкту — 24 000 грн."><span aria-label="Ми не публікуємо цін."></span></div>']
  ].freeze
  TRUTHFUL_NEGATIVE_FRAGMENTS = [
    "Ми не публікуємо цін і не надаємо гарантій.",
    "Ми не публікуємо ціни, гарантії, сертифікати та відгуки.",
    "Наразі ми не публікуємо тут підтверджених кейсів чи матеріалів про виконані об’єкти.",
    "Подію доступу пов’язують із потрібною дією без дистанційного керування точкою входу.",
    "Не публікуємо онлайн-статус системи.",
    "Не надаємо особистий кабінет.",
    "Не заявляємо KNX.",
    "Не публікуємо вартість.",
    "Не публікуємо рейтинг.",
    "Не публікуємо поточний статус системи.",
    "Не публікуємо реалізований проєкт.",
    "Не гарантуємо результат.",
    "Не гарантуємо жодних гарантій.",
    "Не публікуємо сертифіковане рішення."
  ].freeze
  NEUTRAL_BOUNDARY_FRAGMENTS = [
    "Експертелеметрія — один внутрішній термін, а не окреме публічне твердження."
  ].freeze
  ATTRIBUTE_CLAIMS = [
    ["telemetry/status", '<img alt="Онлайн-статус системи доступний у реальному часі." width="100" height="20">'],
    ["portal/account/control", '<button aria-label="Особистий кабінет дає віддалене керування об’єктом.">Кнопка</button>'],
    ["vendor compatibility", '<span title="Рішення сумісне з KNX і підтримує протокол виробника.">Підпис</span>'],
    ["price", '<input placeholder="Ціна електромонтажного проєкту — 24 000 грн.">']
  ].freeze
  TRUTHFUL_NEGATIVE_DISCLOSURE = <<~COPY.strip
    Це візуальна концепція, не підтверджений клієнтський кейс.
    Ми не публікуємо цін, гарантій, сертифікатів, відгуків, телеметрії, порталів
    чи тверджень про сумісність із конкретним виробником.
  COPY

  def validate(source_root, site_root)
    Open3.capture3(
      "bundle", "exec", "ruby", "scripts/validate_public_claims.rb", source_root, site_root,
      chdir: ROOT
    )
  end

  def build_site
    Open3.capture3("bundle", "exec", "jekyll", "build", "--trace", chdir: ROOT)
  end

  def with_public_copy(source:, built:)
    Dir.mktmpdir("smart-electrics-public-claims") do |root|
      site = File.join(root, "_site")
      FileUtils.mkdir_p(site)
      File.write(File.join(root, "index.md"), "---\nlayout: page\n---\n#{source}\n")
      File.write(File.join(site, "index.html"), "<!doctype html><html><body>#{built}</body></html>")
      yield root, site
    end
  end

  def assert_rejected(surface:, claim:, category:)
    source = surface == :source ? claim : TRUTHFUL_NEGATIVE_DISCLOSURE
    built = surface == :built ? "<main><p>#{claim}</p></main>" : "<main><p>#{TRUTHFUL_NEGATIVE_DISCLOSURE}</p></main>"

    with_public_copy(source:, built:) do |root, site|
      _stdout, stderr, status = validate(root, site)

      refute_predicate status, :success?, "#{surface} must reject #{category}"
      assert_includes stderr, "#{surface}:index.#{surface == :source ? 'md' : 'html'}: #{category}"
    end
  end

  def test_rejects_every_unsupported_claim_in_source_and_built_visible_copy
    CLAIMS.each do |category, claim|
      assert_rejected(surface: :source, claim:, category:)
      assert_rejected(surface: :built, claim:, category:)
    end
  end

  def test_allows_truthful_negative_disclosures_and_ignores_script_source
    with_public_copy(
      source: TRUTHFUL_NEGATIVE_DISCLOSURE,
      built: <<~HTML
        <script>const unsupported = "KNX, ціна, live-статус";</script>
        <noscript><p>#{TRUTHFUL_NEGATIVE_DISCLOSURE}</p></noscript>
      HTML
    ) do |root, site|
      _stdout, stderr, status = validate(root, site)

      assert_predicate status, :success?, stderr
    end
  end

  def test_ignores_raw_text_elements_with_parser_tolerated_end_tag_junk
    built = <<~HTML
      <script>const unsupported = "KNX, ціна, live-статус";</script\t
       data-ignored><p>Видимий нейтральний текст.</p>
    HTML

    with_public_copy(source: TRUTHFUL_NEGATIVE_DISCLOSURE, built:) do |root, site|
      _stdout, stderr, status = validate(root, site)

      assert_predicate status, :success?, stderr
    end
  end

  def test_rejects_positive_claims_after_a_negative_disclosure_in_the_same_fragment
    MIXED_DISCLOSURE_CLAIMS.each do |category, claim|
      assert_rejected(surface: :source, claim:, category:)
      assert_rejected(surface: :built, claim:, category:)
    end
  end

  def test_rejects_all_four_client_project_claim_shapes
    CLIENT_PROJECT_CLAIMS.each do |claim|
      assert_rejected(surface: :source, claim:, category: "client project as fact")
      assert_rejected(surface: :built, claim:, category: "client project as fact")
    end
  end

  def test_rejects_compact_category_only_tails_after_unknown_negative_wording
    COMPACT_CATEGORY_TAILS.each do |category, claim|
      assert_rejected(surface: :source, claim:, category:)
      assert_rejected(surface: :built, claim:, category:)
    end
  end

  def test_allows_only_explicitly_recognized_truthful_negative_disclosures
    TRUTHFUL_NEGATIVE_FRAGMENTS.each do |copy|
      with_public_copy(source: copy, built: "<main><p>#{copy}</p></main>") do |root, site|
        _stdout, stderr, status = validate(root, site)

        assert_predicate status, :success?, stderr
      end
    end
  end

  def test_claim_keywords_require_unicode_word_boundaries
    NEUTRAL_BOUNDARY_FRAGMENTS.each do |copy|
      with_public_copy(source: copy, built: "<main><p>#{copy}</p></main>") do |root, site|
        _stdout, stderr, status = validate(root, site)

        assert_predicate status, :success?, stderr
      end
    end
  end

  def test_rejects_claims_in_public_copy_attributes_on_source_and_built_surfaces
    ATTRIBUTE_CLAIMS.each do |category, markup|
      [[:source, markup], [:built, markup]].each do |surface, attribute_copy|
        source = surface == :source ? attribute_copy : TRUTHFUL_NEGATIVE_DISCLOSURE
        built = surface == :built ? attribute_copy : "<main><p>#{TRUTHFUL_NEGATIVE_DISCLOSURE}</p></main>"

        with_public_copy(source:, built:) do |root, site|
          _stdout, stderr, status = validate(root, site)

          refute_predicate status, :success?, "#{surface} must reject #{category} in an accessibility attribute"
          assert_includes stderr, "#{surface}:index.#{surface == :source ? 'md' : 'html'}: #{category}"
        end
      end
    end
  end

  def test_keeps_copy_before_a_negative_attribute_disclosure
    ORDERED_ATTRIBUTE_CLAIMS.each do |category, markup|
      [[:source, markup], [:built, markup]].each do |surface, attribute_copy|
        source = surface == :source ? attribute_copy : TRUTHFUL_NEGATIVE_DISCLOSURE
        built = surface == :built ? attribute_copy : "<main><p>#{TRUTHFUL_NEGATIVE_DISCLOSURE}</p></main>"

        with_public_copy(source:, built:) do |root, site|
          _stdout, stderr, status = validate(root, site)

          refute_predicate status, :success?, "#{surface} must reject #{category} before a negative disclosure"
          assert_includes stderr, "#{surface}:index.#{surface == :source ? 'md' : 'html'}: #{category}"
        end
      end
    end
  end

  def test_ignores_urls_and_arbitrary_data_attributes_as_public_copy
    neutral_markup = <<~HTML
      <a href="/knx?price=24000" data-label="Рейтинг клієнта" data-copy="Телеметрія доступна">Нейтральне посилання</a>
    HTML

    with_public_copy(source: neutral_markup, built: "<main>#{neutral_markup}</main>") do |root, site|
      _stdout, stderr, status = validate(root, site)

      assert_predicate status, :success?, stderr
    end
  end

  def test_allows_vendor_neutral_system_and_demonstration_control_copy
    source = "Система керування та автоматизації функцій об’єкта. Керування системою освітлення у демонстраційній конфігурації."

    with_public_copy(source:, built: "<main><p>#{source}</p></main>") do |root, site|
      _stdout, stderr, status = validate(root, site)

      assert_predicate status, :success?, stderr
    end
  end

  def test_fails_closed_when_built_visible_copy_is_unavailable
    Dir.mktmpdir("smart-electrics-public-claims") do |root|
      File.write(File.join(root, "index.md"), "---\nlayout: page\n---\n#{TRUTHFUL_NEGATIVE_DISCLOSURE}\n")
      _stdout, stderr, status = validate(root, File.join(root, "missing-site"))

      refute_predicate status, :success?
      assert_includes stderr, "built public copy is unavailable"
    end
  end

  def test_accepts_the_current_public_source_and_built_site
    _stdout, build_stderr, build_status = build_site
    assert_predicate build_status, :success?, build_stderr

    _stdout, stderr, status = validate(ROOT, File.join(ROOT, "_site"))
    assert_predicate status, :success?, stderr
  end
end
