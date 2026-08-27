const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

function hasExactKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function finiteInView(value, maximum) {
  return isFiniteNumber(value) && value >= 0 && value <= maximum;
}

function cloneGeometry(rawGeometry, viewBox) {
  if (!isObject(rawGeometry) || !nonEmptyString(rawGeometry.kind)) {
    throw new TypeError("SVG layer geometry must be a supported mapping");
  }

  if (rawGeometry.kind === "ellipse") {
    if (!hasExactKeys(rawGeometry, ["kind", "cx", "cy", "rx", "ry"])) {
      throw new TypeError("SVG ellipse geometry must have exact bounds");
    }
    const { cx, cy, rx, ry } = rawGeometry;
    if (
      !finiteInView(cx, viewBox.width) || !finiteInView(cy, viewBox.height) ||
      !isFiniteNumber(rx) || !isFiniteNumber(ry) || rx <= 0 || ry <= 0 ||
      cx - rx < 0 || cx + rx > viewBox.width || cy - ry < 0 || cy + ry > viewBox.height
    ) {
      throw new TypeError("SVG ellipse geometry must stay within the view box");
    }
    return deepFreeze({ kind: "ellipse", cx, cy, rx, ry });
  }

  if (rawGeometry.kind === "circle") {
    if (!hasExactKeys(rawGeometry, ["kind", "cx", "cy", "r"])) {
      throw new TypeError("SVG circle geometry must have exact bounds");
    }
    const { cx, cy, r } = rawGeometry;
    if (!finiteInView(cx, viewBox.width) || !finiteInView(cy, viewBox.height) || !isFiniteNumber(r) || r <= 0 || cx - r < 0 || cx + r > viewBox.width || cy - r < 0 || cy + r > viewBox.height) {
      throw new TypeError("SVG circle geometry must stay within the view box");
    }
    return deepFreeze({ kind: "circle", cx, cy, r });
  }

  if (rawGeometry.kind === "path") {
    if (!hasExactKeys(rawGeometry, ["kind", "points"]) || !Array.isArray(rawGeometry.points) || rawGeometry.points.length < 2) {
      throw new TypeError("SVG path geometry must contain at least two points");
    }
    let hasLength = false;
    const points = rawGeometry.points.map((point, index) => {
      if (!Array.isArray(point) || point.length !== 2 || !finiteInView(point[0], viewBox.width) || !finiteInView(point[1], viewBox.height)) {
        throw new TypeError("SVG path points must stay within the view box");
      }
      if (index > 0 && (point[0] !== rawGeometry.points[index - 1][0] || point[1] !== rawGeometry.points[index - 1][1])) hasLength = true;
      return Object.freeze([point[0], point[1]]);
    });
    if (!hasLength) throw new TypeError("SVG path geometry must have non-zero length");
    return deepFreeze({ kind: "path", points });
  }

  if (rawGeometry.kind === "rect") {
    if (!hasExactKeys(rawGeometry, ["kind", "x", "y", "width", "height"])) {
      throw new TypeError("SVG rect geometry must have exact bounds");
    }
    const { x, y, width, height } = rawGeometry;
    if (!finiteInView(x, viewBox.width) || !finiteInView(y, viewBox.height) || !isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0 || x + width > viewBox.width || y + height > viewBox.height) {
      throw new TypeError("SVG rect geometry must stay within the view box");
    }
    return deepFreeze({ kind: "rect", x, y, width, height });
  }

  if (rawGeometry.kind === "line") {
    if (!hasExactKeys(rawGeometry, ["kind", "x1", "y1", "x2", "y2"])) {
      throw new TypeError("SVG line geometry must have exact bounds");
    }
    const { x1, y1, x2, y2 } = rawGeometry;
    if (!finiteInView(x1, viewBox.width) || !finiteInView(x2, viewBox.width) || !finiteInView(y1, viewBox.height) || !finiteInView(y2, viewBox.height) || (x1 === x2 && y1 === y2)) {
      throw new TypeError("SVG line geometry must stay within the view box and have length");
    }
    return deepFreeze({ kind: "line", x1, y1, x2, y2 });
  }

  if (rawGeometry.kind === "polygon") {
    if (!hasExactKeys(rawGeometry, ["kind", "points"]) || !Array.isArray(rawGeometry.points) || rawGeometry.points.length < 3) {
      throw new TypeError("SVG polygon geometry must contain at least three points");
    }
    const points = rawGeometry.points.map((point) => {
      if (!Array.isArray(point) || point.length !== 2 || !finiteInView(point[0], viewBox.width) || !finiteInView(point[1], viewBox.height)) {
        throw new TypeError("SVG polygon points must stay within the view box");
      }
      return Object.freeze([point[0], point[1]]);
    });
    const twiceArea = points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point[0] * next[1] - next[0] * point[1];
    }, 0);
    if (twiceArea === 0) throw new TypeError("SVG polygon geometry must have non-zero area");
    return deepFreeze({ kind: "polygon", points });
  }

  throw new TypeError("SVG layer geometry kind is unsupported");
}

