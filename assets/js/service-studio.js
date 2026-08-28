import { createServiceStudioState } from "./service-studio-state.js";
import { createCinematicMotion } from "./cinematic-motion.js";

const PANEL_FALLBACK_DIRECTION_IDS = new Set(["electrical-design", "electrical-installation"]);

const one = (root, selector) => {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 ? matches[0] : null;
};

function readJson(root, attribute) {
  const source = one(root, `script[${attribute}]`);
  if (!source) return null;
  try {
    return JSON.parse(source.textContent);
  } catch (_) {
    return null;
  }
}

function sceneImage(scene) {
  const image = scene?.querySelector("img");
  return image instanceof HTMLImageElement ? image : null;
}

function decodeImage(image) {
  if (!(image instanceof HTMLImageElement)) return Promise.reject(new TypeError("Service studio scene must contain an image."));
  if (typeof image.decode === "function") return image.decode();
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", reject, { once: true });
  });
}

function activeResponsiveCandidate(image) {
  const picture = image.closest("picture");
  const source = [...(picture?.querySelectorAll("source") || [])].find((candidate) =>
    candidate.srcset && (!candidate.media || window.matchMedia(candidate.media).matches)
  );
  const src = source?.srcset || image.currentSrc || image.src;
  return src ? new URL(src, document.baseURI).href : null;
}

async function preloadSceneImage(image) {
  if (!(image instanceof HTMLImageElement)) throw new TypeError("Service studio scene must contain an image.");
  const candidate = activeResponsiveCandidate(image);
  if (!candidate) throw new TypeError("Service studio scene must declare a responsive image candidate.");

  const preload = new Image();
  preload.src = candidate;
  await decodeImage(preload);

  image.loading = "eager";
  await decodeImage(image);
  if (image.currentSrc !== candidate) throw new TypeError("Service studio scene resolved an unexpected responsive image candidate.");
}

function relationIdsFor(config) {
  if (typeof config?.relation_id === "string" && config.relation_id.trim()) return [config.relation_id];
  if (!Array.isArray(config?.relation_ids) || config.relation_ids.length === 0) return null;
  if (!config.relation_ids.every((relationId) => typeof relationId === "string" && relationId.trim())) return null;
  return new Set(config.relation_ids).size === config.relation_ids.length ? config.relation_ids : null;
}

function structurallyCanonicalStudioRelationIds(directionIds, relations) {
  if (!relations.every((relation) => directionIds.includes(relation?.direction_id))) return null;

  const panelRelations = relations.filter((relation) => relation?.child?.id === "panel-assembly");
  if (panelRelations.length !== 1) return null;

  const expected = {};
  for (const directionId of directionIds) {
    const ownedRelations = relations.filter((relation) => relation.direction_id === directionId);
    if (ownedRelations.length === 0) {
      if (!PANEL_FALLBACK_DIRECTION_IDS.has(directionId)) return null;
      expected[directionId] = [panelRelations[0].id];
    } else {
      expected[directionId] = ownedRelations.map((relation) => relation.id);
    }
  }

  return expected;
}

function canonicalStudioRelationIds(graph) {
  if (!Array.isArray(graph?.directions) || !Array.isArray(graph?.relations) || !graph?.service_studio_relation_ids || typeof graph.service_studio_relation_ids !== "object" || Array.isArray(graph.service_studio_relation_ids)) return null;

  const directionIds = graph.directions.map((direction) => direction?.id);
  const knownRelationIds = graph.relations.map((relation) => relation?.id);
  if (!directionIds.every((id) => typeof id === "string" && id.trim()) || new Set(directionIds).size !== directionIds.length) return null;
  if (!knownRelationIds.every((id) => typeof id === "string" && id.trim()) || new Set(knownRelationIds).size !== knownRelationIds.length) return null;

  const expectedMapping = structurallyCanonicalStudioRelationIds(directionIds, graph.relations);
  if (!expectedMapping) return null;

  const mapping = graph.service_studio_relation_ids;
  const mappingKeys = Object.keys(mapping);
  if (mappingKeys.length !== directionIds.length || !mappingKeys.every((id, index) => id === directionIds[index])) return null;
  if (!mappingKeys.every((directionId) => {
    const ids = mapping[directionId];
    return Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === "string" && id.trim() && knownRelationIds.includes(id)) && new Set(ids).size === ids.length;
  })) return null;
  if (!directionIds.every((directionId) => {
    const ids = mapping[directionId];
    const expectedIds = expectedMapping[directionId];
    return ids.length === expectedIds.length && ids.every((id, index) => id === expectedIds[index]);
  })) return null;

  return mapping;
}

