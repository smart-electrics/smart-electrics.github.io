const isText = (value) => typeof value === "string" && value.trim().length > 0;
const NODE_FIELDS = "decision|id|input|next|title";
const JOURNEY_FIELDS = "assembled|id|nodes";

function freezeNode(node) {
  return Object.freeze({
    id: node.id,
    title: node.title,
    input: node.input,
    decision: node.decision,
    next: node.next
  });
}

function normalizeJourney(source) {
  if (
    source === null ||
    typeof source !== "object" ||
    Array.isArray(source) ||
    Object.keys(source).sort().join("|") !== JOURNEY_FIELDS ||
    !isText(source.id) ||
    source.assembled === null ||
    typeof source.assembled !== "object" ||
    Array.isArray(source.assembled) ||
    Object.keys(source.assembled).sort().join("|") !== "summary|title" ||
    !isText(source.assembled.title) ||
    !isText(source.assembled.summary) ||
    !Array.isArray(source.nodes) ||
    source.nodes.length === 0
  ) throw new TypeError("Route journey data is invalid");

  const nodeIds = new Set();
  const nodes = source.nodes.map((node) => {
    if (
      node === null ||
      typeof node !== "object" ||
      Array.isArray(node) ||
      Object.keys(node).sort().join("|") !== NODE_FIELDS ||
      !isText(node.id) ||
      !isText(node.title) ||
      !isText(node.input) ||
      !isText(node.decision) ||
      !isText(node.next) ||
      nodeIds.has(node.id)
    ) throw new TypeError("Route journey node data is invalid");
    nodeIds.add(node.id);
    return freezeNode(node);
  });

  return Object.freeze({
    id: source.id,
    assembled: Object.freeze({ title: source.assembled.title, summary: source.assembled.summary }),
    nodes: Object.freeze(nodes)
  });
}

export function createRouteJourneyState(source) {
  const journey = normalizeJourney(source);
  const nodeIds = new Set(journey.nodes.map((node) => node.id));
  const assembled = (selectedNodeId = journey.nodes[0].id) => Object.freeze({
    state: "assembled",
    selectedNodeId
  });
  const focused = (selectedNodeId) => Object.freeze({ state: "focus", selectedNodeId });
  const reassembled = (selectedNodeId) => Object.freeze({ state: "reassembled", selectedNodeId });
  const initialState = assembled();

  const validState = (state) => state !== null && typeof state === "object" &&
    !Array.isArray(state) &&
    Object.keys(state).sort().join("|") === "selectedNodeId|state" &&
    ["assembled", "focus", "reassembled"].includes(state.state) &&
    nodeIds.has(state.selectedNodeId);

  return Object.freeze({
    initialState,
    reduce(state, action) {
      if (!validState(state)) return initialState;
      if (action?.type === "select-node" && nodeIds.has(action.nodeId)) return focused(action.nodeId);
      if (action?.type === "show-relationship") return state.state === "focus" ? reassembled(state.selectedNodeId) : state;
      if (action?.type === "return") return state.state === "assembled" ? state : assembled();
      return state;
    }
  });
}
