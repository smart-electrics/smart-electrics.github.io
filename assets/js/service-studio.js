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

function enhance(root) {
  const graph = readJson(root, "data-service-studio-graph");
  const config = readJson(root, "data-service-studio-config");
  const fallback = one(root, "[data-service-studio-fallback]");
  const stage = one(root, "[data-service-studio-stage]");
  const live = one(root, "[data-service-studio-live]");
  const snapshot = one(root, "[data-service-studio-outgoing-snapshot]");
  if (!graph || !config || !fallback || !stage || !live || !snapshot) return;

  let machine;
  try {
    machine = createServiceStudioState(graph, config);
  } catch (_) {
    return;
  }

  const controls = [...stage.querySelectorAll("button[data-service-studio-control]")];
  const scenes = [...stage.querySelectorAll("[data-service-studio-scene]")];
  const panels = [...stage.querySelectorAll("[data-service-studio-panel]")];
  const stateIds = ["assembled", "focus", "reassembled"];
  const hasExactlyStates = (elements, attribute) =>
    elements.length === stateIds.length && new Set(elements.map((element) => element.dataset[attribute])).size === stateIds.length &&
    stateIds.every((stateId) => elements.some((element) => element.dataset[attribute] === stateId));
  if (!hasExactlyStates(controls, "serviceStudioControlState") || !hasExactlyStates(scenes, "serviceStudioScene") || !hasExactlyStates(panels, "serviceStudioPanel")) return;

  const panelFor = (stateId) => panels.find((panel) => panel.dataset.serviceStudioPanel === stateId);
  const sceneFor = (stateId) => scenes.find((scene) => scene.dataset.serviceStudioScene === stateId);
  const stateIdFor = (state) => state.state;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let state = machine.initialState;

  const clearTransition = () => {
    snapshot.hidden = true;
    snapshot.removeAttribute("data-service-studio-snapshot-active");
    snapshot.style.removeProperty("--service-studio-snapshot-image");
    root.removeAttribute("data-service-studio-transition");
  };

  const synchronize = (announce = false) => {
    const stateId = stateIdFor(state);
    const panel = panelFor(stateId);
    const scene = sceneFor(stateId);
    if (!panel || !scene) return;
    panels.forEach((candidate) => { candidate.hidden = candidate !== panel; });
    scenes.forEach((candidate) => { candidate.hidden = candidate !== scene; });
    controls.forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.serviceStudioControlState === stateId)));
    root.dataset.serviceStudioState = stateId;
    root.dataset.serviceStudioDirection = state.selectedDirectionId || "";
    root.dataset.serviceStudioRelation = state.selectedRelationId || "";
    if (announce) live.textContent = panel.querySelector("[data-service-studio-summary]")?.textContent.trim() || "";
  };

  stage.addEventListener("click", (event) => {
    const control = event.target instanceof Element ? event.target.closest("button[data-service-studio-action]") : null;
    if (!control || !stage.contains(control)) return;
    const nextState = machine.reduce(state, { type: control.dataset.serviceStudioAction });
    if (nextState === state) return;
    clearTransition();
    if (!reducedMotion.matches) {
      const outgoingScene = sceneFor(stateIdFor(state));
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
