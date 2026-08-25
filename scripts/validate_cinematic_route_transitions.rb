#!/usr/bin/env ruby
# frozen_string_literal: true

module CinematicRouteTransitions
  module_function

  ROOT = File.expand_path("..", __dir__)
  TEMPLATE_FILES = %w[
    _includes/header.html
    _includes/footer.html
    _includes/cinematic-stage.html
    _includes/cinematic-solutions.html
    _includes/service-studio.html
    _layouts/landing.html
    _layouts/service.html
    _layouts/smart-home.html
  ].freeze
  FORBIDDEN_API = /(?:localStorage|sessionStorage|history\.|fetch\(|XMLHttpRequest|autoplay)/
  INERT_CHROME = /(?:button[^>]+(?:disabled|aria-disabled)|role=["']status["']|estimate-status__indicator|header-cta|mobile-nav__cta)/

  def errors
    errors = []
    default = read("_layouts/default.html")
    stylesheet = read("assets/css/main.scss")
    adapter = read("assets/js/cinematic-route-transition.js")
    site_data = read("_data/site.yml")

    errors << "default layout must own exactly one cinematic route root" unless default.scan("data-cinematic-route-root").length == 1
    errors << "default layout must load the one global cinematic route module" unless default.include?("/assets/js/cinematic-route-transition.js")
    errors << "main stylesheet must load the isolated route transition stylesheet" unless stylesheet.include?("cinematic-route-transition")
    errors << "route adapter must avoid storage, history, network, and autoplay APIs" if FORBIDDEN_API.match?(adapter)
    errors << "site data must not retain the removed contact CTA contract" if site_data.include?("contact_cta:") || site_data.include?("estimate_status:")

    TEMPLATE_FILES.each do |file|
      source = read(file)
      errors << "#{file} must not render disabled CTA or availability chrome" if INERT_CHROME.match?(source)
      next unless source.include?("data-cinematic-route")

      anchors = source.scan(/<a\b[^>]*data-cinematic-route[^>]*>/)
      errors << "#{file} must pair each cinematic anchor with a source reference" if anchors.empty? || anchors.any? { |anchor| !anchor.include?("data-cinematic-route-source-ref") }
      errors << "#{file} must declare an explicit cinematic route source" unless source.include?("data-cinematic-route-source")
    end

    errors
  end

  def read(path)
    File.read(File.join(ROOT, path))
  end
end

if $PROGRAM_NAME == __FILE__
  errors = CinematicRouteTransitions.errors
  if errors.any?
    warn errors.join("\n")
    exit 1
  end

  puts "Cinematic route transition contract is safe."
end