function cloneBinding(rawBinding) {
  if (!isObject(rawBinding) || !nonEmptyString(rawBinding.control_id) || !nonEmptyString(rawBinding.parameter)) {
    throw new TypeError("SVG layer binding must identify a control and parameter");
  }

  if (rawBinding.type === "range") {
    if (!hasExactKeys(rawBinding, ["control_id", "type", "input", "parameter", "output"]) ||
      !hasExactKeys(rawBinding.input, ["min", "max"]) || !hasExactKeys(rawBinding.output, ["min", "max"])) {
      throw new TypeError("SVG range binding must define exact input and output bounds");
    }
    const { min: inputMin, max: inputMax } = rawBinding.input;
    const { min: outputMin, max: outputMax } = rawBinding.output;
    if (!isFiniteNumber(inputMin) || !isFiniteNumber(inputMax) || inputMin >= inputMax || !isFiniteNumber(outputMin) || !isFiniteNumber(outputMax)) {
      throw new TypeError("SVG range binding bounds must be finite and increasing");
    }
    return deepFreeze({
      controlId: rawBinding.control_id.trim(),
      type: "range",
      parameter: rawBinding.parameter.trim(),
      input: { min: inputMin, max: inputMax },
      output: { min: outputMin, max: outputMax }
    });
  }

  if (rawBinding.type === "segment") {
    if (!hasExactKeys(rawBinding, ["control_id", "type", "parameter", "output"]) || !isObject(rawBinding.output)) {
      throw new TypeError("SVG segment binding must define exact output values");
    }
    const entries = Object.entries(rawBinding.output);
    if (entries.length === 0 || entries.some(([value, output]) => !nonEmptyString(value) || !isFiniteNumber(output))) {
      throw new TypeError("SVG segment binding values must be non-empty and finite");
    }
    return deepFreeze({
      controlId: rawBinding.control_id.trim(),
      type: "segment",
      parameter: rawBinding.parameter.trim(),
      output: Object.fromEntries(entries.map(([value, output]) => [value, output]))
    });
  }

  if (rawBinding.type === "toggle") {
    if (!hasExactKeys(rawBinding, ["control_id", "type", "parameter", "output"]) || !hasExactKeys(rawBinding.output, ["false", "true"]) || !isFiniteNumber(rawBinding.output.false) || !isFiniteNumber(rawBinding.output.true)) {
      throw new TypeError("SVG toggle binding must define exact false and true outputs");
    }
    return deepFreeze({
      controlId: rawBinding.control_id.trim(),
      type: "toggle",
      parameter: rawBinding.parameter.trim(),
      output: { false: rawBinding.output.false, true: rawBinding.output.true }
    });
  }

  throw new TypeError("SVG layer binding type is unsupported");
}

