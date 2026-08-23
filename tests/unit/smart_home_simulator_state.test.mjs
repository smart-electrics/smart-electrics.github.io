import assert from "node:assert/strict";
import test from "node:test";

import { createScenarioMachine } from "../../assets/js/smart-home-simulator-state.js";

const scenarioIds = ["arrival", "evening", "away", "night", "backup"];

test("creates an immutable deterministic initial arrival state", () => {
  const machine = createScenarioMachine(scenarioIds, "arrival");

  assert.deepEqual(machine.initialState, { scenarioId: "arrival" });
  assert.equal(Object.isFrozen(machine.initialState), true);
  assert.throws(() => {
    machine.initialState.scenarioId = "backup";
  }, TypeError);
  assert.deepEqual(machine.initialState, { scenarioId: "arrival" });
});

test("selects every canonical scenario with a new immutable state", () => {
  const machine = createScenarioMachine(scenarioIds, "arrival");

  for (const scenarioId of scenarioIds.slice(1)) {
    const nextState = machine.transition(machine.initialState, { type: "select", scenarioId });

    assert.notStrictEqual(nextState, machine.initialState);
    assert.deepEqual(nextState, { scenarioId });
    assert.equal(Object.isFrozen(nextState), true);
    assert.deepEqual(machine.initialState, { scenarioId: "arrival" });
  }
});

test("returns the same state for duplicate selection and unknown or malformed actions", () => {
  const machine = createScenarioMachine(scenarioIds, "arrival");
  const selectedEvening = machine.transition(machine.initialState, { type: "select", scenarioId: "evening" });
  const noOpActions = [
    { type: "select", scenarioId: "evening" },
    { type: "select", scenarioId: "unknown" },
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

test("normalizes malformed or unknown previous state to the immutable initial state", () => {
  const machine = createScenarioMachine(scenarioIds, "arrival");

  for (const invalidState of [null, undefined, {}, { scenarioId: "unknown" }, { scenarioId: "" }, "arrival"]) {
    assert.strictEqual(
      machine.transition(invalidState, { type: "select", scenarioId: "backup" }),
      machine.initialState
    );
  }
});

test("rejects invalid factory configuration before state can be created", () => {
  const invalidConfigurations = [
    [[], "arrival"],
    [["arrival", "arrival"], "arrival"],
    [["arrival", ""], "arrival"],
    [["arrival", 3], "arrival"],
    [["arrival", "backup"], "unknown"],
    ["arrival", "arrival"]
  ];

  for (const [ids, initialId] of invalidConfigurations) {
    assert.throws(() => createScenarioMachine(ids, initialId), TypeError);
  }
});
