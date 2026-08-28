#!/usr/bin/env ruby
# frozen_string_literal: true

require "sass-embedded"

ROOT = File.expand_path("..", __dir__)
ENTRYPOINT = File.join(ROOT, "_sass", "_landing-inline.scss")
OUTPUT = File.join(ROOT, "_includes", "generated", "landing-inline.css")
FONT_URLS = {
  "../fonts/manrope-cyrillic.woff2" => "{{ '/assets/fonts/manrope-cyrillic.woff2' | relative_url }}",
  "../fonts/manrope-latin.woff2" => "{{ '/assets/fonts/manrope-latin.woff2' | relative_url }}"
}.freeze

def generated_css
  css = Sass.compile(
    ENTRYPOINT,
    load_paths: [File.join(ROOT, "_sass")],
    style: :compressed,
    source_map: false,
    charset: false
  ).css

  FONT_URLS.each do |source, destination|
    source_url = %(url("#{source}"))
    raise "compiled landing CSS is missing #{source_url}" unless css.include?(source_url)

    css = css.gsub(source_url, %(url("#{destination}")))
  end

  css
end

case ARGV
when []
  css = generated_css
  Dir.mkdir(File.dirname(OUTPUT)) unless Dir.exist?(File.dirname(OUTPUT))
  File.write(OUTPUT, css)
when ["--check"]
  expected = generated_css
  unless File.file?(OUTPUT) && File.binread(OUTPUT) == expected
    warn "landing inline CSS is stale; run bundle exec ruby scripts/generate_landing_inline_css.rb"
    exit 1
  end
else
  warn "usage: bundle exec ruby scripts/generate_landing_inline_css.rb [--check]"
  exit 1
end
