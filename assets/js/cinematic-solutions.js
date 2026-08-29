import {
  createCinematicSolutionsHandoff,
  createCinematicSolutionsState
} from "./cinematic-solutions-state.js";
import {
  CANONICAL_CINEMATIC_SOLUTIONS_FINGERPRINT,
  cinematicSolutionsFingerprint
} from "./cinematic-solutions-integrity.js";

const STATE_IDS = ["assembled", "focus", "reassembled"];
const STATE_ACTIONS = {
  assembled: "select-assembled",
  focus: "select-focus",
  reassembled: "select-reassembled"
};
const STATE_FIELDS = ["alt", "image", "image_focus", "label", "summary", "title"];
const isId = (value) => typeof value === "string" && value.trim().length > 0;
const isServiceSlug = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const isImageBase = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const isImageFocus = (value) => typeof value === "string" && /^(?:100|[1-9]?\d)%\s+(?:100|[1-9]?\d)%$/.test(value);
const sameIds = (left, right) => Array.isArray(left) && left.length === right.length && left.every((id, index) => id === right[index]);
const hasFields = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...fields].sort().join("|");

const one = (root, selector) => {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 ? matches[0] : null;
};

function readJson(root, attribute) {
  const source = one(root, `script[${attribute}]`);
  if (!source) return null;
  try {
    return JSON.parse(source.textContent);
  } catch (_) {
    return null;
  }
}

function validConfig(config, mode, selectedSolutionId) {
  if (
    !hasFields(config, ["mapping_ids", "mode", "selected_solution_id", "solution_ids"]) ||
    config.mode !== mode ||
    !Array.isArray(config.mapping_ids) ||
    config.mapping_ids.length !== 6 ||
    !config.mapping_ids.every(isId) ||
    new Set(config.mapping_ids).size !== config.mapping_ids.length ||
    !Array.isArray(config.solution_ids) ||
    config.solution_ids.length === 0 ||
    !config.solution_ids.every(isId) ||
    new Set(config.solution_ids).size !== config.solution_ids.length ||
    config.selected_solution_id !== selectedSolutionId ||
    config.solution_ids[0] !== config.selected_solution_id
  ) return false;
  return mode === "atlas"
    ? sameIds(config.solution_ids, config.mapping_ids)
    : config.solution_ids.length === 1 && config.mapping_ids.includes(config.selected_solution_id);
}

function validMapping(graph, mapping, mappingIds) {
  if (
    mapping === null ||
    typeof mapping !== "object" ||
    Array.isArray(mapping) ||
    !sameIds(Object.keys(mapping), mappingIds) ||
    !Array.isArray(graph?.directions) ||
    !Array.isArray(graph?.relations)
  ) return null;

  const directionIds = new Set(graph.directions.map((direction) => direction?.id));
  const serviceSlugs = new Set(graph.directions.map((direction) => direction?.service_slug));
  const relationsById = new Map(graph.relations.map((relation) => [relation?.id, relation]));
  if (
    directionIds.size !== graph.directions.length ||
    [...directionIds].some((id) => !isId(id)) ||
    serviceSlugs.size !== graph.directions.length ||
    [...serviceSlugs].some((serviceSlug) => !isServiceSlug(serviceSlug)) ||
    relationsById.size !== graph.relations.length ||
    [...relationsById.keys()].some((id) => !isId(id))
  ) return null;

  for (const solutionId of mappingIds) {
    const entry = mapping[solutionId];
    if (
      !hasFields(entry, ["direction_ids", "relation_id"]) ||
      !Array.isArray(entry.direction_ids) ||
      entry.direction_ids.length === 0 ||
      !entry.direction_ids.every(isId) ||
      new Set(entry.direction_ids).size !== entry.direction_ids.length ||
      entry.direction_ids.some((directionId) => !directionIds.has(directionId)) ||
      !isId(entry.relation_id)
    ) return null;
    const relation = relationsById.get(entry.relation_id);
    if (!relation || !entry.direction_ids.includes(relation.direction_id)) return null;
  }
  if (cinematicSolutionsFingerprint(mapping, mappingIds) !== CANONICAL_CINEMATIC_SOLUTIONS_FINGERPRINT) return null;
  return relationsById;
}

