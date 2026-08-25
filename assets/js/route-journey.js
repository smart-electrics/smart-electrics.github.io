import { createRouteJourneyAdapter } from "./route-journey-adapter.js";
import { createCinematicMotion } from "./cinematic-motion.js";
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
const validLabels = (labels) => hasFields(labels, ["decision", "input", "next"]) &&
  [labels.input, labels.decision, labels.next].every(isText);
const validActions = (actions) => hasFields(actions, ["return", "show_relationship"]) &&
  [actions.show_relationship, actions.return].every(isText);
const validMedia = (media) => hasFields(media, ["image_1536", "image_768", "image_alt", "image_focus"]) &&
  [media.image_768, media.image_1536, media.image_alt, media.image_focus].every(isText);

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
    Object.keys(config).sort().join("|") !== "actions|aria_label|assembled|id|labels|media|nodes|panel" ||
    config.id !== routeId ||
    !isId(config.id) ||
    !isText(config.aria_label) ||
    config.assembled === null ||
    typeof config.assembled !== "object" ||
    Array.isArray(config.assembled) ||
    Object.keys(config.assembled).sort().join("|") !== "summary|title" ||
    ![config.assembled.title, config.assembled.summary].every(isText) ||
    !validPanel(config.panel) ||
    !validLabels(config.labels) ||
    !validActions(config.actions) ||
    !validMedia(config.media) ||
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

function exactFallback(fallback, config) {
  const list = one(fallback, ":scope > ol");
  const entries = list ? [...list.querySelectorAll(":scope > li")] : [];
  const fieldPairs = [
    ["input", "input"],
    ["decision", "decision"],
    ["next", "next"]
  ];
  return fallback.tagName === "DIV" && !fallback.hidden && !fallback.hasAttribute("aria-hidden") &&
    fallback.children.length === 1 && list && entries.length === config.nodes.length &&
    entries.every((entry, index) => {
      const node = config.nodes[index];
      const heading = one(entry, ":scope > h2");
      const definition = one(entry, ":scope > dl");
      const groups = definition ? [...definition.querySelectorAll(":scope > div")] : [];
      return entry.children.length === 2 && entry.id === `${config.id}-${node.id}` &&
        heading && heading.id === `${config.id}-${node.id}-title` && heading.textContent === node.title &&
        definition && definition.children.length === fieldPairs.length && groups.length === fieldPairs.length &&
        groups.every((group, groupIndex) => {
          const [label, copy] = fieldPairs[groupIndex];
          const term = one(group, ":scope > dt");
          const description = one(group, ":scope > dd");
          return group.children.length === 2 && term && description &&
            term.textContent === config.labels[label] && description.textContent === node[copy];
        });
    });
}

function restoreSafeFallback(root, fallback, stage) {
  root.removeAttribute("data-route-journey-enhanced");
  if (fallback) {
    fallback.hidden = false;
    fallback.removeAttribute("aria-hidden");
  }
  if (stage) stage.hidden = true;
}

