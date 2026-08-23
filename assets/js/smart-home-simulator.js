import { createScenarioMachine } from "./smart-home-simulator-state.js";

const isNonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const hasUniqueIds = (ids) => ids.length > 0 && ids.every(isNonEmpty) && new Set(ids).size === ids.length;

function singleElement(root, selector) {
  const elements = [...root.querySelectorAll(selector)];
  return elements.length === 1 ? elements[0] : null;
}

function textOf(element) {
  return element?.textContent?.trim() || "";
}

function hasStaticText(element) {
  return Boolean(element && !element.hidden && textOf(element));
}

function sameIds(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function systemControlFromEvent(target) {
  return target instanceof Element ? target.closest("button[data-system-control]") : null;
}

function scenarioSource(panel) {
  const title = panel.querySelector("h3");
  const eyebrow = panel.querySelector(".section-kicker");
  const event = panel.querySelector(".smart-home__scenario-event p:last-child");
  const routeItems = [...panel.querySelectorAll("[data-route-zone]")];

  if (![title, eyebrow, event, ...routeItems].every(hasStaticText)) return null;
  return {
    title: textOf(title),
    eyebrow: textOf(eyebrow),
    event: textOf(event),
    route: routeItems.map(textOf).join(" · ")
  };
}

function validateMarkup(root) {
  if (
    !root ||
    root.dataset.enhanced ||
    root.hasAttribute("data-scenario") ||
    root.hasAttribute("data-system") ||
    root.hasAttribute("data-zone") ||
    root.hasAttribute("data-visual") ||
    root.hasAttribute("data-motion-phase")
  ) {
    return null;
  }

  const radios = [...root.querySelectorAll('input[type="radio"][data-scenario-radio][value]')];
  const allRadios = [...root.querySelectorAll('input[type="radio"]')];
  const scenarioIds = radios.map((radio) => radio.value);
  const checkedRadios = radios.filter((radio) => radio.checked);
  const panels = [...root.querySelectorAll("[data-scenario-panel]")];
  const panelIds = panels.map((panel) => panel.dataset.scenarioPanel);
  const routes = [...root.querySelectorAll("[data-route-layer]")];
  const routeIds = routes.map((route) => route.dataset.routeLayer);
  const initiallyVisibleRoutes = routes.filter((route) => !route.hasAttribute("hidden"));
  const zoneNodes = [...root.querySelectorAll("[data-zone-node]")];
  const zoneIds = zoneNodes.map((node) => node.dataset.zoneNode);
  const systemLabels = [...root.querySelectorAll("[data-system-label]")];
  const systemControls = [...root.querySelectorAll("button[data-system-control]")];
  const systemIds = systemControls.map((button) => button.dataset.systemControl);
  const labelIds = systemLabels.map((label) => label.dataset.systemLabel);
  const pictures = [...root.querySelectorAll("picture[data-scene-picture]")];
  const visualIds = pictures.map((picture) => picture.dataset.scenePicture);
  const initiallyVisiblePicture = pictures.filter((picture) => !picture.hidden);
  const sceneLabel = singleElement(root, "[data-scenario-scene-label]");
  const sceneTitle = singleElement(root, "[data-scene-title]");
  const sceneEyebrow = singleElement(root, "[data-scene-eyebrow]");
  const routeSummary = singleElement(root, "[data-route-summary]");
  const activeSystemLabel = singleElement(root, "[data-active-system-label]");
  const activeZoneLabel = singleElement(root, "[data-active-zone-label]");
  const activeSystemSummary = singleElement(root, "[data-active-system-summary]");
  const logicChain = singleElement(root, "[data-logic-chain]");
  const live = singleElement(root, '[data-scenario-live][aria-live="polite"]');
  const stage = singleElement(root, "[data-spatial-stage][data-selected-system-prefix]");
  const scene = singleElement(root, "[data-scenario-scene]");
  const panelById = new Map(panels.map((panel) => [panel.dataset.scenarioPanel, panel]));
  const primaryByScenario = Object.fromEntries(panels.map((panel) => [panel.dataset.scenarioPanel, panel.dataset.primarySystem]));

  const panelDetailsAreComplete = panels.every((panel) => {
    const details = [...panel.querySelectorAll("[data-system-detail]")];
    const detailIds = details.map((detail) => detail.dataset.systemDetail);
    const routeZones = [...panel.querySelectorAll("[data-route-zone]")].map((item) => item.dataset.routeZone);
    const primary = details.find((detail) => detail.dataset.systemDetail === panel.dataset.primarySystem);
    return (
      sameIds(detailIds, systemIds) &&
      details.every(
        (detail) =>
          !detail.hidden &&
          zoneIds.includes(detail.dataset.zoneId) &&
          ["focus", "support", "quiet"].includes(detail.dataset.role) &&
          isNonEmpty(detail.dataset.summary) &&
          visualIds.includes(detail.dataset.visualId)
      ) &&
      routeZones.length >= 2 &&
      routeZones.length <= 4 &&
      hasUniqueIds(routeZones) &&
      routeZones.every((zoneId) => zoneIds.includes(zoneId)) &&
      primary?.dataset.role === "focus" &&
      Boolean(scenarioSource(panel))
    );
  });

  const initialScenarioId = checkedRadios[0]?.value;
  const initialPanel = panelById.get(initialScenarioId);
  const initialDetail = initialPanel
    ? [...initialPanel.querySelectorAll("[data-system-detail]")].find(
        (detail) => detail.dataset.systemDetail === initialPanel.dataset.primarySystem
      )
    : null;

  if (
    allRadios.length !== radios.length ||
    !hasUniqueIds(scenarioIds) ||
    !sameIds(panelIds, scenarioIds) ||
    !sameIds(routeIds, scenarioIds) ||
    initiallyVisibleRoutes.length !== 1 ||
    initiallyVisibleRoutes[0]?.dataset.routeLayer !== checkedRadios[0]?.value ||
    checkedRadios.length !== 1 ||
    !hasUniqueIds(zoneIds) ||
    !hasUniqueIds(systemIds) ||
    !sameIds(labelIds, systemIds) ||
    !hasUniqueIds(visualIds) ||
    initiallyVisiblePicture.length !== 1 ||
    initiallyVisiblePicture[0]?.dataset.scenePicture !== initialDetail?.dataset.visualId ||
    systemLabels.some((label) => label.hidden || !textOf(label)) ||
    systemControls.some((button) => !button.hidden || !textOf(button)) ||
    !systemControls.every((button, index) => textOf(button) === textOf(systemLabels[index])) ||
    !scenarioIds.every((scenarioId) => systemIds.includes(primaryByScenario[scenarioId])) ||
    !panelDetailsAreComplete ||
    !isNonEmpty(stage?.dataset.selectedSystemPrefix) ||
    ![
      sceneLabel,
      sceneTitle,
      sceneEyebrow,
      routeSummary,
      activeSystemLabel,
      activeZoneLabel,
      activeSystemSummary,
      logicChain,
      live,
      scene
    ].every(hasStaticText)
  ) {
    return null;
  }

  return {
    radios,
    scenarioIds,
    panels,
    panelById,
    routes,
    zoneNodes,
    systemLabels,
    systemControls,
    systemIds,
    pictures,
    primaryByScenario,
    sceneTitle,
    sceneEyebrow,
    sceneLabel,
    routeSummary,
    activeSystemLabel,
    activeZoneLabel,
    activeSystemSummary,
    logicChain,
    live,
    scene,
    selectedSystemPrefix: stage.dataset.selectedSystemPrefix
  };
}

function enhanceSimulator(root) {
  const markup = validateMarkup(root);
  if (!markup) return;

  const machine = createScenarioMachine(
    markup.scenarioIds,
    markup.scenarioIds[0],
    markup.systemIds,
    markup.primaryByScenario
  );
  let state = machine.initialState;
  let motionPhase = null;
  const selectedPanel = () => markup.panelById.get(state.scenarioId);
  const selectedDetail = () =>
    [...selectedPanel().querySelectorAll("[data-system-detail]")].find(
      (detail) => detail.dataset.systemDetail === state.systemId
    );

  const removeOutgoingSnapshot = () => {
    root.querySelectorAll("[data-outgoing-snapshot]").forEach((snapshot) => snapshot.remove());
  };

  const createOutgoingSnapshot = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const image = markup.scene.querySelector("picture[data-scene-picture]:not([hidden]) img");
    if (!image) return;

    removeOutgoingSnapshot();
    const snapshot = document.createElement("div");
    snapshot.className = "smart-home__outgoing-snapshot";
    snapshot.dataset.outgoingSnapshot = "true";
    snapshot.setAttribute("aria-hidden", "true");
    snapshot.style.backgroundImage = `url("${image.currentSrc || image.src}")`;
    snapshot.addEventListener("animationend", (event) => {
      if (event.animationName === "smart-home-disassemble") snapshot.remove();
    });
    markup.scene.after(snapshot);
  };

  const synchronize = ({ announce = false, replay = false, scenarioChanged = false, initialEntry = false } = {}) => {
    const panel = selectedPanel();
    const detail = selectedDetail();
    const source = scenarioSource(panel);
    const zoneId = detail.dataset.zoneId;
    const visualId = detail.dataset.visualId;
    const systemButton = markup.systemControls.find((button) => button.dataset.systemControl === state.systemId);
    const zoneNode = markup.zoneNodes.find((node) => node.dataset.zoneNode === zoneId);
    const routeZoneIds = new Set(
      [...panel.querySelectorAll("[data-route-zone]")].map((item) => item.dataset.routeZone)
    );

    if (initialEntry) motionPhase = "initial";
    else if (replay || scenarioChanged) motionPhase = motionPhase === "a" ? "b" : "a";

    markup.systemLabels.forEach((label) => {
      label.hidden = true;
    });
    markup.systemControls.forEach((button) => {
      button.hidden = false;
      button.setAttribute("aria-pressed", String(button === systemButton));
    });
    root.dataset.enhanced = "true";
    root.dataset.scenario = state.scenarioId;
    root.dataset.system = state.systemId;
    root.dataset.zone = zoneId;
    root.dataset.visual = visualId;
    if (motionPhase) root.dataset.motionPhase = motionPhase;
    markup.radios.forEach((radio) => {
      radio.checked = radio.value === state.scenarioId;
    });
    markup.panels.forEach((candidate) => {
      candidate.hidden = candidate !== panel;
    });
    markup.routes.forEach((route) => {
      route.toggleAttribute("hidden", route.dataset.routeLayer !== state.scenarioId);
    });
    markup.pictures.forEach((picture) => {
      picture.hidden = picture.dataset.scenePicture !== visualId;
    });
    markup.zoneNodes.forEach((node) => {
      node.dataset.active = String(node === zoneNode);
      node.dataset.route = String(routeZoneIds.has(node.dataset.zoneNode));
    });

    markup.sceneTitle.textContent = source.title;
    markup.sceneEyebrow.textContent = source.eyebrow;
    markup.sceneLabel.textContent = panel.dataset.sceneLabel;
    markup.routeSummary.textContent = source.route;
    markup.activeSystemLabel.textContent = textOf(systemButton);
    markup.activeZoneLabel.textContent = textOf(zoneNode);
    markup.activeSystemSummary.textContent = detail.dataset.summary;
    markup.logicChain.textContent = `${source.event} → ${textOf(zoneNode)} → ${textOf(systemButton)} → ${detail.dataset.summary}`;

    if (announce) {
      markup.live.textContent = `${markup.selectedSystemPrefix} «${textOf(systemButton)}»: ${detail.dataset.summary}`;
    } else if (scenarioChanged) {
      markup.live.textContent = panel.dataset.liveSummary;
    }
  };

  // Attributes that trigger enhanced styling are written only after complete validation.
  synchronize({ initialEntry: true });

  const selectScenario = (scenarioId) => {
    const nextState = machine.transition(state, { type: "select-scenario", scenarioId });
    const scenarioChanged = nextState.scenarioId !== state.scenarioId;
    if (scenarioChanged) createOutgoingSnapshot();
    state = nextState;
    if (scenarioChanged) synchronize({ scenarioChanged, replay: true });
  };

  const focusSystem = (systemId, announce = false, forceReplay = false) => {
    const nextState = machine.transition(state, { type: "focus-system", systemId });
    const changed = nextState.systemId !== state.systemId;
    if (changed || forceReplay) createOutgoingSnapshot();
    state = nextState;
    if (changed || forceReplay) synchronize({ announce, replay: true });
  };

  root.addEventListener("change", (event) => {
    const radio = event.target;
    if (!(radio instanceof HTMLInputElement) || radio.type !== "radio" || !markup.radios.includes(radio)) return;
    selectScenario(radio.value);
  });

  root.addEventListener("keydown", (event) => {
    const radio = event.target;
    if (
      event.key !== "Enter" ||
      !(radio instanceof HTMLInputElement) ||
      radio.type !== "radio" ||
      !markup.radios.includes(radio)
    ) {
      return;
    }
    event.preventDefault();
    selectScenario(radio.value);
  });

  root.addEventListener("focusin", (event) => {
    const button = systemControlFromEvent(event.target);
    if (button instanceof HTMLButtonElement && markup.systemControls.includes(button)) {
      focusSystem(button.dataset.systemControl);
    }
  });

  root.addEventListener(
    "pointerenter",
    (event) => {
      const button = systemControlFromEvent(event.target);
      if (button instanceof HTMLButtonElement && markup.systemControls.includes(button)) {
        focusSystem(button.dataset.systemControl);
      }
    },
    true
  );

  root.addEventListener("click", (event) => {
    const button = systemControlFromEvent(event.target);
    if (button instanceof HTMLButtonElement && markup.systemControls.includes(button)) {
      focusSystem(button.dataset.systemControl, true, true);
    }
  });
}

const root = document.querySelector("[data-smart-home-simulator]");
if (root) enhanceSimulator(root);
