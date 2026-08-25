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
      metadata = metadata_for(relative_path)

      {
        "path" => relative_path,
        "sha256" => Digest::SHA256.file(absolute_path).hexdigest,
        "bytes" => File.size(absolute_path),
        "width" => dimensions.fetch(0),
        "height" => dimensions.fetch(1),
        "responsive_pair" => responsive_pair(relative_path),
        "variant" => variant(relative_path),
        **metadata
      }
    end

    YAML.dump({ "version" => 1, "assets" => assets })
  end

  def responsive_pair(path)
    relative = path.sub(%r{\Aassets/images/}, "").sub(/-(?:768|1536)\.webp\z/, "")
    return "control-room" if relative == "home/control-room"
    return "solution-#{File.basename(relative)}" if relative.start_with?("solutions/")
    return "smart-home-#{File.basename(relative)}" if relative.start_with?("smart-home/")

    "residence-#{File.basename(relative)}"
  end

  def variant(path)
    path.end_with?("-768.webp") ? "mobile" : "desktop"
  end

  def metadata_for(path)
    relative = path.sub(%r{\Aassets/images/}, "")
    case relative
    when %r{\Ahome/}
      documentation("control-room", "control-room-visual-qa.md", "control-room")
    when %r{\Asolutions/}
      solution_metadata(relative)
    when %r{\Acinematic/residence/room-}
      documentation("residence-physical-controls", "residence-controls-visual-qa.md", "room")
    when %r{\Acinematic/residence/stairs-}
      documentation("residence-stairs-and-exterior-physical-controls", "stairs-exterior-controls-visual-qa.md", "stairs")
    when %r{\Acinematic/residence/exterior-}
      documentation("residence-stairs-and-exterior-physical-controls", "stairs-exterior-controls-visual-qa.md", "exterior")
    when %r{\Asmart-home/}
      smart_home_metadata(relative)
    else
      raise "No production asset metadata rule for #{path}"
    end
  end

  def solution_metadata(relative)
    stem = File.basename(relative).sub(/-(?:768|1536)\.webp\z/, "")
    anchors = {
      "apartment-comfort" => "apartment-comfort",
      "private-house" => "private-house",
      "architectural-lighting" => "architectural-lighting",
      "energy-autonomy" => "energy-autonomy",
      "security-access" => "security-access",
      "commercial-space" => "commercial-space"
    }
    documentation(anchors.fetch(stem), "ready-solutions-visual-qa.md", "solution-#{stem}")
  end

  def smart_home_metadata(relative)
    stem = File.basename(relative).sub(/-(?:768|1536)\.webp\z/, "")
    anchor = %w[shading stairs exterior climate].include?(stem) ? "smart-home-scenario-set" : "cinematic-engineering-scene-set"
    documentation(anchor, "smart-home-scenes-visual-qa.md", stem)
  end

  def documentation(anchor, qa, family)
    {
      "family" => family,
      "provenance" => "docs/media/generated-assets.md##{anchor}",
      "qa" => "docs/media/#{qa}"
    }
  end
end

if $PROGRAM_NAME == __FILE__
  repository_root = File.expand_path("..", __dir__)
  print ProductionAssetManifestGenerator.render(repository_root)
end
