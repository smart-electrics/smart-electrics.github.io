import { createPhysicalSceneSvgProjector } from "./physical-scene-svg-state.js";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const safeParameter = (value) => typeof value === "string" && /^[a-z][a-z0-9_]*$/u.test(value);

function exactKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function stableNumber(value) {
  return Number(value.toFixed(12));
}

/**
 * Returns the source-space rectangle visible after CSS object-fit: cover and
 * normalized object-position have been applied. Invalid geometry fails closed.
 */
export function computePhysicalSceneSvgViewBox(candidate) {
  if (!exactKeys(candidate, ["sourceWidth", "sourceHeight", "containerWidth", "containerHeight", "positionX", "positionY"])) return null;
  const { sourceWidth, sourceHeight, containerWidth, containerHeight, positionX, positionY } = candidate;
  if (![sourceWidth, sourceHeight, containerWidth, containerHeight].every((value) => finiteNumber(value) && value > 0) || ![positionX, positionY].every((value) => finiteNumber(value) && value >= 0 && value <= 1)) return null;

  const scale = Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const width = containerWidth / scale;
  const height = containerHeight / scale;
  return deepFreeze({
    x: stableNumber((sourceWidth - width) * positionX),
    y: stableNumber((sourceHeight - height) * positionY),
    width: stableNumber(width),
    height: stableNumber(height)
  });
}

function cloneRegistry(registry) {
  if (!exactKeys(registry, ["systems"]) || !Array.isArray(registry.systems) || registry.systems.length === 0) {
    throw new TypeError("SVG overlay registry must contain systems");
  }
  const systemIds = new Set();
  const layerIds = new Set();
  const systems = registry.systems.map((rawSystem) => {
    if (!exactKeys(rawSystem, ["id", "layerIds"]) || !nonEmptyString(rawSystem.id) || !Array.isArray(rawSystem.layerIds) || rawSystem.layerIds.length === 0) {
      throw new TypeError("SVG overlay system must contain an ID and layers");
    }
    const id = rawSystem.id.trim();
    if (systemIds.has(id)) throw new TypeError("SVG overlay system IDs must be unique");
    systemIds.add(id);
    const normalizedLayerIds = rawSystem.layerIds.map((layerId) => {
      if (!nonEmptyString(layerId)) throw new TypeError("SVG overlay layer IDs must be non-empty");
      const normalized = layerId.trim();
      if (layerIds.has(normalized)) throw new TypeError("SVG overlay layer IDs must be globally unique");
      layerIds.add(normalized);
      return normalized;
    });
    return deepFreeze({ id, layerIds: Object.freeze(normalizedLayerIds) });
  });
  return deepFreeze({ systems });
}

function cssValue(parameter, value) {
  if (!safeParameter(parameter) || !finiteNumber(value)) return null;
  const stable = stableNumber(value);
  if (parameter === "translate_x" || parameter === "translate_y") return `${stable}px`;
  if (parameter === "angle" || parameter === "slat_angle" || parameter === "view_angle") return `${stable}deg`;
  return String(stable);
}

function validFrame(frame) {
  if (!isObject(frame)) return false;
  const allowedKeys = new Set(["systemId", "signature", "layers", "viewBox"]);
  if (Object.keys(frame).some((key) => !allowedKeys.has(key)) || !Object.hasOwn(frame, "systemId") || !Object.hasOwn(frame, "signature") || !Object.hasOwn(frame, "layers") || !nonEmptyString(frame.systemId) || !nonEmptyString(frame.signature) || !Array.isArray(frame.layers) || frame.layers.length === 0) return false;
  if (Object.hasOwn(frame, "viewBox") && !nonEmptyString(frame.viewBox)) return false;
  return true;
}

function validLayer(layer) {
  return exactKeys(layer, ["id", "geometry", "parameters"]) && nonEmptyString(layer.id) && isObject(layer.geometry) && nonEmptyString(layer.geometry.kind) && isObject(layer.parameters) && Object.keys(layer.parameters).length > 0;
}

/**
 * Validates projector frames against the markup-declared global layer registry
 * and reduces them to inert attributes/styles an adapter can apply to SVG.
 */
export function createPhysicalSceneSvgPresenter(registry) {
  const normalized = cloneRegistry(registry);
  const systems = new Map(normalized.systems.map((system) => [system.id, system]));
  const allLayerIds = normalized.systems.flatMap((system) => system.layerIds);

  return Object.freeze({
    present(frame) {
      if (!validFrame(frame)) return null;
      const system = systems.get(frame.systemId);
      if (!system) return null;
      const activeLayerIds = [];
      const layers = [];
      for (const layer of frame.layers) {
        if (!validLayer(layer)) return null;
        const layerId = layer.id.trim();
        if (!system.layerIds.includes(layerId) || activeLayerIds.includes(layerId)) return null;
        const cssProperties = {};
        for (const [parameter, value] of Object.entries(layer.parameters)) {
          const css = cssValue(parameter, value);
          if (css === null) return null;
          cssProperties[`--physical-${parameter.replaceAll("_", "-")}`] = css;
          if (parameter === "slat_angle") cssProperties["--physical-slat-face"] = String(stableNumber(0.16 + (Math.min(Math.abs(value), 45) / 45) * 0.84));
        }
        activeLayerIds.push(layerId);
        layers.push(deepFreeze({ id: layerId, cssProperties: deepFreeze(cssProperties) }));
      }
      return deepFreeze({
        systemId: system.id,
        signature: frame.signature,
        layers: Object.freeze(layers),
        hiddenLayerIds: Object.freeze(allLayerIds.filter((layerId) => !activeLayerIds.includes(layerId)))
      });
    }
  });
}

