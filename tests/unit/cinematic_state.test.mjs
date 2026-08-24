import assert from "node:assert/strict";
import test from "node:test";

import { createCinematicState } from "../../assets/js/cinematic-state.js";

const graph = {
  directions: [
    { id: "lighting", service_slug: "lighting" },
    { id: "low-voltage", service_slug: "low-voltage" }
  ],
  relations: [
    {
      id: "lighting--stair-lighting",
      direction_id: "lighting",
      child: { id: "stair-lighting" },
      related_direction_ids: ["low-voltage"]
    }
  ]
};

const cloneGraph = () => structuredClone(graph);

test("starts assembled with no selected direction or relation", () => {
  const cinematic = createCinematicState(graph);

  assert.deepEqual(cinematic.initialState, {
    state: "assembled",
    selectedDirectionId: null,
    selectedRelationId: null
  });
  assert.equal(Object.isFrozen(cinematic.initialState), true);
});

test("selecting a direction focuses that direction without selecting a relation", () => {
  const cinematic = createCinematicState(graph);

  assert.deepEqual(
    cinematic.reduce(cinematic.initialState, { type: "select-direction", directionId: "low-voltage" }),
    {
      state: "focus",
      selectedDirectionId: "low-voltage",
      selectedRelationId: null
    }
  );
});

test("selecting a child relation reassembles around its owning direction", () => {
  const cinematic = createCinematicState(graph);

  assert.deepEqual(
    cinematic.reduce(cinematic.initialState, { type: "select-relation", relationId: "lighting--stair-lighting" }),
    {
      state: "reassembled",
      selectedDirectionId: "lighting",
      selectedRelationId: "lighting--stair-lighting"
    }
  );
});

test("returning to the system clears a focused or reassembled selection", () => {
  const cinematic = createCinematicState(graph);
  const focused = cinematic.reduce(cinematic.initialState, { type: "select-direction", directionId: "low-voltage" });
  const reassembled = cinematic.reduce(focused, { type: "select-relation", relationId: "lighting--stair-lighting" });

  assert.deepEqual(cinematic.reduce(focused, { type: "return-to-system" }), cinematic.initialState);
  assert.deepEqual(cinematic.reduce(reassembled, { type: "return-to-system" }), cinematic.initialState);
});

test("rejects blank and duplicate direction IDs", () => {
  const blankId = cloneGraph();
  blankId.directions[0].id = " ";
  const duplicateId = cloneGraph();
  duplicateId.directions[1].id = "lighting";

  assert.throws(() => createCinematicState(blankId), TypeError);
  assert.throws(() => createCinematicState(duplicateId), TypeError);
});

test("rejects blank and duplicate relation IDs", () => {
  const blankId = cloneGraph();
  blankId.relations[0].id = "";
  const duplicateId = cloneGraph();
  duplicateId.relations.push(structuredClone(duplicateId.relations[0]));

  assert.throws(() => createCinematicState(blankId), TypeError);
  assert.throws(() => createCinematicState(duplicateId), TypeError);
});

test("rejects relations with unknown direction references", () => {
  const unknownOwner = cloneGraph();
  unknownOwner.relations[0].direction_id = "unknown";
  const unknownRelated = cloneGraph();
  unknownRelated.relations[0].related_direction_ids = ["unknown"];

  assert.throws(() => createCinematicState(unknownOwner), TypeError);
  assert.throws(() => createCinematicState(unknownRelated), TypeError);
});

test("rejects relations with malformed child IDs or topology", () => {
  const blankChild = cloneGraph();
  blankChild.relations[0].child.id = " ";
  const missingChild = cloneGraph();
  missingChild.relations[0].child = null;
  const invalidTopology = cloneGraph();
  invalidTopology.relations[0].id = "lighting--other";

  assert.throws(() => createCinematicState(blankChild), TypeError);
  assert.throws(() => createCinematicState(missingChild), TypeError);
  assert.throws(() => createCinematicState(invalidTopology), TypeError);
});

test("rejects an empty relation list and invalid related direction lists", () => {
  const noRelations = cloneGraph();
  noRelations.relations = [];
  const noRelatedDirections = cloneGraph();
  noRelatedDirections.relations[0].related_direction_ids = [];
  const tooManyRelatedDirections = cloneGraph();
  tooManyRelatedDirections.relations[0].related_direction_ids = ["lighting", "low-voltage", "lighting", "low-voltage"];
  const duplicateRelatedDirection = cloneGraph();
  duplicateRelatedDirection.relations[0].related_direction_ids = ["low-voltage", "low-voltage"];
  const ownerAsRelatedDirection = cloneGraph();
  ownerAsRelatedDirection.relations[0].related_direction_ids = ["lighting"];

  for (const invalidGraph of [
    noRelations,
    noRelatedDirections,
    tooManyRelatedDirections,
    duplicateRelatedDirection,
    ownerAsRelatedDirection
  ]) {
    assert.throws(() => createCinematicState(invalidGraph), TypeError);
  }
});

test("rejects duplicate child IDs independently of relation IDs", () => {
  const duplicateChild = cloneGraph();
  duplicateChild.relations.push({
    id: "low-voltage--stair-lighting",
    direction_id: "low-voltage",
    child: { id: "stair-lighting" },
    related_direction_ids: ["lighting"]
  });

  assert.throws(() => createCinematicState(duplicateChild), TypeError);
});

test("normalizes malformed previous state to the canonical assembled state", () => {
  const cinematic = createCinematicState(graph);

  for (const malformedState of [null, undefined, {}, { state: "focus" }, { state: "focus", selectedDirectionId: "unknown", selectedRelationId: null }, "focus"]) {
    assert.strictEqual(
      cinematic.reduce(malformedState, { type: "select-direction", directionId: "lighting" }),
      cinematic.initialState
    );
  }
});

test("keeps duplicate, unknown, and malformed actions as the same immutable state object", () => {
  const cinematic = createCinematicState(graph);
  const focused = cinematic.reduce(cinematic.initialState, { type: "select-direction", directionId: "lighting" });
  const reassembled = cinematic.reduce(focused, { type: "select-relation", relationId: "lighting--stair-lighting" });

  assert.equal(Object.isFrozen(focused), true);
  assert.equal(Object.isFrozen(reassembled), true);
  assert.strictEqual(
    cinematic.reduce(focused, { type: "select-direction", directionId: "lighting" }),
    focused
  );
  assert.strictEqual(
    cinematic.reduce(reassembled, { type: "select-relation", relationId: "lighting--stair-lighting" }),
    reassembled
  );
  for (const action of [
    { type: "select-direction", directionId: "unknown" },
    { type: "select-relation", relationId: "unknown" },
    { type: "select-direction" },
    { type: "select-relation" },
    { type: "unknown" },
    {},
    null,
    "lighting"
  ]) {
    assert.strictEqual(cinematic.reduce(focused, action), focused);
  }
  assert.strictEqual(cinematic.reduce(cinematic.initialState, { type: "return-to-system" }), cinematic.initialState);
});

test("keeps relation ownership deterministic after the source graph is mutated", () => {
  const sourceGraph = cloneGraph();
  const cinematic = createCinematicState(sourceGraph);
  sourceGraph.relations[0].direction_id = "low-voltage";

  assert.deepEqual(
    cinematic.reduce(cinematic.initialState, { type: "select-relation", relationId: "lighting--stair-lighting" }),
    {
      state: "reassembled",
      selectedDirectionId: "lighting",
      selectedRelationId: "lighting--stair-lighting"
    }
  );
});
