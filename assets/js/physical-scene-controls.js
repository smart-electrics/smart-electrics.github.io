import { createCinematicMotion } from "./cinematic-motion.js";
import { createPhysicalSceneState } from "./physical-scene-state.js";
import { createPhysicalSceneSvgOverlay, createPhysicalSceneSvgSnapshot } from "./physical-scene-svg-overlay.js";

const text = (value) => typeof value === "string" ? value.trim() : "";

function one(root, selector) {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 ? matches[0] : null;
}

function cssImage(value) {
  return `url("${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}")`;
}

function responsiveCandidates(scene) {
  return `${scene.src768} 768w, ${scene.src1536} 1536w`;
}

function stateSignature(system, state) {
  if (system.id === "room") return `${state.lighting}:${state.window_treatment}`;
  return `${system.id}:${system.controls.map((control) => `${control.id}=${state[control.id]}`).join(":")}`;
}

function readPhysicalData(root) {
  const data = one(root, "script[data-cinematic-physical-states]") || one(root, "script[data-smart-home-physical-states]");
  if (!data) return null;
  try { return createPhysicalSceneState(JSON.parse(data.textContent)); } catch (_) { return null; }
}

function controlsMatch(container, system) {
  const controls = [...container.querySelectorAll("button[data-cinematic-physical-action='select-control'], button[data-smart-home-physical-action='select-control']")];
  const expected = system.controls.flatMap((control) => control.choices.map((choice) => `${control.id}:${choice.id}`));
  const actual = controls.map((control) => `${text(control.dataset.physicalControlId)}:${text(control.dataset.physicalValueId)}`);
  return controls.length === expected.length && actual.every((id) => expected.includes(id)) && new Set(actual).size === actual.length;
}

function createSvgSynchronizer({ root, host, phaseAttribute, signatureAttributes }) {
  let overlay = host ? undefined : null;
  let phase = "idle";
  const clearSignature = () => signatureAttributes.forEach((attribute) => root.removeAttribute(attribute));
  return Object.freeze({
    setPhase(nextPhase) {
      phase = nextPhase;
      root.dataset[phaseAttribute] = phase;
      if (overlay) overlay.setPhase(phase);
    },
    render(system, state) {
      if (overlay === undefined) overlay = createPhysicalSceneSvgOverlay(host);
      if (!overlay) return false;
      const frame = overlay.render({ systemId: system.id, valuesBySystem: { [system.id]: state } });
      if (!frame) {
        overlay.disable();
        overlay = null;
        clearSignature();
        return false;
      }
      overlay.setPhase(phase);
      signatureAttributes.forEach((attribute) => root.setAttribute(attribute, frame.signature));
      return true;
    },
    hide() {
      if (overlay) overlay.disable();
      clearSignature();
    },
    disable() {
      if (overlay) overlay.disable();
      overlay = null;
      clearSignature();
    }
  });
}

