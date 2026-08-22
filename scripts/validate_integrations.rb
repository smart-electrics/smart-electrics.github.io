#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

module IntegrationConfig
  module_function

  GA4_ID = /\AG-[A-Z0-9]{6,}\z/
  FORMSPREE_ENDPOINT = %r{\Ahttps://formspree\.io/f/[A-Za-z0-9]+\z}

  def front_matter(path)
    source = File.read(path)
    match = source.match(/\A---\s*\n(.*?)\n---\s*\n/m)
    raise "#{path} has no YAML front matter" unless match

    YAML.safe_load(match[1], permitted_classes: [], aliases: false) || {}
  end

  def validate(root)
    config = YAML.safe_load_file(File.join(root, "_config.yml"), permitted_classes: [], aliases: false) || {}
    privacy = front_matter(File.join(root, "privacy.md"))
    integrations = config.fetch("integrations", {})
    contacts = config.fetch("contacts", {})
    errors = []

    validate_ga4(integrations.fetch("google_analytics", {}), privacy, errors)
    validate_formspree(integrations.fetch("formspree", {}), contacts, privacy, errors)
    errors
  end

  def validate_ga4(ga4, privacy, errors)
    enabled = ga4["enabled"] == true
    measurement_id = ga4.fetch("measurement_id", "").to_s.strip

    if enabled
      errors << "GA4: measurement_id must look like G-XXXXXXXX" unless GA4_ID.match?(measurement_id)
      errors << "GA4: privacy.md must have privacy_status: final" unless privacy["privacy_status"] == "final"
    elsif !measurement_id.empty?
      errors << "GA4: remove measurement_id while the integration is disabled"
    end
  end

  def validate_formspree(formspree, contacts, privacy, errors)
    enabled = formspree["enabled"] == true
    endpoint = formspree.fetch("endpoint", "").to_s.strip

    if enabled
      errors << "Formspree: endpoint must be a verified https://formspree.io/f/... URL" unless FORMSPREE_ENDPOINT.match?(endpoint)
      errors << "Formspree: contacts.email is required before collecting enquiries" if contacts.fetch("email", "").to_s.strip.empty?
      errors << "Formspree: contacts.phone is required before collecting enquiries" if contacts.fetch("phone", "").to_s.strip.empty?
      errors << "Formspree: privacy.md must have privacy_status: final" unless privacy["privacy_status"] == "final"
    elsif !endpoint.empty?
      errors << "Formspree: remove endpoint while the integration is disabled"
    end
  end
end

if $PROGRAM_NAME == __FILE__
  project_root = File.expand_path("..", __dir__)
  errors = IntegrationConfig.validate(project_root)

  if errors.any?
    warn errors.join("\n")
    exit 1
  end

  puts "Integration configuration is safe."
end
