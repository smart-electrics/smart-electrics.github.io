#!/usr/bin/env ruby
# frozen_string_literal: true

require "yaml"

module RouteContent
  module_function

  ROOT = File.expand_path("..", __dir__)
  ROUTES = %w[process about projects contact privacy not_found].freeze
  JOURNEY_IDS = {
    "process" => %w[
      enquiry
      clarification
      site-assessment
      design-and-agreement
      estimation
      installation-and-commissioning
      handover-and-service
    ],
    "about" => %w[object-context system-logic coordination handover]
  }.freeze
  FINGERPRINTS = {
    "process" => "d76fba7e",
    "about" => "2cc0ba17"
  }.freeze
  DOCUMENTS = {
    "process" => ["process.md", "journey"],
    "about" => ["about.md", "journey"],
    "projects" => ["projects.md", "utility"],
    "contact" => ["contact.md", "utility"],
    "privacy" => ["privacy.md", "utility"],
    "not_found" => ["404.html", "utility"]
  }.freeze
  INTERNAL_URLS = %w[/ /services/ /solutions/].freeze
  FORBIDDEN_COMMERCIAL_COPY = /(?:\bціна\b|\bвартіст\w*|\bкошту\w*|\bбюджет\b|\bкошторис\b|\bгаранті\w*|\bвідгук\w*|\bрейтинг\w*|\bknx\b|\bloxone\b|\bcontrol4\b|\bcrestron\b|\bzigbee\b|\bz-wave\b|\bmatter\b|\bhomekit\b|\bтелеметр\w*|\bпортал\w*|[₴€]|\bгрн\b)/iu

  def errors_for(data_path)
    data = YAML.safe_load_file(data_path, permitted_classes: [], aliases: false)
    errors = []
    return ["route_content.yml must contain exactly one top-level uk localization"] unless data.is_a?(Hash) && data.keys == ["uk"]

    localized = data.fetch("uk")
    unless localized.is_a?(Hash) && localized.keys == ROUTES
      return ["uk must contain the six canonical route content entries in order"]
    end

    validate_journey(localized.fetch("process"), "process", errors)
    validate_journey(localized.fetch("about"), "about", errors)
    validate_utility(localized.fetch("projects"), "projects", errors)
    validate_utility(localized.fetch("contact"), "contact", errors)
    validate_utility(localized.fetch("privacy"), "privacy", errors)
    validate_utility(localized.fetch("not_found"), "not_found", errors)
    validate_projects(localized.fetch("projects"), errors)
    validate_contact(localized.fetch("contact"), errors)
    validate_privacy(localized.fetch("privacy"), errors)
    validate_documents(localized, errors)
    validate_integrations(errors)
    errors
  rescue Psych::Exception => error
    ["route_content.yml is not safe YAML: #{error.message}"]
  rescue Errno::ENOENT => error
    [error.message]
  end

  def validate_journey(route, key, errors)
    unless hash_fields?(route, %w[journey kicker lede title] + (key == "about" ? ["partnership"] : []))
      errors << "#{key} fields must be exactly #{key == "about" ? "journey, kicker, lede, partnership, title" : "journey, kicker, lede, title"}"
      return
    end
    %w[title kicker lede].each { |field| errors << "#{key}.#{field} must be non-empty Ukrainian route copy" unless text?(route[field]) }
    journey = route["journey"]
    expected_journey_fields = %w[actions aria_label assembled fingerprint id labels media nodes panel]
    unless hash_fields?(journey, expected_journey_fields)
      errors << "#{key}.journey fields must be exactly #{expected_journey_fields.join(", ")}"
      return
    end
    errors << "#{key}.journey.id must equal #{key}" unless journey["id"] == key
    errors << "#{key}.journey.aria_label must be non-empty" unless text?(journey["aria_label"])
    validate_assembled(journey["assembled"], key, errors)
    validate_panel(journey["panel"], key, errors)
    validate_labels(journey["labels"], key, errors)
    validate_actions(journey["actions"], key, errors)
    validate_media(journey["media"], key, errors)
    validate_nodes(journey["nodes"], key, errors)
    validate_fingerprint(journey, key, errors)
    validate_copy(journey, "#{key}.journey", errors)
    validate_partnership(route["partnership"], errors) if key == "about"
  end

  def validate_assembled(assembled, key, errors)
    unless hash_fields?(assembled, %w[summary title]) && assembled.values.all? { |value| text?(value) }
      errors << "#{key}.journey.assembled fields must be exactly title, summary with non-empty copy"
    end
  end

  def validate_panel(panel, key, errors)
    assembled = panel.is_a?(Hash) ? panel["assembled"] : nil
    focus = panel.is_a?(Hash) ? panel["focus"] : nil
    reassembled = panel.is_a?(Hash) ? panel["reassembled"] : nil
    values = [
      assembled.is_a?(Hash) ? assembled["label"] : nil,
      assembled.is_a?(Hash) ? assembled["title"] : nil,
      assembled.is_a?(Hash) ? assembled["summary"] : nil,
      focus.is_a?(Hash) ? focus["label"] : nil,
      reassembled.is_a?(Hash) ? reassembled["label"] : nil,
      reassembled.is_a?(Hash) ? reassembled["title"] : nil
    ]
    unless hash_fields?(panel, %w[assembled focus reassembled]) &&
           hash_fields?(assembled, %w[label summary title]) &&
           hash_fields?(focus, %w[label]) &&
           hash_fields?(reassembled, %w[label title]) &&
           values.all? { |value| text?(value) }
      errors << "#{key}.journey.panel must provide localized assembled, focus, and reassembled panel copy"
    end
  end

  def validate_labels(labels, key, errors)
    unless hash_fields?(labels, %w[decision input next]) && labels.values.all? { |value| text?(value) }
      errors << "#{key}.journey.labels fields must be exactly input, decision, next with non-empty copy"
    end
  end

  def validate_actions(actions, key, errors)
    unless hash_fields?(actions, %w[return show_relationship]) && actions.values.all? { |value| text?(value) }
      errors << "#{key}.journey.actions fields must be exactly show_relationship, return with non-empty copy"
    end
  end

  def validate_media(media, key, errors)
    fields = %w[image_1536 image_768 image_alt image_focus]
    unless hash_fields?(media, fields)
      errors << "#{key}.journey.media fields must be exactly #{fields.join(", ")}"
      return
    end
    %w[image_768 image_1536].each do |field|
      path = media[field]
      unless text?(path) && path.start_with?("/assets/images/") && File.file?(File.join(ROOT, path))
        errors << "#{key}.journey.media.#{field} must reference an existing responsive image"
      end
    end
    errors << "#{key}.journey.media.image_alt must be non-empty" unless text?(media["image_alt"])
    errors << "#{key}.journey.media.image_focus must be a CSS-safe percentage pair" unless /\A\d{1,3}%\s+\d{1,3}%\z/.match?(media["image_focus"].to_s)
  end

  def validate_nodes(nodes, key, errors)
    unless nodes.is_a?(Array)
      errors << "#{key}.journey.nodes must be an ordered array"
      return
    end
    ids = nodes.map { |node| node.is_a?(Hash) ? node["id"] : nil }
    errors << "#{key}.journey.nodes must use the exact canonical order" unless ids == JOURNEY_IDS.fetch(key)
    visual_signatures = []
    nodes.each_with_index do |node, index|
      unless hash_fields?(node, %w[decision id input next title visual])
        errors << "#{key}.journey.nodes[#{index}] fields must be exactly id, title, input, decision, next, visual"
        next
      end
      unless %w[id title input decision next].all? { |field| text?(node[field]) }
        errors << "#{key}.journey.nodes[#{index}] must contain non-empty input, decision, and next copy"
      end
      validate_copy(node, "#{key}.journey.nodes[#{index}]", errors)
      validate_visual(node["visual"], key, index, errors)
      visual_signatures << visual_signature(node["visual"])
    end
    if visual_signatures.compact.uniq.length != visual_signatures.compact.length
      errors << "#{key}.journey.nodes must use a distinct canonical visual mapping for every node"
    end
  end

  def validate_visual(visual, key, index, errors)
    focus = visual.is_a?(Hash) ? visual["focus"] : nil
    next_point = visual.is_a?(Hash) ? visual["next"] : nil
    valid = hash_fields?(visual, %w[focus next]) &&
            hash_fields?(focus, %w[scale x y]) &&
            hash_fields?(next_point, %w[x y]) &&
            coordinate?(focus["x"]) &&
            coordinate?(focus["y"]) &&
            scale?(focus["scale"]) &&
            coordinate?(next_point["x"]) &&
            coordinate?(next_point["y"]) &&
            [focus["x"], focus["y"]] != [next_point["x"], next_point["y"]]
    errors << "#{key}.journey.nodes[#{index}].visual must provide bounded exact focus and next coordinates" unless valid
  end

  def coordinate?(value)
    value.is_a?(Integer) && value.between?(8, 92)
  end

  def scale?(value)
    value.is_a?(Numeric) && value.finite? && value >= 1.12 && value <= 1.4
  end

  def visual_signature(visual)
    return nil unless visual.is_a?(Hash) && visual["focus"].is_a?(Hash) && visual["next"].is_a?(Hash)

    [visual.dig("focus", "x"), visual.dig("focus", "y"), visual.dig("focus", "scale"), visual.dig("next", "x"), visual.dig("next", "y")].join("~")
  end

  def validate_fingerprint(journey, key, errors)
    fingerprint = route_fingerprint(journey)
    unless journey["fingerprint"] == FINGERPRINTS.fetch(key) && fingerprint == FINGERPRINTS.fetch(key)
      errors << "#{key}.journey must match the detached canonical fingerprint"
    end
  end

  def route_fingerprint(journey)
    return nil unless journey.is_a?(Hash)

    nodes = journey["nodes"]
    assembled = journey["assembled"]
    panel = journey["panel"]
    labels = journey["labels"]
    actions = journey["actions"]
    media = journey["media"]
    return nil unless nodes.is_a?(Array) && assembled.is_a?(Hash) && panel.is_a?(Hash) &&
                      labels.is_a?(Hash) && actions.is_a?(Hash) && media.is_a?(Hash)

    panel_assembled = panel["assembled"]
    panel_focus = panel["focus"]
    panel_reassembled = panel["reassembled"]
    return nil unless panel_assembled.is_a?(Hash) && panel_focus.is_a?(Hash) && panel_reassembled.is_a?(Hash)

    serialized_nodes = nodes.map do |node|
      visual = node.is_a?(Hash) ? node["visual"] : nil
      focus = visual.is_a?(Hash) ? visual["focus"] : nil
      next_point = visual.is_a?(Hash) ? visual["next"] : nil
      return nil unless node.is_a?(Hash) && visual.is_a?(Hash) && focus.is_a?(Hash) && next_point.is_a?(Hash)

      copy = %w[id title input decision next].map { |field| node.fetch(field) }.join("~")
      # Each node owns its camera anchor and causal endpoint; this is not a second topology.
      [
        copy,
        focus.fetch("x"),
        focus.fetch("y"),
        focus.fetch("scale"),
        next_point.fetch("x"),
        next_point.fetch("y")
      ].join("~")
    end
    serialized = [
      journey.fetch("id"),
      journey.fetch("aria_label"),
      assembled.fetch("title"),
      assembled.fetch("summary"),
      [
        panel_assembled.fetch("label"),
        panel_assembled.fetch("title"),
        panel_assembled.fetch("summary"),
        panel_focus.fetch("label"),
        panel_reassembled.fetch("label"),
        panel_reassembled.fetch("title")
      ].join("~"),
      [
        labels.fetch("input"),
        labels.fetch("decision"),
        labels.fetch("next")
      ].join("~"),
      [
        actions.fetch("show_relationship"),
        actions.fetch("return")
      ].join("~"),
      [
        media.fetch("image_768"),
        media.fetch("image_1536"),
        media.fetch("image_alt"),
        media.fetch("image_focus")
      ].join("~"),
      serialized_nodes.join("|")
    ].join(":")
    hash = 0x811c9dc5
    serialized.each_codepoint { |codepoint| hash = ((hash ^ codepoint) * 0x01000193) & 0xffffffff }
    hash.to_s(16).rjust(8, "0")
  rescue KeyError, TypeError
    nil
  end

  def validate_partnership(partnership, errors)
    unless hash_fields?(partnership, %w[body id title]) && partnership["id"] == "partners" && partnership.values.all? { |value| text?(value) }
      errors << "about.partnership must provide the stable partners anchor and non-empty copy"
      return
    end
    validate_copy(partnership, "about.partnership", errors)
  end

  def validate_utility(route, key, errors)
    fields = %w[body kicker lede links links_label title]
    unless hash_fields?(route, fields)
      errors << "#{key} fields must be exactly #{fields.join(", ")}"
      return
    end
    %w[title kicker lede links_label].each { |field| errors << "#{key}.#{field} must be non-empty" unless text?(route[field]) }
    unless route["body"].is_a?(Array) && route["body"].any? && route["body"].all? { |paragraph| text?(paragraph) }
      errors << "#{key}.body must be a non-empty static text array"
    end
    unless route["links"].is_a?(Array)
      errors << "#{key}.links must be a static link array"
      return
    end
    route["links"].each_with_index do |link, index|
      unless hash_fields?(link, %w[label url]) && text?(link["label"]) && INTERNAL_URLS.include?(link["url"])
        errors << "#{key}.links[#{index}].url must point to a generated internal route"
      end
    end
  end

  def validate_projects(projects, errors)
    body = projects.is_a?(Hash) ? projects["body"] : nil
    links = projects.is_a?(Hash) ? projects["links"] : nil
    expected = [
      "Наразі ми не публікуємо тут підтверджених кейсів чи матеріалів про виконані об’єкти.",
      "Візуальні концепції готових рішень залишаються прикладами конфігурацій для обговорення, а не описами робіт на конкретних об’єктах."
    ]
    errors << "projects must not claim a case, review, statistic, or completed work" unless body == expected
    errors << "projects must link only to prepared solutions and services" unless links.is_a?(Array) && links.map { |link| link.is_a?(Hash) ? link["url"] : nil } == %w[/solutions/ /services/]
  end

  def validate_contact(contact, errors)
    body = contact.is_a?(Hash) ? contact["body"] : nil
    links = contact.is_a?(Hash) ? contact["links"] : nil
    errors << "contact must remain a static prelaunch route without links or collection controls" unless links == []
    unless body.is_a?(Array) && body.join(" ").include?("не збирає контактні дані")
      errors << "contact must state that no contact data is collected"
    end
  end

  def validate_privacy(privacy, errors)
    body = privacy.is_a?(Hash) ? privacy["body"] : nil
    text = body.is_a?(Array) ? body.join(" ") : ""
    errors << "privacy must describe the disabled GA4 state" unless text.include?("GA4 не завантажується")
    errors << "privacy must describe the disabled Formspree state" unless text.include?("Formspree не активна")
    errors << "privacy must identify itself as a current technical state, not a final legal policy" unless text.include?("не фінальна юридична політика")
  end

  def validate_copy(value, context, errors)
    copy = flatten_text(value)
    errors << "#{context} contains forbidden commercial or outcome claim" if FORBIDDEN_COMMERCIAL_COPY.match?(copy)
    errors << "#{context} must not render ordinal markers" if /(?:\A|\s)0[1-9](?:\s|\z)/.match?(copy)
  end

  def validate_documents(localized, errors)
    DOCUMENTS.each do |key, (filename, mode)|
      source = File.read(File.join(ROOT, filename))
      match = source.match(/\A---\s*\n(.*?)\n---\s*\n(.*)\z/m)
      unless match
        errors << "#{filename} must use data-owned route content"
        next
      end
      front_matter = YAML.safe_load(match[1], permitted_classes: [], aliases: false) || {}
      unless front_matter["layout"] == "route" && front_matter["route_content_key"] == key && front_matter["route_mode"] == mode && front_matter["title"] == localized.fetch(key).fetch("title")
        errors << "#{filename} must select its route content key without competing copy"
      end
      errors << "#{filename} must not contain body copy outside route_content.yml" unless match[2].strip.empty?
    end
  end

  def validate_integrations(errors)
    config = YAML.safe_load_file(File.join(ROOT, "_config.yml"), permitted_classes: [], aliases: false) || {}
    integrations = config.fetch("integrations", {})
    errors << "GA4 must remain disabled for truthful route content" unless integrations.dig("google_analytics", "enabled") == false
    errors << "Formspree must remain disabled for truthful route content" unless integrations.dig("formspree", "enabled") == false
    privacy_source = File.read(File.join(ROOT, "privacy.md"))
    errors << "privacy.md must keep privacy_status: draft" unless privacy_source.include?("privacy_status: draft")
    navigation = YAML.safe_load_file(File.join(ROOT, "_data", "navigation.yml"), permitted_classes: [], aliases: false) || []
    errors << "projects must remain outside primary navigation" if navigation.any? { |item| item["url"] == "/projects/" }
  end

  def hash_fields?(value, fields)
    value.is_a?(Hash) && value.keys.sort == fields.sort
  end

  def text?(value)
    value.is_a?(String) && !value.strip.empty?
  end

  def flatten_text(value)
    case value
    when Hash then value.values.map { |child| flatten_text(child) }.join(" ")
    when Array then value.map { |child| flatten_text(child) }.join(" ")
    else value.to_s
    end
  end
end

if $PROGRAM_NAME == __FILE__
  data_path = ARGV.fetch(0, File.join(RouteContent::ROOT, "_data", "route_content.yml"))
  errors = RouteContent.errors_for(data_path)
  if errors.any?
    warn errors.join("\n")
    exit 1
  end

  puts "Route content contract is safe."
end
