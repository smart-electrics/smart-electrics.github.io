import assert from "node:assert/strict";
import test from "node:test";

import { createPhysicalSceneState } from "../../assets/js/physical-scene-state.js";

const relationLightingScenes = {
  systems: [
    {
      id: "stairs",
      scene_key: "relation:lighting--stair-lighting",
      controls: [{ id: "stair_lighting", label: "Підсвітка сходів", choices: [
        { id: "off", label: "Вимкнено" },
        { id: "route", label: "Маршрут сходами" },
        { id: "full", label: "Повна циркуляція" }
      ] }],
      initial_state: { stair_lighting: "off" },
      scenes: ["off", "route", "full"].map((stairLighting) => ({
        state: { stair_lighting: stairLighting },
        src_768: `/assets/images/cinematic/residence/stairs-${stairLighting}-768.webp`,
        src_1536: `/assets/images/cinematic/residence/stairs-${stairLighting}-1536.webp`,
        alt: `Візуальна концепція: сходи, ${stairLighting}`
      }))
    },
    {
      id: "exterior",
      scene_key: "relation:lighting--outdoor-lighting",
      controls: [{ id: "exterior_lighting", label: "Зовнішнє освітлення", choices: [
        { id: "approach", label: "Підхід" },
        { id: "evening", label: "Вечірній ландшафт" },
        { id: "reduced-night", label: "Нічне зниження" }
      ] }],
      initial_state: { exterior_lighting: "approach" },
      scenes: ["approach", "evening", "reduced-night"].map((exteriorLighting) => ({
        state: { exterior_lighting: exteriorLighting },
        src_768: `/assets/images/cinematic/residence/exterior-${exteriorLighting}-768.webp`,
        src_1536: `/assets/images/cinematic/residence/exterior-${exteriorLighting}-1536.webp`,
        alt: `Візуальна концепція: фасад, ${exteriorLighting}`
      }))
    }
  ]
};

test("one deterministic physical layer resolves and reduces the stair and exterior relation media", () => {
  const physical = createPhysicalSceneState(relationLightingScenes);
  const stairs = physical.systemForSceneKey("relation:lighting--stair-lighting");
  const exterior = physical.systemForSceneKey("relation:lighting--outdoor-lighting");

  assert.equal(stairs.sceneFor(stairs.initialState).src1536, "/assets/images/cinematic/residence/stairs-off-1536.webp");
  const routeSteps = stairs.reduce(stairs.initialState, { type: "select-control", controlId: "stair_lighting", valueId: "route" });
  assert.deepEqual(routeSteps, { stair_lighting: "route" });
  assert.equal(stairs.sceneFor(routeSteps).src768, "/assets/images/cinematic/residence/stairs-route-768.webp");

  const reducedNight = exterior.reduce(exterior.initialState, { type: "select-control", controlId: "exterior_lighting", valueId: "reduced-night" });
  assert.equal(exterior.sceneFor(reducedNight).src1536, "/assets/images/cinematic/residence/exterior-reduced-night-1536.webp");
});

const physicalScenes = { systems: [{
  id: "room",
  scene_key: "assembled",
  controls: [
    { id: "lighting", label: "Освітлення", choices: [
    { id: "off", label: "Вимкнено" },
    { id: "route", label: "Маршрут" },
    { id: "evening", label: "Вечір" },
    { id: "full", label: "Повне" }
    ] },
    { id: "window_treatment", label: "Сонцезахист", choices: [
    { id: "open", label: "Відкрито" },
    { id: "tulle", label: "Тюль" },
    { id: "blinds", label: "Жалюзі" },
    { id: "blackout", label: "Ролети blackout" },
    { id: "curtains", label: "Штори" }
    ] }
  ],
  initial_state: { lighting: "evening", window_treatment: "open" },
  scenes: []
}] };

const room = physicalScenes.systems[0];
const lighting = room.controls[0].choices;
const windowTreatments = room.controls[1].choices;
room.scenes = lighting.flatMap((lightingChoice) =>
  windowTreatments.map((windowTreatment) => ({
    state: { lighting: lightingChoice.id, window_treatment: windowTreatment.id },
    src_768: `/assets/images/cinematic/residence/room-${lightingChoice.id}-${windowTreatment.id}-768.webp`,
    src_1536: `/assets/images/cinematic/residence/room-${lightingChoice.id}-${windowTreatment.id}-1536.webp`,
    alt: `Візуальна концепція: ${lightingChoice.label} та ${windowTreatment.label} у резиденції`
  }))
);

test("starts from the immutable orthogonal evening and open state", () => {
  const physical = createPhysicalSceneState(physicalScenes).systemForSceneKey("assembled");

  assert.deepEqual(physical.initialState, { lighting: "evening", window_treatment: "open" });
  assert.equal(Object.isFrozen(physical.initialState), true);
  assert.equal(physical.sceneFor(physical.initialState).src1536, "/assets/images/cinematic/residence/room-evening-open-1536.webp");
});

test("each physical control changes only its own axis and resolves a different media mapping", () => {
  const physical = createPhysicalSceneState(physicalScenes).systemForSceneKey("assembled");
  const withBlackout = physical.reduce(physical.initialState, { type: "select-control", controlId: "window_treatment", valueId: "blackout" });
  const routeAndBlackout = physical.reduce(withBlackout, { type: "select-control", controlId: "lighting", valueId: "off" });

  assert.deepEqual(withBlackout, { lighting: "evening", window_treatment: "blackout" });
  assert.equal(physical.sceneFor(withBlackout).src1536, "/assets/images/cinematic/residence/room-evening-blackout-1536.webp");
  assert.deepEqual(routeAndBlackout, { lighting: "off", window_treatment: "blackout" });
});

test("invalid controls and missing pair mappings fail closed without changing state", () => {
  const physical = createPhysicalSceneState(physicalScenes).systemForSceneKey("assembled");

  assert.strictEqual(physical.reduce(physical.initialState, { type: "select-control", controlId: "lighting", valueId: "unknown" }), physical.initialState);
  assert.strictEqual(physical.reduce(physical.initialState, { type: "unknown" }), physical.initialState);
  assert.throws(() => createPhysicalSceneState({ systems: [{ ...room, scenes: room.scenes.slice(1) }] }), TypeError);
});

test("rejects malformed data and remains independent from later source mutation", () => {
  const source = structuredClone(physicalScenes);
  const physical = createPhysicalSceneState(source);
  source.systems[0].initial_state.lighting = "off";
  source.systems[0].scenes[1].src_1536 = "tampered";

  const roomPhysical = physical.systemForSceneKey("assembled");
  assert.equal(roomPhysical.initialState.lighting, "evening");
  assert.equal(roomPhysical.sceneFor(roomPhysical.initialState).src1536, "/assets/images/cinematic/residence/room-evening-open-1536.webp");
  assert.throws(() => createPhysicalSceneState({ systems: [{ ...room, scenes: [] }] }), TypeError);
  assert.throws(() => createPhysicalSceneState({
    systems: [{ ...room, controls: room.controls.map((control) => control.id === "lighting" ? { ...control, choices: control.choices.map((choice) => choice.id === "evening" ? { ...choice, label: " " } : choice) } : control) }]
  }), TypeError);
});
