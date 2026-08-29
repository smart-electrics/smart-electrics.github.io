import { createCinematicState } from "./cinematic-state.js";

const text = (value) => typeof value === "string" ? value.trim() : "";

function one(root, selector) {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 ? matches[0] : null;
}

function idsMatch(elements, attribute, expectedIds) {
  const ids = elements.map((element) => text(element.dataset[attribute]));
  return ids.length === expectedIds.length && ids.every((id) => expectedIds.includes(id)) && new Set(ids).size === ids.length;
}

function readGraph(root) {
  const source = one(root, "script[data-cinematic-graph]");
  if (!source) return null;

  try {
    const graph = JSON.parse(source.textContent);
    return { graph, machine: createCinematicState(graph) };
  } catch (_) {
    return null;
  }
}

function failClosed(root) {
  if (!(root instanceof Element)) return;
  const fallback = one(root, "[data-cinematic-fallback]");
  const stage = one(root, "[data-cinematic-stage]");
  root.removeAttribute("data-cinematic-enhanced");
  root.setAttribute("data-cinematic-failed", "true");
  root.removeAttribute("data-cinematic-motion-phase");
  if (fallback) {
    fallback.hidden = false;
    fallback.removeAttribute("aria-hidden");
  }
  if (stage) {
    stage.hidden = true;
    stage.inert = true;
    stage.setAttribute("aria-hidden", "true");
  }
  document.documentElement.removeAttribute("data-cinematic-stage-pending");
}

