import { createPhysicalSceneState } from "./physical-scene-state.js";

const text = (value) => typeof value === "string" ? value.trim() : "";

function one(root, selector) {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 ? matches[0] : null;
}

function exactIds(controls, attribute, choices) {
  const ids = controls.map((control) => text(control.dataset[attribute]));
  const expected = choices.map((choice) => choice.id);
  return ids.length === expected.length && ids.every((id) => expected.includes(id)) && new Set(ids).size === ids.length;
}

function readPhysicalData(root) {
  const data = one(root, "script[data-cinematic-physical-states]");
  if (!data) return null;
  try {
    return createPhysicalSceneState(JSON.parse(data.textContent));
  } catch (_) {
    return null;
  }
}

function cssImage(value) {
  return `url("${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}")`;
}

function enhancePhysicalControls(root) {
  const physical = readPhysicalData(root);
  const stage = one(root, "[data-cinematic-stage]");
  const live = one(root, "[data-cinematic-live]");
  const layer = one(root, "[data-cinematic-physical-layer]");
  const controls = one(root, "[data-cinematic-physical-controls]");
  const snapshot = one(root, "[data-cinematic-physical-snapshot]");
  const assembledScene = one(root, '[data-cinematic-scene-key="assembled"]');
  const picture = one(layer || root, "picture[data-cinematic-physical-picture]");
  const source = one(picture || root, "source[data-cinematic-physical-source]");
  const image = one(picture || root, "img[data-cinematic-physical-image]");
  const assembledPicture = one(assembledScene || root, "picture");
  const assembledSource = one(assembledPicture || root, "source");
  const assembledImage = one(assembledPicture || root, "img");
  if (!physical || !stage || !live || !layer || !controls || !snapshot || !assembledScene || !picture || !source || !image || !assembledPicture || !assembledSource || !assembledImage) return;

  const lightingControls = [...controls.querySelectorAll("button[data-cinematic-physical-action='select-lighting']")];
  const windowTreatmentControls = [...controls.querySelectorAll("button[data-cinematic-physical-action='select-window-treatment']")];
  const physicalControls = [...controls.querySelectorAll("button[data-cinematic-physical-action]")];
  const initialScene = physical.sceneFor(physical.initialState);
  if (
    !initialScene ||
    picture.dataset.cinematicPhysicalPicture !== `${physical.initialState.lightingId}:${physical.initialState.windowTreatmentId}` ||
    source.getAttribute("srcset") !== initialScene.src768 || image.getAttribute("src") !== initialScene.src1536 || image.alt !== initialScene.alt ||
    assembledSource.getAttribute("srcset") !== initialScene.src768 || assembledImage.getAttribute("src") !== initialScene.src1536 || assembledImage.alt !== initialScene.alt ||
    physicalControls.length !== physical.lighting.length + physical.windowTreatments.length ||
    !exactIds(lightingControls, "lightingId", physical.lighting) || !exactIds(windowTreatmentControls, "windowTreatmentId", physical.windowTreatments)
  ) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let state = physical.initialState;
  let physicalAvailable = false;
  const sceneFor = (candidate) => physical.sceneFor(candidate);
  const responsiveSource = (scene) => window.matchMedia("(max-width: 767px)").matches ? scene.src768 : scene.src1536;
  const clearTransition = () => {
    snapshot.hidden = true;
    snapshot.removeAttribute("data-cinematic-physical-snapshot-active");
    snapshot.style.removeProperty("--cinematic-physical-snapshot-image");
    layer.removeAttribute("data-cinematic-physical-transition");
  };
  const synchronizeCausalScene = (scene) => {
    assembledScene.dataset.cinematicSceneImage = cssImage(responsiveSource(scene));
    assembledSource.srcset = scene.src768;
    assembledImage.src = scene.src1536;
    assembledImage.alt = scene.alt;
  };
  const synchronize = () => {
    const scene = sceneFor(state);
    if (!scene) return false;
    picture.dataset.cinematicPhysicalPicture = `${state.lightingId}:${state.windowTreatmentId}`;
    source.srcset = scene.src768;
    image.src = scene.src1536;
    image.alt = scene.alt;
    lightingControls.forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.lightingId === state.lightingId)));
    windowTreatmentControls.forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.windowTreatmentId === state.windowTreatmentId)));
    synchronizeCausalScene(scene);
    return true;
  };
  const setAvailability = (cinematicState) => {
    physicalAvailable = root.dataset.cinematicEnhanced === "true" && cinematicState === "assembled";
    layer.hidden = !physicalAvailable;
    controls.hidden = !physicalAvailable;
    if (!physicalAvailable) clearTransition();
  };
  const announce = () => {
    const lighting = physical.lighting.find((choice) => choice.id === state.lightingId)?.label;
    const windowTreatment = physical.windowTreatments.find((choice) => choice.id === state.windowTreatmentId)?.label;
    live.textContent = `Освітлення: ${lighting}; сонцезахист: ${windowTreatment}.`;
  };
  const transition = (action) => {
    if (!physicalAvailable) return;
    const nextState = physical.reduce(state, action);
    if (nextState === state) return;
    const outgoingScene = sceneFor(state);
    const outgoingSource = image.currentSrc || (outgoingScene && responsiveSource(outgoingScene));
    clearTransition();
    if (!reducedMotion.matches && outgoingSource) {
      snapshot.style.setProperty("--cinematic-physical-snapshot-image", cssImage(outgoingSource));
      snapshot.hidden = false;
      snapshot.dataset.cinematicPhysicalSnapshotActive = "true";
      layer.dataset.cinematicPhysicalTransition = "true";
    }
    state = nextState;
    if (!synchronize()) clearTransition();
    announce();
  };

  if (!synchronize()) return;
  image.addEventListener("load", () => synchronizeCausalScene(sceneFor(state)));
  root.addEventListener("cinematic:state-change", (event) => setAvailability(event.detail?.state));
  root.addEventListener("click", (event) => {
    const control = event.target instanceof Element ? event.target.closest("button[data-cinematic-physical-action]") : null;
    if (!(control instanceof HTMLButtonElement) || !controls.contains(control)) return;
    if (control.dataset.cinematicPhysicalAction === "select-lighting") transition({ type: "select-lighting", lightingId: control.dataset.lightingId });
    if (control.dataset.cinematicPhysicalAction === "select-window-treatment") transition({ type: "select-window-treatment", windowTreatmentId: control.dataset.windowTreatmentId });
  });
  snapshot.addEventListener("animationend", (event) => {
    if (event.animationName === "residence-spine-physical-outgoing") clearTransition();
  });
  reducedMotion.addEventListener("change", (event) => { if (event.matches) clearTransition(); });
  root.dataset.cinematicPhysicalEnhanced = "true";
  setAvailability(root.dataset.cinematicState);
}

document.querySelectorAll("[data-cinematic-root]").forEach(enhancePhysicalControls);
