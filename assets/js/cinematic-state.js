const isNonEmptyId = (value) => typeof value === "string" && value.trim().length > 0;

const hasUniqueIds = (ids) => ids.every(isNonEmptyId) && new Set(ids).size === ids.length;

function hasValidRelations(relations, directionIds) {
  const relationIds = [];
  const childIds = [];

  for (const relation of relations) {
    if (
      relation === null ||
      typeof relation !== "object" ||
      !isNonEmptyId(relation.id) ||
      !isNonEmptyId(relation.direction_id) ||
      !directionIds.has(relation.direction_id) ||
      relation.child === null ||
      typeof relation.child !== "object" ||
      !isNonEmptyId(relation.child.id) ||
      relation.id !== `${relation.direction_id}--${relation.child.id}` ||
      !Array.isArray(relation.related_direction_ids) ||
      relation.related_direction_ids.length < 1 ||
      relation.related_direction_ids.length > 3 ||
      !hasUniqueIds(relation.related_direction_ids) ||
      relation.related_direction_ids.some((directionId) => !directionIds.has(directionId)) ||
      relation.related_direction_ids.includes(relation.direction_id)
    ) {
      return false;
    }
    relationIds.push(relation.id);
    childIds.push(relation.child.id);
  }

  return hasUniqueIds(relationIds) && hasUniqueIds(childIds);
}

/**
 * Pure state seam for the progressive cinematic adapter. The graph remains
 * data-owned so route adapters can read the same canonical structure.
 */
export function createCinematicState(graph) {
  if (
    graph === null ||
    typeof graph !== "object" ||
    !Array.isArray(graph.directions) ||
    graph.directions.length === 0 ||
    graph.directions.some((direction) => direction === null || typeof direction !== "object") ||
    !hasUniqueIds(graph.directions.map((direction) => direction.id)) ||
    !Array.isArray(graph.relations) ||
    graph.relations.length === 0
  ) {
    throw new TypeError("Cinematic graph must contain directions and relations.");
  }

  const directionIds = new Set(graph.directions.map((direction) => direction.id));
  if (!hasValidRelations(graph.relations, directionIds)) {
    throw new TypeError("Cinematic graph relations must be uniquely declared and reference known directions.");
  }
  const relationsById = new Map(
    graph.relations.map((relation) => [relation.id, relation.direction_id])
  );
  const makeState = (state, selectedDirectionId, selectedRelationId) => Object.freeze({
    state,
    selectedDirectionId,
    selectedRelationId
  });
  const initialState = makeState("assembled", null, null);
  const isValidState = (state) => {
    if (state === null || typeof state !== "object") return false;
    if (state.state === "assembled") {
      return state.selectedDirectionId === null && state.selectedRelationId === null;
    }
    if (state.state === "focus") {
      return directionIds.has(state.selectedDirectionId) && state.selectedRelationId === null;
    }
    if (state.state === "reassembled") {
      const ownerId = relationsById.get(state.selectedRelationId);
      return ownerId && state.selectedDirectionId === ownerId;
    }
    return false;
  };

  return Object.freeze({
    initialState,
    reduce(state, action) {
      if (!isValidState(state)) return initialState;
      if (action && action.type === "return-to-system") return initialState;
      if (
        action &&
        action.type === "select-direction" &&
        isNonEmptyId(action.directionId) &&
        directionIds.has(action.directionId)
      ) {
        if (state.state === "focus" && state.selectedDirectionId === action.directionId) return state;
        return makeState("focus", action.directionId, null);
      }
      if (action && action.type === "select-relation" && isNonEmptyId(action.relationId)) {
        const ownerId = relationsById.get(action.relationId);
        if (ownerId) {
          if (state.state === "reassembled" && state.selectedRelationId === action.relationId) return state;
          return makeState("reassembled", ownerId, action.relationId);
        }
      }
      return state;
    }
  });
}
