import assert from "node:assert/strict";
import test from "node:test";

import { createPhysicalSceneSvgProjector } from "../../assets/js/physical-scene-svg-state.js";

function assertDeeplyFrozen(value) {
  assert.equal(Object.isFrozen(value), true);
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) assertDeeplyFrozen(child);
  }
}

test("projects public lighting controls into an immutable SVG render frame", () => {
  const profile = {
    view_box: { width: 1536, height: 1024 },
    systems: [{
      id: "lighting",
      layers: [
        {
          id: "lighting-living-pool",
          geometry: { kind: "ellipse", cx: 868, cy: 544, rx: 282, ry: 138 },
          binding: {
            control_id: "brightness",
            type: "range",
            input: { min: 0, max: 100 },
            parameter: "strength",
            output: { min: 0, max: 0.84 }
          }
        },
        {
          id: "lighting-route-mask",
          geometry: { kind: "path", points: [[184, 816], [504, 692], [836, 548], [1248, 402]] },
          binding: {
            control_id: "layer",
            type: "segment",
            parameter: "progress",
            output: { route: 0.35, evening: 0.68, full: 1 }
          }
        }
      ]
    }]
  };
  const projector = createPhysicalSceneSvgProjector(profile);
  const routeFrame = projector.frameFor({
    systemId: "lighting",
    valuesBySystem: { lighting: { brightness: 40, layer: "route" } }
  });

  assert.deepEqual(routeFrame, {
    viewBox: "0 0 1536 1024",
    systemId: "lighting",
    signature: "lighting:brightness=40|layer=route",
    layers: [
      {
        id: "lighting-living-pool",
        geometry: { kind: "ellipse", cx: 868, cy: 544, rx: 282, ry: 138 },
        parameters: { strength: 0.336 }
      },
      {
        id: "lighting-route-mask",
        geometry: { kind: "path", points: [[184, 816], [504, 692], [836, 548], [1248, 402]] },
        parameters: { progress: 0.35 }
      }
    ]
  });
  assertDeeplyFrozen(routeFrame);

  const fullFrame = projector.frameFor({
    systemId: "lighting",
    valuesBySystem: { lighting: { brightness: 80, layer: "full" } }
  });
  assert.notEqual(fullFrame.signature, routeFrame.signature);
  assert.notDeepEqual(fullFrame.layers.map((layer) => layer.parameters), routeFrame.layers.map((layer) => layer.parameters));

  profile.view_box.width = 1;
  profile.systems[0].layers[0].geometry.cx = 1;
  profile.systems[0].layers[1].binding.output.route = 1;
  assert.deepEqual(projector.frameFor({
    systemId: "lighting",
    valuesBySystem: { lighting: { brightness: 40, layer: "route" } }
  }), routeFrame);

  assert.equal(projector.frameFor({
    systemId: "lighting",
    valuesBySystem: { lighting: { brightness: 101, layer: "route" } }
  }), null);
  assert.equal(projector.frameFor({
    systemId: "lighting",
    valuesBySystem: { lighting: { brightness: 40, layer: "unknown" } }
  }), null);
});

