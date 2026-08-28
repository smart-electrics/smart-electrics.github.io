# frozen_string_literal: true

require "digest"
require "minitest/autorun"
require "open3"
require "tmpdir"
require "yaml"

require_relative "../../scripts/validate_production_assets"

class ProductionAssetsContractTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  MANIFEST = File.join(ROOT, "_data", "production_assets.yml")

  def validate(manifest_path = MANIFEST, repository_root = ROOT)
    Open3.capture3(
      "bundle", "exec", "ruby", "scripts/validate_production_assets.rb", manifest_path, repository_root,
      chdir: ROOT
    )
  end

  def canonical_manifest
    YAML.safe_load(File.read(MANIFEST), permitted_classes: [], aliases: false)
  end

  def with_manifest(data)
    Dir.mktmpdir("smart-electrics-production-assets") do |directory|
      path = File.join(directory, "production_assets.yml")
      File.write(path, YAML.dump(data))
      yield path
    end
  end

  def assert_rejected(data, expected_error)
    with_manifest(data) do |path|
      _stdout, stderr, status = validate(path)

      refute_predicate status, :success?
      assert_includes stderr, expected_error
    end
  end

  def test_accepts_the_complete_checked_in_production_inventory
    _stdout, stderr, status = validate
    manifest = canonical_manifest

    assert_predicate status, :success?, stderr
    assert_equal 96, manifest.fetch("assets").length
    assert_equal 48, manifest.fetch("assets").group_by { |asset| asset.fetch("responsive_pair") }.length
    %w[panel stairs exterior surveillance audio backup climate shading diagnostics].each do |family|
      assert_includes manifest.fetch("assets").map { |asset| asset.fetch("family") }, family
    end
    %w[
      electrical-design-plan electrical-design-groups electrical-installation-finish panel-intake panel-priorities
    ].each do |family|
      assert_includes manifest.fetch("assets").map { |asset| asset.fetch("family") }, family
    end
  end

  def test_manifest_is_reproducible_from_the_pure_ruby_generator
    generated, stderr, status = Open3.capture3("ruby", "scripts/generate_production_asset_manifest.rb", chdir: ROOT)

    assert_predicate status, :success?, stderr
    assert_equal File.read(MANIFEST), generated
  end

  def test_rejects_stale_duplicate_or_orphaned_production_assets
    data = canonical_manifest
    first = data.fetch("assets").first
    first["sha256"] = "0" * 64
    assert_rejected(data, "#{first.fetch('path')}: SHA-256 does not match the checked-in manifest")

    data = canonical_manifest
    first = data.fetch("assets").first
    first["bytes"] = first.fetch("bytes") + 1
    assert_rejected(data, "#{first.fetch('path')}: byte size does not match the checked-in manifest")

    data = canonical_manifest
    first = data.fetch("assets").first
    first["path"] = "assets/images/home/missing-control-room-768.webp"
    assert_rejected(data, "#{first.fetch('path')}: checked-in production WebP must exist")

    data = canonical_manifest
    duplicate = data.fetch("assets").first.dup
    data.fetch("assets") << duplicate
    assert_rejected(data, "#{duplicate.fetch('path')}: manifest path must be unique")

    data = canonical_manifest
    orphan = data.fetch("assets").pop.fetch("path")
    assert_rejected(data, "#{orphan}: production WebP is not recorded in the manifest")
  end

  def test_rejects_decoded_dimension_and_responsive_pair_drift
    data = canonical_manifest
    asset = data.fetch("assets").first
    asset["width"] = asset.fetch("width") + 1
    assert_rejected(data, "#{asset.fetch('path')}: decoded dimensions do not match the checked-in manifest")

    data = canonical_manifest
    asset = data.fetch("assets").find { |entry| entry.fetch("path").end_with?("control-room-768.webp") }
    asset["responsive_pair"] = "drifted-control-room"
    assert_rejected(data, "responsive pair control-room: must contain exactly one mobile and one desktop asset")

    data = canonical_manifest
    asset = data.fetch("assets").first
    asset["provenance"] = "docs/media/missing-provenance.md"
    assert_rejected(data, "#{asset.fetch('path')}: provenance document must exist")

    data = canonical_manifest
    asset = data.fetch("assets").first
    asset["qa"] = "docs/media/missing-qa.md"
    assert_rejected(data, "#{asset.fetch('path')}: independent visual QA document must exist")
  end

  def test_rejects_complete_semantic_metadata_swaps_between_existing_pairs
    %w[responsive_pair family provenance qa].each do |field|
      data = canonical_manifest
      control_room = assets_for_pair(data, "control-room")
      apartment = assets_for_pair(data, "solution-apartment-comfort")
      swap_pair_field(control_room, apartment, field)

      assert_rejected(data, "#{control_room.first.fetch('path')}: #{field} must match canonical production metadata")
    end
  end

  def test_decodes_vp8_vp8l_and_vp8x_dimensions_without_external_image_gems
    Dir.mktmpdir("smart-electrics-webp-dimensions") do |directory|
      fixtures = {
        "vp8.webp" => [webp_vp8(321, 123), [321, 123]],
        "vp8l.webp" => [webp_vp8l(654, 321), [654, 321]],
        "vp8x.webp" => [webp_vp8x(1400, 900), [1400, 900]]
      }

      fixtures.each do |name, (content, dimensions)|
        path = File.join(directory, name)
        File.binwrite(path, content)
        assert_equal dimensions, ProductionAssetsContract.webp_dimensions(path)
      end
    end
  end

  private

  def webp_vp8(width, height)
    payload = "\x00\x00\x00".b + "\x9d\x01\x2a".b + [width].pack("v") + [height].pack("v")
    riff("VP8 ", payload)
  end

  def webp_vp8l(width, height)
    packed = (width - 1) | ((height - 1) << 14)
    riff("VP8L", "\x2f".b + [packed].pack("V"))
  end

  def webp_vp8x(width, height)
    payload = "\x00\x00\x00\x00".b + uint24(width - 1) + uint24(height - 1)
    riff("VP8X", payload)
  end

  def uint24(value)
    [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff].pack("C*")
  end

  def riff(chunk, payload)
    padded_payload = payload.dup
    padded_payload << "\x00" if padded_payload.bytesize.odd?
    body = "WEBP".b + chunk + [payload.bytesize].pack("V") + padded_payload
    "RIFF".b + [body.bytesize].pack("V") + body
  end

  def assets_for_pair(data, pair)
    data.fetch("assets").select { |asset| asset.fetch("responsive_pair") == pair }
  end

  def swap_pair_field(left, right, field)
    assert_equal left.length, right.length

    left_values = left.map { |asset| asset.fetch(field) }
    right_values = right.map { |asset| asset.fetch(field) }
    left.each_with_index { |asset, index| asset[field] = right_values.fetch(index) }
    right.each_with_index { |asset, index| asset[field] = left_values.fetch(index) }
  end
end
