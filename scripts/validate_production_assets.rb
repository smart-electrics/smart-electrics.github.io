#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"
require "yaml"

module ProductionAssetsContract
  module_function

  EXPECTED_ASSET_COUNT = 120
  EXPECTED_RESPONSIVE_PAIR_COUNT = 60
  ROOT_FIELDS = %w[version assets].freeze
  ASSET_FIELDS = %w[path sha256 bytes width height responsive_pair variant family provenance qa].freeze
  VARIANT_DIMENSIONS = {
    "mobile" => [768, 512],
    "desktop" => [1536, 1024]
  }.freeze
  REQUIRED_SCENE_FAMILIES = %w[panel stairs exterior surveillance audio backup climate shading diagnostics].freeze
  WEBP_PATH = %r{\Aassets/images/.+-(?:768|1536)\.webp\z}.freeze
  SHA256 = /\A[0-9a-f]{64}\z/.freeze
  PROVENANCE = %r{\Adocs/media/generated-assets\.md#[a-z0-9-]+\z}.freeze
  QA_DOCUMENT = %r{\Adocs/media/[a-z0-9-]+-visual-qa\.md\z}.freeze
  SOLUTION_STEM_ANCHORS = {
    "solutions/apartment-comfort" => "apartment-comfort",
    "solutions/private-house" => "private-house",
    "solutions/architectural-lighting" => "architectural-lighting",
    "solutions/energy-autonomy" => "energy-autonomy",
    "solutions/security-access" => "security-access",
    "solutions/commercial-space" => "commercial-space"
  }.freeze
  SOLUTION_STATE_STEMS = SOLUTION_STEM_ANCHORS.keys.flat_map do |stem|
    %w[focus scenario].map { |state| "#{stem}-#{state}" }
  end.freeze
  ROOM_LIGHTING_STATES = %w[off route evening full].freeze
  ROOM_WINDOW_TREATMENTS = %w[open tulle blinds blackout curtains].freeze
  RESIDENCE_ROOM_STEMS = ROOM_LIGHTING_STATES.product(ROOM_WINDOW_TREATMENTS)
                                             .map { |lighting, treatment| "cinematic/residence/room-#{lighting}-#{treatment}" }
                                             .freeze
  RESIDENCE_STAIRS_STEMS = %w[stairs-off stairs-route stairs-full].map { |state| "cinematic/residence/#{state}" }.freeze
  RESIDENCE_EXTERIOR_STEMS = %w[exterior-approach exterior-evening exterior-reduced-night].map { |state| "cinematic/residence/#{state}" }.freeze
  SMART_HOME_SCENARIO_STEMS = %w[shading stairs exterior climate].map { |family| "smart-home/#{family}" }.freeze
  SMART_HOME_ENGINEERING_STEMS = %w[electrical-installation panel backup surveillance audio diagnostics].map { |family| "smart-home/#{family}" }.freeze
  ELECTRICAL_CORE_THREE_STATE_STEMS = %w[
    electrical-design-plan electrical-design-groups electrical-installation-finish panel-intake panel-priorities
  ].map { |family| "smart-home/#{family}" }.freeze

  class WebpDimensionError < StandardError; end

  def validate(manifest_path, repository_root)
    manifest = parse_manifest(manifest_path)
    return ["#{File.basename(manifest_path)}: must contain valid YAML"] unless manifest.is_a?(Hash)

    errors = []
    errors << "production asset manifest: fields must be exactly #{ROOT_FIELDS.join(', ')}" unless manifest.keys.sort == ROOT_FIELDS.sort
    errors << "production asset manifest: version must be 1" unless manifest["version"] == 1

    assets = manifest["assets"]
    unless assets.is_a?(Array)
      errors << "production asset manifest: assets must be a list"
      return errors
    end

    errors << "production asset manifest must record exactly #{EXPECTED_ASSET_COUNT} assets" unless assets.length == EXPECTED_ASSET_COUNT
    validate_assets(errors, assets, repository_root)
    validate_inventory(errors, assets, repository_root)
    validate_pairs(errors, assets)
    validate_families(errors, assets)
    errors
  end

  def parse_manifest(path)
    YAML.safe_load(File.read(path), permitted_classes: [], aliases: false)
  rescue Errno::ENOENT, Psych::Exception
    nil
  end

  def validate_assets(errors, assets, repository_root)
    seen_paths = {}
    assets.each_with_index do |asset, index|
      prefix = asset.is_a?(Hash) ? asset["path"].to_s : "asset #{index + 1}"
      unless asset.is_a?(Hash)
        errors << "asset #{index + 1}: must be a mapping"
        next
      end

      errors << "#{prefix}: fields must be exactly #{ASSET_FIELDS.join(', ')}" unless asset.keys.sort == ASSET_FIELDS.sort
      validate_asset_shape(errors, asset, prefix)
      validate_canonical_metadata(errors, asset, prefix)
      validate_duplicate_path(errors, seen_paths, asset, prefix)
      validate_asset_file(errors, asset, prefix, repository_root)
      validate_documentation(errors, asset, prefix, repository_root)
    end
  end

  def validate_asset_shape(errors, asset, prefix)
    path = asset["path"]
    errors << "#{prefix}: path must be a production assets/images WebP path" unless path.is_a?(String) && path.match?(WEBP_PATH)
    errors << "#{prefix}: SHA-256 must be a lowercase 64-character digest" unless asset["sha256"].is_a?(String) && asset["sha256"].match?(SHA256)
    errors << "#{prefix}: byte size must be a positive integer" unless positive_integer?(asset["bytes"])
    errors << "#{prefix}: decoded dimensions must be positive integers" unless positive_integer?(asset["width"]) && positive_integer?(asset["height"])
    errors << "#{prefix}: responsive_pair must be a non-empty scalar" unless non_empty_string?(asset["responsive_pair"])
    errors << "#{prefix}: variant must be mobile or desktop" unless VARIANT_DIMENSIONS.key?(asset["variant"])
    errors << "#{prefix}: family must be a non-empty scalar" unless non_empty_string?(asset["family"])
    errors << "#{prefix}: provenance must point to generated-assets.md" unless asset["provenance"].is_a?(String) && asset["provenance"].match?(PROVENANCE)
    errors << "#{prefix}: QA must point to an independent visual QA document" unless asset["qa"].is_a?(String) && asset["qa"].match?(QA_DOCUMENT)
  end

  def validate_canonical_metadata(errors, asset, prefix)
    expected = canonical_metadata_for(asset["path"])
    unless expected
      errors << "#{prefix}: path must belong to the canonical production asset registry"
      return
    end

    expected.each do |field, value|
      errors << "#{prefix}: #{field} must match canonical production metadata" unless asset[field] == value
    end
  end

  def canonical_metadata_for(path)
    return nil unless path.is_a?(String) && path.match?(WEBP_PATH)

    stem = path.sub(%r{\Aassets/images/}, "").sub(/-(?:768|1536)\.webp\z/, "")
    metadata = canonical_metadata_for_stem(stem)
    return nil unless metadata

    {
      "responsive_pair" => canonical_responsive_pair(stem),
      "variant" => path.end_with?("-768.webp") ? "mobile" : "desktop",
      **metadata
    }
  end

  def canonical_metadata_for_stem(stem)
    if stem == "home/control-room"
      canonical_documentation("control-room", "control-room-visual-qa.md", "control-room")
    elsif (anchor = SOLUTION_STEM_ANCHORS[stem])
      canonical_documentation(anchor, "ready-solutions-visual-qa.md", "solution-#{File.basename(stem)}")
    elsif SOLUTION_STATE_STEMS.include?(stem)
      family = File.basename(stem).sub(/-(?:focus|scenario)\z/, "")
      canonical_documentation("ready-solutions-state-scenes", "ready-solutions-state-scenes-visual-qa.md", "solution-#{family}")
    elsif RESIDENCE_ROOM_STEMS.include?(stem)
      canonical_documentation("residence-physical-controls", "residence-controls-visual-qa.md", "room")
    elsif RESIDENCE_STAIRS_STEMS.include?(stem)
      canonical_documentation("residence-stairs-and-exterior-physical-controls", "stairs-exterior-controls-visual-qa.md", "stairs")
    elsif RESIDENCE_EXTERIOR_STEMS.include?(stem)
      canonical_documentation("residence-stairs-and-exterior-physical-controls", "stairs-exterior-controls-visual-qa.md", "exterior")
    elsif SMART_HOME_SCENARIO_STEMS.include?(stem)
      canonical_documentation("smart-home-scenario-set", "smart-home-scenes-visual-qa.md", File.basename(stem))
    elsif SMART_HOME_ENGINEERING_STEMS.include?(stem)
      canonical_documentation("cinematic-engineering-scene-set", "smart-home-scenes-visual-qa.md", File.basename(stem))
    elsif ELECTRICAL_CORE_THREE_STATE_STEMS.include?(stem)
      canonical_documentation("electrical-core-three-state-scenes", "electrical-core-three-state-visual-qa.md", File.basename(stem))
    end
  end

  def canonical_responsive_pair(stem)
    return "control-room" if stem == "home/control-room"
    return "solution-#{File.basename(stem)}" if SOLUTION_STEM_ANCHORS.key?(stem)
    return "solution-#{File.basename(stem)}" if SOLUTION_STATE_STEMS.include?(stem)
    return "smart-home-#{File.basename(stem)}" if SMART_HOME_SCENARIO_STEMS.include?(stem) || SMART_HOME_ENGINEERING_STEMS.include?(stem) || ELECTRICAL_CORE_THREE_STATE_STEMS.include?(stem)

    "residence-#{File.basename(stem)}"
  end

  def canonical_documentation(anchor, qa, family)
    {
      "family" => family,
      "provenance" => "docs/media/generated-assets.md##{anchor}",
      "qa" => "docs/media/#{qa}"
    }
  end

  def validate_duplicate_path(errors, seen_paths, asset, prefix)
    path = asset["path"]
    return unless path.is_a?(String)

    errors << "#{path}: manifest path must be unique" if seen_paths.key?(path)
    seen_paths[path] = true
  end

  def validate_asset_file(errors, asset, prefix, repository_root)
    path = asset["path"]
    return unless path.is_a?(String) && path.match?(WEBP_PATH)

    absolute_path = repository_path(repository_root, path)
    unless absolute_path && File.file?(absolute_path)
      errors << "#{prefix}: checked-in production WebP must exist"
      return
    end

    validate_file_bytes(errors, asset, prefix, absolute_path)
    validate_file_dimensions(errors, asset, prefix, absolute_path)
    validate_variant_dimensions(errors, asset, prefix)
  end

  def validate_file_bytes(errors, asset, prefix, absolute_path)
    bytes = File.size(absolute_path)
    sha256 = Digest::SHA256.file(absolute_path).hexdigest
    errors << "#{prefix}: byte size does not match the checked-in manifest" if asset["bytes"] != bytes
    errors << "#{prefix}: SHA-256 does not match the checked-in manifest" if asset["sha256"] != sha256
  end

  def validate_file_dimensions(errors, asset, prefix, absolute_path)
    dimensions = webp_dimensions(absolute_path)
    expected = [asset["width"], asset["height"]]
    errors << "#{prefix}: decoded dimensions do not match the checked-in manifest" unless dimensions == expected
  rescue WebpDimensionError => error
    errors << "#{prefix}: cannot decode WebP dimensions (#{error.message})"
  end

  def validate_variant_dimensions(errors, asset, prefix)
    expected = VARIANT_DIMENSIONS[asset["variant"]]
    return unless expected

    actual = [asset["width"], asset["height"]]
    errors << "#{prefix}: variant dimensions must be #{expected.join('×')}" unless actual == expected
  end

  def validate_documentation(errors, asset, prefix, repository_root)
    provenance = asset["provenance"]
    qa = asset["qa"]
    provenance_document, anchor = provenance.to_s.split("#", 2)
    provenance_path = repository_path(repository_root, provenance_document)
    qa_path = repository_path(repository_root, qa)

    errors << "#{prefix}: provenance document must exist" unless provenance_path && File.file?(provenance_path) && markdown_anchor?(provenance_path, anchor)
    errors << "#{prefix}: independent visual QA document must exist" unless qa_path && File.file?(qa_path)
  end

  def validate_inventory(errors, assets, repository_root)
    manifest_paths = assets.filter_map { |asset| asset["path"] if asset.is_a?(Hash) && asset["path"].is_a?(String) }.uniq.sort
    inventory = Dir.glob(File.join(repository_root, "assets/images/**/*.webp"))
                   .select { |path| File.file?(path) }
                   .map { |path| path.delete_prefix("#{repository_root}/") }
                   .sort

    (inventory - manifest_paths).each { |path| errors << "#{path}: production WebP is not recorded in the manifest" }
    (manifest_paths - inventory).each { |path| errors << "#{path}: manifest entry does not exist in the production inventory" }
    errors << "production asset manifest paths must be in canonical lexical order" unless manifest_paths == assets.filter_map { |asset| asset["path"] if asset.is_a?(Hash) }
  end

  def validate_pairs(errors, assets)
    pairs = assets.group_by { |asset| asset["responsive_pair"] if asset.is_a?(Hash) }
    errors << "production asset manifest must contain exactly #{EXPECTED_RESPONSIVE_PAIR_COUNT} responsive pairs" unless pairs.length == EXPECTED_RESPONSIVE_PAIR_COUNT

    pairs.each do |pair, pair_assets|
      next unless non_empty_string?(pair)

      variants = pair_assets.map { |asset| asset["variant"] }
      errors << "responsive pair #{pair}: must contain exactly one mobile and one desktop asset" unless variants.sort == %w[desktop mobile]
    end
  end

  def validate_families(errors, assets)
    families = assets.filter_map { |asset| asset["family"] if asset.is_a?(Hash) }
    REQUIRED_SCENE_FAMILIES.each do |family|
      errors << "production asset manifest must include the #{family} scene family" unless families.include?(family)
    end
  end

  def webp_dimensions(path)
    bytes = File.binread(path)
    raise WebpDimensionError, "missing RIFF/WebP container header" unless bytes.bytesize >= 12 && bytes.byteslice(0, 4) == "RIFF" && bytes.byteslice(8, 4) == "WEBP"

    declared_size = bytes.byteslice(4, 4).unpack1("V")
    raise WebpDimensionError, "RIFF container length does not match the file" unless declared_size + 8 == bytes.bytesize

    fallback_dimensions = nil
    offset = 12
    while offset < bytes.bytesize
      raise WebpDimensionError, "truncated WebP chunk header" if offset + 8 > bytes.bytesize

      type = bytes.byteslice(offset, 4)
      payload_size = bytes.byteslice(offset + 4, 4).unpack1("V")
      payload_offset = offset + 8
      payload_end = payload_offset + payload_size
      raise WebpDimensionError, "truncated #{type} chunk" if payload_end > bytes.bytesize

      payload = bytes.byteslice(payload_offset, payload_size)
      return vp8x_dimensions(payload) if type == "VP8X"
      fallback_dimensions ||= vp8_dimensions(payload) if type == "VP8 "
      fallback_dimensions ||= vp8l_dimensions(payload) if type == "VP8L"

      offset = payload_end + (payload_size.odd? ? 1 : 0)
    end

    return fallback_dimensions if fallback_dimensions

    raise WebpDimensionError, "missing VP8, VP8L, or VP8X image chunk"
  end

  def vp8_dimensions(payload)
    raise WebpDimensionError, "truncated VP8 frame header" unless payload.bytesize >= 10
    raise WebpDimensionError, "invalid VP8 key-frame start code" unless payload.byteslice(3, 3) == "\x9d\x01\x2a".b

    [payload.byteslice(6, 2).unpack1("v") & 0x3fff, payload.byteslice(8, 2).unpack1("v") & 0x3fff]
  end

  def vp8l_dimensions(payload)
    raise WebpDimensionError, "truncated VP8L header" unless payload.bytesize >= 5
    raise WebpDimensionError, "invalid VP8L signature" unless payload.getbyte(0) == 0x2f

    bits = payload.byteslice(1, 4).unpack1("V")
    [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]
  end

  def vp8x_dimensions(payload)
    raise WebpDimensionError, "truncated VP8X header" unless payload.bytesize >= 10

    [uint24(payload, 4) + 1, uint24(payload, 7) + 1]
  end

  def uint24(bytes, offset)
    bytes.getbyte(offset) | (bytes.getbyte(offset + 1) << 8) | (bytes.getbyte(offset + 2) << 16)
  end

  def markdown_anchor?(path, anchor)
    return false unless non_empty_string?(anchor)

    File.foreach(path).any? do |line|
      heading = line[/\A#+\s+(.+?)\s*\z/, 1]
      heading && markdown_slug(heading) == anchor
    end
  rescue Errno::ENOENT
    false
  end

  def markdown_slug(value)
    value.downcase.gsub(/[^a-z0-9\s-]/, "").strip.gsub(/[\s-]+/, "-")
  end

  def repository_path(repository_root, relative_path)
    return nil unless relative_path.is_a?(String) && !relative_path.empty?

    absolute_path = File.expand_path(relative_path, repository_root)
    root = File.expand_path(repository_root)
    return nil unless absolute_path.start_with?("#{root}/")

    absolute_path
  end

  def positive_integer?(value)
    value.is_a?(Integer) && value.positive?
  end

  def non_empty_string?(value)
    value.is_a?(String) && !value.strip.empty?
  end
end

if $PROGRAM_NAME == __FILE__
  default_repository_root = File.expand_path("..", __dir__)
  manifest_path = File.expand_path(ARGV.fetch(0, File.join(default_repository_root, "_data/production_assets.yml")))
  repository_root = File.expand_path(ARGV.fetch(1, default_repository_root))
  errors = ProductionAssetsContract.validate(manifest_path, repository_root)

  if errors.any?
    warn errors.join("\n")
    exit 1
  end

  puts "Production asset manifest is valid for #{ProductionAssetsContract::EXPECTED_ASSET_COUNT} WebP files."
end
