# frozen_string_literal: true

require "minitest/autorun"
require "nokogiri"
require "open3"
require "tmpdir"

class LandingInlineCssContractTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  GENERATOR = File.join(ROOT, "scripts", "generate_landing_inline_css.rb")
  GENERATED_CSS = File.join(ROOT, "_includes", "generated", "landing-inline.css")

  def generate(*arguments)
    Open3.capture3("bundle", "exec", "ruby", GENERATOR, *arguments, chdir: ROOT)
  end

  def build_site(baseurl: nil)
    Dir.mktmpdir("smart-electrics-landing-inline-css") do |destination|
      command = ["bundle", "exec", "jekyll", "build", "--quiet", "--destination", destination]
      command.concat(["--baseurl", baseurl]) if baseurl
      _stdout, stderr, status = Open3.capture3(
        { "JEKYLL_ENV" => "production" },
        *command,
        chdir: ROOT
      )

      assert_predicate status, :success?, stderr
      yield destination
    end
  end

  def document(destination, path)
    Nokogiri::HTML5.parse(File.read(File.join(destination, path)))
  end

  def test_homepage_inlines_its_route_scoped_css_while_other_routes_keep_main_css
    build_site do |destination|
      homepage = document(destination, "index.html")
      inline_css = homepage.at_css("head > style[data-landing-inline-css]")

      refute_nil inline_css, "homepage must inline its landing CSS in head"
      refute homepage.css('head > link[rel="stylesheet"][href$="/assets/css/main.css"]').any?,
             "homepage must not request the global stylesheet"
      assert_match %r{url\(["']?/assets/fonts/manrope-cyrillic\.woff2["']?\)}, inline_css.content
      assert_match %r{url\(["']?/assets/fonts/manrope-latin\.woff2["']?\)}, inline_css.content
      %w[--ink .site-header .residence-spine .cinematic-route-snapshot data-physical-scene-svg-overlay].each do |marker|
        assert_includes inline_css.content, marker
      end
      refute_includes inline_css.content, ".cinematic-solutions",
                      "landing CSS must exclude modules absent from the homepage DOM"

      about = document(destination, "about/index.html")
      assert about.at_css('head > link[rel="stylesheet"][href="/assets/css/main.css"]'),
             "non-landing routes must keep the cacheable global stylesheet"
      refute about.at_css("head > style[data-landing-inline-css]"),
             "non-landing routes must not receive landing-only inline CSS"
    end
  end

  def test_initial_dark_shell_precedes_the_full_landing_stylesheet
    build_site do |destination|
      homepage_html = File.read(File.join(destination, "index.html"))
      initial_shell = '<style data-initial-page-shell>html,body{background:#040201}</style>'

      assert_includes homepage_html, initial_shell
      assert_operator homepage_html.index(initial_shell), :<,
                      homepage_html.index('<style data-landing-inline-css>')

      about_html = File.read(File.join(destination, "about", "index.html"))
      assert_includes about_html, initial_shell
    end
  end

  def test_generator_rejects_a_stale_generated_artifact
    original = File.binread(GENERATED_CSS)
    File.binwrite(GENERATED_CSS, "#{original} ")

    _stdout, stderr, status = generate("--check")

    refute_predicate status, :success?
    assert_includes stderr, "landing inline CSS is stale"
  ensure
    File.binwrite(GENERATED_CSS, original) if original
  end

  def test_inline_font_urls_follow_the_deployment_baseurl
    build_site(baseurl: "/preview") do |destination|
      homepage = document(destination, "index.html")
      inline_css = homepage.at_css("head > style[data-landing-inline-css]").content

      assert_match %r{url\(["']?/preview/assets/fonts/manrope-cyrillic\.woff2["']?\)}, inline_css
      assert_match %r{url\(["']?/preview/assets/fonts/manrope-latin\.woff2["']?\)}, inline_css
    end
  end

  def test_homepage_prioritizes_the_initial_scene_while_preserving_desktop_preload
    build_site do |destination|
      homepage = document(destination, "index.html")
      preload = homepage.at_css('head > link[rel="preload"][as="image"]')
      assembled_image = homepage.at_css('[data-cinematic-scene-state="assembled"] picture > img')

      assert_equal "(min-width: 768px)", preload["media"]
      assert_equal "high", preload["fetchpriority"]
      assert_equal "eager", assembled_image["loading"]
      assert_equal "high", assembled_image["fetchpriority"]

      services = document(destination, "services/index.html")
      services_image = services.at_css('[data-cinematic-scene-state="assembled"] picture > img')
      assert_equal "lazy", services_image["loading"]
      assert_nil services_image["fetchpriority"]
    end
  end
end
