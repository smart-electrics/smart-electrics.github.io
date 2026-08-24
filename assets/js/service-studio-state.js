import { createCinematicState } from "./cinematic-state.js";

const isId = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * A narrow deterministic view of the canonical cinematic graph for one
 * service-detail studio. It deliberately owns no topology or route data.
 */
export function createServiceStudioState(graph, config) {
  const cinematic = createCinematicState(graph);
  if (
    config === null ||
    typeof config !== "object" ||
    !isId(config.direction_id) ||
    !isId(config.relation_id) ||
    !graph.directions.some((direction) => direction.id === config.direction_id) ||
    !graph.relations.some((relation) => relation.id === config.relation_id)
  ) {
    throw new TypeError("Service studio IDs must reference the canonical graph.");
  }

  return Object.freeze({
    initialState: cinematic.initialState,
    reduce(state, action) {
      if (action?.type === "select-assembled") {
        return cinematic.reduce(state, { type: "return-to-system" });
      }
      if (action?.type === "select-focus") {
        return cinematic.reduce(state, { type: "select-direction", directionId: config.direction_id });
      }
      if (action?.type === "select-reassembled") {
        return cinematic.reduce(state, { type: "select-relation", relationId: config.relation_id });
      }
      return cinematic.reduce(state, action);
    }
  });
}
