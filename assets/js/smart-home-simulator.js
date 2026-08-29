import { createCinematicMotion } from "./cinematic-motion.js";
import { createPhysicalSceneSvgOverlay, createPhysicalSceneSvgSnapshot } from "./physical-scene-svg-overlay.js";
import { createSmartHomeMachine } from "./smart-home-simulator-state.js";

const isNonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const sameIds = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
const uniqueIds = (values) => values.length > 0 && values.every(isNonEmpty) && new Set(values).size === values.length;
const only = (root, selector) => {
  const values = [...root.querySelectorAll(selector)];
  return values.length === 1 ? values[0] : null;
};
const text = (element) => element?.textContent?.trim() || "";

function readOutputSuffix(output) {
  if (!output) return null;
  if (typeof output.dataset.controlOutputSuffix === "string") return output.dataset.controlOutputSuffix;
  const value = output.querySelector("span");
  if (!value) return null;
  return [...output.childNodes]
    .filter((node) => node !== value)
    .map((node) => node.textContent || "")
    .join("")
    .replace(/^.*?:\s*/, "");
}

function readVisibleWhen(control) {
  const rawValues = control.dataset.controlVisibleValues;
  if (rawValues === undefined) return null;
  const [controlId, rawExpectedValues, ...rest] = rawValues.split(":");
  const expectedValues = rawExpectedValues?.split(",") || [];
  if (!isNonEmpty(controlId) || rest.length !== 0 || expectedValues.length === 0 || !uniqueIds(expectedValues)) return undefined;
  return Object.freeze({ controlId, expectedValues: Object.freeze(expectedValues) });
}

function controlDefinition(panel, systemId) {
  const controls = [...panel.querySelectorAll("[data-phone-control]")];
  if (controls.length === 0) return null;

  const definitions = [];
  for (const control of controls) {
    const [declaredSystemId, controlId] = (control.dataset.phoneControl || "").split(":");
    const type = control.dataset.controlType;
    if (declaredSystemId !== systemId || !isNonEmpty(controlId) || !["range", "segment", "toggle"].includes(type)) return null;

    const output = only(control, `[data-control-output="${CSS.escape(systemId)}:${CSS.escape(controlId)}"]`);
    if (!output || !text(output)) return null;
    const visibleWhen = readVisibleWhen(control);
    if (visibleWhen === undefined) return null;

    if (type === "range") {
      const input = only(control, `input[type="range"][data-phone-range][data-control-system="${CSS.escape(systemId)}"][data-control-id="${CSS.escape(controlId)}"]`);
      if (!input || !input.min || !input.max || !input.step || Number(input.min) >= Number(input.max) || Number.isNaN(Number(input.value))) return null;
      const outputSuffix = readOutputSuffix(output);
      if (outputSuffix === null) return null;
      definitions.push({ id: controlId, type, min: Number(input.min), max: Number(input.max), step: Number(input.step), defaultValue: Number(input.value), outputSuffix, visibleWhen });
      continue;
    }

    if (type === "segment") {
      const options = [...control.querySelectorAll(`button[data-phone-segment][data-control-system="${CSS.escape(systemId)}"][data-control-id="${CSS.escape(controlId)}"][data-control-value]`)];
      const ids = options.map((option) => option.dataset.controlValue);
      if (!uniqueIds(ids) || options.some((option) => !text(option))) return null;
      definitions.push({ id: controlId, type, options: ids, defaultValue: options.find((option) => option.getAttribute("aria-pressed") === "true")?.dataset.controlValue, visibleWhen });
      continue;
    }

    const toggle = only(control, `button[data-phone-toggle][data-control-system="${CSS.escape(systemId)}"][data-control-id="${CSS.escape(controlId)}"]`);
    const onLabel = toggle?.dataset.controlOnLabel;
    const offLabel = toggle?.dataset.controlOffLabel;
    if (!toggle || !text(toggle) || !isNonEmpty(onLabel) || !isNonEmpty(offLabel) || !["true", "false"].includes(toggle.getAttribute("aria-pressed"))) return null;
    definitions.push({ id: controlId, type, onLabel, offLabel, defaultValue: toggle.getAttribute("aria-pressed") === "true", visibleWhen });
  }
  return uniqueIds(definitions.map((control) => control.id)) ? definitions : null;
}

function hasValidControlVisibility(controls) {
  const controlsById = new Map(controls.map((control) => [control.id, control]));
  return controls.some((control) => !control.visibleWhen) && controls.every((control) => {
    if (!control.visibleWhen) return true;
    const condition = controlsById.get(control.visibleWhen.controlId);
    return condition && condition.type === "segment" && control.visibleWhen.expectedValues.every((value) => condition.options.includes(value));
  });
}