function validScenes(sceneMapping, mapping, mappingIds) {
  if (!hasFields(sceneMapping, mappingIds)) return null;
  for (const solutionId of mappingIds) {
    const scene = sceneMapping[solutionId];
    if (!hasFields(scene, ["focus_direction_id", "states"]) || !isId(scene.focus_direction_id) || !mapping[solutionId].direction_ids.includes(scene.focus_direction_id) || !hasFields(scene.states, STATE_IDS)) return null;
    for (const stateId of STATE_IDS) {
      const state = scene.states[stateId];
      if (!hasFields(state, STATE_FIELDS) || ![state.alt, state.label, state.summary, state.title].every(isId) || !isImageBase(state.image) || !isImageFocus(state.image_focus)) return null;
    }
  }
  return sceneMapping;
}

function exactControls(stage, solutionIds, mode) {
  const controls = [...stage.querySelectorAll("button[data-cinematic-solutions-control]")];
  const solutionControls = [...stage.querySelectorAll("button[data-cinematic-solutions-solution-control]")];
  const actionable = [...stage.querySelectorAll("button[data-cinematic-solutions-action]")];
  const buttons = [...stage.querySelectorAll("button")];
  const stateControls = STATE_IDS.every((stateId) => controls.filter((control) =>
    control.dataset.cinematicSolutionsControlState === stateId &&
    control.dataset.cinematicSolutionsAction === STATE_ACTIONS[stateId]
  ).length === 1);
  const selectorControls = mode === "atlas"
    ? solutionControls.length === solutionIds.length && solutionIds.every((solutionId) =>
      solutionControls.filter((control) => control.dataset.cinematicSolutionsSolutionId === solutionId).length === 1
    )
    : solutionControls.length === 0;
  const exactActionable = actionable.length === controls.length && actionable.every((button) => controls.includes(button));
  const onlyValidatedButtons = buttons.length === controls.length + solutionControls.length && buttons.every((button) => controls.includes(button) || solutionControls.includes(button));
  return controls.length === STATE_IDS.length && stateControls && selectorControls && exactActionable && onlyValidatedButtons
    ? { controls, solutionControls }
    : null;
}

