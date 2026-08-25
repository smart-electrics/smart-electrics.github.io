import { createCinematicSolutionsState } from "./cinematic-solutions-state.js";
import { createCinematicMotion } from "./cinematic-motion.js";
import { positionCinematicRelationshipConnector } from "./cinematic-relationship-connector.js";
import {
  CANONICAL_CINEMATIC_SOLUTIONS_FINGERPRINT,
  cinematicSolutionsFingerprint
} from "./cinematic-solutions-integrity.js";

const STATE_IDS = ["assembled", "focus", "reassembled"];
const STATE_ACTIONS = {
  assembled: "select-assembled",
  focus: "select-focus",
  reassembled: "select-reassembled"
};
const isId = (value) => typeof value === "string" && value.trim().length > 0;
const isServiceSlug = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const sameIds = (left, right) => Array.isArray(left) && left.length === right.length && left.every((id, index) => id === right[index]);

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

function validConfig(config, mode, selectedSolutionId) {
  if (
    config === null ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.keys(config).sort().join("|") !== "mapping_ids|mode|selected_solution_id|solution_ids" ||
    config.mode !== mode ||
    !Array.isArray(config.mapping_ids) ||
    config.mapping_ids.length !== 6 ||
    !config.mapping_ids.every(isId) ||
    new Set(config.mapping_ids).size !== config.mapping_ids.length ||
    !Array.isArray(config.solution_ids) ||
    config.solution_ids.length === 0 ||
    !config.solution_ids.every(isId) ||
    new Set(config.solution_ids).size !== config.solution_ids.length ||
    config.selected_solution_id !== selectedSolutionId ||
    config.solution_ids[0] !== config.selected_solution_id
  ) return false;
  return mode === "atlas"
    ? sameIds(config.solution_ids, config.mapping_ids)
    : config.solution_ids.length === 1 && config.mapping_ids.includes(config.selected_solution_id);
}

function validMapping(graph, mapping, mappingIds) {
  if (
    mapping === null ||
    typeof mapping !== "object" ||
    Array.isArray(mapping) ||
    !sameIds(Object.keys(mapping), mappingIds) ||
    !Array.isArray(graph?.directions) ||
    !Array.isArray(graph?.relations)
  ) return null;

  const directionIds = new Set(graph.directions.map((direction) => direction?.id));
  const serviceSlugs = new Set(graph.directions.map((direction) => direction?.service_slug));
  const relationsById = new Map(graph.relations.map((relation) => [relation?.id, relation]));
  if (
    directionIds.size !== graph.directions.length ||
    [...directionIds].some((id) => !isId(id)) ||
    serviceSlugs.size !== graph.directions.length ||
    [...serviceSlugs].some((serviceSlug) => !isServiceSlug(serviceSlug)) ||
    relationsById.size !== graph.relations.length ||
    [...relationsById.keys()].some((id) => !isId(id))
  ) return null;

  for (const solutionId of mappingIds) {
    const entry = mapping[solutionId];
    if (
      entry === null ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).sort().join("|") !== "direction_ids|relation_id" ||
      !Array.isArray(entry.direction_ids) ||
      entry.direction_ids.length === 0 ||
      !entry.direction_ids.every(isId) ||
      new Set(entry.direction_ids).size !== entry.direction_ids.length ||
      entry.direction_ids.some((directionId) => !directionIds.has(directionId)) ||
      !isId(entry.relation_id)
    ) return null;
    const relation = relationsById.get(entry.relation_id);
    if (!relation || !entry.direction_ids.includes(relation.direction_id)) return null;
  }
  if (cinematicSolutionsFingerprint(mapping, mappingIds) !== CANONICAL_CINEMATIC_SOLUTIONS_FINGERPRINT) return null;
  return relationsById;
}

function exactControls(stage, solutionIds, mode) {
  const controls = [...stage.querySelectorAll("button[data-cinematic-solutions-control]")];
  const solutionControls = [...stage.querySelectorAll("button[data-cinematic-solutions-solution-control]")];
  const actionable = [...stage.querySelectorAll("button[data-cinematic-solutions-action]")];
  const buttons = [...stage.querySelectorAll("button")];
  const stateControls = STATE_IDS.every((stateId) => controls.filter((control) =>
    control.dataset.cinematicSolutionsControlState === stateId &&
    control.dataset.cinematicSolutionsAction === STATE_ACTIONS[stateId]
  ).length === 1);
  const selectorControls = mode === "atlas"
    ? solutionControls.length === solutionIds.length && solutionIds.every((solutionId) =>
      solutionControls.filter((control) => control.dataset.cinematicSolutionsSolutionId === solutionId).length === 1
    )
    : solutionControls.length === 0;
  const exactActionable = actionable.length === controls.length && actionable.every((button) => controls.includes(button));
  const onlyValidatedButtons = buttons.length === controls.length + solutionControls.length && buttons.every((button) => controls.includes(button) || solutionControls.includes(button));
  return controls.length === STATE_IDS.length && stateControls && selectorControls && exactActionable && onlyValidatedButtons
    ? { controls, solutionControls }
    : null;
}

