import { createCinematicSolutionsState } from "./cinematic-solutions-state.js";
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
  const relationsById = new Map(graph.relations.map((relation) => [relation?.id, relation]));
  if (
    directionIds.size !== graph.directions.length ||
    [...directionIds].some((id) => !isId(id)) ||
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

function exactVisuals(stage, solutionIds, mapping) {
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
  const readablePanel = panels.every((panel) => {
    const summary = panel.querySelectorAll("[data-cinematic-solutions-summary]");
    const related = panel.querySelectorAll("[data-cinematic-solutions-related] a[href]");
    return summary.length === 1 && summary[0].textContent.trim() && related.length > 0 && [...related].every((link) => link.getAttribute("href")?.startsWith("/"));
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
  const live = one(root, "[data-cinematic-solutions-live]");
  const snapshot = one(root, "[data-cinematic-solutions-outgoing-snapshot]");
  const stageTitle = mode === "atlas"
    ? one(root, "#cinematic-solutions-stage-title")
    : one(root, "#cinematic-solution-stage-title");
  if (!(["atlas", "detail"].includes(mode) && isId(selectedSolutionId) && fallback && stage && live && snapshot && stageTitle)) return;
  if (!validConfig(config, mode, selectedSolutionId)) return;
  const relationsById = validMapping(graph, mapping, config.mapping_ids);
  if (!relationsById || config.solution_ids.some((solutionId) => !mapping[solutionId])) return;
  const controls = exactControls(stage, config.solution_ids, mode);
  const visuals = exactVisuals(stage, config.solution_ids, mapping);
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
    synchronize(true);
  });

  snapshot.addEventListener("animationend", clearTransition);
  snapshot.addEventListener("animationcancel", clearTransition);
  reducedMotion.addEventListener("change", (event) => { if (event.matches) clearTransition(); });

  if (!synchronize(true)) return;
  fallback.hidden = true;
  stage.hidden = false;
  root.setAttribute("aria-labelledby", stageTitle.id);
  root.dataset.cinematicSolutionsEnhanced = "true";
}

document.querySelectorAll("[data-cinematic-solutions-root]").forEach(enhance);
