#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"
require "yaml"
require_relative "validate_production_assets"

module ProductionAssetManifestGenerator
  module_function

  def render(repository_root)
    assets = Dir.glob(File.join(repository_root, "assets/images/**/*.webp")).sort.map do |absolute_path|
      relative_path = absolute_path.delete_prefix("#{repository_root}/")
      dimensions = ProductionAssetsContract.webp_dimensions(absolute_path)
      metadata = ProductionAssetsContract.canonical_metadata_for(relative_path)
      raise "No canonical production asset metadata for #{relative_path}" unless metadata

      {
        "path" => relative_path,
        "sha256" => Digest::SHA256.file(absolute_path).hexdigest,
        "bytes" => File.size(absolute_path),
        "width" => dimensions.fetch(0),
        "height" => dimensions.fetch(1),
        **metadata
      }
    end

    YAML.dump({ "version" => 1, "assets" => assets })
  end

end

if $PROGRAM_NAME == __FILE__
  repository_root = File.expand_path("..", __dir__)
  print ProductionAssetManifestGenerator.render(repository_root)
end