function enhance(root) {
  const graph = readJson(root, "data-service-studio-graph");
  const config = readJson(root, "data-service-studio-config");
  const fallback = one(root, "[data-service-studio-fallback]");
  const stage = one(root, "[data-service-studio-stage]");
  const live = one(root, "[data-service-studio-live]");
  const snapshot = one(root, "[data-service-studio-outgoing-snapshot]");
  if (!graph || !config || !fallback || !stage || !live || !snapshot) return;

  const relationIds = relationIdsFor(config);
  if (!relationIds) return;
  const canonicalRelations = canonicalStudioRelationIds(graph);
  if (!canonicalRelations) return;
  const canonicalRelationIds = canonicalRelations[config?.direction_id];
  if (!canonicalRelationIds) return;
  if (relationIds.length !== canonicalRelationIds.length || !relationIds.every((relationId, index) => relationId === canonicalRelationIds[index])) return;

  let machines;
  try {
    machines = new Map(relationIds.map((relationId) => [
      relationId,
      createServiceStudioState(graph, { direction_id: config.direction_id, relation_id: relationId })
    ]));
  } catch (_) {
    return;
  }

  const controls = [...stage.querySelectorAll("button[data-service-studio-control]")];
  const relationControls = [...stage.querySelectorAll("button[data-service-studio-relation-control]")];
  const actionableButtons = [...stage.querySelectorAll("button[data-service-studio-action]")];
  const buttons = [...stage.querySelectorAll("button")];
  const scenes = [...stage.querySelectorAll("[data-service-studio-scene]")];
  const panels = [...stage.querySelectorAll("[data-service-studio-panel]")];
  const stateIds = ["assembled", "focus", "reassembled"];
  const expectedActions = {
    assembled: "select-assembled",
    focus: "select-focus",
    reassembled: "select-reassembled"
  };
  const hasExactStateControls = controls.length === stateIds.length && stateIds.every((stateId) =>
    controls.filter((control) =>
      control.dataset.serviceStudioControlState === stateId && control.dataset.serviceStudioAction === expectedActions[stateId]
    ).length === 1
  );
  const hasExactlyVisuals = (elements, stateAttribute) =>
    elements.length === stateIds.length * relationIds.length && stateIds.every((stateId) =>
      relationIds.every((relationId) => elements.filter((element) =>
        element.dataset[stateAttribute] === stateId && element.dataset.serviceStudioRelationId === relationId
      ).length === 1)
    );
  const hasRelations = relationIds.length === 1
    ? relationControls.length === 0
    : relationControls.length === relationIds.length && relationIds.every((relationId) =>
      relationControls.filter((control) => control.dataset.serviceStudioRelationId === relationId).length === 1
    );
  const hasExactActionableButtons = actionableButtons.length === controls.length && actionableButtons.every((button) => controls.includes(button));
  const hasOnlyValidatedButtons = buttons.length === controls.length + relationControls.length && buttons.every((button) => controls.includes(button) || relationControls.includes(button));
  if (!hasExactStateControls || !hasExactActionableButtons || !hasOnlyValidatedButtons || !hasExactlyVisuals(scenes, "serviceStudioScene") || !hasExactlyVisuals(panels, "serviceStudioPanel") || !hasRelations) return;

  const panelFor = (stateId, relationId) => panels.find((panel) => panel.dataset.serviceStudioPanel === stateId && panel.dataset.serviceStudioRelationId === relationId);
  const sceneFor = (stateId, relationId) => scenes.find((scene) => scene.dataset.serviceStudioScene === stateId && scene.dataset.serviceStudioRelationId === relationId);
  const stateIdFor = (state) => state.state;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let selectedRelationId = relationIds[0];
  let state = machines.get(selectedRelationId).initialState;
  let transitionGeneration = 0;

  const clearTransition = () => {
    snapshot.hidden = true;
    snapshot.removeAttribute("data-service-studio-snapshot-active");
    snapshot.style.removeProperty("--service-studio-snapshot-image");
    snapshot.style.removeProperty("--service-studio-snapshot-position");
    root.removeAttribute("data-service-studio-transition");
  };

  const activePanel = () => panelFor(stateIdFor(state), selectedRelationId);
  const synchronizePanelInertness = (inert) => {
    const panel = activePanel();
    if (panel) panel.inert = inert;
  };
  const motion = createCinematicMotion({
    onPhase: (phase) => {
      root.dataset.serviceStudioMotionPhase = phase;
      synchronizePanelInertness(phase === "hold");
      if (phase === "hold" || phase === "idle") clearTransition();
    }
  });

  const synchronize = (announce = false) => {
    const stateId = stateIdFor(state);
    const panel = panelFor(stateId, selectedRelationId);
    const scene = sceneFor(stateId, selectedRelationId);
    if (!panel || !scene) return;
    panels.forEach((candidate) => { candidate.hidden = candidate !== panel; });
    scenes.forEach((candidate) => { candidate.hidden = candidate !== scene; });
    controls.forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.serviceStudioControlState === stateId)));
    relationControls.forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.serviceStudioRelationId === selectedRelationId)));
    root.dataset.serviceStudioState = stateId;
    root.dataset.serviceStudioDirection = state.selectedDirectionId || "";
    root.dataset.serviceStudioRelation = state.selectedRelationId || "";
    if (announce) {
      const relationship = panel.querySelector(".service-studio__relation-label")?.textContent.trim() || "";
      const summary = panel.querySelector("[data-service-studio-summary]")?.textContent.trim() || "";
      const separator = /[.!?…]$/u.test(relationship) ? " " : ". ";
      live.textContent = relationship && summary ? `${relationship}${separator}${summary}` : relationship || summary;
    }
  };

  const captureOutgoingScene = (outgoingScene) => {
    const outgoingImage = sceneImage(outgoingScene);
    const outgoingSource = outgoingImage?.currentSrc || outgoingImage?.src;
    if (!outgoingImage || !outgoingSource) return;
    snapshot.style.setProperty("--service-studio-snapshot-image", `url("${outgoingSource}")`);
    snapshot.style.setProperty("--service-studio-snapshot-position", window.getComputedStyle(outgoingImage).objectPosition);
    snapshot.hidden = false;
    snapshot.dataset.serviceStudioSnapshotActive = "true";
    root.dataset.serviceStudioTransition = "true";
  };

  const requestTransition = async ({ nextState, nextRelationId }) => {
    const requestGeneration = ++transitionGeneration;
    motion.cancel();
    clearTransition();

    const targetScene = sceneFor(stateIdFor(nextState), nextRelationId);
    try {
      await preloadSceneImage(sceneImage(targetScene));
    } catch (_) {
      return;
    }
    if (requestGeneration !== transitionGeneration) return;

    const outgoingScene = sceneFor(stateIdFor(state), selectedRelationId);
    if (!reducedMotion.matches) captureOutgoingScene(outgoingScene);
    state = nextState;
    selectedRelationId = nextRelationId;
    motion.start({ reducedMotion: reducedMotion.matches });
    synchronize(true);
  };

  stage.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const relationControl = target?.closest("button[data-service-studio-relation-control]");
    const control = target?.closest("button[data-service-studio-action]");
    if ((!control && !relationControl) || !stage.contains(control || relationControl)) return;
    const nextRelationId = relationControl ? relationControl.dataset.serviceStudioRelationId : selectedRelationId;
    const machine = machines.get(nextRelationId);
    if (!machine) return;
    const action = relationControl ? { type: "select-reassembled" } : { type: control.dataset.serviceStudioAction };
    const nextState = machine.reduce(state, action);
    if (nextState === state) {
      transitionGeneration += 1;
      motion.cancel();
      clearTransition();
      return;
    }
    void requestTransition({ nextState, nextRelationId });
  });

  snapshot.addEventListener("animationend", clearTransition);
  snapshot.addEventListener("animationcancel", () => {
    clearTransition();
  });
  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) {
      clearTransition();
      motion.cancel();
      synchronizePanelInertness(false);
    }
  });
  synchronize();
  root.dataset.serviceStudioMotionPhase = "idle";
  fallback.hidden = true;
  stage.hidden = false;
  root.dataset.serviceStudioEnhanced = "true";
}

document.querySelectorAll("[data-service-studio-root]").forEach(enhance);
