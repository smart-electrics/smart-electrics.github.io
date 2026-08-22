# frozen_string_literal: true

require "fileutils"
require "minitest/autorun"
require "tmpdir"
require_relative "../../scripts/validate_integrations"

class IntegrationConfigTest < Minitest::Test
  def with_project(config:, privacy_status: "draft")
    Dir.mktmpdir("smart-electrics-integrations") do |directory|
      File.write(File.join(directory, "_config.yml"), config)
      File.write(File.join(directory, "privacy.md"), "---\nprivacy_status: #{privacy_status}\n---\n")
      yield directory
    end
  end

  def test_disabled_integrations_with_empty_credentials_are_safe
    with_project(config: <<~YAML) do |root|
      contacts:
        email: ""
        phone: ""
      integrations:
        google_analytics:
          enabled: false
          measurement_id: ""
        formspree:
          enabled: false
          endpoint: ""
    YAML
      assert_empty IntegrationConfig.validate(root)
    end
  end

  def test_disabled_integrations_reject_staged_credentials
    with_project(config: <<~YAML) do |root|
      integrations:
        google_analytics:
          enabled: false
          measurement_id: G-ABCDEF12
        formspree:
          enabled: false
          endpoint: https://formspree.io/f/abc123
    YAML
      errors = IntegrationConfig.validate(root)
      assert_includes errors, "GA4: remove measurement_id while the integration is disabled"
      assert_includes errors, "Formspree: remove endpoint while the integration is disabled"
    end
  end

  def test_enabled_integrations_require_contacts_and_final_privacy_copy
    with_project(config: <<~YAML) do |root|
      contacts:
        email: ""
        phone: ""
      integrations:
        google_analytics:
          enabled: true
          measurement_id: invalid
        formspree:
          enabled: true
          endpoint: http://example.com/form
    YAML
      errors = IntegrationConfig.validate(root)
      assert_equal 6, errors.length
    end
  end

  def test_complete_verified_configuration_passes
    with_project(config: <<~YAML, privacy_status: "final") do |root|
      contacts:
        email: hello@example.test
        phone: "+380000000000"
      integrations:
        google_analytics:
          enabled: true
          measurement_id: G-ABCDEF12
        formspree:
          enabled: true
          endpoint: https://formspree.io/f/abc123
    YAML
      assert_empty IntegrationConfig.validate(root)
    end
  end
end
