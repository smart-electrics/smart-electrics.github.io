const isNonEmptyId = (value) => typeof value === "string" && value.trim().length > 0;

function hasUniqueIds(ids) {
  return Array.isArray(ids) && ids.length > 0 && ids.every(isNonEmptyId) && new Set(ids).size === ids.length;
}

function readPrimarySystem(primaryByScenario, scenarioId) {
  if (primaryByScenario instanceof Map) return primaryByScenario.get(scenarioId);
  if (primaryByScenario && typeof primaryByScenario === "object") return primaryByScenario[scenarioId];
  return undefined;
}

/**
 * A deliberately small, pure state machine for the progressive-enhancement
 * adapter. The static HTML remains the source of truth for every summary.
 */
export function createScenarioMachine(scenarioIds, initialId, systemIds, primaryByScenario) {
  if (
    !hasUniqueIds(scenarioIds) ||
    !hasUniqueIds(systemIds) ||
    !isNonEmptyId(initialId) ||
    !scenarioIds.includes(initialId)
  ) {
    throw new TypeError("Scenario and system IDs must be unique non-empty strings that include the initial scenario.");
  }

  const allowedScenarios = new Set(scenarioIds);
  const allowedSystems = new Set(systemIds);
  const primarySystems = new Map(
    scenarioIds.map((scenarioId) => [scenarioId, readPrimarySystem(primaryByScenario, scenarioId)])
  );

  if ([...primarySystems.values()].some((systemId) => !isNonEmptyId(systemId) || !allowedSystems.has(systemId))) {
    throw new TypeError("Every scenario must declare one allowed primary system.");
  }

  const makeState = (scenarioId, systemId) => Object.freeze({ scenarioId, systemId });
  const initialState = makeState(initialId, primarySystems.get(initialId));
  const isValidState = (state) =>
    state !== null &&
    typeof state === "object" &&
    allowedScenarios.has(state.scenarioId) &&
    allowedSystems.has(state.systemId);

  return Object.freeze({
    initialState,
    transition(state, action) {
      if (!isValidState(state)) return initialState;
      if (action === null || typeof action !== "object") return state;

      if (action.type === "select" || action.type === "select-scenario") {
        if (!isNonEmptyId(action.scenarioId) || !allowedScenarios.has(action.scenarioId)) return state;
        const primarySystem = primarySystems.get(action.scenarioId);
        if (state.scenarioId === action.scenarioId && state.systemId === primarySystem) return state;
        return makeState(action.scenarioId, primarySystem);
      }

      if (action.type === "focus-system") {
        if (!isNonEmptyId(action.systemId) || !allowedSystems.has(action.systemId) || action.systemId === state.systemId) {
          return state;
        }
        return makeState(state.scenarioId, action.systemId);
      }

      return state;
    }
  });
}
