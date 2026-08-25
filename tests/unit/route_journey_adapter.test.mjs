import assert from "node:assert/strict";
import test from "node:test";

import { createRouteJourneyAdapter } from "../../assets/js/route-journey-adapter.js";

const aboutJourney = {
  id: "about",
  assembled: {
    title: "Принципи для одного об’єкта",
    summary: "Оберіть принцип, щоб побачити його зв’язок із наступною роботою."
  },
  panel: {
    assembled: {
      label: "Принципи",
      title: "Оберіть принцип",
      summary: "Після вибору показуємо вихідні дані, інженерне рішення та його перехід до наступної роботи."
    },
    focus: { label: "Обраний принцип" },
    reassembled: { label: "Наступний зв’язок", title: "Зв’язок із наступною роботою" }
  },
  nodes: [
    {
      id: "object-context",
      title: "Контекст об’єкта",
      input: "Архітектурні дані",
      decision: "Електрична логіка",
      next: "Координація",
      visual: { focus: { x: 26, y: 67, scale: 1.23 }, next: { x: 49, y: 48 } }
    },
    {
      id: "system-logic",
      title: "Логіка системи",
      input: "Навантаги",
      decision: "Структура системи",
      next: "Передача",
      visual: { focus: { x: 59, y: 44, scale: 1.26 }, next: { x: 78, y: 58 } }
    }
  ]
};

test("adapts immutable route states into the exact readable panel copy", () => {
  const adapter = createRouteJourneyAdapter(aboutJourney);

  assert.deepEqual(adapter.initialView, {
    state: "assembled",
    selectedNodeId: "object-context",
    stateLabel: "Принципи",
    title: "Оберіть принцип",
    summary: "Після вибору показуємо вихідні дані, інженерне рішення та його перехід до наступної роботи.",
    visual: {
      frame: { x: 50, y: 50, scale: 1, inset: 0 },
      connector: null
    },
    node: null
  });

  const focused = adapter.reduce(adapter.initialView, { type: "select-node", nodeId: "system-logic" });
  assert.deepEqual(focused, {
    state: "focus",
    selectedNodeId: "system-logic",
    stateLabel: "Обраний принцип",
    title: "Логіка системи",
    summary: null,
    visual: {
      frame: { x: 59, y: 44, scale: 1.26, inset: 3 },
      connector: { state: "focus", from: { x: 59, y: 44 }, to: { x: 59, y: 44 } }
    },
    node: aboutJourney.nodes[1]
  });
  assert.equal(Object.isFrozen(focused), true);
  assert.equal(Object.isFrozen(focused.node), true);
  assert.equal(Object.isFrozen(focused.visual), true);
  assert.equal(Object.isFrozen(focused.visual.frame), true);

  assert.deepEqual(adapter.reduce(focused, { type: "show-relationship" }), {
    state: "reassembled",
    selectedNodeId: "system-logic",
    stateLabel: "Наступний зв’язок",
    title: "Зв’язок із наступною роботою",
    summary: null,
    visual: {
      frame: { x: 68.5, y: 51, scale: 1.14, inset: 1.5 },
      connector: { state: "reassembled", from: { x: 59, y: 44 }, to: { x: 78, y: 58 } }
    },
    node: aboutJourney.nodes[1]
  });
});

test("adapter keeps unknown actions inert and malformed state returns to its safe initial view", () => {
  const adapter = createRouteJourneyAdapter(aboutJourney);
  const focused = adapter.reduce(adapter.initialView, { type: "select-node", nodeId: "object-context" });

  assert.strictEqual(adapter.reduce(focused, { type: "unknown" }), focused);
  assert.strictEqual(adapter.reduce(focused, { type: "select-node", nodeId: "missing" }), focused);
  assert.deepEqual(adapter.reduce({ state: "focus", selectedNodeId: "missing" }, { type: "return" }), adapter.initialView);
});