function cloneVisibleWhen(rawVisibleWhen) {
  if (!hasExactKeys(rawVisibleWhen, ["control_id", "equals"]) || !nonEmptyString(rawVisibleWhen.control_id) || !nonEmptyString(rawVisibleWhen.equals)) {
    throw new TypeError("SVG layer visibility must identify an exact segment value");
  }
  return deepFreeze({ controlId: rawVisibleWhen.control_id.trim(), equals: rawVisibleWhen.equals });
}

function cloneLayer(rawLayer, viewBox, seenLayers) {
  if (!isObject(rawLayer) || !nonEmptyString(rawLayer.id)) {
    throw new TypeError("SVG layer must contain an ID, geometry, and binding");
  }
  const allowedKeys = new Set(["id", "geometry", "binding", "bindings", "visible_when", "effect"]);
  if (Object.keys(rawLayer).some((key) => !allowedKeys.has(key))) throw new TypeError("SVG layer fields are unsupported");
  if (Object.hasOwn(rawLayer, "effect") && !nonEmptyString(rawLayer.effect)) throw new TypeError("SVG layer effect must be a non-empty scalar");
  const layerId = rawLayer.id.trim();
  if (seenLayers.has(layerId)) throw new TypeError("SVG layer IDs must be unique");
  seenLayers.add(layerId);
  const hasBinding = Object.hasOwn(rawLayer, "binding");
  const hasBindings = Object.hasOwn(rawLayer, "bindings");
  if (hasBinding === hasBindings) throw new TypeError("SVG layer must have exactly one binding or bindings list");
  const bindings = hasBinding
    ? [cloneBinding(rawLayer.binding)]
    : (() => {
      if (!Array.isArray(rawLayer.bindings) || rawLayer.bindings.length === 0) throw new TypeError("SVG layer bindings must be non-empty");
      return rawLayer.bindings.map(cloneBinding);
    })();
  if (new Set(bindings.map((binding) => binding.parameter)).size !== bindings.length) {
    throw new TypeError("SVG layer binding parameters must be unique");
  }
  const visibleWhen = Object.hasOwn(rawLayer, "visible_when") ? cloneVisibleWhen(rawLayer.visible_when) : null;
  return deepFreeze({ id: layerId, geometry: cloneGeometry(rawLayer.geometry, viewBox), bindings, visibleWhen, effect: Object.hasOwn(rawLayer, "effect") ? rawLayer.effect.trim() : null });
}

function stableNumber(value) {
  // A fixed decimal boundary prevents an engine-specific 0.30000000000000004
  // becoming part of a public render frame, while retaining normal SVG precision.
  return Number(value.toFixed(12));
}

function cloneProfile(profile) {
  if (!hasExactKeys(profile, ["view_box", "systems"]) || !hasExactKeys(profile.view_box, ["width", "height"]) || !Array.isArray(profile.systems) || profile.systems.length === 0) {
    throw new TypeError("SVG profile must contain a view box and systems");
  }
  const { width, height } = profile.view_box;
  if (!isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0) {
    throw new TypeError("SVG view box dimensions must be finite positive numbers");
  }
  const viewBox = deepFreeze({ width, height });
  const seenSystems = new Set();
  const seenLayers = new Set();
  const systems = profile.systems.map((rawSystem) => {
    if (!hasExactKeys(rawSystem, ["id", "layers"]) || !nonEmptyString(rawSystem.id) || !Array.isArray(rawSystem.layers) || rawSystem.layers.length === 0) {
      throw new TypeError("SVG system must contain an ID and layers");
    }
    const id = rawSystem.id.trim();
    if (seenSystems.has(id)) throw new TypeError("SVG system IDs must be unique");
    seenSystems.add(id);
    const layers = rawSystem.layers.map((rawLayer) => cloneLayer(rawLayer, viewBox, seenLayers));
    const controls = new Map();
    const declareSegment = (controlId, values) => {
      const existing = controls.get(controlId);
      if (existing && existing.type !== "segment") throw new TypeError("SVG controls cannot mix range and segment values");
      const declared = existing || { type: "segment", values: new Set() };
      values.forEach((value) => declared.values.add(value));
      controls.set(controlId, declared);
    };
    const declareToggle = (controlId) => {
      const existing = controls.get(controlId);
      if (existing && existing.type !== "toggle") throw new TypeError("SVG controls cannot mix toggle and other values");
      controls.set(controlId, { type: "toggle" });
    };
    for (const layer of layers) {
      for (const binding of layer.bindings) {
        const existing = controls.get(binding.controlId);
        if (binding.type === "range") {
          if (existing && (existing.type !== "range" || existing.min !== binding.input.min || existing.max !== binding.input.max)) {
            throw new TypeError("SVG range controls must have one declared input range");
          }
          controls.set(binding.controlId, { type: "range", min: binding.input.min, max: binding.input.max });
        } else if (binding.type === "segment") {
          declareSegment(binding.controlId, Object.keys(binding.output));
        } else {
          declareToggle(binding.controlId);
        }
      }
      if (layer.visibleWhen) declareSegment(layer.visibleWhen.controlId, [layer.visibleWhen.equals]);
    }
    const controlDefinitions = [...controls.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([controlId, definition]) => deepFreeze(
      definition.type === "range"
        ? { controlId, type: "range", min: definition.min, max: definition.max }
        : definition.type === "segment"
          ? { controlId, type: "segment", values: Object.freeze([...definition.values].sort()) }
          : { controlId, type: "toggle" }
    ));
    return deepFreeze({ id, layers, controlDefinitions });
  });
  return deepFreeze({ viewBox, systems });
}

