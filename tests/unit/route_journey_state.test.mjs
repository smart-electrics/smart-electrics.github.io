import assert from "node:assert/strict";
import test from "node:test";

import { createRouteJourneyState } from "../../assets/js/route-journey-state.js";

const processJourney = {
  id: "process",
  nodes: [
    { id: "enquiry", title: "Звернення", input: "Вхід", decision: "Рішення", next: "Далі" },
    { id: "clarification", title: "Уточнення", input: "Вхід", decision: "Рішення", next: "Далі" }
  ]
};

test("keeps the route journey immutable through assembled, focus, and reassembled states", () => {
  const journey = createRouteJourneyState(processJourney);

  assert.deepEqual(journey.initialState, { state: "assembled", selectedNodeId: null });
  assert.equal(Object.isFrozen(journey.initialState), true);

  const focused = journey.reduce(journey.initialState, { type: "select-node", nodeId: "clarification" });
  assert.deepEqual(focused, { state: "focus", selectedNodeId: "clarification" });
  assert.equal(Object.isFrozen(focused), true);

  assert.deepEqual(journey.reduce(focused, { type: "show-relationship" }), {
    state: "reassembled",
    selectedNodeId: "clarification"
  });
  assert.deepEqual(journey.reduce(focused, { type: "return" }), journey.initialState);
});

test("rejects malformed journey data and fails closed for malformed state", () => {
  for (const invalidJourney of [
    null,
    {},
    { id: "process", nodes: [] },
    { id: "process", nodes: [{ id: "enquiry", title: "", input: "Вхід", decision: "Рішення", next: "Далі" }] },
    { id: "process", nodes: [processJourney.nodes[0], processJourney.nodes[0]] },
    { ...processJourney, extra: true }
  ]) {
    assert.throws(() => createRouteJourneyState(invalidJourney), TypeError);
  }

  const journey = createRouteJourneyState(processJourney);
  const focused = journey.reduce(journey.initialState, { type: "select-node", nodeId: "enquiry" });
  for (const state of [null, {}, { state: "focus", selectedNodeId: "unknown" }]) {
    assert.strictEqual(journey.reduce(state, { type: "return" }), journey.initialState);
  }
  for (const action of [null, {}, { type: "unknown" }, { type: "select-node", nodeId: "unknown" }]) {
    assert.strictEqual(journey.reduce(focused, action), focused);
  }
});

test("does not change when the source route data mutates after construction", () => {
  const source = structuredClone(processJourney);
  const journey = createRouteJourneyState(source);
  source.nodes[0].id = "changed";
  source.nodes[1].title = "Змінено";

  assert.deepEqual(journey.reduce(journey.initialState, { type: "select-node", nodeId: "enquiry" }), {
    state: "focus",
    selectedNodeId: "enquiry"
  });
});
