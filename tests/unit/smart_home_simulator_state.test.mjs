import assert from "node:assert/strict";
import test from "node:test";

import { createScenarioMachine } from "../../assets/js/smart-home-simulator-state.js";

const scenarioIds = ["morning", "arrival", "evening", "away", "night", "heat", "backup"];
const systemIds = ["lighting", "climate", "access", "security", "panel", "low-voltage", "backup-power", "audio", "shading"];
const primaryByScenario = {
  morning: "shading",
  arrival: "lighting",
  evening: "lighting",
  away: "security",
  night: "lighting",
  heat: "climate",
  backup: "backup-power"
};

test("creates an immutable deterministic morning/shading state from all four factory arguments", () => {
  const machine = createScenarioMachine(scenarioIds, "morning", systemIds, primaryByScenario);

  assert.deepEqual(machine.initialState, { scenarioId: "morning", systemId: "shading" });
  assert.equal(Object.isFrozen(machine.initialState), true);
  assert.throws(() => {
    machine.initialState.systemId = "lighting";
  }, TypeError);
  assert.deepEqual(machine.initialState, { scenarioId: "morning", systemId: "shading" });
});

test("selecting every scenario deterministically restores its declared primary system", () => {
  const machine = createScenarioMachine(scenarioIds, "morning", systemIds, primaryByScenario);

  for (const scenarioId of scenarioIds.slice(1)) {
    const nextState = machine.transition(machine.initialState, { type: "select-scenario", scenarioId });

    assert.notStrictEqual(nextState, machine.initialState);
    assert.deepEqual(nextState, { scenarioId, systemId: primaryByScenario[scenarioId] });
    assert.equal(Object.isFrozen(nextState), true);
  }
});

test("system focus changes only the selected system and preserves the scenario", () => {
  const machine = createScenarioMachine(scenarioIds, "morning", systemIds, primaryByScenario);
  const focused = machine.transition(machine.initialState, { type: "focus-system", systemId: "climate" });

  assert.deepEqual(focused, { scenarioId: "morning", systemId: "climate" });
  assert.deepEqual(machine.initialState, { scenarioId: "morning", systemId: "shading" });
  assert.deepEqual(
    machine.transition(focused, { type: "select", scenarioId: "heat" }),
    { scenarioId: "heat", systemId: "climate" }
  );
});

test("returns the same state for duplicate, unknown, or malformed actions", () => {
  const machine = createScenarioMachine(scenarioIds, "morning", systemIds, primaryByScenario);
  const selectedEvening = machine.transition(machine.initialState, { type: "select", scenarioId: "evening" });
  const noOpActions = [
    { type: "select", scenarioId: "evening" },
    { type: "focus-system", systemId: "lighting" },
    { type: "select", scenarioId: "unknown" },
    { type: "focus-system", systemId: "unknown" },
    { type: "select" },
    { type: "activate", scenarioId: "backup" },
    {},
    null,
    undefined,
    "backup"
  ];

  for (const action of noOpActions) {
    assert.strictEqual(machine.transition(selectedEvening, action), selectedEvening);
  }
});

test("normalizes malformed previous state to the immutable initial state", () => {
  const machine = createScenarioMachine(scenarioIds, "morning", systemIds, primaryByScenario);

  for (const invalidState of [null, undefined, {}, { scenarioId: "morning" }, { systemId: "shading" }, { scenarioId: "unknown", systemId: "lighting" }, "morning"]) {
    assert.strictEqual(
      machine.transition(invalidState, { type: "select", scenarioId: "backup" }),
      machine.initialState
    );
  }
});

test("rejects invalid four-argument factory configuration before state can be created", () => {
  const invalidConfigurations = [
    [[], "morning", systemIds, primaryByScenario],
    [["morning", "morning"], "morning", systemIds, primaryByScenario],
    [scenarioIds, "unknown", systemIds, primaryByScenario],
    [scenarioIds, "morning", [], primaryByScenario],
    [scenarioIds, "morning", ["lighting", "lighting"], primaryByScenario],
    [scenarioIds, "morning", systemIds, { ...primaryByScenario, morning: "unknown" }],
    [scenarioIds, "morning", systemIds, { arrival: "lighting" }],
    [scenarioIds, "morning", systemIds]
  ];

  for (const args of invalidConfigurations) {
    assert.throws(() => createScenarioMachine(...args), TypeError);
  }
});
