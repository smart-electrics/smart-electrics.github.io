#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

module ServiceContract
  module_function

  CANONICAL_SLUGS = %w[
    electrical-design
    electrical-installation
    panels-and-protection
    lighting
    low-voltage
    backup-power
    smart-home-integration
    diagnostics-and-service
  ].freeze
  REQUIRED_SCALARS = %w[title slug kicker description role when_to_involve].freeze
  PLACEHOLDER_TEXT = /готуються до публікації|placeholder|page-note/i

  def front_matter(path)
    source = File.read(path)
    match = source.match(/\A---\s*\n(.*?)\n---\s*\n/m)
    return nil unless match

    parsed = YAML.safe_load(match[1], permitted_classes: [], aliases: false)
    parsed.is_a?(Hash) ? parsed : nil
  rescue Psych::Exception
    nil
  end

  def validate(services_directory)
    documents = Dir.glob(File.join(services_directory, "*.md")).sort
    services = documents.map { |path| [path, front_matter(path)] }
    metadata = services.map(&:last)
    slugs = metadata.filter_map { |service| service&.fetch("slug", nil) }
    orders = metadata.filter_map { |service| service&.fetch("order", nil) }
    routes = documents.map { |path| File.basename(path, ".md") }
    errors = []
    services.each do |path, service|
      unless service
        errors << "#{File.basename(path)}: must contain valid YAML front matter"
        next
      end

      if File.read(path).match?(PLACEHOLDER_TEXT)
        errors << "#{File.basename(path)}: must not contain placeholder text"
      end

      REQUIRED_SCALARS.each do |field|
        value = service[field]
        next if value.is_a?(String) && !value.strip.empty?

        errors << "#{File.basename(path)}: #{field} must be a non-empty scalar"
      end
      unless service["slug"] == File.basename(path, ".md")
        errors << "#{File.basename(path)}: slug must match the filename-derived service route"
      end

      scope = service["scope"]
      unless list_of_non_empty_strings?(scope, 3..5)
        errors << "#{File.basename(path)}: scope must contain 3 to 5 non-empty items"
      end

      inputs = service["inputs"]
      unless list_of_non_empty_strings?(inputs, 2..4)
        errors << "#{File.basename(path)}: inputs must contain 2 to 4 non-empty items"
      end

      related = service["related_services"]
      unless list_of_non_empty_strings?(related, 2..5)
        errors << "#{File.basename(path)}: related_services must contain 2 to 5 non-empty items"
      end
      if related.is_a?(Array) && related.uniq.length != related.length
        errors << "#{File.basename(path)}: related_services must not contain duplicate slugs"
      end
      if related.is_a?(Array) && related.any? { |slug| !slugs.include?(slug) }
        errors << "#{File.basename(path)}: related_services must only reference existing service slugs"
      end
      if related.is_a?(Array) && related.include?(service["slug"])
        errors << "#{File.basename(path)}: related_services must not link to the same service"
      end
    end
    unless slugs.all?(String) && slugs.sort == CANONICAL_SLUGS.sort
      errors << "services must contain exactly the canonical eight service slugs"
    end
    unless routes.sort == CANONICAL_SLUGS.sort
      errors << "services must contain exactly the canonical eight service routes"
    end
    unless orders.all?(Integer) && orders.sort == (1..8).to_a
      errors << "service orders must be the unique sequence 1 through 8"
    end
    errors
  end

  def list_of_non_empty_strings?(value, range)
    value.is_a?(Array) && range.cover?(value.length) && value.all? { |item| item.is_a?(String) && !item.strip.empty? }
  end
end

if $PROGRAM_NAME == __FILE__
  default_directory = File.expand_path("../_services", __dir__)
  services_directory = File.expand_path(ARGV.fetch(0, default_directory))
  errors = ServiceContract.validate(services_directory)

  if errors.any?
    warn errors.join("\n")
    exit 1
  end

  puts "Service collection contract is valid."
end