function exactVisuals(stage, fallback, solutionIds, mapping, scenes, graph, relationsById) {
  const visuals = (attribute) => [...stage.querySelectorAll(`[data-cinematic-solutions-${attribute}]`)];
  const sceneElements = visuals("scene");
  const panels = visuals("panel");
  const expectedCount = solutionIds.length * STATE_IDS.length;
  const exact = (elements, stateAttribute) => elements.length === expectedCount && solutionIds.every((solutionId) =>
    STATE_IDS.every((stateId) => elements.filter((element) =>
      element.dataset[stateAttribute] === stateId &&
      element.dataset.cinematicSolutionsSolutionId === solutionId &&
      element.dataset.cinematicSolutionsRelationId === mapping[solutionId].relation_id &&
      element.dataset.cinematicSolutionsDirectionIds === mapping[solutionId].direction_ids.join("|") &&
      element.dataset.cinematicSolutionsFocusDirectionId === scenes[solutionId].focus_direction_id
    ).length === 1)
  );
  const directionsById = new Map(graph.directions.map((direction) => [direction.id, direction]));
  const linkHrefs = (element) => [...element.querySelectorAll("a[href]")].map((link) => link.getAttribute("href"));
  const fallbackLinks = (solutionId, suffix) => {
    const items = fallback.querySelectorAll(`#solution-${solutionId}`);
    const groups = items.length === 1 ? items[0].querySelectorAll(`[aria-labelledby="solution-${solutionId}-${suffix}"]`) : [];
    return groups.length === 1 ? linkHrefs(groups[0]) : null;
  };
  const fallbackSolutionLinks = new Map(solutionIds.map((solutionId) => [solutionId, fallbackLinks(solutionId, "solutions")]));
  const fallbackServiceLinks = new Map(solutionIds.map((solutionId) => [solutionId, fallbackLinks(solutionId, "services")]));
  const focusServiceLinks = new Map(solutionIds.map((solutionId) => [
    solutionId,
    mapping[solutionId].direction_ids.map((directionId) => {
      const serviceSlug = directionsById.get(directionId)?.service_slug;
      return isServiceSlug(serviceSlug) ? `/services/${serviceSlug}/` : null;
    })
  ]));
  const readableScenes = sceneElements.every((scene) => {
    const state = scenes[scene.dataset.cinematicSolutionsSolutionId]?.states[scene.dataset.cinematicSolutionsScene];
    const picture = one(scene, "picture");
    const sources = picture ? [...picture.querySelectorAll("source")] : [];
    const image = picture ? one(picture, "img") : null;
    const basePath = state ? `/assets/images/solutions/${state.image}` : null;
    return state && picture && image && sources.length === 2 && image.alt.trim() === state.alt && image.style.objectPosition === state.image_focus &&
      sources[0].getAttribute("srcset")?.endsWith(`${basePath}-768.webp`) && sources[1].getAttribute("srcset")?.endsWith(`${basePath}-1536.webp`) && image.getAttribute("src")?.endsWith(`${basePath}-1536.webp`);
  });
  const readablePanels = panels.every((panel) => {
    const solutionId = panel.dataset.cinematicSolutionsSolutionId;
    const stateId = panel.dataset.cinematicSolutionsPanel;
    const state = scenes[solutionId]?.states[stateId];
    const summary = one(panel, "[data-cinematic-solutions-summary]");
    const kicker = one(panel, ".cinematic-solutions__panel-kicker");
    const title = one(panel, "h2");
    const relation = relationsById.get(panel.dataset.cinematicSolutionsRelationId);
    if (!state || !summary || !kicker || !title || kicker.textContent.trim() !== state.label || title.textContent.trim() !== state.title || summary.textContent.trim() !== state.summary) return false;
    if (stateId !== "reassembled") {
      const related = panel.querySelectorAll("[data-cinematic-solutions-related]");
      const expected = stateId === "assembled" ? fallbackSolutionLinks.get(solutionId) : focusServiceLinks.get(solutionId);
      return related.length === 1 && Array.isArray(expected) && expected.length > 0 && expected.every(Boolean) &&
        (stateId !== "focus" || sameIds(expected, fallbackServiceLinks.get(solutionId))) && sameIds(linkHrefs(related[0]), expected);
    }
    const services = panel.querySelectorAll("section[data-cinematic-solutions-service-links]");
    const relatedSolutions = panel.querySelectorAll("section[data-cinematic-solutions-solution-links]");
    const expectedServices = relation ? [relation.direction_id, ...relation.related_direction_ids].map((directionId) => directionsById.get(directionId)?.service_slug).map((slug) => slug ? `/services/${slug}/` : null) : null;
    return services.length === 1 && relatedSolutions.length === 1 && expectedServices?.every(Boolean) &&
      sameIds(linkHrefs(services[0]), expectedServices) && sameIds(linkHrefs(relatedSolutions[0]), fallbackSolutionLinks.get(solutionId));
  });
  return exact(sceneElements, "cinematicSolutionsScene") && exact(panels, "cinematicSolutionsPanel") && readableScenes && readablePanels
    ? { scenes: sceneElements, panels }
    : null;
}

function decodeSceneImage(image) {
  if (!image) return Promise.reject(new TypeError("A physical solution scene must contain an image."));
  image.loading = "eager";
  const decode = () => {
    if (image.naturalWidth === 0) return Promise.reject(new TypeError("A physical solution scene did not load."));
    if (typeof image.decode !== "function") return Promise.resolve();
    return image.decode().catch(() => image.naturalWidth > 0 ? undefined : Promise.reject(new TypeError("A physical solution scene did not decode.")));
  };
  if (image.complete) return decode();
  return new Promise((resolve, reject) => {
    const loaded = () => { cleanup(); decode().then(resolve, reject); };
    const failed = () => { cleanup(); reject(new TypeError("A physical solution scene did not load.")); };
    const cleanup = () => {
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
    };
    image.addEventListener("load", loaded, { once: true });
    image.addEventListener("error", failed, { once: true });
  });
}