test("projects public shading controls into distinct immutable treatment frames", () => {
  const profile = {
    view_box: { width: 1536, height: 1024 },
    systems: [{
      id: "shading",
      layers: [
        {
          id: "shading-tulle-diffusion",
          geometry: { kind: "rect", x: 292, y: 120, width: 836, height: 668 },
          visible_when: { control_id: "treatment", equals: "tulle" },
          bindings: [{
            control_id: "position",
            type: "range",
            input: { min: 0, max: 100 },
            parameter: "diffusion",
            output: { min: 0.08, max: 0.72 }
          }]
        },
        {
          id: "shading-blinds-slats",
          geometry: { kind: "line", x1: 292, y1: 454, x2: 1128, y2: 454 },
          visible_when: { control_id: "treatment", equals: "blinds" },
          bindings: [{
            control_id: "position",
            type: "range",
            input: { min: 0, max: 100 },
            parameter: "slat_angle",
            output: { min: -18, max: 18 }
          }]
        },
        {
          id: "shading-curtain-left",
          geometry: { kind: "polygon", points: [[768, 120], [768, 788], [614, 788], [614, 120]] },
          visible_when: { control_id: "treatment", equals: "curtains" },
          bindings: [{
            control_id: "position",
            type: "range",
            input: { min: 0, max: 100 },
            parameter: "translate_x",
            output: { min: 0, max: -308 }
          }]
        },
        {
          id: "shading-curtain-right",
          geometry: { kind: "polygon", points: [[768, 120], [922, 120], [922, 788], [768, 788]] },
          visible_when: { control_id: "treatment", equals: "curtains" },
          bindings: [{
            control_id: "position",
            type: "range",
            input: { min: 0, max: 100 },
            parameter: "translate_x",
            output: { min: 0, max: 308 }
          }]
        },
        {
          id: "shading-roller-coverage",
          geometry: { kind: "rect", x: 292, y: 120, width: 836, height: 668 },
          visible_when: { control_id: "treatment", equals: "rollers" },
          bindings: [{
            control_id: "position",
            type: "range",
            input: { min: 0, max: 100 },
            parameter: "vertical_coverage",
            output: { min: 1, max: 0 }
          }]
        }
      ]
    }]
  };
  const projector = createPhysicalSceneSvgProjector(profile);
  const frameFor = (treatment, position = 40) => projector.frameFor({
    systemId: "shading",
    valuesBySystem: { shading: { position, treatment } }
  });
  const frames = Object.fromEntries(["tulle", "blinds", "curtains", "rollers"].map((treatment) => [treatment, frameFor(treatment)]));

  for (const frame of Object.values(frames)) {
    assert.notEqual(frame, null);
    assert.notEqual(frame.layers.length, 0);
    assertDeeplyFrozen(frame);
  }
  assert.equal(new Set(Object.values(frames).map((frame) => frame.signature)).size, 4);
  assert.deepEqual(frames.tulle.layers[0].parameters, { diffusion: 0.336 });
  assert.deepEqual(frames.blinds.layers[0].parameters, { slat_angle: -3.6 });
  assert.deepEqual(frames.curtains.layers.map((layer) => [layer.id, layer.parameters.translate_x]), [
    ["shading-curtain-left", -123.2],
    ["shading-curtain-right", 123.2]
  ]);
  assert.deepEqual(frames.rollers.layers[0].parameters, { vertical_coverage: 0.6 });

  const curtainsClosed = frameFor("curtains", 0);
  const curtainsOpen = frameFor("curtains", 100);
  assert.notEqual(curtainsClosed.signature, curtainsOpen.signature);
  assert.deepEqual(curtainsClosed.layers.map((layer) => layer.parameters.translate_x), [0, 0]);
  assert.deepEqual(curtainsOpen.layers.map((layer) => layer.parameters.translate_x), [-308, 308]);
  assert.notDeepEqual(curtainsClosed.layers.map((layer) => layer.parameters), curtainsOpen.layers.map((layer) => layer.parameters));

  for (const frame of Object.values(frames)) {
    for (const layer of frame.layers) {
      const geometry = layer.geometry;
      const numbers = geometry.kind === "polygon"
        ? geometry.points.flat()
        : Object.entries(geometry).filter(([key]) => key !== "kind").map(([, value]) => value);
      assert.equal(numbers.every((value) => Number.isFinite(value) && value >= 0 && value <= 1536), true);
    }
  }

  assert.equal(frameFor("unknown"), null);
  assert.equal(projector.frameFor({ systemId: "shading", valuesBySystem: { shading: { treatment: "tulle" } } }), null);
});

