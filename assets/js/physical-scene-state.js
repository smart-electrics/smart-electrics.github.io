const text = (value) => typeof value === "string" ? value.trim() : "";

function choices(data, key) {
  const values = data?.[key];
  if (!Array.isArray(values) || values.length === 0) throw new TypeError(`physical scene ${key} must be a non-empty list`);
  const ids = values.map((choice) => text(choice?.id));
  const labels = values.map((choice) => text(choice?.label));
  if (ids.some((id) => !id) || labels.some((label) => !label) || new Set(ids).size !== ids.length) {
    throw new TypeError(`physical scene ${key} choices must have unique IDs and non-empty labels`);
  }
  return new Map(values.map((choice) => [text(choice.id), Object.freeze({ id: text(choice.id), label: text(choice.label) })]));
}

function stateKey(lightingId, windowTreatmentId) {
  return `${lightingId}:${windowTreatmentId}`;
}

export function createPhysicalSceneState(data) {
  const lighting = choices(data, "lighting");
  const windowTreatments = choices(data, "window_treatments");
  const initial = data?.initial_state;
  const lightingId = text(initial?.lighting_id);
  const windowTreatmentId = text(initial?.window_treatment_id);
  if (!lighting.has(lightingId) || !windowTreatments.has(windowTreatmentId)) throw new TypeError("physical scene initial state must reference both axes");

  const rawScenes = data?.scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length !== lighting.size * windowTreatments.size) throw new TypeError("physical scene mappings must cover every pair");
  const scenes = new Map();
  for (const scene of rawScenes) {
    const sceneLightingId = text(scene?.lighting_id);
    const sceneWindowTreatmentId = text(scene?.window_treatment_id);
    const src768 = text(scene?.src_768);
    const src1536 = text(scene?.src_1536);
    const alt = text(scene?.alt);
    if (!lighting.has(sceneLightingId) || !windowTreatments.has(sceneWindowTreatmentId) || !src768 || !src1536 || !alt) throw new TypeError("physical scene mapping must be complete");
    const key = stateKey(sceneLightingId, sceneWindowTreatmentId);
    if (scenes.has(key)) throw new TypeError("physical scene mappings must be unique");
    scenes.set(key, Object.freeze({ lightingId: sceneLightingId, windowTreatmentId: sceneWindowTreatmentId, src768, src1536, alt }));
  }
  if (scenes.size !== lighting.size * windowTreatments.size) throw new TypeError("physical scene mappings must cover every pair");

  const initialState = Object.freeze({ lightingId, windowTreatmentId });
  const validState = (candidate) => candidate && lighting.has(candidate.lightingId) && windowTreatments.has(candidate.windowTreatmentId) && scenes.has(stateKey(candidate.lightingId, candidate.windowTreatmentId));
  const nextState = (nextLightingId, nextWindowTreatmentId, current) => {
    if (nextLightingId === current.lightingId && nextWindowTreatmentId === current.windowTreatmentId) return current;
    return Object.freeze({ lightingId: nextLightingId, windowTreatmentId: nextWindowTreatmentId });
  };

  return Object.freeze({
    initialState,
    lighting: Object.freeze([...lighting.values()]),
    windowTreatments: Object.freeze([...windowTreatments.values()]),
    sceneFor(candidate) {
      return validState(candidate) ? scenes.get(stateKey(candidate.lightingId, candidate.windowTreatmentId)) : null;
    },
    reduce(current, action) {
      if (!validState(current) || !action || typeof action !== "object") return initialState;
      if (action.type === "select-lighting" && lighting.has(text(action.lightingId))) return nextState(text(action.lightingId), current.windowTreatmentId, current);
      if (action.type === "select-window-treatment" && windowTreatments.has(text(action.windowTreatmentId))) return nextState(current.lightingId, text(action.windowTreatmentId), current);
      return current;
    }
  });
}