function enhance(root) {
  const mode = root.dataset.cinematicSolutionsMode;
  const selectedSolutionId = root.dataset.cinematicSolutionsSelectedSolutionId;
  const config = readJson(root, "data-cinematic-solutions-config");
  const mapping = readJson(root, "data-cinematic-solutions-mapping");
  const sceneMapping = readJson(root, "data-cinematic-solutions-scenes");
  const graph = readJson(root, "data-cinematic-solutions-graph");
  const fallback = one(root, "[data-cinematic-solutions-fallback]");
  const stage = one(root, "[data-cinematic-solutions-stage]");
  const live = one(root, "[data-cinematic-solutions-live]");
  const stageTitle = mode === "atlas" ? one(root, "#cinematic-solutions-stage-title") : one(root, "#cinematic-solution-stage-title");
  if (!(["atlas", "detail"].includes(mode) && isId(selectedSolutionId) && fallback && stage && live && stageTitle)) return;
  if (!validConfig(config, mode, selectedSolutionId)) return;
  const relationsById = validMapping(graph, mapping, config.mapping_ids);
  if (!relationsById || config.solution_ids.some((solutionId) => !mapping[solutionId])) return;
  const scenes = validScenes(sceneMapping, mapping, config.mapping_ids);
  if (!scenes) return;
  const controls = exactControls(stage, config.solution_ids, mode);
  const visuals = exactVisuals(stage, fallback, config.solution_ids, mapping, scenes, graph, relationsById);
  if (!controls || !visuals) return;

  const localMapping = Object.fromEntries(config.solution_ids.map((solutionId) => [solutionId, mapping[solutionId]]));
  const localScenes = Object.fromEntries(config.solution_ids.map((solutionId) => [solutionId, scenes[solutionId]]));
  let atlas;
  try {
    atlas = createCinematicSolutionsState(graph, localMapping, localScenes);
  } catch (_) {
    return;
  }

  const panelFor = (stateId, solutionId) => visuals.panels.find((panel) =>
    panel.dataset.cinematicSolutionsPanel === stateId && panel.dataset.cinematicSolutionsSolutionId === solutionId
  );
  const sceneFor = (stateId, solutionId) => visuals.scenes.find((scene) =>
    scene.dataset.cinematicSolutionsScene === stateId && scene.dataset.cinematicSolutionsSolutionId === solutionId
  );
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let state = atlas.initialState;
  let desiredState = state;
  const handoff = createCinematicSolutionsHandoff();
  let handoffPending = false;

  const setAccessible = (element, active) => {
    element.inert = !active;
    if (active) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", "true");
  };
  const hideScene = (scene) => {
    scene.hidden = true;
    scene.removeAttribute("data-cinematic-solutions-incoming");
    scene.removeAttribute("data-cinematic-solutions-revealed");
    setAccessible(scene, false);
  };
  const synchronizePanelsAndControls = (announce = false) => {
    const panel = panelFor(state.state, state.selectedSolutionId);
    if (!panel) return false;
    visuals.panels.forEach((candidate) => {
      const active = candidate === panel;
      candidate.hidden = !active;
      setAccessible(candidate, active);
    });
    controls.controls.forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.cinematicSolutionsControlState === state.state)));
    controls.solutionControls.forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.cinematicSolutionsSolutionId === state.selectedSolutionId)));
    root.dataset.cinematicSolutionsState = state.state;
    root.dataset.cinematicSolutionsSolutionId = state.selectedSolutionId;
    root.dataset.cinematicSolutionsRelationId = state.selectedRelationId || "";
    root.dataset.cinematicSolutionsMotionPhase = "idle";
    if (announce) {
      const label = panel.querySelector(".cinematic-solutions__panel-kicker")?.textContent.trim() || "";
      const summary = panel.querySelector("[data-cinematic-solutions-summary]")?.textContent.trim() || "";
      live.textContent = label && summary ? `${label}: ${summary}` : label || summary;
    }
    return true;
  };

  const synchronizeInitial = (announce = false) => {
    const activeScene = sceneFor(state.state, state.selectedSolutionId);
    if (!activeScene || !synchronizePanelsAndControls(announce)) return false;
    visuals.scenes.forEach((candidate) => {
      if (candidate === activeScene) {
        candidate.hidden = false;
        setAccessible(candidate, true);
      } else hideScene(candidate);
    });
    return true;
  };

  const commitHandoff = (nextState, outgoingScene, incomingScene, token) => {
    state = nextState;
    if (!synchronizePanelsAndControls(true)) return false;
    visuals.scenes.forEach((candidate) => {
      if (candidate !== outgoingScene && candidate !== incomingScene) hideScene(candidate);
    });
    incomingScene.hidden = false;
    setAccessible(incomingScene, true);
    setAccessible(outgoingScene, false);
    if (reducedMotion.matches || outgoingScene === incomingScene) {
      if (outgoingScene !== incomingScene) hideScene(outgoingScene);
      else setAccessible(incomingScene, true);
      handoffPending = false;
      root.dataset.cinematicSolutionsMotionPhase = "idle";
      root.removeAttribute("aria-busy");
      return true;
    }
    incomingScene.dataset.cinematicSolutionsIncoming = "true";
    root.dataset.cinematicSolutionsMotionPhase = "reveal";
    window.requestAnimationFrame(() => {
      if (handoff.isCurrent(token)) incomingScene.dataset.cinematicSolutionsRevealed = "true";
    });
    const settle = () => {
      if (!handoff.isCurrent(token)) return;
      hideScene(outgoingScene);
      incomingScene.removeAttribute("data-cinematic-solutions-incoming");
      incomingScene.removeAttribute("data-cinematic-solutions-revealed");
      handoffPending = false;
      root.dataset.cinematicSolutionsMotionPhase = "idle";
      root.removeAttribute("aria-busy");
    };
    incomingScene.addEventListener("animationend", settle, { once: true });
    incomingScene.addEventListener("animationcancel", settle, { once: true });
    return true;
  };

  const transition = async (nextState) => {
    const token = handoff.begin();
    const outgoingScene = sceneFor(state.state, state.selectedSolutionId);
    const incomingScene = sceneFor(nextState.state, nextState.selectedSolutionId);
    const incomingImage = incomingScene?.querySelector("img");
    if (!outgoingScene || !incomingScene || !incomingImage) {
      desiredState = state;
      return;
    }
    handoffPending = true;
    root.dataset.cinematicSolutionsMotionPhase = "prepare";
    visuals.scenes.forEach((candidate) => {
      if (candidate !== outgoingScene) hideScene(candidate);
    });
    outgoingScene.hidden = false;
    outgoingScene.removeAttribute("data-cinematic-solutions-incoming");
    outgoingScene.removeAttribute("data-cinematic-solutions-revealed");
    setAccessible(outgoingScene, true);
    root.setAttribute("aria-busy", "true");
    try {
      await decodeSceneImage(incomingImage);
    } catch (_) {
      if (handoff.isCurrent(token)) {
        desiredState = state;
        handoffPending = false;
        root.dataset.cinematicSolutionsMotionPhase = "idle";
        root.removeAttribute("aria-busy");
      }
      return;
    }
    if (!handoff.isCurrent(token)) return;
    commitHandoff(nextState, outgoingScene, incomingScene, token);
  };

  const cancelPendingHandoff = () => {
    handoff.begin();
    desiredState = state;
    handoffPending = false;
    const activeScene = sceneFor(state.state, state.selectedSolutionId);
    visuals.scenes.forEach((candidate) => {
      if (candidate === activeScene) {
        candidate.hidden = false;
        candidate.removeAttribute("data-cinematic-solutions-incoming");
        candidate.removeAttribute("data-cinematic-solutions-revealed");
        setAccessible(candidate, true);
      } else hideScene(candidate);
    });
    root.removeAttribute("aria-busy");
    root.dataset.cinematicSolutionsMotionPhase = "idle";
  };

  stage.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const stateControl = target?.closest("button[data-cinematic-solutions-action]");
    const solutionControl = target?.closest("button[data-cinematic-solutions-solution-control]");
    if ((!stateControl && !solutionControl) || !stage.contains(stateControl || solutionControl)) return;
    const action = solutionControl
      ? { type: "select-solution", solutionId: solutionControl.dataset.cinematicSolutionsSolutionId }
      : { type: stateControl.dataset.cinematicSolutionsAction };
    const nextState = atlas.reduce(desiredState, action);
    if (nextState === desiredState) {
      if (handoffPending && nextState === state) cancelPendingHandoff();
      return;
    }
    desiredState = nextState;
    if (nextState === state) {
      if (handoffPending) cancelPendingHandoff();
      return;
    }
    void transition(nextState);
  });

  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) {
      const token = handoff.begin();
      desiredState = state;
      handoffPending = false;
      const activeScene = sceneFor(state.state, state.selectedSolutionId);
      visuals.scenes.forEach((candidate) => {
        if (candidate === activeScene) {
          candidate.hidden = false;
          candidate.removeAttribute("data-cinematic-solutions-incoming");
          candidate.removeAttribute("data-cinematic-solutions-revealed");
          setAccessible(candidate, true);
        } else hideScene(candidate);
      });
      if (handoff.isCurrent(token)) root.removeAttribute("aria-busy");
      root.dataset.cinematicSolutionsMotionPhase = "idle";
    }
  });

  if (!synchronizeInitial(true)) return;
  fallback.hidden = true;
  stage.hidden = false;
  root.dataset.cinematicSolutionsView = "stage";
  root.removeAttribute("aria-label");
  root.setAttribute("aria-labelledby", stageTitle.id);
  root.dataset.cinematicSolutionsEnhanced = "true";
}

document.querySelectorAll("[data-cinematic-solutions-root]").forEach(enhance);