const OVERLAY_PHASES = new Set(["idle", "disassemble", "hold", "reassemble"]);

function one(root, selector) {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Freezes the currently rendered SVG into an inert visual-only clone so a
 * raster crossfade never pairs an outgoing room with incoming engineering
 * geometry. Definitions remain in the live sibling SVG and are immutable.
 */
export function createPhysicalSceneSvgSnapshot(host) {
  if (!host || typeof host.querySelectorAll !== "function") return null;
  const source = one(host, "svg[data-physical-scene-svg-overlay]");
  if (!source || source.hasAttribute("hidden") || source.dataset.physicalSceneSvgEnhanced !== "true" || typeof source.cloneNode !== "function") return null;
  const snapshot = source.cloneNode(true);
  snapshot.querySelector("defs")?.remove();
  snapshot.removeAttribute("data-physical-scene-svg-overlay");
  snapshot.removeAttribute("data-physical-scene-svg-instance");
  snapshot.removeAttribute("data-physical-scene-svg-enhanced");
  snapshot.removeAttribute("data-physical-scene-svg-active-system");
  snapshot.removeAttribute("data-physical-scene-svg-phase");
  snapshot.removeAttribute("data-physical-scene-svg-signature");
  snapshot.removeAttribute("hidden");
  snapshot.removeAttribute("tabindex");
  snapshot.dataset.physicalSceneSvgSnapshot = source.dataset.physicalSceneSvgSignature || "rendered";
  snapshot.classList.add("physical-scene-svg-snapshot");
  return snapshot;
}

function normalizedPosition(value) {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source) return null;
  const percent = source.endsWith("%") ? Number(source.slice(0, -1)) / 100 : Number(source);
  return finiteNumber(percent) && percent >= 0 && percent <= 1 ? percent : null;
}

function profileRegistry(profile) {
  if (!isObject(profile) || !Array.isArray(profile.systems)) return null;
  return { systems: profile.systems.map((system) => ({
    id: system?.id,
    layerIds: Array.isArray(system?.layers) ? system.layers.map((layer) => layer?.id) : []
  })) };
}

function validateOverlayMarkup(host, svg, profile) {
  if (
    svg.getAttribute("aria-hidden") !== "true" || svg.getAttribute("focusable") !== "false" ||
    !Array.isArray(profile?.systems) || profile.systems.length === 0
  ) return null;
  const systemElements = [...svg.querySelectorAll("[data-physical-scene-svg-system]")];
  if (systemElements.length !== profile.systems.length) return null;
  const layerElements = new Map();
  for (let index = 0; index < profile.systems.length; index += 1) {
    const profileSystem = profile.systems[index];
    const systemElement = systemElements[index];
    if (!isObject(profileSystem) || systemElement.dataset.physicalSceneSvgSystem !== profileSystem.id || !Array.isArray(profileSystem.layers)) return null;
    const elements = [...systemElement.querySelectorAll("[data-physical-scene-svg-layer]")];
    if (elements.length !== profileSystem.layers.length) return null;
    for (let layerIndex = 0; layerIndex < profileSystem.layers.length; layerIndex += 1) {
      const profileLayer = profileSystem.layers[layerIndex];
      const layerElement = elements[layerIndex];
      const shapes = [...layerElement.querySelectorAll("[data-physical-scene-svg-shape]")];
      if (
        !isObject(profileLayer) || layerElement.dataset.physicalSceneSvgLayer !== profileLayer.id ||
        layerElement.dataset.physicalSceneSvgEffect !== profileLayer.effect || shapes.length !== 1 ||
        shapes[0].dataset.physicalSceneSvgShape !== profileLayer.geometry?.kind || layerElements.has(profileLayer.id)
      ) return null;
      layerElements.set(profileLayer.id, layerElement);
    }
  }
  return { systemElements, layerElements };
}

/**
 * Fail-closed DOM controller for one decorative inline SVG scene overlay.
 * It deliberately accepts only the exact template generated from its profile.
 */
