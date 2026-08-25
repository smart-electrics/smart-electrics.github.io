const isText = (value) => typeof value === "string" && value.trim().length > 0;

export const CANONICAL_ROUTE_JOURNEY_FINGERPRINTS = Object.freeze({
  process: "066c7944",
  about: "284c693b"
});

export function routeJourneyFingerprint(journey) {
  if (
    journey === null ||
    typeof journey !== "object" ||
    Array.isArray(journey) ||
    Object.keys(journey).sort().join("|") !== "assembled|id|nodes|panel" ||
    !isText(journey.id) ||
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
      Object.keys(node).sort().join("|") !== "decision|id|input|next|title" ||
      ![node.id, node.title, node.input, node.decision, node.next].every(isText) ||
      nodeIds.has(node.id)
    ) return null;
    nodeIds.add(node.id);
    serializedNodes.push([node.id, node.title, node.input, node.decision, node.next].join("~"));
  }

  const serializedPanel = [
    journey.panel.assembled.label,
    journey.panel.assembled.title,
    journey.panel.assembled.summary,
    journey.panel.focus.label,
    journey.panel.reassembled.label,
    journey.panel.reassembled.title
  ].join("~");
  const serialized = [journey.id, journey.assembled.title, journey.assembled.summary, serializedPanel, serializedNodes.join("|")].join(":");
  let hash = 0x811c9dc5;
  for (const character of serialized) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
