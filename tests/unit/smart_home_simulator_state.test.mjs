import assert from "node:assert/strict";
import test from "node:test";

import { createSmartHomeMachine } from "../../assets/js/smart-home-simulator-state.js";

const systemIds = ["lighting", "climate", "shading", "access", "security", "panel", "low-voltage", "backup-power", "audio"];
const presetIds = ["morning", "arrival", "evening", "away", "night", "heat", "backup"];
const presetSystemIds = {
  morning: "shading",
  arrival: "access",
  evening: "audio",
  away: "security",
  night: "lighting",
  heat: "climate",
  backup: "backup-power"
};
const controlsBySystem = {
  lighting: [{ id: "intensity", type: "range", min: 0, max: 100, step: 5, defaultValue: 40 }],
  climate: [{ id: "target", type: "range", min: 16, max: 28, step: 1, defaultValue: 21 }],
  shading: [{ id: "position", type: "range", min: 0, max: 100, step: 5, defaultValue: 0 }],
  access: [{ id: "perimeter", type: "toggle", defaultValue: false }],
  security: [{ id: "coverage", type: "segment", options: ["entry", "perimeter", "all"], defaultValue: "entry" }],
  panel: [{ id: "layer", type: "segment", options: ["input", "protection", "priority"], defaultValue: "input" }],
  "low-voltage": [{ id: "route", type: "segment", options: ["network", "sensors", "video"], defaultValue: "network" }],
  "backup-power": [{ id: "priority", type: "segment", options: ["critical", "comfort", "all"], defaultValue: "critical" }],
  audio: [{ id: "enabled", type: "toggle", defaultValue: false }]
};
const canonicalValues = (offset) => ({
  lighting: { intensity: 40 + offset }, climate: { target: 21 + (offset === 0 ? 0 : 1) }, shading: { position: offset }, access: { perimeter: offset > 0 },
  security: { coverage: offset > 0 ? "all" : "entry" }, panel: { layer: offset > 0 ? "priority" : "input" },
  "low-voltage": { route: offset > 0 ? "video" : "network" }, "backup-power": { priority: offset > 0 ? "all" : "critical" }, audio: { enabled: offset > 0 }
});
const presets = Object.fromEntries(presetIds.map((presetId, index) => [presetId, canonicalValues(index * 5)]));
function makeMachine(overrides = {}) {
  return createSmartHomeMachine({ systemIds, presetIds, initialPresetId: "morning", initialSystemId: "shading", presetSystemIds, controlsBySystem, presets, ...overrides });
}

test("creates an immutable canonical state for all nine systems and seven presets", () => {
  const machine = makeMachine();
  assert.deepEqual(machine.initialState, { systemId: "shading", presetId: "morning", valuesBySystem: canonicalValues(0), manual: false });
  assert.equal(Object.isFrozen(machine.initialState), true);
  assert.equal(Object.isFrozen(machine.initialState.valuesBySystem), true);
  assert.equal(Object.isFrozen(machine.initialState.valuesBySystem.lighting), true);
  assert.throws(() => { machine.initialState.valuesBySystem.lighting.intensity = 100; }, TypeError);
});

test("select-system changes only the active system and preserves all controls, preset, and manual state", () => {
  const machine = makeMachine();
  const adjusted = machine.transition(machine.initialState, { type: "set-control", systemId: "lighting", controlId: "intensity", value: 70 });
  const selected = machine.transition(adjusted, { type: "select-system", systemId: "audio" });
  assert.deepEqual(selected, { systemId: "audio", presetId: "morning", valuesBySystem: { ...canonicalValues(0), lighting: { intensity: 70 } }, manual: true });
  assert.strictEqual(selected.valuesBySystem, adjusted.valuesBySystem);
});

test("selects every declared system and atomically restores every declared preset", () => {
  const machine = makeMachine();

  for (const systemId of systemIds) {
    const selected = machine.transition(machine.initialState, { type: "select-system", systemId });
    assert.equal(selected.systemId, systemId);
    assert.equal(selected.presetId, "morning");
    assert.strictEqual(selected.valuesBySystem, machine.initialState.valuesBySystem);
  }

  for (const [index, presetId] of presetIds.entries()) {
    const manual = machine.transition(machine.initialState, { type: "set-control", systemId: "lighting", controlId: "intensity", value: 65 });
    const selected = machine.transition(manual, { type: "select-preset", presetId });
    assert.equal(selected.presetId, presetId);
    assert.equal(selected.systemId, presetSystemIds[presetId]);
    assert.equal(selected.manual, false);
    assert.deepEqual(selected.valuesBySystem, canonicalValues(index * 5));
  }
});

test("select-preset atomically restores canonical values for all systems and exits manual state", () => {
  const machine = makeMachine();
  const changedLighting = machine.transition(machine.initialState, { type: "set-control", systemId: "lighting", controlId: "intensity", value: 70 });
  const changedClimate = machine.transition(changedLighting, { type: "set-control", systemId: "climate", controlId: "target", value: 25 });
  const restored = machine.transition(changedClimate, { type: "select-preset", presetId: "evening" });
  assert.deepEqual(restored, { systemId: "audio", presetId: "evening", valuesBySystem: canonicalValues(10), manual: false });
  assert.notStrictEqual(restored.valuesBySystem, changedClimate.valuesBySystem);
});

