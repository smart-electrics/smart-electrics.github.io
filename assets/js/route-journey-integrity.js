const isText = (value) => typeof value === "string" && value.trim().length > 0;
const hasFields = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join("|") === fields.join("|");
const isCoordinate = (value) => Number.isInteger(value) && value >= 8 && value <= 92;
const isScale = (value) => typeof value === "number" && Number.isFinite(value) && value >= 1.12 && value <= 1.4;
const validLabels = (labels) => hasFields(labels, ["decision", "input", "next"]) &&
  [labels.input, labels.decision, labels.next].every(isText);
const validActions = (actions) => hasFields(actions, ["return", "show_relationship"]) &&
  [actions.show_relationship, actions.return].every(isText);
const validMedia = (media) => hasFields(media, ["image_1536", "image_768", "image_alt", "image_focus"]) &&
  [media.image_768, media.image_1536, media.image_alt, media.image_focus].every(isText);
const validVisual = (visual) => hasFields(visual, ["focus", "next"]) &&
  hasFields(visual.focus, ["scale", "x", "y"]) &&
  hasFields(visual.next, ["x", "y"]) &&
  isCoordinate(visual.focus.x) &&
  isCoordinate(visual.focus.y) &&
  isScale(visual.focus.scale) &&
  isCoordinate(visual.next.x) &&
  isCoordinate(visual.next.y) &&
  (visual.focus.x !== visual.next.x || visual.focus.y !== visual.next.y);

export const CANONICAL_ROUTE_JOURNEY_FINGERPRINTS = Object.freeze({
  process: "d76fba7e",
  about: "2cc0ba17"
});

export function routeJourneyFingerprint(journey) {
  if (
    journey === null ||
    typeof journey !== "object" ||
    Array.isArray(journey) ||
    Object.keys(journey).sort().join("|") !== "actions|aria_label|assembled|id|labels|media|nodes|panel" ||
    !isText(journey.id) ||
    !isText(journey.aria_label) ||
    journey.assembled === null ||
    typeof journey.assembled !== "object" ||
    Array.isArray(journey.assembled) ||
    Object.keys(journey.assembled).sort().join("|") !== "summary|title" ||
    !isText(journey.assembled.title) ||
    !isText(journey.assembled.summary) ||
    journey.panel === null ||
    typeof journey.panel !== "object" ||
    Array.isArray(journey.panel) ||
    Object.keys(journey.panel).sort().join("|") !== "assembled|focus|reassembled" ||
    journey.panel.assembled === null ||
    typeof journey.panel.assembled !== "object" ||
    Array.isArray(journey.panel.assembled) ||
    Object.keys(journey.panel.assembled).sort().join("|") !== "label|summary|title" ||
    journey.panel.focus === null ||
    typeof journey.panel.focus !== "object" ||
    Array.isArray(journey.panel.focus) ||
    Object.keys(journey.panel.focus).sort().join("|") !== "label" ||
    journey.panel.reassembled === null ||
    typeof journey.panel.reassembled !== "object" ||
    Array.isArray(journey.panel.reassembled) ||
    Object.keys(journey.panel.reassembled).sort().join("|") !== "label|title" ||
    ![
      journey.panel.assembled.label,
      journey.panel.assembled.title,
      journey.panel.assembled.summary,
      journey.panel.focus.label,
      journey.panel.reassembled.label,
      journey.panel.reassembled.title
    ].every(isText) ||
    !validLabels(journey.labels) ||
    !validActions(journey.actions) ||
    !validMedia(journey.media) ||
    !Array.isArray(journey.nodes) ||
    journey.nodes.length === 0
  ) return null;

  const nodeIds = new Set();
  const serializedNodes = [];
  for (const node of journey.nodes) {
    if (
      node === null ||
      typeof node !== "object" ||
      Array.isArray(node) ||
      Object.keys(node).sort().join("|") !== "decision|id|input|next|title|visual" ||
      ![node.id, node.title, node.input, node.decision, node.next].every(isText) ||
      !validVisual(node.visual) ||
      nodeIds.has(node.id)
    ) return null;
    nodeIds.add(node.id);
    serializedNodes.push([
      node.id,
      node.title,
      node.input,
      node.decision,
      node.next,
      node.visual.focus.x,
      node.visual.focus.y,
      node.visual.focus.scale,
      node.visual.next.x,
      node.visual.next.y
    ].join("~"));
  }

  const serializedPanel = [
    journey.panel.assembled.label,
    journey.panel.assembled.title,
    journey.panel.assembled.summary,
    journey.panel.focus.label,
    journey.panel.reassembled.label,
    journey.panel.reassembled.title
  ].join("~");
  const serializedLabels = [journey.labels.input, journey.labels.decision, journey.labels.next].join("~");
  const serializedActions = [journey.actions.show_relationship, journey.actions.return].join("~");
  const serializedMedia = [
    journey.media.image_768,
    journey.media.image_1536,
    journey.media.image_alt,
    journey.media.image_focus
  ].join("~");
  const serialized = [
    journey.id,
    journey.aria_label,
    journey.assembled.title,
    journey.assembled.summary,
    serializedPanel,
    serializedLabels,
    serializedActions,
    serializedMedia,
    serializedNodes.join("|")
  ].join(":");
  let hash = 0x811c9dc5;
  for (const character of serialized) {
    hash = Math.imul(hash ^ character.codePointAt(0), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
