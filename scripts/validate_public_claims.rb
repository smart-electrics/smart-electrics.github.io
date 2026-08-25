#!/usr/bin/env ruby
# frozen_string_literal: true

require "cgi"
require "nokogiri"

module PublicClaims
  module_function

  ROOT = File.expand_path("..", __dir__)
  SOURCE_GLOBS = %w[
    _services/**/*.md
    _solutions/**/*.md
    _data/**/*.yml
    _includes/**/*.html
    _includes/**/*.liquid
    _layouts/**/*.html
    _layouts/**/*.liquid
  ].freeze
  INVISIBLE_ELEMENTS = "script, style, template"
  PUBLIC_COPY_ATTRIBUTES = %w[
    alt
    aria-label
    aria-description
    aria-valuetext
    aria-roledescription
    title
    placeholder
  ].freeze
  LIQUID_OUTPUT = /\{[{%].*?[}%]\}/m
  NEGATIVE_DISCLOSURE_ITEM = [
    "телеметр[\\p{L}\\p{N}]*",
    "(?:live|онлайн)[\\s-]*(?:статус|status)(?:\\s+(?:систем[\\p{L}\\p{N}]*|об[’']?єкт[\\p{L}\\p{N}]*|інженер[\\p{L}\\p{N}]*))?",
    "(?:поточн[\\p{L}\\p{N}]*|актуальн[\\p{L}\\p{N}]*|реальн[\\p{L}\\p{N}]*(?:\\s+час[\\p{L}\\p{N}]*)?)\\s+(?:стан|статус|показник[\\p{L}\\p{N}]*)\\s+(?:систем[\\p{L}\\p{N}]*|об[’']?єкт[\\p{L}\\p{N}]*|інженер[\\p{L}\\p{N}]*)",
    "(?:статус|показник[\\p{L}\\p{N}]*)\\s+(?:систем[\\p{L}\\p{N}]*|об[’']?єкт[\\p{L}\\p{N}]*|інженер[\\p{L}\\p{N}]*)",
    "(?:портал[\\p{L}\\p{N}]*|особист[\\p{L}\\p{N}]*\\s+кабінет[\\p{L}\\p{N}]*|кабінет[\\p{L}\\p{N}]*\\s+(?:клієнт[\\p{L}\\p{N}]*|користувач[\\p{L}\\p{N}]*)|account[\\p{L}\\p{N}]*|dashboard[\\p{L}\\p{N}]*)",
    "(?:віддален[\\p{L}\\p{N}]*|дистанційн[\\p{L}\\p{N}]*)\\s+(?:керуван[\\p{L}\\p{N}]*|контрол[\\p{L}\\p{N}]*)(?:\\s+точк[\\p{L}\\p{N}]*\\s+вход[\\p{L}\\p{N}]*)?",
    "(?:knx|loxone|control4|crestron|zigbee|z-wave|matter|homekit|alexa|google\\s+home|philips\\s+hue)",
    "(?:сумісн[\\p{L}\\p{N}]*|підтрим[\\p{L}\\p{N}]*)\\s+(?:з|із)\\s+(?:(?:конкретн[\\p{L}\\p{N}]*\\s+)?(?:виробник[\\p{L}\\p{N}]*|бренд[\\p{L}\\p{N}]*|платформ[\\p{L}\\p{N}]*|протокол[\\p{L}\\p{N}]*|систем[\\p{L}\\p{N}]*))",
    "(?:compatible|compatibility)\\s+(?:with|vendor|protocol)",
    "(?:цін[\\p{L}\\p{N}]*|вартіст[\\p{L}\\p{N}]*|кошту[\\p{L}\\p{N}]*|бюджет[\\p{L}\\p{N}]*|кошторис[\\p{L}\\p{N}]*)",
    "(?:гаранті[\\p{L}\\p{N}]*|гаранту[\\p{L}\\p{N}]*)",
    "(?:сертифік[\\p{L}\\p{N}]*|certified)(?:\\s+(?:рішенн[\\p{L}\\p{N}]*|систем[\\p{L}\\p{N}]*|продукт[\\p{L}\\p{N}]*|об[’']?єкт[\\p{L}\\p{N}]*))?",
    "(?:відгук[\\p{L}\\p{N}]*|рейтинг[\\p{L}\\p{N}]*|testimonial[\\p{L}\\p{N}]*|review[\\p{L}\\p{N}]*)",
    "(?:клієнтськ[\\p{L}\\p{N}]*\\s+)?(?:кейс|проєкт|об[’']?єкт)\\s+(?:реалізован[\\p{L}\\p{N}]*|виконан[\\p{L}\\p{N}]*|завершен[\\p{L}\\p{N}]*|встановлен[\\p{L}\\p{N}]*|змонтован[\\p{L}\\p{N}]*)",
    "(?:реалізован[\\p{L}\\p{N}]*|виконан[\\p{L}\\p{N}]*|завершен[\\p{L}\\p{N}]*|встановлен[\\p{L}\\p{N}]*|змонтован[\\p{L}\\p{N}]*)\\s+(?:клієнтськ[\\p{L}\\p{N}]*\\s+)?(?:кейс|проєкт|об[’']?єкт|систем[\\p{L}\\p{N}]*|рішенн[\\p{L}\\p{N}]*)",
    "(?:кейс|case)\\s+(?:клієнт[\\p{L}\\p{N}]*|об[’']?єкт[\\p{L}\\p{N}]*)",
    "(?:клієнт[\\p{L}\\p{N}]*|власник[\\p{L}\\p{N}]*)\\s+(?:отримав[\\p{L}\\p{N}]*|отримала[\\p{L}\\p{N}]*|підтверд[\\p{L}\\p{N}]*)\\s+(?:результат[\\p{L}\\p{N}]*|рішенн[\\p{L}\\p{N}]*)"
  ].then { |patterns| "(?:#{patterns.join('|')})" }.freeze
  NEGATIVE_DISCLOSURE_TERMINATOR = "(?=(?:\\s*[.!?])?\\s*\\z|\\s+(?:і|та|або|чи)\\s+(?:не\\b|без\\b))".freeze
  TRUTHFUL_NEGATIVE_DISCLOSURE_SPANS = [
    /\bне\s+публіку[\p{L}\p{N}]*\s+(?:тут\s+)?підтверджен[\p{L}\p{N}]*\s+кейс[\p{L}\p{N}]*\s+(?:чи|або|та|і)\s+матеріал[\p{L}\p{N}]*\s+про\s+виконан[\p{L}\p{N}]*\s+об[’']?єкт[\p{L}\p{N}]*#{NEGATIVE_DISCLOSURE_TERMINATOR}/iu,
    /\bне\s+(?:є\s+)?(?:підтверджен[\p{L}\p{N}]*|документальн[\p{L}\p{N}]*|реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)\s+(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт)[\p{L}\p{N}]*#{NEGATIVE_DISCLOSURE_TERMINATOR}/iu,
    /\bне\s+публіку[\p{L}\p{N}]*\s+цін[\p{L}\p{N}]*,\s*гаранті[\p{L}\p{N}]*,\s*сертифік[\p{L}\p{N}]*,\s*відгук[\p{L}\p{N}]*,\s*телеметр[\p{L}\p{N}]*,\s*портал[\p{L}\p{N}]*\s+чи\s+тверджен[\p{L}\p{N}]*\s+про\s+сумісн[\p{L}\p{N}]*\s+із\s+конкретн[\p{L}\p{N}]*\s+виробник[\p{L}\p{N}]*#{NEGATIVE_DISCLOSURE_TERMINATOR}/iu,
    /\bне\s+публіку[\p{L}\p{N}]*\s+цін[\p{L}\p{N}]*,\s*гаранті[\p{L}\p{N}]*,\s*сертифік[\p{L}\p{N}]*\s+(?:та|і)\s+відгук[\p{L}\p{N}]*#{NEGATIVE_DISCLOSURE_TERMINATOR}/iu,
    /\bне\s+гаранту[\p{L}\p{N}]*(?:\s+(?:жодн[\p{L}\p{N}]*\s+)?(?:результат[\p{L}\p{N}]*|гаранті[\p{L}\p{N}]*))?\b#{NEGATIVE_DISCLOSURE_TERMINATOR}/iu,
    /\bне\s+(?:публіку[\p{L}\p{N}]*|ма[єе]мо|нада[\p{L}\p{N}]*|пропону[\p{L}\p{N}]*|підтрим[\p{L}\p{N}]*|заявля[\p{L}\p{N}]*|гаранту[\p{L}\p{N}]*)\s+#{NEGATIVE_DISCLOSURE_ITEM}\b#{NEGATIVE_DISCLOSURE_TERMINATOR}/iu,
    /\bбез\s+(?:підтверджен[\p{L}\p{N}]*|#{NEGATIVE_DISCLOSURE_ITEM})\b#{NEGATIVE_DISCLOSURE_TERMINATOR}/iu
  ].freeze
  CLAIM_PATTERNS = {
    "telemetry/status" => [
      /\bтелеметр[\p{L}\p{N}]*\b/iu,
      /\b(?:live|онлайн)[\s-]*(?:статус|status)\b/iu,
      /\b(?:поточн[\p{L}\p{N}]*|актуальн[\p{L}\p{N}]*|реальн[\p{L}\p{N}]*(?:\s+час[\p{L}\p{N}]*)?)\s+(?:стан|статус|показник[\p{L}\p{N}]*)\s+(?:систем[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*|інженер[\p{L}\p{N}]*)\b/iu,
      /\b(?:статус|показник[\p{L}\p{N}]*)\s+(?:систем[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*|інженер[\p{L}\p{N}]*)\b/iu
    ].freeze,
    "portal/account/control" => [
      /\b(?:портал[\p{L}\p{N}]*|особист[\p{L}\p{N}]*\s+кабінет[\p{L}\p{N}]*|кабінет[\p{L}\p{N}]*\s+(?:клієнт[\p{L}\p{N}]*|користувач[\p{L}\p{N}]*)|account[\p{L}\p{N}]*|dashboard[\p{L}\p{N}]*)\b/iu,
      /\b(?:віддален[\p{L}\p{N}]*|дистанційн[\p{L}\p{N}]*)\s+(?:керуван[\p{L}\p{N}]*|контрол[\p{L}\p{N}]*)\b/iu
    ].freeze,
    "vendor compatibility" => [
      /\b(?:knx|loxone|control4|crestron|zigbee|z-wave|matter|homekit|alexa|google\s+home|philips\s+hue)\b/iu,
      /\b(?:сумісн[\p{L}\p{N}]*|підтрим[\p{L}\p{N}]*)\s+(?:з|із)\s+(?:(?:конкретн[\p{L}\p{N}]*\s+)?(?:виробник[\p{L}\p{N}]*|бренд[\p{L}\p{N}]*|платформ[\p{L}\p{N}]*|протокол[\p{L}\p{N}]*|систем[\p{L}\p{N}]*))\b/iu,
      /\b(?:compatible|compatibility)\s+(?:with|vendor|protocol)\b/iu
    ].freeze,
    "price" => [
      /\b(?:ціна|вартіст[\p{L}\p{N}]*|кошту[\p{L}\p{N}]*|бюджет[\p{L}\p{N}]*|кошторис[\p{L}\p{N}]*)\b/iu,
      /[₴€]/u,
      /\bгрн\b/iu,
      /\$\s*\d/u
    ].freeze,
    "guarantee" => [/\b(?:гаранті[\p{L}\p{N}]*|гаранту[\p{L}\p{N}]*)\b/iu].freeze,
    "certificate" => [/\b(?:сертифік[\p{L}\p{N}]*|certified)\b/iu].freeze,
    "review" => [/\b(?:відгук[\p{L}\p{N}]*|рейтинг[\p{L}\p{N}]*|testimonial[\p{L}\p{N}]*|review[\p{L}\p{N}]*)\b/iu].freeze,
    "client project as fact" => [
      /\b(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт)\s+(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)\b/iu,
      /\b(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)\s+(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт|систем[\p{L}\p{N}]*|рішенн[\p{L}\p{N}]*)\b/iu,
      /\b(?:кейс|case)\s+(?:клієнт[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*)\b/iu,
      /\b(?:клієнт[\p{L}\p{N}]*|власник[\p{L}\p{N}]*)\s+(?:отримав[\p{L}\p{N}]*|отримала[\p{L}\p{N}]*|підтверд[\p{L}\p{N}]*)\s+(?:результат[\p{L}\p{N}]*|рішенн[\p{L}\p{N}]*)\b/iu
    ].freeze
  }.freeze

  def errors_for(source_root: ROOT, site_root: File.join(source_root, "_site"))
    errors = []
    source_root = File.expand_path(source_root)
    site_root = File.expand_path(site_root)
    errors.concat(scan_surface("source", source_root, public_source_files(source_root)))

    if !Dir.exist?(site_root)
      errors << "built public copy is unavailable: #{site_root}"
    else
      built_files = Dir.glob(File.join(site_root, "**", "*.html")).select { |path| File.file?(path) }.sort
      if built_files.empty?
        errors << "built public copy is unavailable: #{site_root} contains no HTML files"
      else
        errors.concat(scan_surface("built", site_root, built_files))
      end
    end
    errors
  end

  def public_source_files(root)
    return [] unless Dir.exist?(root)

    root_pages = Dir.glob(File.join(root, "*.{md,html}")).select { |path| public_page_source?(path) }
    (root_pages + SOURCE_GLOBS.flat_map { |glob| Dir.glob(File.join(root, glob)) })
                .select { |path| File.file?(path) }
                .uniq
                .sort
  end

  def public_page_source?(path)
    File.open(path, "rb", &:gets) == "---\n"
  rescue Errno::EACCES, Errno::ENOENT
    false
  end

  def scan_surface(surface, root, files)
    errors = []
    if files.empty?
      return ["#{surface} public copy is unavailable: #{root}"]
    end

    files.each do |path|
      document = File.binread(path).force_encoding(Encoding::UTF_8)
      unless document.valid_encoding?
        errors << "#{surface}:#{relative_path(path, root)}: copy must be valid UTF-8"
        next
      end

      visible_fragments(document).each do |fragment|
        claimable = mask_truthful_negative_spans(fragment)

        claim_categories(claimable).each do |category|
          errors << "#{surface}:#{relative_path(path, root)}: #{category}"
        end
      end
    rescue Errno::EACCES, Errno::ENOENT => error
      errors << "#{surface}:#{relative_path(path, root)}: #{error.message}"
    end
    errors.uniq
  end

  def visible_fragments(document)
    fragment = Nokogiri::HTML5.fragment(document)
    fragment.css(INVISIBLE_ELEMENTS).remove
    text = (fragment.xpath(".//text()").map(&:text) +
            fragment.xpath(".//*").flat_map do |node|
              PUBLIC_COPY_ATTRIBUTES.filter_map { |attribute| node[attribute] }
            end)
           .join(" ")
           .gsub(LIQUID_OUTPUT, " ")
    CGI.unescapeHTML(text)
       .gsub(/\r?\n/, " ")
       .split(/(?<=[.!?])\s+/u)
       .map { |fragment| fragment.gsub(/\s+/, " ").strip }
       .reject(&:empty?)
  end

  def mask_truthful_negative_spans(fragment)
    TRUTHFUL_NEGATIVE_DISCLOSURE_SPANS.reduce(fragment) do |claimable, pattern|
      claimable.gsub(pattern, " ")
    end
  end

  def claim_categories(fragment)
    CLAIM_PATTERNS.filter_map do |category, patterns|
      category if patterns.any? { |pattern| pattern.match?(fragment) }
    end
  end

  def relative_path(path, root)
    path.delete_prefix("#{root}/")
  end
end

if $PROGRAM_NAME == __FILE__
  source_root = File.expand_path(ARGV.fetch(0, PublicClaims::ROOT))
  site_root = File.expand_path(ARGV.fetch(1, File.join(source_root, "_site")))
  errors = PublicClaims.errors_for(source_root:, site_root:)
  abort(errors.join("\n")) unless errors.empty?

  puts "Public claims are grounded in source and built visible copy."
end
