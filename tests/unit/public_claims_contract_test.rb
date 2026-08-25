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