function enhancePhysicalControls(root) {
  const physical = readPhysicalData(root);
  const stage = one(root, "[data-cinematic-stage]");
  const live = one(root, "[data-cinematic-live]");
  const layer = one(root, "[data-cinematic-physical-layer]");
  const snapshot = one(root, "[data-cinematic-physical-snapshot]");
  const picture = one(layer || root, "picture[data-cinematic-physical-picture]");
  const image = one(picture || root, "img[data-cinematic-physical-image]");
  if (!physical || !stage || !live || !layer || !snapshot || !picture || !image) return;

  const controlContainers = [...stage.querySelectorAll("[data-cinematic-physical-controls]")];
  const containerBySystem = new Map(controlContainers.map((container) => [text(container.dataset.cinematicPhysicalControls), container]));
  const room = physical.systemForSceneKey("assembled");
  const initialScene = room?.sceneFor(room.initialState);
  if (!room || !initialScene || picture.dataset.cinematicPhysicalPicture !== "room" || image.getAttribute("src") !== initialScene.src768 || image.getAttribute("srcset") !== responsiveCandidates(initialScene) || image.alt !== initialScene.alt || containerBySystem.size !== physical.systems.length || physical.systems.some((system) => !containerBySystem.get(system.id) || !controlsMatch(containerBySystem.get(system.id), system))) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const states = new Map(physical.systems.map((system) => [system.id, system.initialState]));
  const svg = createSvgSynchronizer({
    root,
    host: layer,
    phaseAttribute: "cinematicPhysicalMotionPhase",
    signatureAttributes: ["data-cinematic-physical-svg-signature", "data-physical-scene-svg-signature"]
  });
  let activeSystem = null;
  let physicalAvailable = false;
  let enhancementValid = true;
  let syncPending = false;

  const responsiveSource = (scene) => window.matchMedia("(max-width: 767px)").matches ? scene.src768 : scene.src1536;
  const clearTransition = () => {
    snapshot.hidden = true;
    snapshot.removeAttribute("data-cinematic-physical-snapshot-active");
    snapshot.style.removeProperty("--cinematic-physical-snapshot-image");
    layer.removeAttribute("data-cinematic-physical-transition");
  };
  const causalSceneFor = (sceneKey) => {
    const matches = [...stage.querySelectorAll("[data-cinematic-scene-key]")].filter((scene) => scene.dataset.cinematicSceneKey === sceneKey);
    return matches.length === 1 ? matches[0] : null;
  };
  const synchronizeCausalScene = (system, scene) => {
    const causalScene = causalSceneFor(system.sceneKey);
    const causalImage = one(causalScene || root, "img");
    if (!causalScene || !causalImage) return false;
    causalScene.dataset.cinematicSceneImage = cssImage(responsiveSource(scene));
    causalImage.srcset = responsiveCandidates(scene);
    causalImage.src = scene.src768;
    causalImage.alt = scene.alt;
    return true;
  };
  const synchronize = () => {
    if (!activeSystem) return false;
    const state = states.get(activeSystem.id);
    const scene = activeSystem.sceneFor(state);
    if (!scene) return false;
    picture.dataset.cinematicPhysicalPicture = stateSignature(activeSystem, state);
    image.srcset = responsiveCandidates(scene);
    image.src = scene.src768;
    image.alt = scene.alt;
    for (const control of activeSystem.controls) {
      for (const button of containerBySystem.get(activeSystem.id).querySelectorAll(`[data-physical-control-id="${control.id}"]`)) button.setAttribute("aria-pressed", String(button.dataset.physicalValueId === state[control.id]));
    }
    if (!synchronizeCausalScene(activeSystem, scene)) return false;
    svg.render(activeSystem, state);
    return true;
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
  const disablePhysicalEnhancement = () => {
    enhancementValid = false;
    physicalAvailable = false;
    activeSystem = null;
    syncPending = false;
    layer.hidden = true;
    controlContainers.forEach((container) => { container.hidden = true; });
    clearTransition();
    svg.disable();
    root.removeAttribute("data-cinematic-physical-enhanced");
  };
  const applyPendingSync = () => {
    if (!syncPending) return;
    syncPending = false;
    if (!synchronize()) disablePhysicalEnhancement(); else announce();
  };
  const motion = createCinematicMotion({
    onPhase: (phase) => {
      svg.setPhase(phase);
      if (phase === "hold") {
        clearTransition();
        applyPendingSync();
      }
      if (phase === "idle") clearTransition();
    }
  });
  const setAvailability = (cinematicState, relationId) => {
    if (motion.phase !== "idle") motion.cancel();
    const sceneKey = cinematicState === "assembled" ? "assembled" : cinematicState === "reassembled" ? `relation:${text(relationId)}` : "";
    activeSystem = physical.systemForSceneKey(sceneKey);
    physicalAvailable = enhancementValid && root.dataset.cinematicEnhanced === "true" && Boolean(activeSystem);
    layer.hidden = !physicalAvailable;
    controlContainers.forEach((container) => { container.hidden = !physicalAvailable || container !== containerBySystem.get(activeSystem?.id); });
    if (!physicalAvailable) {
      syncPending = false;
      clearTransition();
      svg.hide();
      return;
    }
    if (!synchronize()) disablePhysicalEnhancement();
  };
  const transition = (controlId, valueId) => {
    if (!physicalAvailable || !activeSystem) return;
    const current = states.get(activeSystem.id);
    const nextState = activeSystem.reduce(current, { type: "select-control", controlId, valueId });
    if (nextState === current) return;
    if (!reducedMotion.matches && snapshot.hidden) {
      const outgoingScene = activeSystem.sceneFor(current);
      const outgoingSource = image.currentSrc || (outgoingScene && responsiveSource(outgoingScene));
      if (outgoingSource) {
        snapshot.style.setProperty("--cinematic-physical-snapshot-image", cssImage(outgoingSource));
        snapshot.hidden = false;
        snapshot.dataset.cinematicPhysicalSnapshotActive = "true";
        layer.dataset.cinematicPhysicalTransition = "true";
      }
    }
    states.set(activeSystem.id, nextState);
    syncPending = true;
    motion.start({ reducedMotion: reducedMotion.matches });
    if (reducedMotion.matches) applyPendingSync();
  };

  root.addEventListener("cinematic:state-change", (event) => setAvailability(event.detail?.state, event.detail?.selectedRelationId));
  root.addEventListener("click", (event) => {
    const control = event.target instanceof Element ? event.target.closest("button[data-cinematic-physical-action='select-control']") : null;
    if (!(control instanceof HTMLButtonElement) || !activeSystem || !containerBySystem.get(activeSystem.id).contains(control)) return;
    transition(control.dataset.physicalControlId, control.dataset.physicalValueId);
  });
  reducedMotion.addEventListener("change", (event) => {
    if (!event.matches) return;
    if (motion.phase !== "idle") motion.cancel();
    clearTransition();
    applyPendingSync();
  });
  root.dataset.cinematicPhysicalEnhanced = "true";
  svg.setPhase("idle");
  setAvailability(root.dataset.cinematicState, root.dataset.cinematicRelation);
}

document.querySelectorAll("[data-cinematic-root]").forEach(enhancePhysicalControls);

function enhanceSmartHomePhysicalControls(root) {
  const physical = readPhysicalData(root);
  const fallback = one(root, "[data-smart-home-physical-fallback]");
  const stage = one(root, "[data-smart-home-physical-stage]");
  const media = one(root, "[data-smart-home-physical-media]") || one(root, ".smart-home__physical-media");
  const picture = one(root, "picture[data-smart-home-physical-picture]");
  const image = one(picture || root, "img[data-smart-home-physical-image]");
  const live = one(root.closest("[data-smart-home-simulator]") || root, "[data-phone-live]");
  if (!physical || !fallback || !stage || !media || !picture || !image || !live) return;
  const systems = physical.systems.filter((system) => system.id === "stairs" || system.id === "exterior");
  const pickers = [...root.querySelectorAll("button[data-smart-home-physical-system]")];
  const controlContainers = [...root.querySelectorAll("[data-smart-home-physical-controls]")];
  const containers = new Map(controlContainers.map((container) => [text(container.dataset.smartHomePhysicalControls), container]));
  const initialSystem = systems.find((system) => system.id === "stairs");
  const initialScene = initialSystem?.sceneFor(initialSystem.initialState);
  const pickerIds = pickers.map((picker) => text(picker.dataset.smartHomePhysicalSystem));
  const containerIds = controlContainers.map((container) => text(container.dataset.smartHomePhysicalControls));
  if (systems.length !== 2 || !initialSystem || !initialScene || pickers.length !== systems.length || new Set(pickerIds).size !== pickerIds.length || !systems.every((system) => pickerIds.includes(system.id)) || controlContainers.length !== systems.length || containers.size !== systems.length || new Set(containerIds).size !== containerIds.length || systems.some((system) => !containers.has(system.id) || !controlsMatch(containers.get(system.id), system)) || picture.dataset.smartHomePhysicalPicture !== "stairs" || image.getAttribute("src") !== initialScene.src768 || image.getAttribute("srcset") !== responsiveCandidates(initialScene) || image.alt !== initialScene.alt) return;

  fallback.hidden = true;
  stage.hidden = false;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const states = new Map(systems.map((system) => [system.id, system.initialState]));
  const svg = createSvgSynchronizer({
    root,
    host: media,
    phaseAttribute: "smartHomePhysicalMotionPhase",
    signatureAttributes: ["data-smart-home-physical-svg-signature", "data-physical-scene-svg-signature"]
  });
  let activeSystem = initialSystem;
  let transitionGeneration = 0;
  const removeSnapshots = () => root.querySelectorAll("[data-smart-home-physical-snapshot]").forEach((snapshot) => snapshot.dispatchEvent(new Event("smart-home-physical:snapshot-remove")));
  const clearTransition = () => {
    removeSnapshots();
    media.removeAttribute("data-smart-home-physical-transition");
  };
  const createOutgoingSnapshot = () => {
    if (reducedMotion.matches) return;
    const existingSnapshot = root.querySelector("[data-smart-home-physical-snapshot]");
    const existingRaster = existingSnapshot?.querySelector("[data-smart-home-physical-snapshot-raster]");
    const existingSvg = existingSnapshot?.querySelector("[data-physical-scene-svg-snapshot]");
    const imageStyle = getComputedStyle(image);
    const backgroundImage = existingRaster?.style.backgroundImage || cssImage(image.currentSrc || image.src);
    const backgroundPosition = existingRaster?.style.backgroundPosition || imageStyle.objectPosition;
    const svgSnapshot = existingSvg?.cloneNode(true) || createPhysicalSceneSvgSnapshot(media);
    removeSnapshots();
    const snapshot = document.createElement("span");
    snapshot.className = "smart-home__physical-snapshot";
    snapshot.dataset.smartHomePhysicalSnapshot = "true";
    snapshot.setAttribute("aria-hidden", "true");
    const raster = document.createElement("span");
    raster.className = "smart-home__physical-snapshot-raster";
    raster.dataset.smartHomePhysicalSnapshotRaster = "true";
    raster.style.backgroundImage = backgroundImage;
    raster.style.backgroundPosition = backgroundPosition;
    snapshot.append(raster);
    if (svgSnapshot) snapshot.append(svgSnapshot);
    const remove = () => {
      snapshot.removeEventListener("animationend", onAnimationEnd);
      snapshot.removeEventListener("animationcancel", remove);
      snapshot.removeEventListener("smart-home-physical:snapshot-remove", remove);
      reducedMotion.removeEventListener("change", onPreference);
      snapshot.remove();
    };
    const onAnimationEnd = (event) => { if (event.animationName === "smart-home-disassemble") remove(); };
    const onPreference = (event) => { if (event.matches) remove(); };
    snapshot.addEventListener("animationend", onAnimationEnd);
    snapshot.addEventListener("animationcancel", remove);
    snapshot.addEventListener("smart-home-physical:snapshot-remove", remove);
    reducedMotion.addEventListener("change", onPreference);
    media.dataset.smartHomePhysicalTransition = "true";
    media.append(snapshot);
  };
  const synchronize = (announce = false) => {
    const state = states.get(activeSystem.id);
    const scene = activeSystem.sceneFor(state);
    if (!scene) return false;
    picture.dataset.smartHomePhysicalPicture = stateSignature(activeSystem, state);
    image.srcset = responsiveCandidates(scene);
    image.src = scene.src768;
    image.alt = scene.alt;
    pickers.forEach((picker) => picker.setAttribute("aria-pressed", String(picker.dataset.smartHomePhysicalSystem === activeSystem.id)));
    containers.forEach((container, id) => { container.hidden = id !== activeSystem.id; });
    activeSystem.controls.forEach((control) => containers.get(activeSystem.id).querySelectorAll(`[data-physical-control-id="${control.id}"]`).forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.physicalValueId === state[control.id]))));
    svg.render(activeSystem, state);
    if (announce) live.textContent = activeSystem.controls.map((control) => `${control.label}: ${control.choices.find((choice) => choice.id === state[control.id])?.label || ""}`).join("; ") + ".";
    return true;
  };
  const motion = createCinematicMotion({
    durations: { disassemble: 280, hold: 0, reassemble: 0 },
    onPhase: (phase) => {
      root.dataset.smartHomePhysicalMotionPhase = phase;
      if (phase === "hold" || phase === "idle") clearTransition();
    }
  });
  const transition = async () => {
    const generation = ++transitionGeneration;
    motion.cancel();
    createOutgoingSnapshot();
    if (!synchronize(true)) {
      clearTransition();
      return;
    }
    if (reducedMotion.matches) {
      motion.start({ reducedMotion: true });
      root.dataset.smartHomePhysicalMotionPhase = "idle";
      clearTransition();
      return;
    }
    try {
      await image.decode();
    } catch (_) {
      // The semantic state and alt remain available if the decorative raster fails.
    }
    if (generation !== transitionGeneration) return;
    const snapshot = root.querySelector("[data-smart-home-physical-snapshot]");
    if (snapshot) snapshot.dataset.smartHomePhysicalSnapshotActive = "true";
    motion.start();
  };
  const applyManualControl = () => {
    transitionGeneration += 1;
    motion.cancel();
    root.dataset.smartHomePhysicalMotionPhase = "idle";
    clearTransition();
    synchronize(true);
  };

  root.addEventListener("click", (event) => {
    const picker = event.target instanceof Element ? event.target.closest("button[data-smart-home-physical-system]") : null;
    if (picker instanceof HTMLButtonElement) {
      const system = systems.find((candidate) => candidate.id === picker.dataset.smartHomePhysicalSystem);
      if (system && system !== activeSystem) {
        activeSystem = system;
        transition();
      }
      return;
    }
    const control = event.target instanceof Element ? event.target.closest("button[data-smart-home-physical-action='select-control']") : null;
    if (!(control instanceof HTMLButtonElement) || !containers.get(activeSystem.id).contains(control)) return;
    const next = activeSystem.reduce(states.get(activeSystem.id), { type: "select-control", controlId: control.dataset.physicalControlId, valueId: control.dataset.physicalValueId });
    if (next !== states.get(activeSystem.id)) {
      states.set(activeSystem.id, next);
      applyManualControl();
    }
  });
  reducedMotion.addEventListener("change", (event) => {
    if (!event.matches) return;
    transitionGeneration += 1;
    motion.cancel();
    root.dataset.smartHomePhysicalMotionPhase = "idle";
    clearTransition();
  });
  if (!synchronize()) return;
  root.dataset.smartHomePhysicalEnhanced = "true";
  svg.setPhase("idle");
}

document.querySelectorAll("[data-smart-home-physical]").forEach(enhanceSmartHomePhysicalControls);
