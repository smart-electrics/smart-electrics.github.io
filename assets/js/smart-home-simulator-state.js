const REQUIRED_SYSTEM_IDS = [
  "lighting",
  "climate",
  "shading",
  "access",
  "security",
  "panel",
  "low-voltage",
  "backup-power",
  "audio"
];

const REQUIRED_PRESET_IDS = ["morning", "arrival", "evening", "away", "night", "heat", "backup"];

const isNonEmptyId = (value) => typeof value === "string" && value.trim().length > 0;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function hasExactIds(ids, expectedIds) {
  return (
    Array.isArray(ids) &&
    ids.length === expectedIds.length &&
    ids.every(isNonEmptyId) &&
    new Set(ids).size === ids.length &&
    expectedIds.every((id) => ids.includes(id))
  );
}

function hasOnlyKeys(record, keys) {
  return isRecord(record) && Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

function isSteppedValue(value, min, step) {
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

function validateControl(control) {
  if (!isRecord(control) || !isNonEmptyId(control.id)) return false;

  if (control.type === "range") {
    return (
      Number.isFinite(control.min) &&
      Number.isFinite(control.max) &&
      Number.isFinite(control.step) &&
      control.min < control.max &&
      control.step > 0 &&
      Number.isFinite(control.defaultValue) &&
      control.defaultValue >= control.min &&
      control.defaultValue <= control.max &&
      isSteppedValue(control.defaultValue, control.min, control.step)
    );
  }

  if (control.type === "segment") {
    return (
      Array.isArray(control.options) &&
      control.options.length > 1 &&
      control.options.every(isNonEmptyId) &&
      new Set(control.options).size === control.options.length &&
      control.options.includes(control.defaultValue)
    );
  }

  return control.type === "toggle" && typeof control.defaultValue === "boolean";
}

function isControlValueValid(control, value) {
  if (control.type === "range") {
    return (
      Number.isFinite(value) &&
      value >= control.min &&
      value <= control.max &&
      isSteppedValue(value, control.min, control.step)
    );
  }

  if (control.type === "segment") return control.options.includes(value);
  return typeof value === "boolean";
}

function freezeValues(valuesBySystem, systemIds) {
  return Object.freeze(
    Object.fromEntries(
      systemIds.map((systemId) => [systemId, Object.freeze({ ...valuesBySystem[systemId] })])
    )
  );
}

function createControlIndex(systemIds, controlsBySystem) {
  if (!hasOnlyKeys(controlsBySystem, systemIds)) throw new TypeError("Controls must be declared for every allowed system.");

  const controlsById = new Map();
  for (const systemId of systemIds) {
    const controls = controlsBySystem[systemId];
    if (!Array.isArray(controls) || controls.length === 0 || !controls.every(validateControl)) {
      throw new TypeError("Every system must declare valid controls.");
    }

    const ids = controls.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) throw new TypeError("Control IDs must be unique within a system.");
    controlsById.set(systemId, new Map(controls.map((control) => {
      const canonicalControl = control.type === "segment"
        ? Object.freeze({ ...control, options: Object.freeze([...control.options]) })
        : Object.freeze({ ...control });
      return [control.id, canonicalControl];
    })));
  }
  return controlsById;
}

function validatePresetValues(valuesBySystem, systemIds, controlsById) {
  if (!hasOnlyKeys(valuesBySystem, systemIds)) return false;

  return systemIds.every((systemId) => {
    const controls = controlsById.get(systemId);
    const controlIds = [...controls.keys()];
    const values = valuesBySystem[systemId];
    return hasOnlyKeys(values, controlIds) && controlIds.every((controlId) => isControlValueValid(controls.get(controlId), values[controlId]));
  });
}

function createCanonicalPresets(presetIds, systemIds, controlsById, presets) {
  if (!hasOnlyKeys(presets, presetIds)) throw new TypeError("Canonical values must be declared for every preset.");

  const canonicalPresets = new Map();
  for (const presetId of presetIds) {
    const values = presets[presetId];
    if (!validatePresetValues(values, systemIds, controlsById)) {
      throw new TypeError("Every preset must provide valid values for every control.");
    }
    canonicalPresets.set(presetId, freezeValues(values, systemIds));
  }
  return canonicalPresets;
}

function createPresetSystemIds(presetIds, allowedSystems, presetSystemIds) {
  if (!hasOnlyKeys(presetSystemIds, presetIds)) {
    throw new TypeError("Every preset must declare one primary system.");
  }

  const canonicalPresetSystemIds = {};
  for (const presetId of presetIds) {
    const systemId = presetSystemIds[presetId];
    if (!allowedSystems.has(systemId)) {
      throw new TypeError("Preset primary systems must be allowed systems.");
    }
    canonicalPresetSystemIds[presetId] = systemId;
  }
  return Object.freeze(canonicalPresetSystemIds);
}

/**
 * Pure state machine for the unified smart-home phone. The caller declares all
 * controls and canonical preset values, keeping the model independent of DOM,
 * storage, time, vendor integrations, and telemetry.
 */
export function createSmartHomeMachine(config) {
  if (!isRecord(config)) throw new TypeError("Smart-home machine configuration must be an object.");

  const { systemIds, presetIds, initialPresetId, initialSystemId, presetSystemIds, controlsBySystem, presets } = config;
  if (!hasExactIds(systemIds, REQUIRED_SYSTEM_IDS) || !hasExactIds(presetIds, REQUIRED_PRESET_IDS)) {
    throw new TypeError("The unified phone requires its nine systems and seven presets.");
  }
  if (!presetIds.includes(initialPresetId) || !systemIds.includes(initialSystemId)) {
    throw new TypeError("Initial system and preset IDs must be allowed.");
  }

  const canonicalSystemIds = Object.freeze([...systemIds]);
  const canonicalPresetIds = Object.freeze([...presetIds]);
  const allowedSystems = new Set(canonicalSystemIds);
  const allowedPresets = new Set(canonicalPresetIds);
  const canonicalPresetSystemIds = createPresetSystemIds(canonicalPresetIds, allowedSystems, presetSystemIds);
  if (initialSystemId !== canonicalPresetSystemIds[initialPresetId]) {
    throw new TypeError("Initial system must be the primary system of the initial preset.");
  }
  const controlsById = createControlIndex(canonicalSystemIds, controlsBySystem);
  const canonicalPresets = createCanonicalPresets(canonicalPresetIds, canonicalSystemIds, controlsById, presets);

  const makeState = (systemId, presetId, valuesBySystem, manual) =>
    Object.freeze({ systemId, presetId, valuesBySystem, manual });
  const initialState = makeState(initialSystemId, initialPresetId, canonicalPresets.get(initialPresetId), false);

  const isValidState = (state) =>
    isRecord(state) &&
    allowedSystems.has(state.systemId) &&
    allowedPresets.has(state.presetId) &&
    typeof state.manual === "boolean" &&
    validatePresetValues(state.valuesBySystem, canonicalSystemIds, controlsById);

  return Object.freeze({
    initialState,
    transition(state, action) {
      if (!isValidState(state)) return initialState;
      if (!isRecord(action)) return state;

      if (action.type === "select-system") {
        if (!allowedSystems.has(action.systemId) || action.systemId === state.systemId) return state;
        return makeState(action.systemId, state.presetId, state.valuesBySystem, state.manual);
      }

      if (action.type === "select-preset") {
        if (!allowedPresets.has(action.presetId)) return state;
        const nextSystemId = canonicalPresetSystemIds[action.presetId];
        if (action.presetId === state.presetId && !state.manual && state.systemId === nextSystemId) return state;
        return makeState(nextSystemId, action.presetId, canonicalPresets.get(action.presetId), false);
      }

      if (action.type === "set-control") {
        if (!allowedSystems.has(action.systemId) || !isNonEmptyId(action.controlId)) return state;
        const control = controlsById.get(action.systemId).get(action.controlId);
        if (!control || !isControlValueValid(control, action.value)) return state;

        const currentValue = state.valuesBySystem[action.systemId][action.controlId];
        if (currentValue === action.value && state.manual) return state;

        const valuesBySystem =
          currentValue === action.value
            ? state.valuesBySystem
            : Object.freeze({
                ...state.valuesBySystem,
                [action.systemId]: Object.freeze({ ...state.valuesBySystem[action.systemId], [action.controlId]: action.value })
              });
        return makeState(state.systemId, state.presetId, valuesBySystem, true);
      }

      return state;
    }
  });
}
