import assert from "node:assert/strict";
import test from "node:test";

import {
  computePhysicalSceneSvgViewBox,
  createPhysicalSceneSvgPresenter
} from "../../assets/js/physical-scene-svg-overlay.js";

test("computes a stable SVG crop that exactly follows object-fit cover and object-position", () => {
  const threeByTwo = computePhysicalSceneSvgViewBox({
    sourceWidth: 1536,
    sourceHeight: 1024,
    containerWidth: 1200,
    containerHeight: 800,
    positionX: 0.6,
    positionY: 0.5
  });
  const tallMobile = computePhysicalSceneSvgViewBox({
    sourceWidth: 1536,
    sourceHeight: 1024,
    containerWidth: 375,
    containerHeight: 544,
    positionX: 0.6,
    positionY: 0.5
  });
  const wideDesktop = computePhysicalSceneSvgViewBox({
    sourceWidth: 1536,
    sourceHeight: 1024,
    containerWidth: 1440,
    containerHeight: 720,
    positionX: 0.6,
    positionY: 0.5
  });

  assert.deepEqual(threeByTwo, { x: 0, y: 0, width: 1536, height: 1024 });
  assert.deepEqual(tallMobile, { x: 498.070588235294, y: 0, width: 705.882352941176, height: 1024 });
  assert.deepEqual(wideDesktop, { x: 0, y: 128, width: 1536, height: 768 });
  assert.deepEqual(computePhysicalSceneSvgViewBox({
    sourceWidth: 1536,
    sourceHeight: 1024,
    containerWidth: 375,
    containerHeight: 544,
    positionX: 0.6,
    positionY: 0.5
  }), tallMobile);
  for (const box of [threeByTwo, tallMobile, wideDesktop]) {
    assert.equal(Object.values(box).every(Number.isFinite), true);
  }
  for (const invalid of [
    { sourceWidth: 0, sourceHeight: 1024, containerWidth: 375, containerHeight: 544, positionX: 0.6, positionY: 0.5 },
    { sourceWidth: 1536, sourceHeight: 1024, containerWidth: -1, containerHeight: 544, positionX: 0.6, positionY: 0.5 },
    { sourceWidth: 1536, sourceHeight: 1024, containerWidth: 375, containerHeight: 544, positionX: -0.01, positionY: 0.5 },
    { sourceWidth: 1536, sourceHeight: 1024, containerWidth: 375, containerHeight: 544, positionX: 0.6, positionY: 1.01 },
    { sourceWidth: 1536, sourceHeight: 1024, containerWidth: 375, containerHeight: 544, positionX: Infinity, positionY: 0.5 }
  ]) assert.equal(computePhysicalSceneSvgViewBox(invalid), null);
});

test("presents a validated projector frame as immutable active SVG layers and safe CSS properties", () => {
  const presenter = createPhysicalSceneSvgPresenter({
    systems: [
      { id: "lighting", layerIds: ["lighting-pool"] },
      { id: "shading", layerIds: ["shading-curtain-left", "shading-curtain-right"] },
      { id: "climate", layerIds: ["climate-flow"] }
    ]
  });
  const frame = {
    systemId: "shading",
    signature: "shading:position=40|treatment=curtains",
    layers: [
      { id: "shading-curtain-left", geometry: { kind: "polygon" }, parameters: { level: 0.588, "translate_x": -42 } },
      { id: "shading-curtain-right", geometry: { kind: "polygon" }, parameters: { "translate_x": 42 } }
    ]
  };
  const presentation = presenter.present(frame);

  assert.deepEqual(presentation, {
    systemId: "shading",
    signature: "shading:position=40|treatment=curtains",
    layers: [
      {
        id: "shading-curtain-left",
        cssProperties: { "--physical-level": "0.588", "--physical-translate-x": "-42px" }
      },
      {
        id: "shading-curtain-right",
        cssProperties: { "--physical-translate-x": "42px" }
      }
    ],
    hiddenLayerIds: ["lighting-pool", "climate-flow"]
  });
  assert.equal(Object.isFrozen(presentation), true);
  assert.equal(Object.isFrozen(presentation.layers), true);
  assert.equal(Object.isFrozen(presentation.layers[0]), true);
  assert.equal(Object.isFrozen(presentation.layers[0].cssProperties), true);
  assert.equal(Object.isFrozen(presentation.hiddenLayerIds), true);

  assert.equal(presenter.present({ ...frame, layers: [{ ...frame.layers[0], id: "unknown-layer" }] }), null);
  assert.equal(presenter.present({ ...frame, layers: [frame.layers[0], frame.layers[0]] }), null);
  assert.equal(presenter.present({ ...frame, layers: [{ ...frame.layers[0], parameters: { level: Infinity } }] }), null);
  assert.equal(presenter.present({ ...frame, layers: [{ ...frame.layers[0], parameters: { "background-image": "url(unsafe)" } }] }), null);
  assert.throws(() => createPhysicalSceneSvgPresenter({ systems: [{ id: "lighting", layerIds: ["duplicate", "duplicate"] }] }), TypeError);
});
