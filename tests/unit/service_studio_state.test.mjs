import assert from "node:assert/strict";
import test from "node:test";

import { createServiceStudioState } from "../../assets/js/service-studio-state.js";

const graph = {
  directions: [
    { id: "electrical-design" },
    { id: "panels-and-protection" }
  ],
  relations: [
    {
      id: "panels-and-protection--panel-assembly",
      direction_id: "panels-and-protection",
      child: { id: "panel-assembly" },
      related_direction_ids: ["electrical-design"]
    }
  ]
};

test("service studio maps its three rail states onto the canonical cinematic graph", () => {
  const studio = createServiceStudioState(graph, {
    direction_id: "electrical-design",
    relation_id: "panels-and-protection--panel-assembly"
  });

  assert.deepEqual(studio.initialState, {
    state: "assembled",
    selectedDirectionId: null,
    selectedRelationId: null
  });
  assert.deepEqual(studio.reduce(studio.initialState, { type: "select-focus" }), {
    state: "focus",
    selectedDirectionId: "electrical-design",
    selectedRelationId: null
  });
  assert.deepEqual(studio.reduce(studio.initialState, { type: "select-reassembled" }), {
    state: "reassembled",
    selectedDirectionId: "panels-and-protection",
    selectedRelationId: "panels-and-protection--panel-assembly"
  });
});

test("service studio rejects IDs absent from the canonical graph", () => {
  assert.throws(
    () => createServiceStudioState(graph, {
      direction_id: "unavailable-service",
      relation_id: "panels-and-protection--panel-assembly"
    }),
    /canonical graph/
  );
});

test("service studio maps the reserve relation onto its canonical owner", () => {
  const reserveGraph = {
    directions: [
      { id: "backup-power" },
      { id: "panels-and-protection" }
    ],
    relations: [
      {
        id: "backup-power--backup",
        direction_id: "backup-power",
        child: { id: "backup" },
        related_direction_ids: ["panels-and-protection"]
      }
    ]
  };
  const studio = createServiceStudioState(reserveGraph, {
    direction_id: "backup-power",
    relation_id: "backup-power--backup"
  });

  assert.deepEqual(studio.reduce(studio.initialState, { type: "select-reassembled" }), {
    state: "reassembled",
    selectedDirectionId: "backup-power",
    selectedRelationId: "backup-power--backup"
  });
});
