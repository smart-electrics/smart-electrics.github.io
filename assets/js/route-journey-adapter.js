import { createRouteJourneyState } from "./route-journey-state.js";

const isView = (view) => view !== null && typeof view === "object" && !Array.isArray(view) &&
  Object.keys(view).sort().join("|") === "node|selectedNodeId|state|stateLabel|summary|title";

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

export function createRouteJourneyAdapter(config) {
  if (!validPanel(config?.panel)) throw new TypeError("Route journey panel copy is invalid");
  const stableConfig = Object.freeze({
    id: config?.id,
    assembled: Object.freeze({ title: config?.assembled?.title, summary: config?.assembled?.summary }),
    panel: Object.freeze({
      assembled: Object.freeze({ ...config.panel.assembled }),
      focus: Object.freeze({ ...config.panel.focus }),
      reassembled: Object.freeze({ ...config.panel.reassembled })
    }),
    nodes: Object.freeze(Array.isArray(config?.nodes) ? config.nodes.map((node) => Object.freeze({ ...node })) : [])
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
        node: null
      });
    }
    return Object.freeze({
      state: state.state,
      selectedNodeId: state.selectedNodeId,
      stateLabel: state.state === "focus" ? stableConfig.panel.focus.label : stableConfig.panel.reassembled.label,
      title: state.state === "focus" ? node.title : stableConfig.panel.reassembled.title,
      summary: null,
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
