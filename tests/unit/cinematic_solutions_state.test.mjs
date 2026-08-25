import assert from "node:assert/strict";
import test from "node:test";

import { createCinematicSolutionsState } from "../../assets/js/cinematic-solutions-state.js";

const graph = {
  directions: [
    { id: "electrical-design" },
    { id: "lighting" },
    { id: "smart-home-integration" },
    { id: "backup-power" }
  ],
  relations: [
    {
      id: "smart-home-integration--climate",
      direction_id: "smart-home-integration",
      child: { id: "climate" },
      related_direction_ids: ["electrical-design"]
    },
    {
      id: "backup-power--backup",
      direction_id: "backup-power",
      child: { id: "backup" },
      related_direction_ids: ["lighting"]
    }
  ]
};

const mapping = {
  apartment: {
    direction_ids: ["electrical-design", "lighting", "smart-home-integration"],
    relation_id: "smart-home-integration--climate"
  },
  autonomy: {
    direction_ids: ["backup-power", "electrical-design"],
    relation_id: "backup-power--backup"
  }
};

test("keeps an immutable selected solution through assembled, focus, and reassembled states", () => {
  const atlas = createCinematicSolutionsState(graph, mapping);

  assert.deepEqual(atlas.initialState, {
    state: "assembled",
    selectedSolutionId: "apartment",
    selectedDirectionIds: ["electrical-design", "lighting", "smart-home-integration"],
    selectedDirectionId: null,
    selectedRelationId: null
  });
  assert.equal(Object.isFrozen(atlas.initialState), true);
  assert.equal(Object.isFrozen(atlas.initialState.selectedDirectionIds), true);

  const focused = atlas.reduce(atlas.initialState, { type: "select-focus" });
  assert.deepEqual(focused, {
    state: "focus",
    selectedSolutionId: "apartment",
    selectedDirectionIds: ["electrical-design", "lighting", "smart-home-integration"],
    selectedDirectionId: "electrical-design",
    selectedRelationId: null
  });

  assert.deepEqual(atlas.reduce(focused, { type: "select-reassembled" }), {
    state: "reassembled",
    selectedSolutionId: "apartment",
    selectedDirectionIds: ["electrical-design", "lighting", "smart-home-integration"],
    selectedDirectionId: "smart-home-integration",
    selectedRelationId: "smart-home-integration--climate"
  });

  assert.deepEqual(atlas.reduce(focused, { type: "select-assembled" }), atlas.initialState);
});

test("selecting a solution deterministically focuses that solution and its canonical relation", () => {
  const atlas = createCinematicSolutionsState(graph, mapping);
  const selected = atlas.reduce(atlas.initialState, { type: "select-solution", solutionId: "autonomy" });

  assert.deepEqual(selected, {
    state: "focus",
    selectedSolutionId: "autonomy",
    selectedDirectionIds: ["backup-power", "electrical-design"],
    selectedDirectionId: "backup-power",
    selectedRelationId: null
  });
  assert.deepEqual(atlas.reduce(selected, { type: "select-reassembled" }), {
    state: "reassembled",
    selectedSolutionId: "autonomy",
    selectedDirectionIds: ["backup-power", "electrical-design"],
    selectedDirectionId: "backup-power",
    selectedRelationId: "backup-power--backup"
  });
});

test("rejects malformed topology, unknown relations, and a relation outside the declared solution directions", () => {
  const invalidMappings = [
    null,
    {},
    { apartment: { direction_ids: [], relation_id: "smart-home-integration--climate" } },
    { apartment: { direction_ids: ["electrical-design", "electrical-design"], relation_id: "smart-home-integration--climate" } },
    { apartment: { direction_ids: ["electrical-design"], relation_id: "smart-home-integration--climate" } },
    { apartment: { direction_ids: ["electrical-design", "lighting"], relation_id: "unknown--relation" } },
    { apartment: { direction_ids: ["electrical-design"], relation_id: "smart-home-integration--climate", extra: true } }
  ];

  for (const invalidMapping of invalidMappings) {
    assert.throws(() => createCinematicSolutionsState(graph, invalidMapping), TypeError);
  }
});

test("fails closed for malformed prior state and leaves unknown actions inert", () => {
  const atlas = createCinematicSolutionsState(graph, mapping);
  const focused = atlas.reduce(atlas.initialState, { type: "select-focus" });

  for (const malformedState of [null, {}, { state: "focus" }, { ...focused, selectedSolutionId: "unknown" }]) {
    assert.strictEqual(atlas.reduce(malformedState, { type: "select-focus" }), atlas.initialState);
  }
  for (const action of [null, {}, { type: "unknown" }, { type: "select-solution", solutionId: "unknown" }]) {
    assert.strictEqual(atlas.reduce(focused, action), focused);
  }
});

test("does not change when its source mapping is mutated after construction", () => {
  const source = structuredClone(mapping);
  const atlas = createCinematicSolutionsState(graph, source);
  source.apartment.direction_ids[0] = "backup-power";
  source.apartment.relation_id = "backup-power--backup";

  assert.deepEqual(atlas.reduce(atlas.initialState, { type: "select-reassembled" }), {
    state: "reassembled",
    selectedSolutionId: "apartment",
    selectedDirectionIds: ["electrical-design", "lighting", "smart-home-integration"],
    selectedDirectionId: "smart-home-integration",
    selectedRelationId: "smart-home-integration--climate"
  });
});
