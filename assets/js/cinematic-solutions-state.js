import { createCinematicState } from "./cinematic-state.js";

const isId = (value) => typeof value === "string" && value.trim().length > 0;
const sameIds = (left, right) => Array.isArray(left) && left.length === right.length && left.every((id, index) => id === right[index]);

function frozenIds(ids) {
  return Object.freeze([...ids]);
}

function configurationEntries(graph, mapping) {
  if (mapping === null || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new TypeError("Cinematic solutions must be a mapping.");
  }
  const entries = Object.entries(mapping);
  if (entries.length === 0) throw new TypeError("Cinematic solutions must not be empty.");

  const directionIds = new Set(graph.directions.map((direction) => direction.id));
  const relationsById = new Map(graph.relations.map((relation) => [relation.id, relation]));
  return entries.map(([solutionId, config]) => {
    if (
      !isId(solutionId) ||
      config === null ||
      typeof config !== "object" ||
      Array.isArray(config) ||
      Object.keys(config).sort().join("|") !== "direction_ids|relation_id" ||
      !Array.isArray(config.direction_ids) ||
      config.direction_ids.length === 0 ||
      !config.direction_ids.every(isId) ||
      new Set(config.direction_ids).size !== config.direction_ids.length ||
      !isId(config.relation_id)
    ) {
      throw new TypeError("Cinematic solution IDs must be declared exactly once.");
    }
    if (config.direction_ids.some((directionId) => !directionIds.has(directionId))) {
      throw new TypeError("Cinematic solution directions must reference the canonical graph.");
    }
    const relation = relationsById.get(config.relation_id);
    if (!relation) throw new TypeError("Cinematic solution relation must reference the canonical graph.");
    if (!config.direction_ids.includes(relation.direction_id)) {
      throw new TypeError("Cinematic solution relation owner must belong to the solution directions.");
    }
    return Object.freeze({
      id: solutionId,
      directionIds: frozenIds(config.direction_ids),
      relationId: config.relation_id
    });
  });
}

/**
 * Pure, solution-owned state model. It composes the canonical #24 graph state
 * without adding a second graph or sharing the service-studio reducer.
 */
export function createCinematicSolutionsState(graph, mapping) {
  const cinematic = createCinematicState(graph);
  const configs = configurationEntries(graph, mapping);
  const configsById = new Map(configs.map((config) => [config.id, config]));

  const makeState = (cinematicState, config) => Object.freeze({
    state: cinematicState.state,
    selectedSolutionId: config.id,
    selectedDirectionIds: frozenIds(config.directionIds),
    selectedDirectionId: cinematicState.selectedDirectionId,
    selectedRelationId: cinematicState.selectedRelationId
  });
  const assembled = (config) => makeState(cinematic.initialState, config);
  const focused = (config) => makeState(
    cinematic.reduce(cinematic.initialState, { type: "select-direction", directionId: config.directionIds[0] }),
    config
  );
  const reassembled = (config) => makeState(
    cinematic.reduce(cinematic.initialState, { type: "select-relation", relationId: config.relationId }),
    config
  );
  const initialState = assembled(configs[0]);

  const isValidState = (state) => {
    if (state === null || typeof state !== "object") return false;
    const config = configsById.get(state.selectedSolutionId);
    if (!config || !sameIds(state.selectedDirectionIds, config.directionIds)) return false;
    if (state.state === "assembled") return state.selectedDirectionId === null && state.selectedRelationId === null;
    if (state.state === "focus") return state.selectedDirectionId === config.directionIds[0] && state.selectedRelationId === null;
    if (state.state === "reassembled") {
      const relation = graph.relations.find((candidate) => candidate.id === config.relationId);
      return state.selectedDirectionId === relation?.direction_id && state.selectedRelationId === config.relationId;
    }
    return false;
  };

  return Object.freeze({
    initialState,
    reduce(state, action) {
      if (!isValidState(state)) return initialState;
      const config = configsById.get(state.selectedSolutionId);
      if (action?.type === "select-assembled") return state.state === "assembled" ? state : assembled(config);
      if (action?.type === "select-focus") return state.state === "focus" ? state : focused(config);
      if (action?.type === "select-reassembled") return state.state === "reassembled" ? state : reassembled(config);
      if (action?.type === "select-solution" && isId(action.solutionId)) {
        const selected = configsById.get(action.solutionId);
        if (!selected) return state;
        return state.state === "focus" && selected.id === state.selectedSolutionId ? state : focused(selected);
      }
      return state;
    }
  });
}
