import { createRouteJourneyState } from "./route-journey-state.js";

const isView = (view) => view !== null && typeof view === "object" && !Array.isArray(view) &&
  Object.keys(view).sort().join("|") === "node|selectedNodeId|state|stateLabel|summary|title|visual";

const isText = (value) => typeof value === "string" && value.trim().length > 0;

const hasFields = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join("|") === fields.join("|");

const validPanel = (panel) => hasFields(panel, ["assembled", "focus", "reassembled"]) &&
  hasFields(panel.assembled, ["label", "summary", "title"]) &&
  hasFields(panel.focus, ["label"]) &&
  hasFields(panel.reassembled, ["label", "title"]) &&
  [
    panel.assembled.label,
    panel.assembled.title,
    panel.assembled.summary,
    panel.focus.label,
    panel.reassembled.label,
    panel.reassembled.title
  ].every(isText);

const isCoordinate = (value) => Number.isInteger(value) && value >= 8 && value <= 92;
const isScale = (value) => typeof value === "number" && Number.isFinite(value) && value >= 1.12 && value <= 1.4;
const validVisual = (visual) => hasFields(visual, ["focus", "next"]) &&
  hasFields(visual.focus, ["scale", "x", "y"]) &&
  hasFields(visual.next, ["x", "y"]) &&
  isCoordinate(visual.focus.x) &&
  isCoordinate(visual.focus.y) &&
  isScale(visual.focus.scale) &&
  isCoordinate(visual.next.x) &&
  isCoordinate(visual.next.y) &&
  (visual.focus.x !== visual.next.x || visual.focus.y !== visual.next.y);

const freezePoint = (point) => Object.freeze({ x: point.x, y: point.y });
const freezeVisual = (visual) => Object.freeze({
  focus: Object.freeze({ x: visual.focus.x, y: visual.focus.y, scale: visual.focus.scale }),
  next: freezePoint(visual.next)
});
const freezeNode = (node) => Object.freeze({
  id: node.id,
  title: node.title,
  input: node.input,
  decision: node.decision,
  next: node.next,
  visual: freezeVisual(node.visual)
});

const frame = (x, y, scale, inset) => Object.freeze({ x, y, scale, inset });
const connection = (state, from, to) => Object.freeze({ state, from: freezePoint(from), to: freezePoint(to) });

function visualFor(state, visual) {
  if (state === "assembled") return Object.freeze({
    frame: frame(50, 50, 1, 0),
    connector: null
  });
  if (state === "focus") return Object.freeze({
    frame: frame(visual.focus.x, visual.focus.y, visual.focus.scale, 3),
    connector: connection("focus", visual.focus, visual.focus)
  });
  const x = (visual.focus.x + visual.next.x) / 2;
  const y = (visual.focus.y + visual.next.y) / 2;
  const scale = Number(Math.max(1.08, visual.focus.scale - 0.12).toFixed(2));
  return Object.freeze({
    frame: frame(x, y, scale, 1.5),
    connector: connection("reassembled", visual.focus, visual.next)
  });
}

export function createRouteJourneyAdapter(config) {
  if (!validPanel(config?.panel) || !Array.isArray(config?.nodes) || !config.nodes.every((node) => validVisual(node?.visual))) {
    throw new TypeError("Route journey visual data is invalid");
  }
  const stableConfig = Object.freeze({
    id: config?.id,
    assembled: Object.freeze({ title: config?.assembled?.title, summary: config?.assembled?.summary }),
    panel: Object.freeze({
      assembled: Object.freeze({ ...config.panel.assembled }),
      focus: Object.freeze({ ...config.panel.focus }),
      reassembled: Object.freeze({ ...config.panel.reassembled })
    }),
    nodes: Object.freeze(config.nodes.map(freezeNode))
  });
  const journey = createRouteJourneyState({
    id: stableConfig.id,
    assembled: stableConfig.assembled,
    nodes: stableConfig.nodes
  });
  const nodesById = new Map(stableConfig.nodes.map((node) => [node.id, node]));

  const viewFor = (state) => {
    const node = nodesById.get(state.selectedNodeId);
    if (!node) return null;
    if (state.state === "assembled") {
      return Object.freeze({
        state: state.state,
        selectedNodeId: state.selectedNodeId,
        stateLabel: stableConfig.panel.assembled.label,
        title: stableConfig.panel.assembled.title,
        summary: stableConfig.panel.assembled.summary,
        visual: visualFor(state.state),
        node: null
      });
    }
    return Object.freeze({
      state: state.state,
      selectedNodeId: state.selectedNodeId,
      stateLabel: state.state === "focus" ? stableConfig.panel.focus.label : stableConfig.panel.reassembled.label,
      title: state.state === "focus" ? node.title : stableConfig.panel.reassembled.title,
      summary: null,
      visual: visualFor(state.state, node.visual),
      node
    });
  };

  const initialView = viewFor(journey.initialState);
  return Object.freeze({
    initialView,
    reduce(view, action) {
      if (!isView(view)) return initialView;
      const state = { state: view.state, selectedNodeId: view.selectedNodeId };
      const next = journey.reduce(state, action);
      if (next.state === state.state && next.selectedNodeId === state.selectedNodeId) return view;
      return viewFor(next) || initialView;
    }
  });
}