function enhanceValidated(root) {

  const source = readGraph(root);
  const fallback = one(root, "[data-cinematic-fallback]");
  const stage = one(root, "[data-cinematic-stage]");
  const composition = one(root, "[data-cinematic-composition]");
  const live = one(root, "[data-cinematic-live]");
  const returnControl = one(root, "button[data-cinematic-return]");
  if (!source || !fallback || !stage || !composition || !live || !returnControl) return false;

  const { graph, machine } = source;
  const directionIds = graph.directions.map((direction) => direction.id);
  const relationIds = graph.relations.map((relation) => relation.id);
  const relationById = new Map(graph.relations.map((relation) => [relation.id, relation]));

  const fallbackDirections = [...fallback.querySelectorAll("[data-cinematic-fallback-direction]")];
  const fallbackRelations = [...fallback.querySelectorAll("[data-cinematic-fallback-relation]")];
  const directionLinks = [...fallback.querySelectorAll("[data-cinematic-direction-link]")];
  const directionControls = [...stage.querySelectorAll("button[data-cinematic-direction-control]")];
  const relationControls = [...stage.querySelectorAll("button[data-cinematic-relation-control]")];
  const scenes = [...stage.querySelectorAll("[data-cinematic-scene]")];
  const panels = [...stage.querySelectorAll("[data-cinematic-panel]")];
  const focusPanels = [...stage.querySelectorAll("[data-cinematic-focus-panel]")];
  const reassembledPanels = [...stage.querySelectorAll("[data-cinematic-reassembled-panel]")];
  const focusScenes = [...stage.querySelectorAll("[data-cinematic-focus-scene]")];
  const relationScenes = [...stage.querySelectorAll("[data-cinematic-relation-scene]")];
  const assembledScene = one(stage, '[data-cinematic-scene-key="assembled"]');
  const assembledPanel = one(stage, '[data-cinematic-panel="assembled"]');

  if (
    !assembledScene || !assembledPanel ||
    !idsMatch(fallbackDirections, "cinematicFallbackDirection", directionIds) ||
    !idsMatch(fallbackRelations, "cinematicFallbackRelation", relationIds) ||
    !idsMatch(directionLinks, "cinematicDirectionLink", directionIds) ||
    !idsMatch(directionControls, "directionId", directionIds) ||
    !idsMatch(relationControls, "relationId", relationIds) ||
    !idsMatch(focusPanels, "cinematicFocusPanel", directionIds) ||
    !idsMatch(reassembledPanels, "cinematicReassembledPanel", relationIds) ||
    !idsMatch(focusScenes, "cinematicFocusScene", directionIds) ||
    !idsMatch(relationScenes, "cinematicRelationScene", relationIds) ||
    scenes.length !== 1 + directionIds.length + relationIds.length ||
    panels.length !== 1 + directionIds.length + relationIds.length
  ) return false;

  const sceneByKey = new Map(scenes.map((scene) => [scene.dataset.cinematicSceneKey, scene]));
  const panelByKey = new Map([
    ["assembled", assembledPanel],
    ...focusPanels.map((panel) => [`focus:${panel.dataset.cinematicFocusPanel}`, panel]),
    ...reassembledPanels.map((panel) => [`relation:${panel.dataset.cinematicReassembledPanel}`, panel])
  ]);
  if (sceneByKey.size !== scenes.length || panelByKey.size !== panels.length) return false;

  let state = machine.initialState;

  const stateKey = (nextState) => {
    if (nextState.state === "assembled") return "assembled";
    if (nextState.state === "focus") return `focus:${nextState.selectedDirectionId}`;
    return `relation:${nextState.selectedRelationId}`;
  };


  const synchronize = (announce) => {
    const key = stateKey(state);
    const activeScene = sceneByKey.get(key);
    const activePanel = panelByKey.get(key);
    if (!activeScene || !activePanel) return false;

    scenes.forEach((scene) => { scene.hidden = scene !== activeScene; });
    panels.forEach((panel) => {
      const inactive = panel !== activePanel;
      panel.hidden = inactive;
      panel.inert = inactive;
      if (inactive) panel.setAttribute("aria-hidden", "true");
      else panel.removeAttribute("aria-hidden");
    });
    directionControls.forEach((control) => {
      control.setAttribute("aria-pressed", String(control.dataset.directionId === state.selectedDirectionId));
    });
    returnControl.hidden = state.state === "assembled";
    root.dataset.cinematicState = state.state;
    root.dataset.cinematicDirection = state.selectedDirectionId || "";
    root.dataset.cinematicRelation = state.selectedRelationId || "";
    if (announce) live.textContent = text(activePanel.querySelector("[data-cinematic-summary]")?.textContent);

    root.dispatchEvent(new CustomEvent("cinematic:state-change", {
      bubbles: true,
      detail: {
        ...state,
        directionLabel: state.selectedDirectionId ? graph.directions.find((direction) => direction.id === state.selectedDirectionId)?.label || "" : "Повна система",
        relationLabel: state.selectedRelationId ? relationById.get(state.selectedRelationId)?.child.label || "" : ""
      }
    }));
    return true;
  };

  const transition = (action) => {
    const nextState = machine.reduce(state, action);
    if (nextState === state) return;
    state = nextState;
    if (!synchronize(true)) {
      failClosed(root);
    }
  };

  const protect = (callback) => (...args) => {
    try {
      callback(...args);
    } catch (_) {
      failClosed(root);
    }
  };

  root.addEventListener("click", protect((event) => {
    const control = event.target instanceof Element ? event.target.closest("button[data-cinematic-action]") : null;
    if (!(control instanceof HTMLButtonElement) || !stage.contains(control)) return;

    if (control.dataset.cinematicAction === "select-direction") {
      transition({ type: "select-direction", directionId: control.dataset.directionId });
    } else if (control.dataset.cinematicAction === "select-relation") {
      transition({ type: "select-relation", relationId: control.dataset.relationId });
    } else if (control.dataset.cinematicAction === "return-to-system") {
      transition({ type: "return-to-system" });
    }
  }));

  root.dataset.cinematicMotionPhase = "idle";
  if (!synchronize(false)) return false;
  fallback.hidden = true;
  fallback.setAttribute("aria-hidden", "true");
  stage.hidden = false;
  stage.inert = false;
  stage.removeAttribute("aria-hidden");
  root.dataset.cinematicEnhanced = "true";
  root.removeAttribute("data-cinematic-failed");
  return true;
}

function enhance(root) {
  if (root.dataset.cinematicEnhanced === "true") return;
  try {
    if (!enhanceValidated(root)) failClosed(root);
  } catch (_) {
    failClosed(root);
  }
}

document.querySelectorAll("[data-cinematic-root]").forEach(enhance);
