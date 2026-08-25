import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_ROUTE_JOURNEY_FINGERPRINTS,
  routeJourneyFingerprint
} from "../../assets/js/route-journey-integrity.js";

const journey = {
  id: "process",
  assembled: { title: "Послідовність", summary: "Оберіть етап" },
  panel: {
    assembled: { label: "Маршрут", title: "Оберіть етап", summary: "Деталі етапу" },
    focus: { label: "Обраний етап" },
    reassembled: { label: "Наступний зв’язок", title: "Перехід" }
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

test("fingerprints the route ID, node order, and copy without declaring the route topology", () => {
  const canonical = routeJourneyFingerprint(journey);
  assert.match(canonical, /^[a-f0-9]{8}$/u);

  const reordered = structuredClone(journey);
  reordered.nodes.reverse();
  assert.notEqual(routeJourneyFingerprint(reordered), canonical);

  const changedCopy = structuredClone(journey);
  changedCopy.nodes[0].next = "Інше";
  assert.notEqual(routeJourneyFingerprint(changedCopy), canonical);

  const changedPanel = structuredClone(journey);
  changedPanel.panel.focus.label = "Інший стан";
  assert.notEqual(routeJourneyFingerprint(changedPanel), canonical);

  const changedVisual = structuredClone(journey);
  changedVisual.nodes[0].visual.next.x = 47;
  assert.notEqual(routeJourneyFingerprint(changedVisual), canonical);
  assert.deepEqual(Object.keys(CANONICAL_ROUTE_JOURNEY_FINGERPRINTS), ["process", "about"]);
});