export function createPhysicalSceneSvgOverlay(host, options = {}) {
  if (!host || typeof host.querySelectorAll !== "function" || typeof host.getBoundingClientRect !== "function" || !isObject(options)) return null;
  const svg = one(host, "svg[data-physical-scene-svg-overlay]");
  const source = one(host, "script[data-physical-scene-svg-profile]");
  const ResizeObserverConstructor = options.ResizeObserver || globalThis.ResizeObserver;
  const readComputedStyle = options.getComputedStyle || globalThis.getComputedStyle;
  if (!svg || !source || typeof ResizeObserverConstructor !== "function" || typeof readComputedStyle !== "function" || !svg.style) return null;

  let profile;
  let projector;
  let presenter;
  let markup;
  try {
    profile = JSON.parse(source.textContent);
    projector = createPhysicalSceneSvgProjector(profile);
    const registry = profileRegistry(profile);
    if (!registry) return null;
    presenter = createPhysicalSceneSvgPresenter(registry);
    markup = validateOverlayMarkup(host, svg, profile);
    if (!markup) return null;
  } catch (_) {
    return null;
  }

  const appliedProperties = new Map();
  let observer = null;
  let destroyed = false;

  const clearLayer = (layerElement) => {
    const properties = appliedProperties.get(layerElement) || [];
    properties.forEach((property) => layerElement.style.removeProperty(property));
    appliedProperties.delete(layerElement);
    layerElement.removeAttribute("data-physical-scene-svg-parameters");
    layerElement.removeAttribute("data-physical-blind-tilt");
    layerElement.setAttribute("hidden", "");
  };
  const clear = () => {
    markup.systemElements.forEach((systemElement) => systemElement.setAttribute("hidden", ""));
    markup.layerElements.forEach(clearLayer);
    svg.setAttribute("hidden", "");
    ["data-physical-scene-svg-enhanced", "data-physical-scene-svg-active-system", "data-physical-scene-svg-signature", "data-physical-scene-svg-phase"].forEach((attribute) => svg.removeAttribute(attribute));
  };
  const synchronizeCrop = () => {
    let styles;
    try { styles = readComputedStyle(svg); } catch (_) { return false; }
    if (!styles || typeof styles.getPropertyValue !== "function") return false;
    const positionX = normalizedPosition(styles.getPropertyValue("--physical-crop-x"));
    const positionY = normalizedPosition(styles.getPropertyValue("--physical-crop-y"));
    const rect = host.getBoundingClientRect();
    const crop = computePhysicalSceneSvgViewBox({
      sourceWidth: profile.view_box?.width,
      sourceHeight: profile.view_box?.height,
      containerWidth: rect?.width,
      containerHeight: rect?.height,
      positionX,
      positionY
    });
    if (!crop) return false;
    svg.setAttribute("viewBox", `${crop.x} ${crop.y} ${crop.width} ${crop.height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    return true;
  };

  // Residence and subordinate physical stages are intentionally hidden until
  // their semantic controls become available. A zero-sized initial host must
  // not permanently disable the overlay; the first visible render owns the
  // required crop synchronization.
  synchronizeCrop();
  try {
    observer = new ResizeObserverConstructor(() => {
      if (!destroyed && !synchronizeCrop()) clear();
    });
    if (!observer || typeof observer.observe !== "function" || typeof observer.disconnect !== "function") return null;
    observer.observe(host);
  } catch (_) {
    return null;
  }

  return Object.freeze({
    render(candidate) {
      if (destroyed) return null;
      const frame = projector.frameFor(candidate);
      const presentation = frame && presenter.present(frame);
      if (!frame || !presentation || !synchronizeCrop()) {
        clear();
        return null;
      }
      const active = new Map(presentation.layers.map((layer) => [layer.id, layer]));
      markup.systemElements.forEach((systemElement) => {
        if (systemElement.dataset.physicalSceneSvgSystem === presentation.systemId) systemElement.removeAttribute("hidden");
        else systemElement.setAttribute("hidden", "");
      });
      markup.layerElements.forEach((layerElement, layerId) => {
        const layer = active.get(layerId);
        if (!layer) {
          clearLayer(layerElement);
          return;
        }
        const previous = appliedProperties.get(layerElement) || [];
        previous.forEach((property) => layerElement.style.removeProperty(property));
        const properties = Object.entries(layer.cssProperties);
        properties.forEach(([property, value]) => layerElement.style.setProperty(property, value));
        appliedProperties.set(layerElement, properties.map(([property]) => property));
        const sourceLayer = frame.layers.find((candidateLayer) => candidateLayer.id === layerId);
        if (!sourceLayer) {
          clear();
          return;
        }
        layerElement.setAttribute("data-physical-scene-svg-parameters", JSON.stringify(sourceLayer.parameters));
        if (Object.hasOwn(sourceLayer.parameters, "slat_angle")) {
          const slatAngle = sourceLayer.parameters.slat_angle;
          layerElement.dataset.physicalBlindTilt = slatAngle > 1 ? "toward" : slatAngle < -1 ? "away" : "open";
        } else {
          layerElement.removeAttribute("data-physical-blind-tilt");
        }
        layerElement.removeAttribute("hidden");
      });
      svg.dataset.physicalSceneSvgEnhanced = "true";
      svg.dataset.physicalSceneSvgActiveSystem = presentation.systemId;
      svg.dataset.physicalSceneSvgSignature = presentation.signature;
      svg.removeAttribute("hidden");
      return frame;
    },
    setPhase(phase) {
      if (destroyed || !OVERLAY_PHASES.has(phase)) return null;
      svg.dataset.physicalSceneSvgPhase = phase;
      return phase;
    },
    disable() {
      clear();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      clear();
    }
  });
}
