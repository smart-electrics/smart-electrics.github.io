import { createSmartHomeMachine } from "./smart-home-simulator-state.js";

const isNonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const sameIds = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
const uniqueIds = (values) => values.length > 0 && values.every(isNonEmpty) && new Set(values).size === values.length;
const only = (root, selector) => {
  const values = [...root.querySelectorAll(selector)];
  return values.length === 1 ? values[0] : null;
};
const text = (element) => element?.textContent?.trim() || "";

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

    if (type === "range") {
      const input = only(control, `input[type="range"][data-phone-range][data-control-system="${CSS.escape(systemId)}"][data-control-id="${CSS.escape(controlId)}"]`);
      if (!input || !input.min || !input.max || !input.step || Number(input.min) >= Number(input.max) || Number.isNaN(Number(input.value))) return null;
      definitions.push({ id: controlId, type, min: Number(input.min), max: Number(input.max), step: Number(input.step), defaultValue: Number(input.value) });
      continue;
    }

    if (type === "segment") {
      const options = [...control.querySelectorAll(`button[data-phone-segment][data-control-system="${CSS.escape(systemId)}"][data-control-id="${CSS.escape(controlId)}"][data-control-value]`)];
      const ids = options.map((option) => option.dataset.controlValue);
      if (!uniqueIds(ids) || options.some((option) => !text(option))) return null;
      definitions.push({ id: controlId, type, options: ids, defaultValue: options.find((option) => option.getAttribute("aria-pressed") === "true")?.dataset.controlValue });
      continue;
    }

    const toggle = only(control, `button[data-phone-toggle][data-control-system="${CSS.escape(systemId)}"][data-control-id="${CSS.escape(controlId)}"]`);
    const onLabel = toggle?.dataset.controlOnLabel;
    const offLabel = toggle?.dataset.controlOffLabel;
    if (!toggle || !text(toggle) || !isNonEmpty(onLabel) || !isNonEmpty(offLabel) || !["true", "false"].includes(toggle.getAttribute("aria-pressed"))) return null;
    definitions.push({ id: controlId, type, onLabel, offLabel, defaultValue: toggle.getAttribute("aria-pressed") === "true" });
  }
  return uniqueIds(definitions.map((control) => control.id)) ? definitions : null;
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
    !sceneTopology || topologyConnectors.length !== 2 || ![sceneTitle, sceneEyebrow, sceneLabel, activeLabel, activeSummary, topologyLabel, topologyDetail, topologySource, topologyLogic, topologyResult].every((item) => isNonEmpty(text(item))) ||
    allRadios.length !== radios.length || checked.length !== 1 || !uniqueIds(presetIds) || !sameIds(radios.map((radio) => radio.value), presetIds) ||
    !uniqueIds(systemIds) || !sameIds(staticLabels.map((label) => label.dataset.systemLabel), systemIds) ||
    !sameIds(controlPanelIds, systemIds) || !uniqueIds(visualIds) || !sameIds(visualIds, systemButtons.map((button) => button.dataset.systemVisual)) ||
    visiblePicture.length !== 1 || visiblePicture[0]?.dataset.scenePicture !== systemButtons[0]?.dataset.systemVisual ||
    systemButtons.some((button) => !isNonEmpty(text(button)) || !isNonEmpty(button.dataset.systemSummary) || !isNonEmpty(button.dataset.topologyLabel) || !isNonEmpty(button.dataset.topologyDetail) || hasInvalidDiagnostics(button))
  ) return null;

  for (const systemId of systemIds) {
    const definition = controlDefinition(controlPanelById.get(systemId), systemId);
    if (!definition) return null;
    controlsBySystem[systemId] = definition;
  }

  const presets = {};
  for (const panel of panels) {
    const detailItems = [...panel.querySelectorAll("[data-system-detail]")];
    if (
      !isNonEmpty(panel.dataset.liveSummary) || !isNonEmpty(panel.dataset.sceneLabel) ||
      !sameIds(detailItems.map((detail) => detail.dataset.systemDetail), systemIds) ||
      detailItems.some((detail) => !isNonEmpty(detail.dataset.zoneId) || !isNonEmpty(detail.dataset.summary) || !visualIds.includes(detail.dataset.visualId))
    ) return null;
    const values = readPresetValues(panel, systemIds, controlsBySystem);
    if (!values) return null;
    presets[panel.dataset.presetPanel] = values;
  }

  const initialPresetId = checked[0].value;
  const initialSystemId = systemIds[0];
  if (!panelById.has(initialPresetId) || !presets[initialPresetId]) return null;
  return { phone, experience, staticExplainer, scene, scenePreview, sceneTitle, sceneEyebrow, sceneLabel, sceneTopology, topologySource, topologyLogic, topologyResult, live, signature, activeLabel, activeSummary, topologyLabel, topologyDetail, radios, presetIds, panels, panelById, systemIds, systemButtons, systemButtonById, pictures: picture, controlPanels, controlPanelById, controlsBySystem, presets, initialPresetId, initialSystemId };
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
      controlsBySystem: markup.controlsBySystem,
      presets: markup.presets
    });
  } catch (_) {
    return;
  }
  let state = machine.initialState;
  let motionPhase = null;
  const activePanel = () => markup.panelById.get(state.presetId);
  const detailFor = (systemId) => activePanel().querySelector(`[data-system-detail="${CSS.escape(systemId)}"]`);

  const removeSnapshots = () => root.querySelectorAll("[data-outgoing-snapshot]").forEach((snapshot) => snapshot.dispatchEvent(new Event("smart-home:snapshot-remove")));
  const createOutgoingSnapshot = () => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const image = markup.scene.querySelector("picture[data-scene-picture]:not([hidden]) img");
    if (!image) return;
    removeSnapshots();
    const snapshot = document.createElement("div");
    snapshot.className = "smart-home__outgoing-snapshot";
    snapshot.dataset.outgoingSnapshot = "true";
    snapshot.setAttribute("aria-hidden", "true");
    snapshot.style.backgroundImage = `url("${image.currentSrc || image.src}")`;
    const remove = () => {
      snapshot.removeEventListener("animationend", onAnimationEnd);
      snapshot.removeEventListener("animationcancel", remove);
      snapshot.removeEventListener("smart-home:snapshot-remove", remove);
      preference.removeEventListener("change", onPreference);
      snapshot.remove();
    };
    const onPreference = (event) => { if (event.matches) remove(); };
    const onAnimationEnd = (event) => { if (event.animationName === "smart-home-disassemble") remove(); };
    snapshot.addEventListener("animationend", onAnimationEnd);
    snapshot.addEventListener("animationcancel", remove);
    snapshot.addEventListener("smart-home:snapshot-remove", remove);
    preference.addEventListener("change", onPreference);
    markup.scene.append(snapshot);
  };

  const controlValueLabel = (systemId, controlId, value) => {
    const control = markup.controlsBySystem[systemId].find((candidate) => candidate.id === controlId);
    if (control.type === "toggle") return value ? control.onLabel : control.offLabel;
    if (control.type === "range") return `${value}${root.querySelector(`[data-phone-control="${CSS.escape(systemId)}:${CSS.escape(controlId)}"] output`)?.textContent?.includes("%") ? "%" : ""}`;
    return text(root.querySelector(`[data-phone-segment][data-control-system="${CSS.escape(systemId)}"][data-control-id="${CSS.escape(controlId)}"][data-control-value="${CSS.escape(value)}"]`));
  };
  const controlLabel = (systemId, controlId) => text(root.querySelector(`[data-phone-control="${CSS.escape(systemId)}:${CSS.escape(controlId)}"] label, [data-phone-control="${CSS.escape(systemId)}:${CSS.escape(controlId)}"] .smart-home__phone-control-label`));

  const updateControls = () => {
    markup.systemIds.forEach((systemId) => {
      markup.controlPanelById.get(systemId).hidden = systemId !== state.systemId;
      for (const control of markup.controlsBySystem[systemId]) {
        const value = state.valuesBySystem[systemId][control.id];
        const controlRoot = root.querySelector(`[data-phone-control="${CSS.escape(systemId)}:${CSS.escape(control.id)}"]`);
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
    const changedControl = controls.find((control) => control.id === changedControlId) || controls[0];
    const changedValue = state.valuesBySystem[state.systemId][changedControl.id];
    if (initial) motionPhase = "initial";
    else if (cinematic) motionPhase = motionPhase === "a" ? "b" : "a";
    root.dataset.enhanced = "true";
    root.dataset.preset = state.presetId;
    root.dataset.system = state.systemId;
    root.dataset.visual = button.dataset.systemVisual;
    root.dataset.manual = String(state.manual);
    if (motionPhase) root.dataset.motionPhase = motionPhase;
    markup.phone.hidden = false;
    markup.staticExplainer.hidden = true;
    markup.radios.forEach((radio) => { radio.checked = radio.value === state.presetId; });
    markup.panels.forEach((candidate) => { candidate.hidden = candidate !== panel; });
    markup.systemButtons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    markup.pictures.forEach((candidate) => { candidate.hidden = candidate.dataset.scenePicture !== button.dataset.systemVisual; });
    markup.sceneTitle.textContent = text(panel.querySelector("h3"));
    markup.sceneEyebrow.textContent = text(panel.querySelector(".section-kicker"));
    markup.sceneLabel.textContent = panel.dataset.sceneLabel;
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
    const diagnostics = isNonEmpty(button.dataset.diagnosticObservation);
    markup.topologySource.textContent = diagnostics ? button.dataset.diagnosticObservation : text(panel.querySelector("[data-preset-event]"));
    markup.topologyLogic.textContent = diagnostics ? button.dataset.diagnosticIsolation : button.dataset.topologyLabel;
    markup.topologyResult.textContent = diagnostics
      ? `${panel.dataset.sceneLabel}: ${button.dataset.diagnosticNextStep}; ${controlLabel(state.systemId, changedControl.id)}, ${controlValueLabel(state.systemId, changedControl.id, changedValue)}`
      : `${panel.dataset.sceneLabel}: ${controlLabel(state.systemId, changedControl.id)}, ${controlValueLabel(state.systemId, changedControl.id, changedValue)}`;
    updateControls();
    const status = state.manual
      ? `Ручне коригування на основі «${panel.querySelector("h3").textContent.trim()}»: ${text(button)}. ${controlLabel(state.systemId, changedControl.id)}: ${controlValueLabel(state.systemId, changedControl.id, changedValue)}.`
      : panel.dataset.liveSummary;
    markup.signature.textContent = status;
    if (announce || cinematic || initial) markup.live.textContent = status;
  };

  synchronize({ initial: true });

  const selectPreset = (presetId) => {
    const next = machine.transition(state, { type: "select-preset", presetId });
    if (next === state) return;
    createOutgoingSnapshot();
    state = next;
    synchronize({ announce: true, cinematic: true });
  };
  const selectSystem = (systemId) => {
    const next = machine.transition(state, { type: "select-system", systemId });
    if (next === state) return;
    createOutgoingSnapshot();
    state = next;
    synchronize({ announce: true, cinematic: true });
  };
  const setControl = (systemId, controlId, value) => {
    const next = machine.transition(state, { type: "set-control", systemId, controlId, value });
    if (next === state) return;
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
}

const root = document.querySelector("[data-smart-home-simulator]");
if (root) enhanceSimulator(root);