function readPresetValues(panel, systemIds, controlsBySystem) {
  const valueRoot = only(panel, `[data-preset-values="${CSS.escape(panel.dataset.presetPanel || "")}"]`);
  if (!valueRoot) return null;
  const values = [...valueRoot.querySelectorAll("[data-preset-control-value]")];
  const expected = systemIds.flatMap((systemId) => controlsBySystem[systemId].map((control) => `${systemId}:${control.id}`));
  const actual = values.map((item) => `${item.dataset.controlSystem}:${item.dataset.controlId}`);
  if (!sameIds(actual, expected)) return null;

  const output = {};
  for (const item of values) {
    const systemId = item.dataset.controlSystem;
    const control = controlsBySystem[systemId].find((candidate) => candidate.id === item.dataset.controlId);
    const raw = item.dataset.controlValue;
    let value;
    if (control.type === "range") {
      value = Number(raw);
      if (!Number.isFinite(value)) return null;
    } else if (control.type === "toggle") {
      if (!["true", "false"].includes(raw)) return null;
      value = raw === "true";
    } else {
      value = raw;
    }
    output[systemId] ||= {};
    output[systemId][control.id] = value;
  }
  return output;
}

function validateMarkup(root) {
  if (!root || root.dataset.enhanced || root.hasAttribute("data-preset") || root.hasAttribute("data-system") || root.hasAttribute("data-visual")) return null;

  const phone = only(root, "[data-smart-home-phone][hidden]");
  const experience = only(root, "[data-smart-home-experience]");
  const staticExplainer = only(root, "[data-static-explainer]");
  const scene = only(root, "[data-scenario-scene]");
  const scenePreview = only(root, "[data-scene-preview]");
  const sceneTitle = only(root, "[data-scene-title]");
  const sceneEyebrow = only(root, "[data-scene-eyebrow]");
  const sceneLabel = only(root, "[data-active-scene-label]");
  const live = only(root, "[data-phone-live][aria-live='polite']");
  const signature = only(root, "[data-phone-signature]");
  const activeLabel = only(root, "[data-phone-system-label]");
  const activeSummary = only(root, "[data-phone-system-summary]");
  const topologyLabel = only(root, "[data-phone-topology-label]");
  const topologyDetail = only(root, "[data-phone-topology-detail]");
  const phoneActive = only(root, ".smart-home__phone-active");
  const sceneTopology = only(root, "[data-scene-topology]");
  const topologySource = only(root, "[data-topology-source]");
  const topologyLogic = only(root, "[data-topology-logic]");
  const topologyResult = only(root, "[data-topology-result]");
  const topologyConnectors = [...root.querySelectorAll("[data-topology-connector][aria-hidden='true']")];
  const staticLabels = [...root.querySelectorAll("[data-system-label]")];
  const systemButtons = [...root.querySelectorAll("button[data-phone-system]")];
  const systemIds = systemButtons.map((button) => button.dataset.phoneSystem);
  const panels = [...root.querySelectorAll("[data-preset-panel]")];
  const presetIds = panels.map((panel) => panel.dataset.presetPanel);
  const radios = [...root.querySelectorAll("input[type='radio'][data-preset-radio][value]")];
  const allRadios = [...root.querySelectorAll("input[type='radio']")];
  const checked = radios.filter((radio) => radio.checked);
  const picture = [...root.querySelectorAll("picture[data-scene-picture]")];
  const visualIds = picture.map((candidate) => candidate.dataset.scenePicture);
  const visiblePicture = picture.filter((candidate) => !candidate.hidden);
  const pictureImages = picture.map((candidate) => only(candidate, "img"));
  const initialPresetId = checked[0]?.value;
  const initialSystemId = panels.find((panel) => panel.dataset.presetPanel === initialPresetId)?.dataset.primarySystem;
  const initialVisualId = systemButtons.find((button) => button.dataset.phoneSystem === initialSystemId)?.dataset.systemVisual;
  const initialPicture = picture[visualIds.indexOf(initialVisualId)];
  const initialImage = pictureImages[visualIds.indexOf(initialVisualId)];
  const initialSources = initialPicture ? [...initialPicture.querySelectorAll("source")] : [];
  const validInitialSources = initialImage && initialSources.length === 2 &&
    initialSources[0].getAttribute("media") === "(max-width: 767px)" && initialSources[0].getAttribute("srcset") === initialImage.dataset.sceneMobile &&
    initialSources[1].getAttribute("media") === "(min-width: 768px)" && initialSources[1].getAttribute("srcset") === initialImage.dataset.sceneDesktop;
  const controlPanels = [...root.querySelectorAll("[data-phone-control-panel]")];
  const controlPanelIds = controlPanels.map((panel) => panel.dataset.phoneControlPanel);
  const panelById = new Map(panels.map((panel) => [panel.dataset.presetPanel, panel]));
  const systemButtonById = new Map(systemButtons.map((button) => [button.dataset.phoneSystem, button]));
  const controlPanelById = new Map(controlPanels.map((panel) => [panel.dataset.phoneControlPanel, panel]));
  const controlsBySystem = {};
  const hasInvalidDiagnostics = (button) => {
    const values = [button.dataset.diagnosticObservation, button.dataset.diagnosticIsolation, button.dataset.diagnosticNextStep];
    const populated = values.filter(isNonEmpty).length;
    return populated !== 0 && populated !== values.length;
  };

  if (
    !phone || !experience || !staticExplainer || !scene || !scenePreview || !live || !signature ||
    !sceneTopology || !phoneActive || topologyConnectors.length !== 2 || ![sceneTitle, sceneEyebrow, sceneLabel, activeLabel, activeSummary, topologyLabel, topologyDetail, topologySource, topologyLogic, topologyResult].every((item) => isNonEmpty(text(item))) ||
    allRadios.length !== radios.length || checked.length !== 1 || !uniqueIds(presetIds) || !sameIds(radios.map((radio) => radio.value), presetIds) ||
    !uniqueIds(systemIds) || !sameIds(staticLabels.map((label) => label.dataset.systemLabel), systemIds) ||
    !sameIds(controlPanelIds, systemIds) || !uniqueIds(visualIds) || !sameIds(visualIds, systemButtons.map((button) => button.dataset.systemVisual)) ||
    !validInitialSources || picture.filter((candidate) => candidate !== initialPicture).some((candidate) => candidate.querySelector("source")) ||
    pictureImages.some((image) => !image || !isNonEmpty(image.dataset.sceneMobile) || !isNonEmpty(image.dataset.sceneDesktop) || image.hasAttribute("srcset")) ||
    visiblePicture.length !== 1 || visiblePicture[0]?.dataset.scenePicture !== initialVisualId ||
    systemButtons.some((button) => !isNonEmpty(text(button)) || !isNonEmpty(button.dataset.systemSummary) || !isNonEmpty(button.dataset.topologyLabel) || !isNonEmpty(button.dataset.topologyDetail) || hasInvalidDiagnostics(button))
  ) return null;

  for (const systemId of systemIds) {
    const definition = controlDefinition(controlPanelById.get(systemId), systemId);
    if (!definition || !hasValidControlVisibility(definition)) return null;
    controlsBySystem[systemId] = definition;
  }

  const presets = {};
  const presetSystemIds = {};
  for (const panel of panels) {
    const detailItems = [...panel.querySelectorAll("[data-system-detail]")];
    const primarySystemId = panel.dataset.primarySystem;
    if (
      !isNonEmpty(panel.dataset.liveSummary) || !isNonEmpty(panel.dataset.sceneLabel) || !systemIds.includes(primarySystemId) ||
      !sameIds(detailItems.map((detail) => detail.dataset.systemDetail), systemIds) ||
      detailItems.some((detail) => !isNonEmpty(detail.dataset.zoneId) || !isNonEmpty(detail.dataset.summary) || !visualIds.includes(detail.dataset.visualId))
    ) return null;
    const values = readPresetValues(panel, systemIds, controlsBySystem);
    if (!values) return null;
    presets[panel.dataset.presetPanel] = values;
    presetSystemIds[panel.dataset.presetPanel] = primarySystemId;
  }

  if (!panelById.has(initialPresetId) || !presets[initialPresetId] || presetSystemIds[initialPresetId] !== initialSystemId) return null;
  return { phone, experience, staticExplainer, scene, scenePreview, sceneTitle, sceneEyebrow, sceneLabel, sceneTopology, topologySource, topologyLogic, topologyResult, live, signature, activeLabel, activeSummary, topologyLabel, topologyDetail, phoneActive, radios, presetIds, panels, panelById, systemIds, systemButtons, systemButtonById, pictures: picture, pictureByVisualId: new Map(picture.map((candidate) => [candidate.dataset.scenePicture, candidate])), imageByVisualId: new Map(picture.map((candidate, index) => [candidate.dataset.scenePicture, pictureImages[index]])), controlPanels, controlPanelById, controlsBySystem, presets, presetSystemIds, initialPresetId, initialSystemId };
}