function exactVisuals(stage, fallback, solutionIds, mapping, graph, relationsById) {
  const scenes = [...stage.querySelectorAll("[data-cinematic-solutions-scene]")];
  const panels = [...stage.querySelectorAll("[data-cinematic-solutions-panel]")];
  const expectedCount = solutionIds.length * STATE_IDS.length;
  const exact = (elements, stateAttribute) => elements.length === expectedCount && solutionIds.every((solutionId) =>
    STATE_IDS.every((stateId) => elements.filter((element) =>
      element.dataset[stateAttribute] === stateId &&
      element.dataset.cinematicSolutionsSolutionId === solutionId &&
      element.dataset.cinematicSolutionsRelationId === mapping[solutionId].relation_id &&
      element.dataset.cinematicSolutionsDirectionIds === mapping[solutionId].direction_ids.join("|")
    ).length === 1)
  );
  const readableScene = scenes.every((scene) => scene.querySelectorAll("picture").length === 1 && scene.querySelectorAll("img").length === 1);
  const directionsById = new Map(graph.directions.map((direction) => [direction.id, direction]));
  const linkHrefs = (element) => [...element.querySelectorAll("a[href]")].map((link) => link.getAttribute("href"));
  const fallbackLinks = (solutionId, suffix) => {
    const fallbackItems = fallback.querySelectorAll(`[id="solution-${solutionId}"]`);
    const groups = fallbackItems.length === 1
      ? fallbackItems[0].querySelectorAll(`[aria-labelledby="solution-${solutionId}-${suffix}"]`)
      : [];
    return groups.length === 1 ? linkHrefs(groups[0]) : null;
  };
  const fallbackSolutionLinks = new Map(solutionIds.map((solutionId) => [solutionId, fallbackLinks(solutionId, "solutions")]));
  const fallbackServiceLinks = new Map(solutionIds.map((solutionId) => [solutionId, fallbackLinks(solutionId, "services")]));
  const focusServiceLinks = new Map(solutionIds.map((solutionId) => [
    solutionId,
    mapping[solutionId].direction_ids.map((directionId) => {
      const serviceSlug = directionsById.get(directionId)?.service_slug;
      return isServiceSlug(serviceSlug) ? `/services/${serviceSlug}/` : null;
    })
  ]));
  const readablePanel = panels.every((panel) => {
    const summary = panel.querySelectorAll("[data-cinematic-solutions-summary]");
    const stateId = panel.dataset.cinematicSolutionsPanel;
    const relation = relationsById.get(panel.dataset.cinematicSolutionsRelationId);
    const related = [...panel.querySelectorAll("[data-cinematic-solutions-related] a[href]")];
    if (summary.length !== 1 || !summary[0].textContent.trim() || related.length === 0 || related.some((link) => !link.getAttribute("href")?.startsWith("/"))) return false;
    if (stateId !== "reassembled") {
      const relatedLists = panel.querySelectorAll("[data-cinematic-solutions-related]");
      const expectedLinks = stateId === "assembled"
        ? fallbackSolutionLinks.get(panel.dataset.cinematicSolutionsSolutionId)
        : focusServiceLinks.get(panel.dataset.cinematicSolutionsSolutionId);
      const expectedFallbackServices = fallbackServiceLinks.get(panel.dataset.cinematicSolutionsSolutionId);
      return panel.querySelectorAll("[data-cinematic-solutions-relation-label], [data-cinematic-solutions-service-links], [data-cinematic-solutions-solution-links]").length === 0 &&
        relatedLists.length === 1 &&
        Array.isArray(expectedLinks) &&
        expectedLinks.length > 0 &&
        expectedLinks.every(Boolean) &&
        (stateId !== "focus" || sameIds(expectedLinks, expectedFallbackServices)) &&
        sameIds(linkHrefs(relatedLists[0]), expectedLinks);
    }

    const label = panel.querySelectorAll("[data-cinematic-solutions-relation-label]");
    const serviceGroups = panel.querySelectorAll("section[data-cinematic-solutions-service-links]");
    const solutionGroups = panel.querySelectorAll("section[data-cinematic-solutions-solution-links]");
    const expectedSolutions = fallbackSolutionLinks.get(panel.dataset.cinematicSolutionsSolutionId);
    const expectedServices = relation && Array.isArray(relation.related_direction_ids)
      ? [relation.direction_id, ...relation.related_direction_ids].map((directionId) => directionsById.get(directionId)?.service_slug).map((serviceSlug) => serviceSlug ? `/services/${serviceSlug}/` : null)
      : null;
    const readableGroup = (groups, heading, expectedLinks = null) => groups.length === 1 &&
      groups[0].querySelectorAll("h4").length === 1 &&
      groups[0].querySelector("h4")?.textContent.trim() === heading &&
      groups[0].querySelectorAll("ul[data-cinematic-solutions-related]").length === 1 &&
      linkHrefs(groups[0]).length > 0 &&
      linkHrefs(groups[0]).every((href) => href?.startsWith("/")) &&
      (expectedLinks === null || sameIds(linkHrefs(groups[0]), expectedLinks));
    return relation &&
      typeof relation.child?.label === "string" &&
      typeof relation.child?.description === "string" &&
      label.length === 1 &&
      label[0].textContent.trim() === relation.child.label &&
      summary[0].textContent.trim() === relation.child.description &&
      expectedServices?.every(Boolean) &&
      Array.isArray(expectedSolutions) &&
      expectedSolutions.length > 0 &&
      panel.querySelectorAll("[data-cinematic-solutions-related]").length === 2 &&
      readableGroup(serviceGroups, "Пов’язані послуги", expectedServices) &&
      readableGroup(solutionGroups, "Пов’язані готові рішення", expectedSolutions);
  });
  return exact(scenes, "cinematicSolutionsScene") && exact(panels, "cinematicSolutionsPanel") && readableScene && readablePanel
    ? { scenes, panels }
    : null;
}

