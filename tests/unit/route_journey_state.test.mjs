import assert from "node:assert/strict";
import test from "node:test";

import { createRouteJourneyState } from "../../assets/js/route-journey-state.js";

const processJourney = {
  id: "process",
  assembled: {
    title: "Послідовність робіт для одного об’єкта",
    summary: "Оберіть етап, щоб побачити його робочий зв’язок."
  },
  nodes: [
    {
      id: "enquiry", title: "Звернення", input: "Вхід", decision: "Рішення", next: "Далі",
      visual: { focus: { x: 24, y: 68, scale: 1.24 }, next: { x: 46, y: 52 } }
    },
    {
      id: "clarification", title: "Уточнення", input: "Вхід", decision: "Рішення", next: "Далі",
      visual: { focus: { x: 46, y: 52, scale: 1.29 }, next: { x: 66, y: 40 } }
    }
  ]
};

test("keeps the route journey immutable through assembled, focus, and reassembled states", () => {
  const journey = createRouteJourneyState(processJourney);

  assert.deepEqual(journey.initialState, { state: "assembled", selectedNodeId: "enquiry" });
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
    { id: "process", assembled: processJourney.assembled, nodes: [] },
    { id: "process", assembled: processJourney.assembled, nodes: [{ id: "enquiry", title: "", input: "Вхід", decision: "Рішення", next: "Далі" }] },
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
  source.nodes[0].visual.focus.x = 91;

  assert.deepEqual(journey.reduce(journey.initialState, { type: "select-node", nodeId: "enquiry" }), {
    state: "focus",
    selectedNodeId: "enquiry"
  });
});