function parameterFor(binding, value) {
  if (binding.type === "range") {
    if (!isFiniteNumber(value) || value < binding.input.min || value > binding.input.max) return null;
    const ratio = (value - binding.input.min) / (binding.input.max - binding.input.min);
    return stableNumber(binding.output.min + (binding.output.max - binding.output.min) * ratio);
  }
  if (binding.type === "toggle") return typeof value === "boolean" ? binding.output[String(value)] : null;
  return typeof value === "string" && Object.hasOwn(binding.output, value) ? binding.output[value] : null;
}

/**
 * Turns a validated, serializable SVG profile into immutable render frames.
 * It is deliberately DOM-free so malformed data can fail closed before any
 * visual enhancement is mounted.
 */
export function createPhysicalSceneSvgProjector(profile) {
  const normalized = cloneProfile(profile);
  const systems = new Map(normalized.systems.map((system) => [system.id, system]));

  return Object.freeze({
    frameFor(candidate) {
      if (!isObject(candidate) || !nonEmptyString(candidate.systemId) || !isObject(candidate.valuesBySystem)) return null;
      const system = systems.get(candidate.systemId);
      const values = system && candidate.valuesBySystem[candidate.systemId];
      if (!system || !isObject(values) || Object.keys(values).length !== system.controlDefinitions.length || system.controlDefinitions.some((definition) => !Object.hasOwn(values, definition.controlId))) return null;
      for (const definition of system.controlDefinitions) {
        const value = values[definition.controlId];
        if (definition.type === "range" ? !isFiniteNumber(value) || value < definition.min || value > definition.max : definition.type === "segment" ? typeof value !== "string" || !definition.values.includes(value) : typeof value !== "boolean") return null;
      }

      const layers = [];
      for (const layer of system.layers) {
        const parameters = {};
        for (const binding of layer.bindings) {
          const parameterValue = parameterFor(binding, values[binding.controlId]);
          if (parameterValue === null) return null;
          parameters[binding.parameter] = parameterValue;
        }
        if (layer.visibleWhen && values[layer.visibleWhen.controlId] !== layer.visibleWhen.equals) continue;
        layers.push(deepFreeze({
          id: layer.id,
          geometry: layer.geometry,
          parameters: deepFreeze(parameters)
        }));
      }
      const signature = `${system.id}:${system.controlDefinitions.map((definition) => `${definition.controlId}=${String(values[definition.controlId])}`).join("|")}`;
      return deepFreeze({
        viewBox: `0 0 ${normalized.viewBox.width} ${normalized.viewBox.height}`,
        systemId: system.id,
        signature,
        layers
      });
    }
  });
}