function enhanceSimulator(root) {
  const markup = validateMarkup(root);
  if (!markup) return;
  let machine;
  try {
    machine = createSmartHomeMachine({
      systemIds: markup.systemIds,
      presetIds: markup.presetIds,
      initialPresetId: markup.initialPresetId,
      initialSystemId: markup.initialSystemId,
      presetSystemIds: markup.presetSystemIds,
      controlsBySystem: markup.controlsBySystem,
      presets: markup.presets
    });
  } catch (_) {
    return;
  }
  let state = machine.initialState;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactScene = window.matchMedia("(max-width: 767px)");
  let motionPhase = "idle";
  let physicalSceneSvgOverlay = null;
  try {
    physicalSceneSvgOverlay = createPhysicalSceneSvgOverlay(markup.scene);
    physicalSceneSvgOverlay?.setPhase("idle");
  } catch (_) {
    physicalSceneSvgOverlay = null;
  }
  const activePanel = () => markup.panelById.get(state.presetId);
  const detailFor = (systemId) => activePanel().querySelector(`[data-system-detail="${CSS.escape(systemId)}"]`);

  const measuredMaximum = (element, candidates, { limit = 1 } = {}) => {
    const current = element.textContent;
    const selected = [...new Set(candidates)]
      .sort((left, right) => right.length - left.length)
      .slice(0, limit)
    let maximum = 0;
    selected.forEach((candidate) => {
      element.textContent = candidate;
      maximum = Math.max(maximum, element.getBoundingClientRect().height);
    });
    element.textContent = current;
    return Math.ceil(maximum);
  };

  const reserveSceneCopySpace = () => {
    const sceneCopy = markup.sceneTitle.closest(".smart-home__scene-copy");
    if (!sceneCopy) return;
    const entries = [
      [markup.sceneEyebrow, "--smart-home-scene-eyebrow-height"],
      [markup.sceneTitle, "--smart-home-scene-title-height"],
      [markup.sceneLabel, "--smart-home-scene-label-height"]
    ];
    const current = entries.map(([element]) => element.textContent);
    const visibility = sceneCopy.style.visibility;
    sceneCopy.style.visibility = "hidden";
    entries.forEach(([element, property]) => {
      const candidates = markup.systemButtons.flatMap((button) => {
        if (element === markup.sceneEyebrow) return button.dataset.topologyLabel;
        if (element === markup.sceneTitle) return text(button);
        return markup.panels.map((panel) => panel.querySelector(`[data-system-detail="${CSS.escape(button.dataset.phoneSystem)}"]`)?.dataset.summary || button.dataset.systemSummary);
      });
      element.style.setProperty(property, `${measuredMaximum(element, candidates)}px`);
    });
    entries.forEach(([element], index) => { element.textContent = current[index]; });
    sceneCopy.style.visibility = visibility;
  };

  const reservePhoneActiveSpace = () => {
    const entries = [
      [markup.topologyLabel, "--smart-home-phone-kicker-height"],
      [markup.activeLabel, "--smart-home-phone-label-height"],
      [markup.activeSummary, "--smart-home-phone-summary-height"],
      [markup.topologyDetail, "--smart-home-phone-topology-height"]
    ];
    const current = entries.map(([element]) => element.textContent);
    const records = markup.panels.flatMap((panel) => markup.systemButtons.map((button) => {
      const detail = panel.querySelector(`[data-system-detail="${CSS.escape(button.dataset.phoneSystem)}"]`);
      return [button.dataset.topologyLabel, text(button), detail?.dataset.summary || button.dataset.systemSummary, button.dataset.topologyDetail];
    }));
    entries.forEach(([element, property], index) => {
      element.textContent = current[index];
      element.style.setProperty(property, `${measuredMaximum(element, records.map((record) => record[index]))}px`);
    });
    const activeRecords = records
      .map((record) => ({ record, score: record.reduce((score, candidate) => score + candidate.length, 0) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 1);
    let maximum = 0;
    activeRecords.forEach(({ record }) => {
      entries.forEach(([element], index) => { element.textContent = record[index]; });
      maximum = Math.max(maximum, markup.phoneActive.getBoundingClientRect().height);
    });
    entries.forEach(([element], index) => { element.textContent = current[index]; });
    markup.phoneActive.style.setProperty("--smart-home-phone-active-height", `${Math.ceil(maximum)}px`);
  };

  const synchronizePhysicalSceneSvg = () => {
    let frame = null;
    try {
      frame = physicalSceneSvgOverlay?.render({
        systemId: state.systemId,
        valuesBySystem: state.valuesBySystem
      });
    } catch (_) {
      frame = null;
    }
    if (frame?.signature) root.dataset.physicalSceneSvgSignature = frame.signature;
    else delete root.dataset.physicalSceneSvgSignature;
  };

  const setPhysicalSceneSvgPhase = (phase) => {
    try {
      physicalSceneSvgOverlay?.setPhase(phase);
    } catch (_) {
      // The raster scene remains the baseline if the optional SVG adapter fails.
    }
  };

  const removeSnapshots = () => root.querySelectorAll("[data-outgoing-snapshot]").forEach((snapshot) => snapshot.dispatchEvent(new Event("smart-home:snapshot-remove")));
  const clearTransition = () => {
    removeSnapshots();
    delete root.dataset.transition;
  };
  const createOutgoingSnapshot = () => {
    if (reducedMotion.matches) return;
    const image = markup.scene.querySelector("picture[data-scene-picture]:not([hidden]) img");
    if (!image) return;
    const existingSnapshot = root.querySelector("[data-outgoing-snapshot]");
    const existingRaster = existingSnapshot?.querySelector("[data-outgoing-snapshot-raster]");
    const existingSvg = existingSnapshot?.querySelector("[data-physical-scene-svg-snapshot]");
    const imageStyle = getComputedStyle(image);
    const backgroundImage = existingRaster?.style.backgroundImage || `url("${image.currentSrc || image.src}")`;
    const backgroundPosition = existingRaster?.style.backgroundPosition || imageStyle.objectPosition;
    const imageFilter = existingRaster?.style.filter || imageStyle.filter;
    const svgSnapshot = existingSvg?.cloneNode(true) || createPhysicalSceneSvgSnapshot(markup.scene);
    removeSnapshots();
    const snapshot = document.createElement("div");
    snapshot.className = "smart-home__outgoing-snapshot";
    snapshot.dataset.outgoingSnapshot = "true";
    snapshot.setAttribute("aria-hidden", "true");
    const raster = document.createElement("span");
    raster.className = "smart-home__snapshot-raster";
    raster.dataset.outgoingSnapshotRaster = "true";
    raster.style.backgroundImage = backgroundImage;
    raster.style.backgroundPosition = backgroundPosition;
    raster.style.filter = imageFilter;
    snapshot.append(raster);
    if (svgSnapshot) snapshot.append(svgSnapshot);
    const remove = () => {
      snapshot.removeEventListener("animationend", onAnimationEnd);
      snapshot.removeEventListener("animationcancel", remove);
      snapshot.removeEventListener("smart-home:snapshot-remove", remove);
      reducedMotion.removeEventListener("change", onPreference);
      snapshot.remove();
    };
    const onPreference = (event) => { if (event.matches) remove(); };
    const onAnimationEnd = (event) => { if (event.animationName === "smart-home-disassemble") remove(); };
    snapshot.addEventListener("animationend", onAnimationEnd);
    snapshot.addEventListener("animationcancel", remove);
    snapshot.addEventListener("smart-home:snapshot-remove", remove);
    reducedMotion.addEventListener("change", onPreference);
    root.dataset.transition = "true";
    markup.scene.append(snapshot);
  };

  const synchronizePanelInertness = (inert) => {
    markup.panels.forEach((panel) => {
      const hidden = panel !== activePanel();
      panel.inert = inert || hidden;
      panel.setAttribute("aria-hidden", String(inert || hidden));
    });
  };

  const activateScenePicture = (visualId) => {
    const picture = markup.pictureByVisualId.get(visualId);
    const image = markup.imageByVisualId.get(visualId);
    if (!picture || !image) return;
    const source = compactScene.matches ? image.dataset.sceneMobile : image.dataset.sceneDesktop;
    const resolvedSource = new URL(source, document.baseURI).href;
    if (image.src !== resolvedSource) image.src = source;
    image.removeAttribute("srcset");
    markup.pictures.forEach((candidate) => {
      candidate.querySelectorAll("source").forEach((sourceCandidate) => sourceCandidate.remove());
      candidate.hidden = candidate !== picture;
    });
  };

  const controlValueLabel = (systemId, controlId, value) => {
    const control = markup.controlsBySystem[systemId].find((candidate) => candidate.id === controlId);
    if (control.type === "toggle") return value ? control.onLabel : control.offLabel;
    if (control.type === "range") return `${value}${control.outputSuffix}`;
    return text(root.querySelector(`[data-phone-segment][data-control-system="${CSS.escape(systemId)}"][data-control-id="${CSS.escape(controlId)}"][data-control-value="${CSS.escape(value)}"]`));
  };
  const controlLabel = (systemId, controlId) => text(root.querySelector(`[data-phone-control="${CSS.escape(systemId)}:${CSS.escape(controlId)}"] label, [data-phone-control="${CSS.escape(systemId)}:${CSS.escape(controlId)}"] .smart-home__phone-control-label`));

  const reserveSceneTopologySpace = () => {
    const entries = [
      [markup.topologySource, "--smart-home-topology-source-height"],
      [markup.topologyLogic, "--smart-home-topology-logic-height"],
      [markup.topologyResult, "--smart-home-topology-result-height"]
    ];
    const current = entries.map(([element]) => element.textContent);
    const visibility = markup.sceneTopology.style.visibility;
    markup.sceneTopology.style.visibility = "hidden";
    const sourceCandidates = markup.systemButtons.flatMap((button) => isNonEmpty(button.dataset.diagnosticObservation)
      ? [button.dataset.diagnosticObservation]
      : markup.panels.map((panel) => text(panel.querySelector("[data-preset-event]"))));
    const logicCandidates = markup.systemButtons.map((button) => isNonEmpty(button.dataset.diagnosticObservation) ? button.dataset.diagnosticIsolation : button.dataset.topologyLabel);
    const resultCandidates = markup.panels.flatMap((panel) => markup.systemButtons.flatMap((button) => {
      const systemId = button.dataset.phoneSystem;
      const diagnostics = isNonEmpty(button.dataset.diagnosticObservation);
      const summary = panel.querySelector(`[data-system-detail="${CSS.escape(systemId)}"]`)?.dataset.summary || button.dataset.systemSummary;
      return markup.controlsBySystem[systemId].flatMap((control) => {
        const values = control.type === "range" ? [control.min, control.max] : control.type === "toggle" ? [false, true] : control.options;
        return values.map((value) => diagnostics
          ? `${text(button)}: ${button.dataset.diagnosticNextStep}. ${controlLabel(systemId, control.id)}: ${controlValueLabel(systemId, control.id, value)}.`
          : `${text(button)}: ${summary} ${controlLabel(systemId, control.id)}: ${controlValueLabel(systemId, control.id, value)}.`);
      });
    }));
    [sourceCandidates, logicCandidates, resultCandidates].forEach((candidates, index) => {
      const [element, property] = entries[index];
      element.style.setProperty(property, `${measuredMaximum(element, candidates)}px`);
    });
    entries.forEach(([element], index) => { element.textContent = current[index]; });
    markup.sceneTopology.style.visibility = visibility;
  };

  const reservePhoneSignatureSpace = () => {
    const candidates = markup.panels.flatMap((panel) => [
      panel.dataset.liveSummary,
      ...markup.systemIds.flatMap((systemId) => markup.controlsBySystem[systemId].flatMap((control) => {
        const values = control.type === "range" ? [control.min, control.max] : control.type === "toggle" ? [false, true] : control.options;
        return values.map((value) => `Ручне коригування на основі «${text(panel.querySelector("h3"))}»: ${text(markup.systemButtonById.get(systemId))}. ${controlLabel(systemId, control.id)}: ${controlValueLabel(systemId, control.id, value)}.`);
      }))
    ]);
    markup.signature.style.setProperty("--smart-home-phone-signature-height", `${measuredMaximum(markup.signature, candidates)}px`);
  };

  const updateControls = () => {
    markup.systemIds.forEach((systemId) => {
      const controlPanel = markup.controlPanelById.get(systemId);
      const panelHidden = systemId !== state.systemId;
      controlPanel.hidden = panelHidden;
      controlPanel.inert = panelHidden;
      controlPanel.setAttribute("aria-hidden", String(panelHidden));
      for (const control of markup.controlsBySystem[systemId]) {
        const value = state.valuesBySystem[systemId][control.id];
        const controlRoot = root.querySelector(`[data-phone-control="${CSS.escape(systemId)}:${CSS.escape(control.id)}"]`);
        const isVisible = !control.visibleWhen || control.visibleWhen.expectedValues.includes(state.valuesBySystem[systemId][control.visibleWhen.controlId]);
        controlRoot.hidden = !isVisible;
        controlRoot.inert = !isVisible || panelHidden;
        controlRoot.setAttribute("aria-hidden", String(!isVisible || panelHidden));
        if (!isVisible && controlRoot.contains(document.activeElement)) {
          markup.phone.focus({ preventScroll: true });
        }
        const output = controlRoot.querySelector("[data-control-output] span");
        if (control.type === "range") controlRoot.querySelector("input").value = String(value);
        if (control.type === "segment") controlRoot.querySelectorAll("[data-phone-segment]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.controlValue === value)));
        if (control.type === "toggle") controlRoot.querySelector("[data-phone-toggle]").setAttribute("aria-pressed", String(value));
        output.textContent = control.type === "range" ? String(value) : controlValueLabel(systemId, control.id, value);
      }
    });
  };

  const normalizedControlValue = (control, value) => {
    if (control.type === "toggle") return value ? 1 : 0;
    if (control.type === "segment") return control.options.length < 2 ? 0 : control.options.indexOf(value) / (control.options.length - 1);
    return (value - control.min) / (control.max - control.min);
  };

  const synchronize = ({ announce = false, cinematic = false, initial = false, changedControlId = null } = {}) => {
    const panel = activePanel();
    const button = markup.systemButtonById.get(state.systemId);
    const detail = detailFor(state.systemId);
    const controls = markup.controlsBySystem[state.systemId];
    const visibleControls = controls.filter((control) => !control.visibleWhen || control.visibleWhen.expectedValues.includes(state.valuesBySystem[state.systemId][control.visibleWhen.controlId]));
    const selectedSceneContext = detail.dataset.summary || button.dataset.systemSummary;
    const selectedSystemLabel = text(button);
    const changedControl = visibleControls.find((control) => control.id === changedControlId) || visibleControls[0];
    const changedValue = state.valuesBySystem[state.systemId][changedControl.id];
    if (initial) motionPhase = "idle";
    root.dataset.enhanced = "true";
    root.dataset.preset = state.presetId;
    root.dataset.system = state.systemId;
    root.dataset.visual = button.dataset.systemVisual;
    root.dataset.manual = String(state.manual);
    if (root.dataset.motionPhase !== motionPhase) root.dataset.motionPhase = motionPhase;
    markup.phone.hidden = false;
    markup.staticExplainer.hidden = true;
    markup.radios.forEach((radio) => { radio.checked = radio.value === state.presetId; });
    markup.panels.forEach((candidate) => {
      const hidden = candidate !== panel;
      candidate.hidden = hidden;
      candidate.inert = hidden;
      candidate.setAttribute("aria-hidden", String(hidden));
    });
    markup.systemButtons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    activateScenePicture(button.dataset.systemVisual);
    if (!initial) {
      markup.sceneTitle.textContent = selectedSystemLabel;
      markup.sceneEyebrow.textContent = button.dataset.topologyLabel;
      markup.sceneLabel.textContent = selectedSceneContext;
    }
    markup.activeLabel.textContent = text(button);
    markup.activeSummary.textContent = detail.dataset.summary || button.dataset.systemSummary;
    markup.topologyLabel.textContent = button.dataset.topologyLabel;
    markup.topologyDetail.textContent = button.dataset.topologyDetail;
    markup.scenePreview.dataset.system = state.systemId;
    markup.scenePreview.dataset.control = changedControl.id;
    markup.scenePreview.dataset.value = String(changedValue);
    const previewSignature = controls.map((control) => `${control.id}:${state.valuesBySystem[state.systemId][control.id]}`).join("|");
    markup.scenePreview.dataset.previewSignature = previewSignature;
    root.dataset.previewSignature = previewSignature;
    for (let index = 1; index <= 4; index += 1) {
      markup.scenePreview.style.setProperty(`--smart-home-preview-control-${index}`, "0");
      root.style.setProperty(`--smart-home-preview-control-${index}`, "0");
    }
    controls.slice(0, 4).forEach((control, index) => {
      markup.scenePreview.style.setProperty(`--smart-home-preview-control-${index + 1}`, String(normalizedControlValue(control, state.valuesBySystem[state.systemId][control.id])));
      root.style.setProperty(`--smart-home-preview-control-${index + 1}`, String(normalizedControlValue(control, state.valuesBySystem[state.systemId][control.id])));
    });
    synchronizePhysicalSceneSvg();
    const diagnostics = isNonEmpty(button.dataset.diagnosticObservation);
    if (!initial) {
      markup.topologySource.textContent = diagnostics ? button.dataset.diagnosticObservation : text(panel.querySelector("[data-preset-event]"));
      markup.topologyLogic.textContent = diagnostics ? button.dataset.diagnosticIsolation : button.dataset.topologyLabel;
      markup.topologyResult.textContent = diagnostics
        ? `${selectedSystemLabel}: ${button.dataset.diagnosticNextStep}. ${controlLabel(state.systemId, changedControl.id)}: ${controlValueLabel(state.systemId, changedControl.id, changedValue)}.`
        : `${selectedSystemLabel}: ${selectedSceneContext} ${controlLabel(state.systemId, changedControl.id)}: ${controlValueLabel(state.systemId, changedControl.id, changedValue)}.`;
    }
    updateControls();
    const status = state.manual
      ? `Ручне коригування на основі «${panel.querySelector("h3").textContent.trim()}»: ${text(button)}. ${controlLabel(state.systemId, changedControl.id)}: ${controlValueLabel(state.systemId, changedControl.id, changedValue)}.`
      : panel.dataset.liveSummary;
    markup.signature.textContent = status;
    if (announce || cinematic || initial) markup.live.textContent = status;
  };

  const sceneCopy = markup.sceneTitle.closest(".smart-home__scene-copy");
  const initialSceneCopyVisibility = sceneCopy?.style.visibility;
  const initialTopologyVisibility = markup.sceneTopology.style.visibility;
  const initialPhoneActiveVisibility = markup.phoneActive.style.visibility;
  if (sceneCopy) sceneCopy.style.visibility = "hidden";
  markup.sceneTopology.style.visibility = "hidden";
  markup.phoneActive.style.visibility = "hidden";
  synchronize({ initial: true });
  reserveSceneCopySpace();
  reserveSceneTopologySpace();
  reservePhoneActiveSpace();
  if (sceneCopy) sceneCopy.style.visibility = initialSceneCopyVisibility;
  markup.sceneTopology.style.visibility = initialTopologyVisibility;
  markup.phoneActive.style.visibility = initialPhoneActiveVisibility;
  reservePhoneSignatureSpace();
  let phoneActiveResizeFrame = null;
  window.addEventListener("resize", () => {
    if (phoneActiveResizeFrame !== null) cancelAnimationFrame(phoneActiveResizeFrame);
    phoneActiveResizeFrame = requestAnimationFrame(() => {
      phoneActiveResizeFrame = null;
      reserveSceneCopySpace();
      reserveSceneTopologySpace();
      reservePhoneActiveSpace();
      reservePhoneSignatureSpace();
    });
  });

  let transitionGeneration = 0;
  const motion = createCinematicMotion({
    durations: { disassemble: 280, hold: 0, reassemble: 0 },
    onPhase: (phase) => {
      motionPhase = phase;
      root.dataset.motionPhase = phase;
      setPhysicalSceneSvgPhase("idle");
      synchronizePanelInertness(false);
      if (phase === "hold" || phase === "idle") clearTransition();
    }
  });

  const beginCinematicTransition = async (next) => {
    const generation = ++transitionGeneration;
    motion.cancel();
    createOutgoingSnapshot();
    state = next;
    if (!reducedMotion.matches) motion.prepare();
    synchronize({ announce: true, cinematic: true });
    if (reducedMotion.matches) {
      motion.start({ reducedMotion: true });
      setPhysicalSceneSvgPhase("idle");
      clearTransition();
      return;
    }
    const image = markup.scene.querySelector("picture[data-scene-picture]:not([hidden]) img");
    try {
      await image?.decode();
    } catch (_) {
      // The semantic scene and alt remain available if the decorative raster fails.
    }
    if (generation !== transitionGeneration) return;
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    if (generation !== transitionGeneration) return;
    motion.start();
  };

  const selectPreset = (presetId) => {
    const next = machine.transition(state, { type: "select-preset", presetId });
    if (next === state) return;
    beginCinematicTransition(next);
  };
  const selectSystem = (systemId) => {
    const next = machine.transition(state, { type: "select-system", systemId });
    if (next === state) return;
    beginCinematicTransition(next);
  };
  const setControl = (systemId, controlId, value) => {
    const next = machine.transition(state, { type: "set-control", systemId, controlId, value });
    if (next === state) return;
    transitionGeneration += 1;
    motion.cancel();
    clearTransition();
    synchronizePanelInertness(false);
    state = next;
    synchronize({ announce: true, changedControlId: controlId });
  };

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches("[data-preset-radio]")) selectPreset(target.value);
    if (target instanceof HTMLInputElement && target.matches("[data-phone-range]")) setControl(target.dataset.controlSystem, target.dataset.controlId, Number(target.value));
  });
  root.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches("[data-phone-range]")) setControl(target.dataset.controlSystem, target.dataset.controlId, Number(target.value));
  });
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("button") : null;
    const radio = event.target instanceof HTMLInputElement ? event.target.closest("[data-preset-radio]") : null;
    if (radio) {
      selectPreset(radio.value);
      return;
    }
    if (!target) return;
    if (target.matches("[data-phone-system]")) selectSystem(target.dataset.phoneSystem);
    if (target.matches("[data-phone-segment]")) setControl(target.dataset.controlSystem, target.dataset.controlId, target.dataset.controlValue);
    if (target.matches("[data-phone-toggle]")) setControl(target.dataset.controlSystem, target.dataset.controlId, target.getAttribute("aria-pressed") !== "true");
  });

  reducedMotion.addEventListener("change", (event) => {
    if (!event.matches) return;
    transitionGeneration += 1;
    clearTransition();
    motion.cancel();
    setPhysicalSceneSvgPhase("idle");
    synchronizePanelInertness(false);
  });
  compactScene.addEventListener("change", () => activateScenePicture(markup.systemButtonById.get(state.systemId).dataset.systemVisual));
}

const root = document.querySelector("[data-smart-home-simulator]");
if (root) enhanceSimulator(root);
