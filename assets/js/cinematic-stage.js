import { createCinematicState } from "./cinematic-state.js";

const text = (value) => typeof value === "string" ? value.trim() : "";

function one(root, selector) {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 ? matches[0] : null;
}

function readGraph(root) {
  const source = one(root, "script[data-cinematic-graph]");
  if (!source) return null;
  try {
    return createCinematicState(JSON.parse(source.textContent));
  } catch (_) {
    return null;
  }
}

function enhance(root) {
  if (root.dataset.cinematicEnhanced) return;
  const machine = readGraph(root);
  const graph = one(root, "script[data-cinematic-graph]");
  const summary = one(root, "[data-cinematic-summary]");
  const connectorCopy = one(root, "[data-cinematic-connector-copy]");
  const destination = one(root, "[data-cinematic-destination]");
  const related = one(root, "[data-cinematic-related]");
  const returnControl = one(root, 'button[data-cinematic-action="return-to-system"]');
  const directionControls = [...root.querySelectorAll('button[data-cinematic-action="select-direction"]')];
  const relationControls = [...root.querySelectorAll('button[data-cinematic-action="select-relation"]')];
  const directionLinks = [...root.querySelectorAll("[data-cinematic-direction-link]")];
  const relationItems = [...root.querySelectorAll("[data-cinematic-relation-item]")];
  const relatedItems = [...related?.querySelectorAll("[data-related-direction-id]") ?? []];
  const connectors = [...root.querySelectorAll("[data-cinematic-connector]")];

  if (
    !machine || !graph || !summary || !connectorCopy || !destination || !related || !returnControl ||
    directionControls.length !== directionLinks.length || directionControls.length === 0 ||
    relationControls.length !== relationItems.length || relationControls.length === 0 ||
    relatedItems.length !== directionControls.length || connectors.length !== relationControls.length
  ) return;

  const rawGraph = JSON.parse(graph.textContent);
  const directions = new Map(rawGraph.directions.map((direction) => [direction.id, direction]));
  const relations = new Map(rawGraph.relations.map((relation) => [relation.id, relation]));
  const directionHref = new Map(directionLinks.map((link) => [link.dataset.cinematicDirectionLink, link.getAttribute("href")]));
  if (
    directionControls.some((control) => !directions.has(control.dataset.directionId)) ||
    relationControls.some((control) => !relations.has(control.dataset.relationId)) ||
    directionLinks.some((link) => !directions.has(link.dataset.cinematicDirectionLink)) ||
    relatedItems.some((item) => !directions.has(item.dataset.relatedDirectionId))
  ) return;

  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let state = machine.initialState;

  const removeOutgoingSnapshot = () => {
    root.querySelectorAll("[data-cinematic-outgoing-snapshot]").forEach((snapshot) => snapshot.remove());
  };

  const createOutgoingSnapshot = () => {
    removeOutgoingSnapshot();
    if (motionPreference.matches) return;
    const snapshot = document.createElement("div");
    snapshot.className = "cinematic__outgoing-snapshot";
    snapshot.dataset.cinematicOutgoingSnapshot = "true";
    snapshot.setAttribute("aria-hidden", "true");
    const remove = (event) => {
      if (event.type === "animationend" && event.animationName !== "cinematic-topology-out") return;
      snapshot.removeEventListener("animationend", remove);
      snapshot.removeEventListener("animationcancel", remove);
      motionPreference.removeEventListener("change", removeForReducedMotion);
      snapshot.remove();
    };
    const removeForReducedMotion = (event) => { if (event.matches) remove(event); };
    snapshot.addEventListener("animationend", remove);
    snapshot.addEventListener("animationcancel", remove);
    motionPreference.addEventListener("change", removeForReducedMotion);
    root.querySelector("[data-cinematic-topology]")?.after(snapshot);
  };

  const relatedDirectionIds = (nextState) => {
    if (nextState.state === "assembled") return [...directions.keys()];
    if (nextState.state === "reassembled") return relations.get(nextState.selectedRelationId).related_direction_ids;
    return [...new Set(rawGraph.relations
      .filter((relation) => relation.direction_id === nextState.selectedDirectionId)
      .flatMap((relation) => relation.related_direction_ids))];
  };

  const synchronize = (announce) => {
    const direction = state.selectedDirectionId ? directions.get(state.selectedDirectionId) : null;
    const relation = state.selectedRelationId ? relations.get(state.selectedRelationId) : null;
    const relatedIds = relatedDirectionIds(state);
    root.dataset.cinematicState = state.state;
    root.dataset.cinematicEnhanced = "true";
    root.dataset.cinematicDirection = state.selectedDirectionId || "";
    root.dataset.cinematicRelation = state.selectedRelationId || "";
    directionControls.forEach((control) => {
      control.hidden = false;
      control.setAttribute("aria-pressed", String(control.dataset.directionId === state.selectedDirectionId));
    });
    relationControls.forEach((control) => { control.hidden = false; });
    root.querySelectorAll(".cinematic__relation-copy").forEach((copy) => { copy.hidden = true; });
    relationItems.forEach((item) => {
      const id = item.dataset.cinematicRelationItem;
      item.hidden = state.state === "focus" ? relations.get(id).direction_id !== state.selectedDirectionId :
        state.state === "reassembled" ? id !== state.selectedRelationId : false;
    });
    relatedItems.forEach((item) => { item.hidden = !relatedIds.includes(item.dataset.relatedDirectionId); });
    connectors.forEach((connector) => {
      connector.dataset.active = String(
        state.state === "assembled" || connector.dataset.cinematicConnector === state.selectedRelationId ||
        (state.state === "focus" && relations.get(connector.dataset.cinematicConnector).direction_id === state.selectedDirectionId)
      );
    });
    returnControl.hidden = state.state === "assembled";

    if (!direction) {
      summary.textContent = "Оберіть напрям або зв’язок, щоб побачити пояснення та суміжні роботи.";
      connectorCopy.textContent = "Повна система: напрями розглядають у зв’язці, а не ізольовано.";
      destination.setAttribute("href", "/services/");
      destination.childNodes[0].textContent = "Переглянути всі напрями ";
    } else {
      summary.textContent = relation ? relation.child.description : direction.description;
      connectorCopy.textContent = relation
        ? `${relation.child.label} → ${direction.label}: ${relation.child.description}`
        : `${direction.label}: показані суміжні напрями для цього елемента системи.`;
      destination.setAttribute("href", directionHref.get(direction.id));
      destination.childNodes[0].textContent = `Переглянути «${direction.label}» `;
    }
    root.dispatchEvent(new CustomEvent("cinematic:state-change", {
      bubbles: true,
      detail: { ...state, directionLabel: direction?.label || "Повна система", relationLabel: relation?.child.label || "" }
    }));
    if (announce) summary.setAttribute("data-cinematic-announced", "true");
  };

  const transition = (action) => {
    const nextState = machine.reduce(state, action);
    if (nextState === state) return;
    createOutgoingSnapshot();
    state = nextState;
    synchronize(true);
  };

  root.addEventListener("click", (event) => {
    const control = event.target instanceof Element ? event.target.closest("button[data-cinematic-action]") : null;
    if (!(control instanceof HTMLButtonElement) || !root.contains(control)) return;
    if (control.dataset.cinematicAction === "select-direction") transition({ type: "select-direction", directionId: control.dataset.directionId });
    if (control.dataset.cinematicAction === "select-relation") transition({ type: "select-relation", relationId: control.dataset.relationId });
    if (control.dataset.cinematicAction === "return-to-system") transition({ type: "return-to-system" });
  });
  motionPreference.addEventListener("change", (event) => { if (event.matches) removeOutgoingSnapshot(); });
  synchronize(false);
}

document.querySelectorAll("[data-cinematic-root]").forEach(enhance);