function enhance(root) {
  const mode = root.dataset.cinematicSolutionsMode;
  const selectedSolutionId = root.dataset.cinematicSolutionsSelectedSolutionId;
  const config = readJson(root, "data-cinematic-solutions-config");
  const mapping = readJson(root, "data-cinematic-solutions-mapping");
  const graph = readJson(root, "data-cinematic-solutions-graph");
  const fallback = one(root, "[data-cinematic-solutions-fallback]");
  const stage = one(root, "[data-cinematic-solutions-stage]");
  const composition = one(root, ".cinematic-solutions__composition");
  const live = one(root, "[data-cinematic-solutions-live]");
  const snapshot = one(root, "[data-cinematic-solutions-outgoing-snapshot]");
  const relationshipConnector = one(root, "svg[data-cinematic-solutions-relationship-connector]");
  const stageTitle = mode === "atlas"
    ? one(root, "#cinematic-solutions-stage-title")
    : one(root, "#cinematic-solution-stage-title");
  if (!(["atlas", "detail"].includes(mode) && isId(selectedSolutionId) && fallback && stage && composition && live && snapshot && relationshipConnector && stageTitle)) return;
  if (!validConfig(config, mode, selectedSolutionId)) return;
  const relationsById = validMapping(graph, mapping, config.mapping_ids);
  if (!relationsById || config.solution_ids.some((solutionId) => !mapping[solutionId])) return;
  const controls = exactControls(stage, config.solution_ids, mode);
  const visuals = exactVisuals(stage, fallback, config.solution_ids, mapping, graph, relationsById);
  if (!controls || !visuals) return;

  const localMapping = Object.fromEntries(config.solution_ids.map((solutionId) => [solutionId, mapping[solutionId]]));
  let atlas;
  try {
    atlas = createCinematicSolutionsState(graph, localMapping);
  } catch (_) {
    return;
  }

  const panelFor = (stateId, solutionId) => visuals.panels.find((panel) =>
    panel.dataset.cinematicSolutionsPanel === stateId && panel.dataset.cinematicSolutionsSolutionId === solutionId
  );
  const sceneFor = (stateId, solutionId) => visuals.scenes.find((scene) =>
    scene.dataset.cinematicSolutionsScene === stateId && scene.dataset.cinematicSolutionsSolutionId === solutionId
  );
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let state = atlas.initialState;

  const clearTransition = () => {
    snapshot.hidden = true;
    snapshot.removeAttribute("data-cinematic-solutions-snapshot-active");
    snapshot.style.removeProperty("--cinematic-solutions-snapshot-image");
    root.removeAttribute("data-cinematic-solutions-transition");
  };

  const activePanel = () => panelFor(state.state, state.selectedSolutionId);
  const synchronizePanelInertness = (inert) => {
    const panel = activePanel();
    if (panel) panel.inert = inert;
  };
  const synchronizeConnector = () => {
    const scene = sceneFor(state.state, state.selectedSolutionId);
    const solutionControl = controls.solutionControls.find((control) => control.dataset.cinematicSolutionsSolutionId === state.selectedSolutionId);
    const stateControl = controls.controls.find((control) => control.dataset.cinematicSolutionsControlState === state.state);
    const source = solutionControl || stateControl;
    const stacked = window.matchMedia("(max-width: 47.999rem)").matches;
    const target = scene;
    if (state.state === "assembled" || !source || !target) {
      relationshipConnector.setAttribute("hidden", "");
      return;
    }
    positionCinematicRelationshipConnector({
      connector: relationshipConnector,
      container: composition,
      source,
      target,
      state: state.state,
      edgeRoute: stacked ? "right" : "perimeter",
      sourceBias: stacked ? { x: 0.5, y: 1 } : { x: 1, y: 0.5 },
      targetBias: { x: 0.82, y: 0.3 }
    });
  };
  const motion = createCinematicMotion({
    onPhase: (phase) => {
      root.dataset.cinematicSolutionsMotionPhase = phase;
      synchronizePanelInertness(phase === "hold");
      if (phase === "hold" || phase === "idle") clearTransition();
      if (phase === "reassemble" || phase === "idle") synchronizeConnector();
    }
  });

  const synchronize = (announce = false) => {
    const panel = panelFor(state.state, state.selectedSolutionId);
    const scene = sceneFor(state.state, state.selectedSolutionId);
    if (!panel || !scene) return false;
    visuals.panels.forEach((candidate) => { candidate.hidden = candidate !== panel; });
    visuals.scenes.forEach((candidate) => { candidate.hidden = candidate !== scene; });
    controls.controls.forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.cinematicSolutionsControlState === state.state)));
    controls.solutionControls.forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.cinematicSolutionsSolutionId === state.selectedSolutionId)));
    root.dataset.cinematicSolutionsState = state.state;
    root.dataset.cinematicSolutionsSolutionId = state.selectedSolutionId;
    root.dataset.cinematicSolutionsRelationId = state.selectedRelationId || "";
    synchronizeConnector();
    if (announce) {
      const label = panel.querySelector(".cinematic-solutions__panel-kicker")?.textContent.trim() || "";
      const summary = panel.querySelector("[data-cinematic-solutions-summary]")?.textContent.trim() || "";
      live.textContent = label && summary ? `${label}: ${summary}` : label || summary;
    }
    return true;
  };

  stage.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const stateControl = target?.closest("button[data-cinematic-solutions-action]");
    const solutionControl = target?.closest("button[data-cinematic-solutions-solution-control]");
    if ((!stateControl && !solutionControl) || !stage.contains(stateControl || solutionControl)) return;
    const action = solutionControl
      ? { type: "select-solution", solutionId: solutionControl.dataset.cinematicSolutionsSolutionId }
      : { type: stateControl.dataset.cinematicSolutionsAction };
    const nextState = atlas.reduce(state, action);
    if (nextState === state) return;
    const outgoingScene = sceneFor(state.state, state.selectedSolutionId);
    clearTransition();
    if (!reducedMotion.matches) {
      const image = outgoingScene?.querySelector("img");
      const outgoingImage = image?.currentSrc || image?.src;
      if (outgoingImage) {
        snapshot.style.setProperty("--cinematic-solutions-snapshot-image", `url("${outgoingImage}")`);
        snapshot.hidden = false;
        snapshot.dataset.cinematicSolutionsSnapshotActive = "true";
        root.dataset.cinematicSolutionsTransition = "true";
      }
    }
    state = nextState;
    motion.start({ reducedMotion: reducedMotion.matches });
    if (!synchronize(true)) {
      clearTransition();
      motion.cancel();
      return;
    }
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
  window.addEventListener("resize", () => {
    window.requestAnimationFrame(synchronizeConnector);
  }, { passive: true });

  if (!synchronize(true)) return;
  root.dataset.cinematicSolutionsMotionPhase = "idle";
  fallback.hidden = true;
  stage.hidden = false;
  root.setAttribute("aria-labelledby", stageTitle.id);
  root.dataset.cinematicSolutionsEnhanced = "true";
}

document.querySelectorAll("[data-cinematic-solutions-root]").forEach(enhance);
