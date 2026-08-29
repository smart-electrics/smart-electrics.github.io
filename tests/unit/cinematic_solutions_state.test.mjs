import assert from "node:assert/strict";
import test from "node:test";

import {
  createCinematicSolutionsHandoff,
  createCinematicSolutionsState
} from "../../assets/js/cinematic-solutions-state.js";

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

const scenes = {
  apartment: { focus_direction_id: "smart-home-integration" },
  autonomy: { focus_direction_id: "backup-power" }
};

test("latest decode handoff owns the eventual physical scene", () => {
  const handoff = createCinematicSolutionsHandoff();
  const first = handoff.begin();
  assert.equal(handoff.isCurrent(first), true);

  const second = handoff.begin();
  assert.equal(handoff.isCurrent(first), false);
  assert.equal(handoff.isCurrent(second), true);
  assert.equal(handoff.isCurrent(0), false);
  assert.equal(handoff.isCurrent("2"), false);
});

test("keeps an immutable selected solution through assembled, focus, and reassembled states", () => {
  const atlas = createCinematicSolutionsState(graph, mapping, scenes);

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
    selectedDirectionId: "smart-home-integration",
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

test("selecting a solution returns to its assembled spatial overview", () => {
  const atlas = createCinematicSolutionsState(graph, mapping, scenes);
  const selected = atlas.reduce(atlas.initialState, { type: "select-solution", solutionId: "autonomy" });

  assert.deepEqual(selected, {
    state: "assembled",
    selectedSolutionId: "autonomy",
    selectedDirectionIds: ["backup-power", "electrical-design"],
    selectedDirectionId: null,
    selectedRelationId: null
  });
  assert.strictEqual(atlas.reduce(selected, { type: "select-solution", solutionId: "autonomy" }), selected);
  const focused = atlas.reduce(selected, { type: "select-focus" });
  assert.equal(focused.selectedDirectionId, "backup-power");
  assert.deepEqual(atlas.reduce(focused, { type: "select-reassembled" }), {
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
    assert.throws(() => createCinematicSolutionsState(graph, invalidMapping, scenes), TypeError);
  }
  assert.throws(() => createCinematicSolutionsState(graph, mapping, { apartment: { focus_direction_id: "smart-home-integration" } }), TypeError);
  assert.throws(() => createCinematicSolutionsState(graph, mapping, { ...scenes, apartment: { focus_direction_id: "backup-power" } }), TypeError);
});

test("fails closed for malformed prior state and leaves unknown actions inert", () => {
  const atlas = createCinematicSolutionsState(graph, mapping, scenes);
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
  const sceneSource = structuredClone(scenes);
  const atlas = createCinematicSolutionsState(graph, source, sceneSource);
  source.apartment.direction_ids[0] = "backup-power";
  source.apartment.relation_id = "backup-power--backup";
  sceneSource.apartment.focus_direction_id = "electrical-design";

  assert.deepEqual(atlas.reduce(atlas.initialState, { type: "select-reassembled" }), {
    state: "reassembled",
    selectedSolutionId: "apartment",
    selectedDirectionIds: ["electrical-design", "lighting", "smart-home-integration"],
    selectedDirectionId: "smart-home-integration",
    selectedRelationId: "smart-home-integration--climate"
  });
});
