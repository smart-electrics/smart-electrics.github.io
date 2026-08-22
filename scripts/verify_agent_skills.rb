#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"
require "pathname"

EXPECTED_SKILLS = %w[
  advanced-evaluation
  bdi-mental-states
  code-review
  context-compression
  context-degradation
  context-fundamentals
  context-optimization
  diagnosing-bugs
  domain-modeling
  evaluation
  filesystem-context
  grill-with-docs
  grilling
  harness-engineering
  hosted-agents
  implement
  latent-briefing
  long-horizon-prompting
  memory-systems
  multi-agent-patterns
  project-development
  prototype
  research
  self-improvement-loops
  setup-matt-pocock-skills
  tdd
  to-spec
  to-tickets
  tool-design
  triage
  writing-for-agents
].freeze

root = File.expand_path("..", __dir__)
skills_root = File.join(root, ".agents", "skills")
checksum_manifest = File.join(root, ".agents", "skill-checksums.sha256")
actual_skills = Dir.children(skills_root).select do |entry|
  File.directory?(File.join(skills_root, entry))
end.sort
actual_files = Dir.glob(File.join(skills_root, "**", "*"), File::FNM_DOTMATCH).select do |path|
  File.file?(path)
end.map do |path|
  Pathname.new(path).relative_path_from(Pathname.new(root)).to_s
end.sort

errors = []
errors << "missing skills: #{(EXPECTED_SKILLS - actual_skills).join(', ')}" if (EXPECTED_SKILLS - actual_skills).any?
errors << "unexpected skills: #{(actual_skills - EXPECTED_SKILLS).join(', ')}" if (actual_skills - EXPECTED_SKILLS).any?

EXPECTED_SKILLS.each do |skill|
  entrypoint = File.join(skills_root, skill, "SKILL.md")
  errors << "missing entrypoint: .agents/skills/#{skill}/SKILL.md" unless File.file?(entrypoint)
end

unless File.file?(checksum_manifest)
  errors << "missing checksum manifest: .agents/skill-checksums.sha256"
else
  manifest = {}
  File.readlines(checksum_manifest, chomp: true).each_with_index do |line, index|
    digest, path = line.split("  ", 2)
    if digest.nil? || path.nil? || digest !~ /\A[0-9a-f]{64}\z/ || path.empty?
      errors << "malformed checksum manifest line #{index + 1}"
      next
    end

    errors << "duplicate checksum manifest entry: #{path}" if manifest.key?(path)
    manifest[path] = digest
  end

  manifest_paths = manifest.keys.sort
  errors << "checksum manifest missing files: #{(actual_files - manifest_paths).join(', ')}" if (actual_files - manifest_paths).any?
  errors << "checksum manifest has unexpected files: #{(manifest_paths - actual_files).join(', ')}" if (manifest_paths - actual_files).any?

  (actual_files & manifest_paths).each do |path|
    actual_digest = Digest::SHA256.file(File.join(root, path)).hexdigest
    errors << "checksum mismatch: #{path}" unless actual_digest == manifest.fetch(path)
  end
end

if errors.any?
  warn errors.join("\n")
  exit 1
end

puts "Agent skills verified: #{EXPECTED_SKILLS.length} expected entrypoints and #{actual_files.length} vendored files match the checksum manifest."