test("set-control validates range, segment, and toggle values, changes exactly one control, and enters manual state", () => {
  const machine = makeMachine();
  const range = machine.transition(machine.initialState, { type: "set-control", systemId: "lighting", controlId: "intensity", value: 65 });
  const segment = machine.transition(range, { type: "set-control", systemId: "security", controlId: "coverage", value: "all" });
  const toggle = machine.transition(segment, { type: "set-control", systemId: "audio", controlId: "enabled", value: true });
  assert.deepEqual(range.valuesBySystem, { ...canonicalValues(0), lighting: { intensity: 65 } });
  assert.deepEqual(segment.valuesBySystem, { ...canonicalValues(0), lighting: { intensity: 65 }, security: { coverage: "all" } });
  assert.deepEqual(toggle.valuesBySystem, { ...canonicalValues(0), lighting: { intensity: 65 }, security: { coverage: "all" }, audio: { enabled: true } });
  assert.strictEqual(range.valuesBySystem.climate, machine.initialState.valuesBySystem.climate);
  assert.strictEqual(segment.valuesBySystem.lighting, range.valuesBySystem.lighting);
  assert.equal(toggle.manual, true);
});

test("returns the same valid state for malformed actions and normalizes malformed state to initialState", () => {
  const machine = makeMachine();
  const noOpActions = [
    { type: "select-system", systemId: "unknown" }, { type: "select-preset", presetId: "unknown" },
    { type: "set-control", systemId: "lighting", controlId: "intensity", value: 63 }, { type: "set-control", systemId: "security", controlId: "coverage", value: "unknown" },
    { type: "set-control", systemId: "audio", controlId: "enabled", value: "true" }, { type: "set-control", systemId: "lighting", controlId: "unknown", value: 65 },
    { type: "activate" }, {}, null, undefined, "lighting"
  ];
  for (const action of noOpActions) assert.strictEqual(machine.transition(machine.initialState, action), machine.initialState);
  for (const malformedState of [null, undefined, {}, { ...machine.initialState, manual: "false" }, { ...machine.initialState, valuesBySystem: {} }]) {
    assert.strictEqual(machine.transition(malformedState, { type: "select-system", systemId: "audio" }), machine.initialState);
  }
});

test("remains deterministic after the caller mutates the source configuration", () => {
  const mutableConfig = {
    systemIds: [...systemIds],
    presetIds: [...presetIds],
    initialPresetId: "morning",
    initialSystemId: "shading",
    presetSystemIds: structuredClone(presetSystemIds),
    controlsBySystem: structuredClone(controlsBySystem),
    presets: structuredClone(presets)
  };
  const machine = createSmartHomeMachine(mutableConfig);

  mutableConfig.systemIds.splice(0);
  mutableConfig.presetIds.splice(0);
  mutableConfig.presetSystemIds.evening = "lighting";
  mutableConfig.controlsBySystem.security[0].options.splice(0);
  mutableConfig.presets.evening.lighting.intensity = 100;

  const selected = machine.transition(machine.initialState, { type: "select-system", systemId: "audio" });
  const adjusted = machine.transition(selected, { type: "set-control", systemId: "security", controlId: "coverage", value: "all" });
  const restored = machine.transition(adjusted, { type: "select-preset", presetId: "evening" });
  assert.equal(selected.systemId, "audio");
  assert.equal(adjusted.valuesBySystem.security.coverage, "all");
  assert.deepEqual(restored.valuesBySystem, canonicalValues(10));
  assert.equal(restored.systemId, "audio");
});

test("rejects incomplete or invalid factory configuration before state can be created", () => {
  const invalidConfigurations = [
    { systemIds: systemIds.slice(1) }, { systemIds: [...systemIds, "lighting"] }, { presetIds: presetIds.slice(1) }, { initialPresetId: "unknown" }, { initialSystemId: "unknown" }, { initialSystemId: "lighting" },
    { presetSystemIds: { ...presetSystemIds, morning: "unknown" } }, { presetSystemIds: { morning: "shading" } }, { presetSystemIds: { ...presetSystemIds, extra: "lighting" } },
    { controlsBySystem: { ...controlsBySystem, lighting: [{ id: "intensity", type: "range", min: 0, max: 100, step: 5, defaultValue: 63 }] } },
    { controlsBySystem: { ...controlsBySystem, audio: [{ id: "enabled", type: "toggle", defaultValue: "false" }] } },
    { presets: { ...presets, morning: { ...canonicalValues(0), audio: { enabled: "false" } } } }, { presets: { morning: canonicalValues(0) } }
  ];
  for (const overrides of invalidConfigurations) assert.throws(() => makeMachine(overrides), TypeError);
});
