import assert from "node:assert/strict";
import test from "node:test";

import { createPhysicalSceneState } from "../../assets/js/physical-scene-state.js";

const physicalScenes = {
  lighting: [
    { id: "off", label: "Вимкнено" },
    { id: "route", label: "Маршрут" },
    { id: "evening", label: "Вечір" },
    { id: "full", label: "Повне" }
  ],
  window_treatments: [
    { id: "open", label: "Відкрито" },
    { id: "tulle", label: "Тюль" },
    { id: "blinds", label: "Жалюзі" },
    { id: "blackout", label: "Ролети blackout" },
    { id: "curtains", label: "Штори" }
  ],
  initial_state: { lighting_id: "evening", window_treatment_id: "open" },
  scenes: []
};

physicalScenes.scenes = physicalScenes.lighting.flatMap((lighting) =>
  physicalScenes.window_treatments.map((windowTreatment) => ({
    lighting_id: lighting.id,
    window_treatment_id: windowTreatment.id,
    src_768: `/assets/images/cinematic/residence/room-${lighting.id}-${windowTreatment.id}-768.webp`,
    src_1536: `/assets/images/cinematic/residence/room-${lighting.id}-${windowTreatment.id}-1536.webp`,
    alt: `Візуальна концепція: ${lighting.label} та ${windowTreatment.label} у резиденції`
  }))
);

test("starts from the immutable orthogonal evening and open state", () => {
  const physical = createPhysicalSceneState(physicalScenes);

  assert.deepEqual(physical.initialState, { lightingId: "evening", windowTreatmentId: "open" });
  assert.equal(Object.isFrozen(physical.initialState), true);
  assert.equal(physical.sceneFor(physical.initialState).src1536, "/assets/images/cinematic/residence/room-evening-open-1536.webp");
});

test("each physical control changes only its own axis and resolves a different media mapping", () => {
  const physical = createPhysicalSceneState(physicalScenes);
  const withBlackout = physical.reduce(physical.initialState, { type: "select-window-treatment", windowTreatmentId: "blackout" });
  const routeAndBlackout = physical.reduce(withBlackout, { type: "select-lighting", lightingId: "off" });

  assert.deepEqual(withBlackout, { lightingId: "evening", windowTreatmentId: "blackout" });
  assert.equal(physical.sceneFor(withBlackout).src1536, "/assets/images/cinematic/residence/room-evening-blackout-1536.webp");
  assert.deepEqual(routeAndBlackout, { lightingId: "off", windowTreatmentId: "blackout" });
});

test("invalid controls and missing pair mappings fail closed without changing state", () => {
  const physical = createPhysicalSceneState(physicalScenes);

  assert.strictEqual(physical.reduce(physical.initialState, { type: "select-lighting", lightingId: "unknown" }), physical.initialState);
  assert.strictEqual(physical.reduce(physical.initialState, { type: "unknown" }), physical.initialState);
  assert.throws(() => createPhysicalSceneState({ ...physicalScenes, scenes: physicalScenes.scenes.slice(1) }), TypeError);
});

test("rejects malformed data and remains independent from later source mutation", () => {
  const source = structuredClone(physicalScenes);
  const physical = createPhysicalSceneState(source);
  source.initial_state.lighting_id = "off";
  source.scenes[1].src_1536 = "tampered";

  assert.equal(physical.initialState.lightingId, "evening");
  assert.equal(physical.sceneFor(physical.initialState).src1536, "/assets/images/cinematic/residence/room-evening-open-1536.webp");
  assert.throws(() => createPhysicalSceneState({ ...physicalScenes, scenes: [] }), TypeError);
  assert.throws(() => createPhysicalSceneState({
    ...physicalScenes,
    lighting: physicalScenes.lighting.map((choice) => choice.id === "evening" ? { ...choice, label: " " } : choice)
  }), TypeError);
});
