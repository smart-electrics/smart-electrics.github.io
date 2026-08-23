#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"
require_relative "validate_services"

module SolutionContract
  module_function

  CANONICAL_SLUGS = %w[
    apartment-comfort-and-control
    private-house-full-automation
    architectural-lighting
    energy-autonomy
    security-and-access-control
    commercial-space
  ].freeze
  REQUIRED_SCALARS = %w[
    title slug kicker description audience focus
    image_768 image_1536 image_alt image_focus
  ].freeze
  SCENARIO_SCALARS = %w[title trigger response benefit].freeze
  PLACEHOLDER_TEXT = /гот(?:ую|ує)ться до публікації|placeholder|page-note|lorem ipsum|coming soon/i

  def front_matter(path)
    source = File.read(path)
    match = source.match(/\A---\s*\n(.*?)\n---\s*\n/m)
    return nil unless match

    parsed = YAML.safe_load(match[1], permitted_classes: [], aliases: false)
    parsed.is_a?(Hash) ? parsed : nil
  rescue Psych::Exception
    nil
  end

  def validate(solutions_directory, repository_root)
    documents = Dir.glob(File.join(solutions_directory, "*.md")).sort
    solutions = documents.map { |path| [path, front_matter(path)] }
    metadata = solutions.map(&:last)
    slugs = metadata.filter_map { |solution| solution&.fetch("slug", nil) }
    orders = metadata.filter_map { |solution| solution&.fetch("order", nil) }
    routes = documents.map { |path| File.basename(path, ".md") }
    errors = []

    solutions.each do |path, solution|
      filename = File.basename(path)
      unless solution
        errors << "#{filename}: must contain valid YAML front matter"
        next
      end

      if File.read(path).match?(PLACEHOLDER_TEXT)
        errors << "#{filename}: must not contain placeholder text"
      end

      REQUIRED_SCALARS.each do |field|
        value = solution[field]
        next if value.is_a?(String) && !value.strip.empty?

        errors << "#{filename}: #{field} must be a non-empty scalar"
      end

      unless solution["slug"] == File.basename(path, ".md")
        errors << "#{filename}: slug must match the filename-derived solution route"
      end

      validate_image_path(errors, filename, "image_768", solution["image_768"], repository_root)
      validate_image_path(errors, filename, "image_1536", solution["image_1536"], repository_root)

      validate_string_list(errors, filename, "systems", solution["systems"], 3..5)
      validate_string_list(errors, filename, "inputs", solution["inputs"], 3..5)
      validate_scenarios(errors, filename, solution["scenarios"])
      validate_related_services(errors, filename, solution["related_services"])
      validate_related_solutions(errors, filename, solution["slug"], solution["related_solutions"], slugs)
    end

    unless slugs.all?(String) && slugs.sort == CANONICAL_SLUGS.sort
      errors << "solutions must contain exactly the canonical six solution slugs"
    end
    unless routes.sort == CANONICAL_SLUGS.sort
      errors << "solutions must contain exactly the canonical six solution routes"
    end
    unless orders.all?(Integer) && orders.sort == (1..6).to_a
      errors << "solution orders must be the unique sequence 1 through 6"
    end

    errors
  end

  def validate_image_path(errors, filename, field, value, repository_root)
    return unless value.is_a?(String) && !value.strip.empty?

    relative_path = value.delete_prefix("/")
    root = File.expand_path(repository_root)
    resolved_path = File.expand_path(relative_path, root)
    unless resolved_path.start_with?("#{root}/") && File.file?(resolved_path)
      errors << "#{filename}: #{field} must reference an existing local image file"
    end
  end

  def validate_string_list(errors, filename, field, value, range)
    return if list_of_non_empty_strings?(value, range)

    errors << "#{filename}: #{field} must contain #{range.begin} to #{range.end} non-empty items"
  end

  def validate_scenarios(errors, filename, scenarios)
    unless scenarios.is_a?(Array) && (2..4).cover?(scenarios.length)
      errors << "#{filename}: scenarios must contain 2 to 4 items"
      return
    end

    scenarios.each_with_index do |scenario, index|
      unless scenario.is_a?(Hash)
        errors << "#{filename}: scenario #{index + 1} must be a mapping"
        next
      end

      SCENARIO_SCALARS.each do |field|
        value = scenario[field]
        next if value.is_a?(String) && !value.strip.empty?

        errors << "#{filename}: scenario #{index + 1} #{field} must be a non-empty scalar"
      end
    end
  end

  def validate_related_services(errors, filename, related_services)
    validate_string_list(errors, filename, "related_services", related_services, 3..6)
    return unless related_services.is_a?(Array)

    if related_services.uniq.length != related_services.length
      errors << "#{filename}: related_services must not contain duplicate slugs"
    end
    if related_services.any? { |slug| !ServiceContract::CANONICAL_SLUGS.include?(slug) }
      errors << "#{filename}: related_services must only reference existing service slugs"
    end
  end

  def validate_related_solutions(errors, filename, slug, related_solutions, solution_slugs)
    validate_string_list(errors, filename, "related_solutions", related_solutions, 2..3)
    return unless related_solutions.is_a?(Array)

    if related_solutions.uniq.length != related_solutions.length
      errors << "#{filename}: related_solutions must not contain duplicate slugs"
    end
    if related_solutions.any? { |related_slug| !solution_slugs.include?(related_slug) }
      errors << "#{filename}: related_solutions must only reference existing solution slugs"
    end
    if related_solutions.include?(slug)
      errors << "#{filename}: related_solutions must not link to the same solution"
    end
  end

  def list_of_non_empty_strings?(value, range)
    value.is_a?(Array) && range.cover?(value.length) && value.all? { |item| item.is_a?(String) && !item.strip.empty? }
  end
end

if $PROGRAM_NAME == __FILE__
  default_solutions = File.expand_path("../_solutions", __dir__)
  default_repository_root = File.expand_path("..", __dir__)
  solutions_directory = File.expand_path(ARGV.fetch(0, default_solutions))
  repository_root = File.expand_path(ARGV.fetch(1, default_repository_root))
  errors = SolutionContract.validate(solutions_directory, repository_root)

  if errors.any?
    warn errors.join("\n")
    exit 1
  end

  puts "Solution collection contract is valid."
end
