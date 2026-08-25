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
      next: "Координація"
    },
    {
      id: "system-logic",
      title: "Логіка системи",
      input: "Навантаги",
      decision: "Структура системи",
      next: "Передача"
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
    node: null
  });

  const focused = adapter.reduce(adapter.initialView, { type: "select-node", nodeId: "system-logic" });
  assert.deepEqual(focused, {
    state: "focus",
    selectedNodeId: "system-logic",
    stateLabel: "Обраний принцип",
    title: "Логіка системи",
    summary: null,
    node: aboutJourney.nodes[1]
  });
  assert.equal(Object.isFrozen(focused), true);
  assert.equal(Object.isFrozen(focused.node), true);

  assert.deepEqual(adapter.reduce(focused, { type: "show-relationship" }), {
    state: "reassembled",
    selectedNodeId: "system-logic",
    stateLabel: "Наступний зв’язок",
    title: "Зв’язок із наступною роботою",
    summary: null,
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
