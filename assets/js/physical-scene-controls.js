import { createPhysicalSceneState } from "./physical-scene-state.js";

const text = (value) => typeof value === "string" ? value.trim() : "";

function one(root, selector) {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 ? matches[0] : null;
}

function cssImage(value) {
  return `url("${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}")`;
}

function stateSignature(system, state) {
  if (system.id === "room") return `${state.lighting}:${state.window_treatment}`;
  return `${system.id}:${system.controls.map((control) => `${control.id}=${state[control.id]}`).join(":")}`;
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

function controlsMatch(container, system) {
  const controls = [...container.querySelectorAll("button[data-cinematic-physical-action='select-control']")];
  const expected = system.controls.flatMap((control) => control.choices.map((choice) => `${control.id}:${choice.id}`));
  const actual = controls.map((control) => `${text(control.dataset.physicalControlId)}:${text(control.dataset.physicalValueId)}`);
  return controls.length === expected.length && actual.every((id) => expected.includes(id)) && new Set(actual).size === actual.length;
}

function enhancePhysicalControls(root) {
  const physical = readPhysicalData(root);
  const stage = one(root, "[data-cinematic-stage]");
  const live = one(root, "[data-cinematic-live]");
  const layer = one(root, "[data-cinematic-physical-layer]");
  const snapshot = one(root, "[data-cinematic-physical-snapshot]");
  const picture = one(layer || root, "picture[data-cinematic-physical-picture]");
  const source = one(picture || root, "source[data-cinematic-physical-source]");
  const image = one(picture || root, "img[data-cinematic-physical-image]");
  if (!physical || !stage || !live || !layer || !snapshot || !picture || !source || !image) return;

  const controlContainers = [...stage.querySelectorAll("[data-cinematic-physical-controls]")];
  const containerBySystem = new Map(controlContainers.map((container) => [text(container.dataset.cinematicPhysicalControls), container]));
  const room = physical.systemForSceneKey("assembled");
  const initialScene = room?.sceneFor(room.initialState);
  if (
    !room || !initialScene || picture.dataset.cinematicPhysicalPicture !== "room" ||
    source.getAttribute("srcset") !== initialScene.src768 || image.getAttribute("src") !== initialScene.src1536 || image.alt !== initialScene.alt ||
    containerBySystem.size !== physical.systems.length || physical.systems.some((system) => !containerBySystem.get(system.id) || !controlsMatch(containerBySystem.get(system.id), system))
  ) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const states = new Map(physical.systems.map((system) => [system.id, system.initialState]));
  let activeSystem = null;
  let physicalAvailable = false;

  const responsiveSource = (scene) => window.matchMedia("(max-width: 767px)").matches ? scene.src768 : scene.src1536;
  const clearTransition = () => {
    snapshot.hidden = true;
    snapshot.removeAttribute("data-cinematic-physical-snapshot-active");
    snapshot.style.removeProperty("--cinematic-physical-snapshot-image");
    layer.removeAttribute("data-cinematic-physical-transition");
  };
  const causalSceneFor = (sceneKey) => [...stage.querySelectorAll("[data-cinematic-scene-key]")].find((scene) => scene.dataset.cinematicSceneKey === sceneKey) || null;
  const synchronizeCausalScene = (system, scene) => {
    const causalScene = causalSceneFor(system.sceneKey);
    const causalPicture = one(causalScene || root, "picture");
    const causalSource = one(causalPicture || root, "source");
    const causalImage = one(causalPicture || root, "img");
    if (!causalScene || !causalSource || !causalImage) return;
    causalScene.dataset.cinematicSceneImage = cssImage(responsiveSource(scene));
    causalSource.srcset = scene.src768;
    causalImage.src = scene.src1536;
    causalImage.alt = scene.alt;
  };
  const synchronize = () => {
    if (!activeSystem) return false;
    const state = states.get(activeSystem.id);
    const scene = activeSystem.sceneFor(state);
    if (!scene) return false;
    picture.dataset.cinematicPhysicalPicture = stateSignature(activeSystem, state);
    source.srcset = scene.src768;
    image.src = scene.src1536;
    image.alt = scene.alt;
    for (const control of activeSystem.controls) {
      for (const button of containerBySystem.get(activeSystem.id).querySelectorAll(`[data-physical-control-id="${control.id}"]`)) {
        button.setAttribute("aria-pressed", String(button.dataset.physicalValueId === state[control.id]));
      }
    }
    synchronizeCausalScene(activeSystem, scene);
    return true;
  };
  const setAvailability = (cinematicState, relationId) => {
    const sceneKey = cinematicState === "assembled" ? "assembled" : cinematicState === "reassembled" ? `relation:${text(relationId)}` : "";
    activeSystem = physical.systemForSceneKey(sceneKey);
    physicalAvailable = root.dataset.cinematicEnhanced === "true" && Boolean(activeSystem);
    layer.hidden = !physicalAvailable;
    controlContainers.forEach((container) => { container.hidden = !physicalAvailable || container !== containerBySystem.get(activeSystem?.id); });
    if (!physicalAvailable) {
      clearTransition();
      return;
    }
    if (!synchronize()) clearTransition();
  };
  const announce = () => {
    if (!activeSystem) return;
    const state = states.get(activeSystem.id);
    const summary = activeSystem.controls.map((control, index) => {
      const choice = control.choices.find((candidate) => candidate.id === state[control.id]);
      const label = index === 0 ? control.label : `${control.label.slice(0, 1).toLocaleLowerCase("uk-UA")}${control.label.slice(1)}`;
      return `${label}: ${choice?.label || ""}`;
    });
    live.textContent = summary.join("; ") + ".";
  };
  const transition = (controlId, valueId) => {
    if (!physicalAvailable || !activeSystem) return;
    const current = states.get(activeSystem.id);
    const nextState = activeSystem.reduce(current, { type: "select-control", controlId, valueId });
    if (nextState === current) return;
    const outgoingScene = activeSystem.sceneFor(current);
    const outgoingSource = image.currentSrc || (outgoingScene && responsiveSource(outgoingScene));
    clearTransition();
    if (!reducedMotion.matches && outgoingSource) {
      snapshot.style.setProperty("--cinematic-physical-snapshot-image", cssImage(outgoingSource));
      snapshot.hidden = false;
      snapshot.dataset.cinematicPhysicalSnapshotActive = "true";
      layer.dataset.cinematicPhysicalTransition = "true";
    }
    states.set(activeSystem.id, nextState);
    if (!synchronize()) clearTransition();
    announce();
  };

  root.addEventListener("cinematic:state-change", (event) => setAvailability(event.detail?.state, event.detail?.selectedRelationId));
  root.addEventListener("click", (event) => {
    const control = event.target instanceof Element ? event.target.closest("button[data-cinematic-physical-action='select-control']") : null;
    if (!(control instanceof HTMLButtonElement) || !activeSystem || !containerBySystem.get(activeSystem.id).contains(control)) return;
    transition(control.dataset.physicalControlId, control.dataset.physicalValueId);
  });
  snapshot.addEventListener("animationend", (event) => {
    if (event.animationName === "residence-spine-physical-outgoing") clearTransition();
  });
  snapshot.addEventListener("animationcancel", clearTransition);
  reducedMotion.addEventListener("change", (event) => { if (event.matches) clearTransition(); });
  root.dataset.cinematicPhysicalEnhanced = "true";
  setAvailability(root.dataset.cinematicState, root.dataset.cinematicRelation);
}

document.querySelectorAll("[data-cinematic-root]").forEach(enhancePhysicalControls);

function enhanceSmartHomePhysicalControls(root) {
  const data = one(root, "script[data-smart-home-physical-states]");
  const fallback = one(root, "[data-smart-home-physical-fallback]");
  const stage = one(root, "[data-smart-home-physical-stage]");
  const picture = one(root, "picture[data-smart-home-physical-picture]");
  const source = one(picture || root, "source[data-smart-home-physical-source]");
  const image = one(picture || root, "img[data-smart-home-physical-image]");
  const live = one(root.closest("[data-smart-home-simulator]") || root, "[data-phone-live]");
  if (!data || !fallback || !stage || !picture || !source || !image || !live) return;
  let physical;
  try { physical = createPhysicalSceneState(JSON.parse(data.textContent)); } catch (_) { return; }
  const systems = physical.systems.filter((system) => system.id === "stairs" || system.id === "exterior");
  const pickers = [...root.querySelectorAll("button[data-smart-home-physical-system]")];
  const controlContainers = [...root.querySelectorAll("[data-smart-home-physical-controls]")];
  const containers = new Map(controlContainers.map((container) => [container.dataset.smartHomePhysicalControls, container]));
  const initialSystem = systems.find((system) => system.id === "stairs");
  const initialScene = initialSystem?.sceneFor(initialSystem.initialState);
  const pickerIds = pickers.map((picker) => text(picker.dataset.smartHomePhysicalSystem));
  const containerIds = controlContainers.map((container) => text(container.dataset.smartHomePhysicalControls));
  if (
    systems.length !== 2 || !initialSystem || !initialScene ||
    pickers.length !== systems.length || new Set(pickerIds).size !== pickerIds.length || !systems.every((system) => pickerIds.includes(system.id)) ||
    controlContainers.length !== systems.length || containers.size !== systems.length || new Set(containerIds).size !== containerIds.length ||
    systems.some((system) => !containers.has(system.id) || !controlsMatch(containers.get(system.id), system)) ||
    picture.dataset.smartHomePhysicalPicture !== "stairs" || source.getAttribute("srcset") !== initialScene.src768 || image.getAttribute("src") !== initialScene.src1536 || image.alt !== initialScene.alt
  ) return;
  const states = new Map(systems.map((system) => [system.id, system.initialState]));
  let activeSystem = initialSystem;
  const synchronize = (announce = false) => {
    const state = states.get(activeSystem.id);
    const scene = activeSystem.sceneFor(state);
    if (!scene) return false;
    picture.dataset.smartHomePhysicalPicture = stateSignature(activeSystem, state);
    source.srcset = scene.src768;
    image.src = scene.src1536;
    image.alt = scene.alt;
    pickers.forEach((picker) => picker.setAttribute("aria-pressed", String(picker.dataset.smartHomePhysicalSystem === activeSystem.id)));
    containers.forEach((container, id) => { container.hidden = id !== activeSystem.id; });
    activeSystem.controls.forEach((control) => containers.get(activeSystem.id).querySelectorAll(`[data-physical-control-id="${control.id}"]`).forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.physicalValueId === state[control.id]))));
    if (announce) {
      const summary = activeSystem.controls.map((control) => `${control.label}: ${control.choices.find((choice) => choice.id === state[control.id])?.label || ""}`).join("; ");
      live.textContent = summary + ".";
    }
    return true;
  };
  root.addEventListener("click", (event) => {
    const picker = event.target instanceof Element ? event.target.closest("button[data-smart-home-physical-system]") : null;
    if (picker instanceof HTMLButtonElement) {
      const system = systems.find((candidate) => candidate.id === picker.dataset.smartHomePhysicalSystem);
      if (system && system !== activeSystem) { activeSystem = system; synchronize(true); }
      return;
    }
    const control = event.target instanceof Element ? event.target.closest("button[data-smart-home-physical-action='select-control']") : null;
    if (!(control instanceof HTMLButtonElement) || !containers.get(activeSystem.id).contains(control)) return;
    const next = activeSystem.reduce(states.get(activeSystem.id), { type: "select-control", controlId: control.dataset.physicalControlId, valueId: control.dataset.physicalValueId });
    if (next !== states.get(activeSystem.id)) { states.set(activeSystem.id, next); synchronize(true); }
  });
  if (!synchronize()) return;
  fallback.hidden = true;
  stage.hidden = false;
  root.dataset.smartHomePhysicalEnhanced = "true";
}

document.querySelectorAll("[data-smart-home-physical]").forEach(enhanceSmartHomePhysicalControls);
