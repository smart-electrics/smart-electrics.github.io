const text = (value) => typeof value === "string" ? value.trim() : "";

function stateKey(controlIds, state) {
  return controlIds.map((id) => `${id}=${state[id]}`).join(":");
}

function createSystem(rawSystem) {
  const id = text(rawSystem?.id);
  const sceneKey = text(rawSystem?.scene_key);
  const rawControls = rawSystem?.controls;
  if (!id || !sceneKey || !Array.isArray(rawControls) || rawControls.length === 0) throw new TypeError("physical scene system must define an ID, scene key, and controls");

  const controls = rawControls.map((control) => {
    const controlId = text(control?.id);
    const label = text(control?.label);
    const rawChoices = control?.choices;
    if (!controlId || !label || !Array.isArray(rawChoices) || rawChoices.length === 0) throw new TypeError("physical scene controls must define choices");
    const choices = rawChoices.map((choice) => Object.freeze({ id: text(choice?.id), label: text(choice?.label) }));
    if (choices.some((choice) => !choice.id || !choice.label) || new Set(choices.map((choice) => choice.id)).size !== choices.length) {
      throw new TypeError("physical scene control choices must have unique IDs and non-empty labels");
    }
    return Object.freeze({ id: controlId, label, choices: Object.freeze(choices) });
  });
  const controlIds = controls.map((control) => control.id);
  if (new Set(controlIds).size !== controlIds.length) throw new TypeError("physical scene controls must have unique IDs");

  const initial = rawSystem?.initial_state;
  if (!initial || typeof initial !== "object" || Array.isArray(initial) || Object.keys(initial).length !== controlIds.length) throw new TypeError("physical scene initial state must cover each control");
  const initialState = {};
  for (const control of controls) {
    const valueId = text(initial[control.id]);
    if (!control.choices.some((choice) => choice.id === valueId)) throw new TypeError("physical scene initial state must reference every control choice");
    initialState[control.id] = valueId;
  }
  const frozenInitialState = Object.freeze(initialState);

  const expectedSceneCount = controls.reduce((total, control) => total * control.choices.length, 1);
  const rawScenes = rawSystem?.scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length !== expectedSceneCount) throw new TypeError("physical scene mappings must cover every control combination");
  const scenes = new Map();
  for (const rawScene of rawScenes) {
    const sceneState = rawScene?.state;
    if (!sceneState || typeof sceneState !== "object" || Array.isArray(sceneState) || Object.keys(sceneState).length !== controlIds.length) throw new TypeError("physical scene mapping must include every control state");
    const state = {};
    for (const control of controls) {
      const valueId = text(sceneState[control.id]);
      if (!control.choices.some((choice) => choice.id === valueId)) throw new TypeError("physical scene mapping must reference known choices");
      state[control.id] = valueId;
    }
    const key = stateKey(controlIds, state);
    const src768 = text(rawScene?.src_768);
    const src1536 = text(rawScene?.src_1536);
    const alt = text(rawScene?.alt);
    if (!src768 || !src1536 || !alt || scenes.has(key)) throw new TypeError("physical scene mappings must be complete and unique");
    scenes.set(key, Object.freeze({ state: Object.freeze(state), src768, src1536, alt }));
  }
  if (scenes.size !== expectedSceneCount) throw new TypeError("physical scene mappings must cover every control combination");

  const validState = (candidate) => candidate && typeof candidate === "object" && controlIds.every((controlId) =>
    controls.find((control) => control.id === controlId).choices.some((choice) => choice.id === candidate[controlId])
  ) && scenes.has(stateKey(controlIds, candidate));

  return Object.freeze({
    id,
    sceneKey,
    controls: Object.freeze(controls),
    initialState: frozenInitialState,
    sceneFor(candidate) {
      return validState(candidate) ? scenes.get(stateKey(controlIds, candidate)) : null;
    },
    reduce(current, action) {
      if (!validState(current) || !action || typeof action !== "object") return frozenInitialState;
      if (action.type !== "select-control") return current;
      const control = controls.find((candidate) => candidate.id === text(action.controlId));
      const valueId = text(action.valueId);
      if (!control || !control.choices.some((choice) => choice.id === valueId)) return current;
      if (current[control.id] === valueId) return current;
      return Object.freeze({ ...current, [control.id]: valueId });
    }
  });
}

/**
 * Pure deterministic seam for physical media. Each system owns its controls
 * and media combinations while the browser adapter reuses one stable layer.
 */
export function createPhysicalSceneState(data) {
  const rawSystems = data?.systems;
  if (!Array.isArray(rawSystems) || rawSystems.length === 0) throw new TypeError("physical scene data must contain systems");
  const systems = rawSystems.map(createSystem);
  if (new Set(systems.map((system) => system.id)).size !== systems.length || new Set(systems.map((system) => system.sceneKey)).size !== systems.length) {
    throw new TypeError("physical scene systems must have unique IDs and scene keys");
  }
  const bySceneKey = new Map(systems.map((system) => [system.sceneKey, system]));
  return Object.freeze({
    systems: Object.freeze(systems),
    systemForSceneKey(sceneKey) {
      return bySceneKey.get(text(sceneKey)) || null;
    }
  });
}