test("projects every remaining physical system into distinct immutable public frames", () => {
  const profile = {
    view_box: { width: 1536, height: 1024 },
    systems: [
      {
        id: "room",
        layers: [{
          id: "room-ambient-window",
          geometry: { kind: "rect", x: 448, y: 132, width: 640, height: 556 },
          bindings: [
            { control_id: "lighting", type: "segment", parameter: "ambient", output: { evening: 0.48, full: 0.88 } },
            { control_id: "window_treatment", type: "segment", parameter: "privacy", output: { open: 0, curtains: 1 } }
          ]
        }]
      },
      {
        id: "climate",
        layers: [{
          id: "climate-comfort-flow",
          geometry: { kind: "line", x1: 362, y1: 490, x2: 1182, y2: 490 },
          bindings: [
            { control_id: "comfort", type: "segment", parameter: "thermal_bias", output: { warm: 1, cool: -1 } },
            { control_id: "operation", type: "segment", parameter: "flow", output: { heating: 0.32, cooling: 0.76 } }
          ]
        }]
      },
      {
        id: "access",
        layers: [{
          id: "access-entry-route",
          geometry: { kind: "path", points: [[132, 876], [396, 742], [662, 654]] },
          bindings: [
            { control_id: "arrival_route", type: "toggle", parameter: "enabled", output: { false: 0, true: 1 } },
            { control_id: "entry_zone", type: "segment", parameter: "target", output: { gate: 0.18, entry: 0.58, garage: 1 } }
          ]
        }]
      },
      {
        id: "security",
        layers: [{
          id: "security-coverage-cone",
          geometry: { kind: "polygon", points: [[980, 198], [1246, 708], [658, 708]] },
          bindings: [
            { control_id: "coverage", type: "segment", parameter: "coverage", output: { entry: 0.34, perimeter: 0.72 } },
            { control_id: "event_path", type: "segment", parameter: "signal", output: { video: 0.4, sensors: 0.9 } }
          ]
        }]
      },
      {
        id: "panel",
        layers: [{
          id: "panel-protection-bus",
          geometry: { kind: "path", points: [[196, 248], [476, 248], [620, 478], [944, 478]] },
          bindings: [
            { control_id: "layer", type: "segment", parameter: "branch", output: { protection: 0.24, priorities: 0.82 } },
            { control_id: "priority_groups", type: "toggle", parameter: "priority", output: { false: 0.12, true: 1 } }
          ]
        }]
      },
      {
        id: "low-voltage",
        layers: [{
          id: "low-voltage-topology",
          geometry: { kind: "path", points: [[228, 738], [520, 604], [812, 550], [1164, 364]] },
          bindings: [
            { control_id: "route", type: "segment", parameter: "route", output: { network: 0.28, signals: 0.86 } },
            { control_id: "topology_focus", type: "segment", parameter: "focus", output: { routes: 0.22, interfaces: 0.94 } }
          ]
        }]
      },
      {
        id: "backup-power",
        layers: [{
          id: "backup-priority-source",
          geometry: { kind: "rect", x: 858, y: 598, width: 264, height: 206 },
          bindings: [
            { control_id: "priority_groups", type: "toggle", parameter: "priority", output: { false: 0, true: 1 } },
            { control_id: "restore_intent", type: "segment", parameter: "restore", output: { essential: 0.28, staged: 0.66, manual: 1 } }
          ]
        }]
      },
      {
        id: "audio",
        layers: [{
          id: "audio-zone-route",
          geometry: { kind: "circle", cx: 998, cy: 700, r: 112 },
          bindings: [
            { control_id: "source", type: "segment", parameter: "source", output: { local: 0.22, scenario: 0.86 } },
            { control_id: "zone", type: "segment", parameter: "zone", output: { living: 0.38, private: 0.9 } },
            { control_id: "group", type: "segment", parameter: "group", output: { single: 0.3, floor: 1 } },
            { control_id: "muted", type: "toggle", parameter: "audibility", output: { false: 1, true: 0.08 } }
          ]
        }]
      },
      {
        id: "stairs",
        layers: [{
          id: "stairs-sequential-light",
          geometry: { kind: "path", points: [[534, 734], [628, 664], [720, 592], [814, 520]] },
          bindings: [{ control_id: "stair_lighting", type: "segment", parameter: "progress", output: { off: 0, full: 1 } }]
        }]
      },
      {
        id: "exterior",
        layers: [{
          id: "exterior-path-light",
          geometry: { kind: "path", points: [[1120, 852], [1258, 738], [1386, 612]] },
          bindings: [{ control_id: "exterior_lighting", type: "segment", parameter: "intensity", output: { approach: 0.36, evening: 0.82, "reduced-night": 0.16 } }]
        }]
      }
    ]
  };
  const cases = [
    ["room", { lighting: "evening", window_treatment: "open" }, { lighting: "full", window_treatment: "curtains" }],
    ["climate", { comfort: "warm", operation: "heating" }, { comfort: "cool", operation: "cooling" }],
    ["access", { arrival_route: false, entry_zone: "gate" }, { arrival_route: true, entry_zone: "garage" }],
    ["security", { coverage: "entry", event_path: "video" }, { coverage: "perimeter", event_path: "sensors" }],
    ["panel", { layer: "protection", priority_groups: false }, { layer: "priorities", priority_groups: true }],
    ["low-voltage", { route: "network", topology_focus: "routes" }, { route: "signals", topology_focus: "interfaces" }],
    ["backup-power", { priority_groups: false, restore_intent: "essential" }, { priority_groups: true, restore_intent: "manual" }],
    ["audio", { source: "local", zone: "living", group: "single", muted: false }, { source: "scenario", zone: "private", group: "floor", muted: true }],
    ["stairs", { stair_lighting: "off" }, { stair_lighting: "full" }],
    ["exterior", { exterior_lighting: "approach" }, { exterior_lighting: "evening" }]
  ];
  const projector = createPhysicalSceneSvgProjector(profile);
  const frameFor = (systemId, values) => projector.frameFor({ systemId, valuesBySystem: { [systemId]: values } });
  const frames = new Map();

  for (const [systemId, initialValues, changedValues] of cases) {
    const initial = frameFor(systemId, initialValues);
    const changed = frameFor(systemId, changedValues);
    frames.set(systemId, initial);
    assert.notEqual(initial, null, `${systemId} initial frame`);
    assert.notEqual(changed, null, `${systemId} changed frame`);
    assert.notEqual(initial.layers.length, 0, `${systemId} renders geometry`);
    assertDeeplyFrozen(initial);
    assertDeeplyFrozen(changed);
    assert.notEqual(initial.signature, changed.signature, `${systemId} public signature`);
    assert.notDeepEqual(initial.layers.map((layer) => layer.parameters), changed.layers.map((layer) => layer.parameters), `${systemId} visible parameters`);
    assert.equal(frameFor(systemId, Object.fromEntries(Object.entries(initialValues).slice(1))), null, `${systemId} missing value`);
    const unknownValues = { ...initialValues, [Object.keys(initialValues)[0]]: "unknown" };
    assert.equal(frameFor(systemId, unknownValues), null, `${systemId} unknown value`);
  }

  profile.systems[0].layers[0].geometry.x = 1;
  profile.systems[2].layers[0].bindings[0].output.false = 1;
  const [roomId, roomInitial] = cases[0];
  assert.deepEqual(frameFor(roomId, roomInitial), frames.get(roomId));
  assert.equal(frameFor("access", { arrival_route: false, entry_zone: "gate" }).layers[0].parameters.enabled, 0);
  assert.equal(frameFor("access", { arrival_route: true, entry_zone: "gate" }).layers[0].parameters.enabled, 1);
});
