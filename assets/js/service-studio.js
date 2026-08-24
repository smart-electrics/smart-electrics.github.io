import { createServiceStudioState } from "./service-studio-state.js";

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

function relationIdsFor(config) {
  if (typeof config?.relation_id === "string" && config.relation_id.trim()) return [config.relation_id];
  if (!Array.isArray(config?.relation_ids) || config.relation_ids.length === 0) return null;
  if (!config.relation_ids.every((relationId) => typeof relationId === "string" && relationId.trim())) return null;
  return new Set(config.relation_ids).size === config.relation_ids.length ? config.relation_ids : null;
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
  if (Array.isArray(config.relation_ids) && !relationIds.every((relationId) =>
    graph.relations?.some((relation) => relation?.id === relationId && relation.direction_id === config.direction_id)
  )) return;

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
  const scenes = [...stage.querySelectorAll("[data-service-studio-scene]")];
  const panels = [...stage.querySelectorAll("[data-service-studio-panel]")];
  const stateIds = ["assembled", "focus", "reassembled"];
  const hasExactlyStates = (elements, attribute) =>
    elements.length === stateIds.length && new Set(elements.map((element) => element.dataset[attribute])).size === stateIds.length &&
    stateIds.every((stateId) => elements.some((element) => element.dataset[attribute] === stateId));
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
  if (!hasExactlyStates(controls, "serviceStudioControlState") || !hasExactlyVisuals(scenes, "serviceStudioScene") || !hasExactlyVisuals(panels, "serviceStudioPanel") || !hasRelations) return;

  const panelFor = (stateId, relationId) => panels.find((panel) => panel.dataset.serviceStudioPanel === stateId && panel.dataset.serviceStudioRelationId === relationId);
  const sceneFor = (stateId, relationId) => scenes.find((scene) => scene.dataset.serviceStudioScene === stateId && scene.dataset.serviceStudioRelationId === relationId);
  const stateIdFor = (state) => state.state;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let selectedRelationId = relationIds[0];
  let state = machines.get(selectedRelationId).initialState;

  const clearTransition = () => {
    snapshot.hidden = true;
    snapshot.removeAttribute("data-service-studio-snapshot-active");
    snapshot.style.removeProperty("--service-studio-snapshot-image");
    root.removeAttribute("data-service-studio-transition");
  };

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
      live.textContent = relationship ? `${relationship}. ${summary}` : summary;
    }
  };

  stage.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const relationControl = target?.closest("button[data-service-studio-relation-control]");
    const control = target?.closest("button[data-service-studio-action]");
    if ((!control && !relationControl) || !stage.contains(control || relationControl)) return;
    const outgoingRelationId = selectedRelationId;
    if (relationControl) selectedRelationId = relationControl.dataset.serviceStudioRelationId;
    const machine = machines.get(selectedRelationId);
    if (!machine) return;
    const action = relationControl ? { type: "select-reassembled" } : { type: control.dataset.serviceStudioAction };
    const nextState = machine.reduce(state, action);
    if (nextState === state) return;
    clearTransition();
    if (!reducedMotion.matches) {
      const outgoingScene = sceneFor(stateIdFor(state), outgoingRelationId);
      const outgoingImage = outgoingScene?.querySelector("img")?.currentSrc || outgoingScene?.querySelector("img")?.src;
      if (outgoingImage) {
        snapshot.style.setProperty("--service-studio-snapshot-image", `url("${outgoingImage}")`);
        snapshot.hidden = false;
        snapshot.dataset.serviceStudioSnapshotActive = "true";
        root.dataset.serviceStudioTransition = "true";
      }
    }
    state = nextState;
    synchronize(true);
  });

  snapshot.addEventListener("animationend", clearTransition);
  snapshot.addEventListener("animationcancel", clearTransition);
  reducedMotion.addEventListener("change", (event) => { if (event.matches) clearTransition(); });

  synchronize();
  fallback.hidden = true;
  stage.hidden = false;
  root.dataset.serviceStudioEnhanced = "true";
}

document.querySelectorAll("[data-service-studio-root]").forEach(enhance);