function exactStage(root, stage, config) {
  const nodeButtons = [...stage.querySelectorAll("button[data-route-journey-node]")];
  const actionButtons = [...stage.querySelectorAll("button[data-route-journey-action]")];
  const buttons = [...stage.querySelectorAll("button")];
  const nodeIds = config.nodes.map((node) => node.id);
  const expectedActions = [...nodeIds.map(() => "select-node"), "show-relationship", "return"];
  const actualActions = actionButtons.map((button) => button.dataset.routeJourneyAction);
  const exactNodeButtons = nodeButtons.length === nodeIds.length &&
    sameIds(nodeButtons.map((button) => button.dataset.routeJourneyNode), nodeIds) &&
    nodeButtons.every((button, index) => button.type === "button" &&
      button.dataset.routeJourneyAction === "select-node" &&
      button.textContent === config.nodes[index].title &&
      button.getAttribute("aria-pressed") === String(index === 0));
  const exactScene = (() => {
    const scene = one(stage, "[data-route-journey-scene]");
    const media = one(stage, "[data-route-journey-media]");
    const source = scene && one(scene, "source");
    const image = scene && one(scene, "img");
    const outgoing = one(stage, "img[data-route-journey-outgoing]");
    const connector = one(stage, "svg[data-route-journey-connector]");
    const connectorLine = connector && one(connector, "line[data-route-journey-connector-line]");
    const connectorSource = connector && one(connector, "circle[data-route-journey-connector-source]");
    const connectorTarget = connector && one(connector, "circle[data-route-journey-connector-target]");
    const initialPoint = (element, xAttribute, yAttribute) => element &&
      element.getAttribute(xAttribute) === "50" && element.getAttribute(yAttribute) === "50";
    return scene && media && source && image && outgoing && connector && connectorLine && connectorSource && connectorTarget &&
      media.contains(scene) && media.contains(outgoing) && media.contains(connector) &&
      stage.querySelectorAll("svg").length === 1 &&
      scene.tagName === "PICTURE" && scene.querySelectorAll("source").length === 1 && scene.querySelectorAll("img").length === 1 &&
      source.getAttribute("media") === "(max-width: 767px)" && source.getAttribute("srcset") === config.media.image_768 &&
      image.getAttribute("src") === config.media.image_1536 && image.getAttribute("alt") === config.media.image_alt &&
      image.style.getPropertyValue("--route-journey-scene-position").trim() === config.media.image_focus &&
      outgoing.getAttribute("src") === config.media.image_1536 && outgoing.getAttribute("alt") === "" &&
      outgoing.getAttribute("aria-hidden") === "true" && outgoing.hidden &&
      connector.getAttribute("aria-hidden") === "true" && connector.hasAttribute("hidden") && connector.dataset.routeJourneyConnectorState === "assembled" &&
      connector.getAttribute("viewBox") === "0 0 100 100" &&
      connector.getAttribute("preserveAspectRatio") === "none" &&
      connector.querySelectorAll("line").length === 1 && connector.querySelectorAll("circle").length === 2 &&
      connectorLine.getAttribute("pathLength") === "1" && initialPoint(connectorLine, "x1", "y1") && initialPoint(connectorLine, "x2", "y2") &&
      initialPoint(connectorSource, "cx", "cy") && initialPoint(connectorTarget, "cx", "cy") &&
      connectorSource.getAttribute("r") === "1.45" && connectorTarget.getAttribute("r") === "1.45" &&
      scene.querySelectorAll("picture").length === 0 && scene.querySelectorAll("img").length === 1;
  })();
  const panel = one(stage, "[data-route-journey-panel]");
  const panelTitle = panel && one(panel, "[data-route-journey-panel-title]");
  const panelState = panel && one(panel, "[data-route-journey-panel-state]");
  const panelSummary = panel && one(panel, "[data-route-journey-panel-summary]");
  const details = panel && one(panel, "[data-route-journey-details]");
  const detailGroups = details ? [...details.querySelectorAll(":scope > div")] : [];
  const detailFields = ["input", "decision", "next"];
  const live = one(stage, "[data-route-journey-live]");
  const showRelationship = one(stage, 'button[data-route-journey-action="show-relationship"]');
  const returnControl = one(stage, 'button[data-route-journey-action="return"]');
  const exactPanel = panel && panel.tagName === "SECTION" && panel.getAttribute("aria-labelledby") === `${config.id}-journey-panel-title` &&
    panelTitle && panelTitle.id === `${config.id}-journey-panel-title` && panelTitle.textContent === config.panel.assembled.title &&
    panelState && panelState.textContent === config.panel.assembled.label &&
    panelSummary && panelSummary.textContent === config.panel.assembled.summary &&
    details && details.hidden && detailGroups.length === detailFields.length &&
    detailGroups.every((group, index) => {
      const term = one(group, ":scope > dt");
      const description = one(group, ":scope > dd");
      return group.children.length === 2 && term && description && term.textContent === config.labels[detailFields[index]] && description.textContent === "";
    }) &&
    showRelationship && showRelationship.type === "button" && showRelationship.textContent === config.actions.show_relationship && showRelationship.hidden &&
    returnControl && returnControl.type === "button" && returnControl.textContent === config.actions.return && returnControl.hidden &&
    live && live.tagName === "P" && live.getAttribute("aria-live") === "polite";
  const stageTitle = one(stage, ".route-journey__stage-heading h2");
  const rail = one(stage, ".route-journey__rail");
  return root.tagName === "SECTION" && root.getAttribute("aria-label") === config.aria_label && stage.tagName === "DIV" && stage.hidden &&
    stage.getAttribute("aria-labelledby") === `${config.id}-journey-title` &&
    stageTitle && stageTitle.id === `${config.id}-journey-title` && stageTitle.textContent === config.assembled.title &&
    rail && rail.tagName === "OL" && rail.getAttribute("aria-label") === config.aria_label &&
    exactNodeButtons &&
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
  const expectedFingerprint = CANONICAL_ROUTE_JOURNEY_FINGERPRINTS[routeId];
  const controls = isId(routeId) && fallback && stage && validConfig(config, routeId) &&
    expectedFingerprint && fingerprint === expectedFingerprint &&
    routeJourneyFingerprint(config) === expectedFingerprint &&
    exactFallback(fallback, config) && exactStage(root, stage, config);
  restoreSafeFallback(root, fallback, stage);
  if (!controls) return;

  let adapter;
  try {
    adapter = createRouteJourneyAdapter(config);
  } catch (_) {
    return;
  }

  const title = one(stage, "[data-route-journey-panel-title]");
  const panel = one(stage, "[data-route-journey-panel]");
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
  if (!title || !panel || !stateLabel || !summary || !details || !input || !decision || !next || !showRelationship || !returnControl || !live || !scene || !outgoing || !connector || !connectorLine || !connectorSource || !connectorTarget) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let view = adapter.initialView;

  const clearTransition = () => {
    outgoing.hidden = true;
    outgoing.removeAttribute("src");
    ["transform", "object-position", "transform-origin", "clip-path"].forEach((property) => outgoing.style.removeProperty(property));
    root.removeAttribute("data-route-journey-transition");
  };

  const startTransition = () => {
    clearTransition();
    if (reducedMotion.matches) return;
    const source = scene.currentSrc || scene.src;
    if (!source) return;
    const style = window.getComputedStyle(scene);
    outgoing.src = source;
    outgoing.style.transform = style.transform;
    outgoing.style.objectPosition = style.objectPosition;
    outgoing.style.transformOrigin = style.transformOrigin;
    outgoing.style.clipPath = style.clipPath;
    outgoing.hidden = false;
    root.dataset.routeJourneyTransition = "true";
  };

  const motion = createCinematicMotion({
    onPhase: (phase) => {
      root.dataset.routeJourneyMotionPhase = phase;
      const cleanHold = phase === "hold";
      panel.hidden = cleanHold;
      panel.inert = cleanHold;
      if (phase === "hold" || phase === "idle") clearTransition();
    }
  });

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
    motion.start({ reducedMotion: reducedMotion.matches });
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
  outgoing.addEventListener("animationcancel", () => {
    clearTransition();
  });
  outgoing.addEventListener("error", () => {
    clearTransition();
  });
  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) {
      clearTransition();
      motion.cancel();
      panel.hidden = false;
      panel.inert = false;
    }
  });

  synchronize(true);
  root.dataset.routeJourneyMotionPhase = "idle";
  fallback.hidden = true;
  stage.hidden = false;
  root.dataset.routeJourneyEnhanced = "true";
}

document.querySelectorAll("[data-route-journey-root]").forEach(enhance);
