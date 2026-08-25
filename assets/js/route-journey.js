import { createRouteJourneyAdapter } from "./route-journey-adapter.js";
import {
  CANONICAL_ROUTE_JOURNEY_FINGERPRINTS,
  routeJourneyFingerprint
} from "./route-journey-integrity.js";

const isId = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
const isText = (value) => typeof value === "string" && value.trim().length > 0;
const sameIds = (left, right) => Array.isArray(left) && left.length === right.length && left.every((id, index) => id === right[index]);
const hasFields = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join("|") === fields.join("|");
const isCoordinate = (value) => Number.isInteger(value) && value >= 8 && value <= 92;
const isScale = (value) => typeof value === "number" && Number.isFinite(value) && value >= 1.12 && value <= 1.4;

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

const validVisual = (visual) => hasFields(visual, ["focus", "next"]) &&
  hasFields(visual.focus, ["scale", "x", "y"]) &&
  hasFields(visual.next, ["x", "y"]) &&
  isCoordinate(visual.focus.x) &&
  isCoordinate(visual.focus.y) &&
  isScale(visual.focus.scale) &&
  isCoordinate(visual.next.x) &&
  isCoordinate(visual.next.y) &&
  (visual.focus.x !== visual.next.x || visual.focus.y !== visual.next.y);

const one = (root, selector) => {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 ? matches[0] : null;
};

function readJson(root) {
  const source = one(root, "script[data-route-journey-config]");
  if (!source) return null;
  try {
    return JSON.parse(source.textContent);
  } catch (_) {
    return null;
  }
}

function validConfig(config, routeId) {
  if (
    config === null ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.keys(config).sort().join("|") !== "assembled|id|nodes|panel" ||
    config.id !== routeId ||
    !isId(config.id) ||
    config.assembled === null ||
    typeof config.assembled !== "object" ||
    Array.isArray(config.assembled) ||
    Object.keys(config.assembled).sort().join("|") !== "summary|title" ||
    ![config.assembled.title, config.assembled.summary].every(isText) ||
    !validPanel(config.panel) ||
    !Array.isArray(config.nodes) ||
    config.nodes.length === 0
  ) return false;

  const nodeIds = new Set();
  return config.nodes.every((node) => {
    const valid = node !== null &&
      typeof node === "object" &&
      !Array.isArray(node) &&
      Object.keys(node).sort().join("|") === "decision|id|input|next|title|visual" &&
      [node.id, node.title, node.input, node.decision, node.next].every(isText) &&
      validVisual(node.visual) &&
      isId(node.id) &&
      !nodeIds.has(node.id);
    nodeIds.add(node?.id);
    return valid;
  });
}

function exactStage(stage, config) {
  const nodeButtons = [...stage.querySelectorAll("button[data-route-journey-node]")];
  const actionButtons = [...stage.querySelectorAll("button[data-route-journey-action]")];
  const buttons = [...stage.querySelectorAll("button")];
  const nodeIds = config.nodes.map((node) => node.id);
  const expectedActions = [
    ...nodeIds.map(() => "select-node"),
    "show-relationship",
    "return"
  ].sort();
  const actualActions = actionButtons.map((button) => button.dataset.routeJourneyAction).sort();
  const exactNodeButtons = nodeButtons.length === nodeIds.length &&
    sameIds(nodeButtons.map((button) => button.dataset.routeJourneyNode), nodeIds) &&
    nodeButtons.every((button) => button.dataset.routeJourneyAction === "select-node");
  const exactScene = (() => {
    const scene = one(stage, "[data-route-journey-scene]");
    const media = one(stage, "[data-route-journey-media]");
    const outgoing = one(stage, "img[data-route-journey-outgoing]");
    const connector = one(stage, "svg[data-route-journey-connector]");
    const connectorLine = connector && one(connector, "line[data-route-journey-connector-line]");
    const source = connector && one(connector, "circle[data-route-journey-connector-source]");
    const target = connector && one(connector, "circle[data-route-journey-connector-target]");
    return scene && media && outgoing && connector && connectorLine && source && target &&
      media.contains(scene) && media.contains(outgoing) && media.contains(connector) &&
      stage.querySelectorAll("svg").length === 1 &&
      connector.getAttribute("viewBox") === "0 0 100 100" &&
      connector.getAttribute("preserveAspectRatio") === "none" &&
      connector.querySelectorAll("line").length === 1 && connector.querySelectorAll("circle").length === 2 &&
      scene.querySelectorAll("picture").length === 0 && scene.querySelectorAll("img").length === 1;
  })();
  const panel = one(stage, "[data-route-journey-panel]");
  const exactPanel = panel && [
    "[data-route-journey-panel-title]",
    "[data-route-journey-panel-state]",
    "[data-route-journey-panel-summary]",
    "[data-route-journey-details]",
    "[data-route-journey-input]",
    "[data-route-journey-decision]",
    "[data-route-journey-next]",
    "[data-route-journey-live]"
  ].every((selector) => stage.querySelectorAll(selector).length === 1);
  return exactNodeButtons &&
    sameIds(actualActions, expectedActions) &&
    buttons.length === actionButtons.length &&
    exactScene &&
    exactPanel
    ? { nodeButtons, actionButtons, panel, connector: one(stage, "svg[data-route-journey-connector]") }
    : null;
}

function enhance(root) {
  const routeId = root.dataset.routeJourneyId;
  const fingerprint = root.dataset.routeJourneyFingerprint;
  const config = readJson(root);
  const fallback = one(root, "[data-route-journey-fallback]");
  const stage = one(root, "[data-route-journey-stage]");
  if (!isId(routeId) || !fallback || !stage || !validConfig(config, routeId)) return;
  const expectedFingerprint = CANONICAL_ROUTE_JOURNEY_FINGERPRINTS[routeId];
  if (!expectedFingerprint || fingerprint !== expectedFingerprint || routeJourneyFingerprint(config) !== expectedFingerprint) return;
  const controls = exactStage(stage, config);
  if (!controls) return;

  let adapter;
  try {
    adapter = createRouteJourneyAdapter(config);
  } catch (_) {
    return;
  }

  const title = one(stage, "[data-route-journey-panel-title]");
  const stateLabel = one(stage, "[data-route-journey-panel-state]");
  const summary = one(stage, "[data-route-journey-panel-summary]");
  const details = one(stage, "[data-route-journey-details]");
  const input = one(stage, "[data-route-journey-input]");
  const decision = one(stage, "[data-route-journey-decision]");
  const next = one(stage, "[data-route-journey-next]");
  const showRelationship = one(stage, 'button[data-route-journey-action="show-relationship"]');
  const returnControl = one(stage, 'button[data-route-journey-action="return"]');
  const live = one(stage, "[data-route-journey-live]");
  const scene = one(stage, "[data-route-journey-scene] img");
  const outgoing = one(stage, "[data-route-journey-outgoing]");
  const connector = controls.connector;
  const connectorLine = connector && one(connector, "line[data-route-journey-connector-line]");
  const connectorSource = connector && one(connector, "circle[data-route-journey-connector-source]");
  const connectorTarget = connector && one(connector, "circle[data-route-journey-connector-target]");
  if (!title || !stateLabel || !summary || !details || !input || !decision || !next || !showRelationship || !returnControl || !live || !scene || !outgoing || !connector || !connectorLine || !connectorSource || !connectorTarget) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let view = adapter.initialView;

  const clearTransition = () => {
    outgoing.hidden = true;
    outgoing.removeAttribute("src");
    root.removeAttribute("data-route-journey-transition");
  };

  const startTransition = () => {
    clearTransition();
    if (reducedMotion.matches) return;
    const source = scene.currentSrc || scene.src;
    if (!source) return;
    outgoing.src = source;
    outgoing.hidden = false;
    root.dataset.routeJourneyTransition = "true";
  };

  const synchronize = (announce = false) => {
    controls.nodeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.routeJourneyNode === view.selectedNodeId));
    });
    root.dataset.routeJourneyState = view.state;
    root.dataset.routeJourneySelectedNode = view.selectedNodeId;
    const frame = view.visual.frame;
    scene.style.setProperty("--route-journey-scene-x", `${frame.x}%`);
    scene.style.setProperty("--route-journey-scene-y", `${frame.y}%`);
    scene.style.setProperty("--route-journey-scene-position", `${frame.x}% ${frame.y}%`);
    scene.style.setProperty("--route-journey-scene-scale", String(frame.scale));
    scene.style.setProperty("--route-journey-scene-inset", `${frame.inset}%`);
    const connection = view.visual.connector;
    connector.toggleAttribute("hidden", connection === null);
    connector.dataset.routeJourneyConnectorState = connection?.state || "assembled";
    if (connection) {
      const points = [
        [connectorLine, connection.from.x, connection.from.y, "x1", "y1"],
        [connectorLine, connection.to.x, connection.to.y, "x2", "y2"],
        [connectorSource, connection.from.x, connection.from.y, "cx", "cy"],
        [connectorTarget, connection.to.x, connection.to.y, "cx", "cy"]
      ];
      points.forEach(([element, x, y, xAttribute, yAttribute]) => {
        element.setAttribute(xAttribute, String(x));
        element.setAttribute(yAttribute, String(y));
      });
    }
    stateLabel.textContent = view.stateLabel;
    title.textContent = view.title;
    summary.hidden = view.summary === null;
    if (view.summary !== null) summary.textContent = view.summary;
    const hasNode = view.node !== null;
    details.hidden = !hasNode;
    if (hasNode) {
      input.textContent = view.node.input;
      decision.textContent = view.node.decision;
      next.textContent = view.node.next;
    }
    showRelationship.hidden = view.state !== "focus";
    returnControl.hidden = view.state === "assembled";
    if (announce) live.textContent = view.title;
  };

  stage.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("button[data-route-journey-action]") : null;
    if (!target || !stage.contains(target)) return;
    const action = target.dataset.routeJourneyAction === "select-node"
      ? { type: "select-node", nodeId: target.dataset.routeJourneyNode }
      : { type: target.dataset.routeJourneyAction };
    const nextView = adapter.reduce(view, action);
    if (nextView === view) return;
    startTransition();
    view = nextView;
    synchronize(true);
    if (action.type === "show-relationship") {
      window.requestAnimationFrame(() => returnControl.focus({ preventScroll: true }));
    }
    if (action.type === "return") {
      window.requestAnimationFrame(() => {
        controls.nodeButtons.find((button) => button.dataset.routeJourneyNode === view.selectedNodeId)?.focus({ preventScroll: true });
      });
    }
  });

  outgoing.addEventListener("animationend", clearTransition);
  outgoing.addEventListener("animationcancel", clearTransition);
  outgoing.addEventListener("error", clearTransition);
  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) clearTransition();
  });

  synchronize(true);
  fallback.hidden = true;
  stage.hidden = false;
  root.dataset.routeJourneyEnhanced = "true";
}

document.querySelectorAll("[data-route-journey-root]").forEach(enhance);
