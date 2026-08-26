import { expect, test } from "@playwright/test";

const compositions = [
  {
    route: "/",
    root: "[data-cinematic-root]",
    stage: "[data-cinematic-stage]",
    trigger: '[data-cinematic-direction-control=""]',
    phase: "data-cinematic-motion-phase",
    snapshot: "[data-cinematic-outgoing-snapshot]",
    scene: "[data-cinematic-scene]",
    panel: "[data-cinematic-panel]",
    connector: "svg[data-cinematic-relationship-connector]",
    source: '[data-cinematic-direction-control][aria-pressed="true"]'
  },
  {
    route: "/services/lighting/",
    root: "[data-service-studio-root]",
    stage: "[data-service-studio-stage]",
    trigger: '[data-service-studio-action="select-focus"]',
    phase: "data-service-studio-motion-phase",
    snapshot: "[data-service-studio-outgoing-snapshot]",
    scene: "[data-service-studio-scene]",
    panel: "[data-service-studio-panel]",
    connector: "svg[data-service-studio-relationship-connector]",
    source: '[data-service-studio-relation-control][aria-pressed="true"], [data-service-studio-control][aria-pressed="true"]'
  },
  {
    route: "/solutions/",
    root: "[data-cinematic-solutions-root]",
    stage: "[data-cinematic-solutions-stage]",
    trigger: '[data-cinematic-solutions-action="select-focus"]',
    phase: "data-cinematic-solutions-motion-phase",
    snapshot: "[data-cinematic-solutions-outgoing-snapshot]",
    scene: "[data-cinematic-solutions-scene]",
    panel: "[data-cinematic-solutions-panel]",
    connector: "svg[data-cinematic-solutions-relationship-connector]",
    source: '[data-cinematic-solutions-solution-control][aria-pressed="true"]'
  },
  {
    route: "/smart-home/",
    root: "[data-smart-home-simulator]",
    stage: "[data-smart-home-experience]",
    trigger: "button[data-phone-system]",
    phase: "data-motion-phase",
    snapshot: "[data-outgoing-snapshot]",
    scene: ".smart-home__scene",
    panel: "[data-preset-panel]",
    connector: "[data-topology-connector]",
    topology: "[data-scene-topology]",
    sceneLayer: "[data-motion-layer]",
    smartHome: true
  }
];

async function ready(page, composition) {
  await page.goto(composition.route);
  const root = page.locator(composition.root);
  await expect(root).toBeVisible();
  await expect(root.locator(composition.stage)).toBeVisible();
  return root;
}

async function recordPhaseTimeline(root, phaseAttribute) {
  await root.evaluate((element, attribute) => {
    element.__cinematicPhaseObserver?.disconnect();
    element.__cinematicPhaseTimeline = [];
    element.__cinematicPhaseObserver = new MutationObserver(() => {
      element.__cinematicPhaseTimeline.push({ phase: element.getAttribute(attribute), time: performance.now() });
    });
    element.__cinematicPhaseObserver.observe(element, { attributeFilter: [attribute] });
  }, phaseAttribute);
}

async function expectDeliberatePhaseDurations(root, label) {
  const timeline = await root.evaluate((element) => {
    element.__cinematicPhaseObserver?.disconnect();
    return element.__cinematicPhaseTimeline || [];
  });
  const phase = (name) => timeline.find((entry) => entry.phase === name);
  const disassemble = phase("disassemble");
  const hold = phase("hold");
  const reassemble = phase("reassemble");
  const idle = phase("idle");
  expect(timeline.map(({ phase: name }) => name), label + " must expose the complete causal phase order").toEqual([
    "disassemble",
    "hold",
    "reassemble",
    "idle"
  ]);
  expect(hold.time - disassemble.time, label + " must visibly disassemble before replacing the scene").toBeGreaterThanOrEqual(250);
  expect(reassemble.time - hold.time, label + " must retain an inspectable clean hold").toBeGreaterThanOrEqual(500);
  expect(idle.time - reassemble.time, label + " must visibly reassemble the selected state").toBeGreaterThanOrEqual(300);
  return timeline;
}

test("cinematic compositions expose a bounded causal lifecycle with a clean single-scene hold", async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    for (const composition of compositions) {
      const root = await ready(page, composition);
      const trigger = composition.route === "/"
        ? root.locator("[data-cinematic-direction-control]").first()
        : root.locator(composition.trigger).nth(composition.smartHome ? 1 : 0);
      const previousSmartSystem = composition.smartHome ? await root.getAttribute("data-system") : null;
      const nextSmartSystem = composition.smartHome ? await trigger.getAttribute("data-phone-system") : null;
      await recordPhaseTimeline(root, composition.phase);
      await trigger.click();
      await expect(root).toHaveAttribute(composition.phase, "disassemble");
      await expect(root.locator(composition.snapshot)).toBeVisible();
      if (composition.smartHome) {
        await expect(root).toHaveAttribute("data-system", previousSmartSystem);
        await expect(root.locator(`${composition.panel}:not([hidden])`)).toHaveAttribute("inert", "");
        expect(await root.locator(composition.connector).evaluateAll((connectors) =>
          connectors.map((connector) => getComputedStyle(connector).opacity)
        )).toEqual(["0", "0"]);
      } else {
        await expect(root.locator(composition.connector)).toBeHidden();
      }
      await expect(root).toHaveAttribute(composition.phase, "hold");
      await expect(root.locator(composition.snapshot)).toBeHidden();
      await expect(root.locator(`${composition.scene}:visible`)).toHaveCount(1);
      await expect(root.locator(`${composition.panel}:visible`)).toHaveCount(0);
      if (composition.smartHome) {
        await expect(root).toHaveAttribute("data-system", nextSmartSystem);
        await expect(root.locator(`${composition.panel}:not([hidden])`)).toHaveAttribute("inert", "");
        expect(await root.locator(composition.topology).evaluate((topology) => getComputedStyle(topology).visibility)).toBe("hidden");
      }
      await expect(root).toHaveAttribute(composition.phase, "reassemble");
      if (composition.smartHome) {
        await expect(root.locator(`${composition.panel}:not([hidden])`)).not.toHaveAttribute("inert", "");
        await expect(root.locator(composition.topology)).toBeVisible();
        await expect(root.locator(composition.connector)).toHaveCount(2);
        expect(await root.locator(composition.connector).evaluateAll((connectors) =>
          connectors.every((connector) => connector.getAnimations().some((animation) => animation.animationName === "smart-home-topology-draw"))
        )).toBe(true);
        expect(await root.locator(`${composition.scene} ${composition.sceneLayer}:not([hidden])`).evaluateAll((layers) =>
          layers.length === 3 && layers.every((layer) => layer.getAnimations().length > 0)
        )).toBe(true);
      } else {
        const connector = root.locator(composition.connector);
        await expect(connector).toBeVisible();
        await expect(connector).toHaveAttribute("aria-hidden", "true");
        await expect(connector.locator("path[pathLength='1']")).toHaveCount(1);
      }
      expect(await root.locator(`${composition.panel}:not([hidden]), ${composition.panel}:not([hidden]) *`).evaluateAll((elements) =>
        elements.flatMap((element) => element.getAnimations()).some((animation) =>
          animation.effect?.getKeyframes().some((keyframe) => keyframe.opacity !== undefined || keyframe.filter !== undefined)
        )
      )).toBe(false);
      if (!composition.smartHome) {
        const connectorGeometry = await root.evaluate((element, selectors) => {
          const svg = element.querySelector(selectors.connector);
          const path = svg?.querySelector("path[pathLength='1']");
          const source = svg?.querySelector("[data-cinematic-relationship-connector-source]");
          const target = svg?.querySelector("[data-cinematic-relationship-connector-target]");
          const scene = element.querySelector(`${selectors.scene}:not([hidden])`);
          const selectedControl = element.querySelector(selectors.source);
          const headings = [...element.querySelectorAll(`${selectors.panel}:not([hidden]) h2, ${selectors.panel}:not([hidden]) h3`)];
          if (!svg || !path || !source || !target || !scene || !selectedControl) return null;
          const svgBounds = svg.getBoundingClientRect();
          const viewBox = svg.viewBox.baseVal;
          const sceneBounds = scene.getBoundingClientRect();
          const sourceBounds = selectedControl.getBoundingClientRect();
          const toScreen = (point) => ({
            x: svgBounds.left + point.x * svgBounds.width / viewBox.width,
            y: svgBounds.top + point.y * svgBounds.height / viewBox.height
          });
          const endpoint = toScreen({ x: Number(target.getAttribute("cx")), y: Number(target.getAttribute("cy")) });
          const sourceEndpoint = toScreen({ x: Number(source.getAttribute("cx")), y: Number(source.getAttribute("cy")) });
          const intersectsHeading = headings.some((heading) => {
            const bounds = heading.getBoundingClientRect();
            const length = path.getTotalLength();
            for (let distance = 0; distance <= length; distance += Math.max(1, length / 40)) {
              const point = toScreen(path.getPointAtLength(distance));
              if (point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom) return true;
            }
            return false;
          });
          const within = (point, bounds) => point.x >= bounds.left - 0.5 && point.x <= bounds.right + 0.5 && point.y >= bounds.top - 0.5 && point.y <= bounds.bottom + 0.5;
          return {
            endpointInScene: within(endpoint, sceneBounds),
            sourceEndpointOnSelectedControl: within(sourceEndpoint, sourceBounds),
            intersectsHeading
          };
        }, composition);
        expect(connectorGeometry, `${composition.route} at ${width}px`).toEqual({ endpointInScene: true, sourceEndpointOnSelectedControl: true, intersectsHeading: false });
      }
      await expect(root).toHaveAttribute(composition.phase, "idle");
      await expect(root.locator(`${composition.panel}:visible`)).toHaveCount(1);
      if (composition.smartHome) {
        const selectedSystem = await root.getAttribute("data-system");
        await expect(root.locator(`${composition.scene} picture[data-scene-picture]:visible`)).toHaveAttribute("data-scene-picture", selectedSystem);
        expect(await root.locator(composition.connector).evaluateAll((connectors) =>
          connectors.map((connector) => getComputedStyle(connector).opacity)
        )).toEqual(["1", "1"]);
      }
      await expectDeliberatePhaseDurations(root, `${composition.route} at ${width}px`);
    }
  }
});

test("snapshot cancellation clears only the visual artifact and never aborts the causal lifecycle", async ({ page }) => {
  for (const composition of compositions) {
    const root = await ready(page, composition);
    const trigger = composition.route === "/"
      ? root.locator("[data-cinematic-direction-control]").first()
      : root.locator(composition.trigger).nth(composition.smartHome ? 1 : 0);
    await trigger.click();
    const snapshot = root.locator(composition.snapshot);
    await expect(root).toHaveAttribute(composition.phase, "disassemble");
    await snapshot.dispatchEvent("animationcancel");
    await expect(snapshot).toBeHidden();
    await expect(root).toHaveAttribute(composition.phase, "hold");
    if (!composition.smartHome) await expect(root.locator(composition.connector)).toBeHidden();
    await expect(root).toHaveAttribute(composition.phase, "reassemble");
    await expect(root).toHaveAttribute(composition.phase, "idle");
  }
});

test("rapid interactions restart each composition from the newest selected state", async ({ page }) => {
  for (const composition of compositions) {
    const root = await ready(page, composition);
    if (composition.route === "/") {
      const controls = root.locator("[data-cinematic-direction-control]");
      await controls.nth(0).click();
      const newestDirection = await controls.nth(3).getAttribute("data-direction-id");
      await controls.nth(3).click();
      await expect(root).toHaveAttribute("data-cinematic-direction", newestDirection);
      await expect(root).toHaveAttribute("data-cinematic-state", "focus");
      await expect(root).toHaveAttribute(composition.phase, "idle");
      await expect(root.locator(`${composition.scene}:visible`)).toHaveAttribute("data-cinematic-focus-scene", newestDirection);
      await expect(root.locator(`${composition.panel}:visible`)).toHaveAttribute("data-cinematic-focus-panel", newestDirection);
    } else if (composition.route === "/services/lighting/") {
      const newestRelation = await root.locator(`${composition.scene}:visible`).getAttribute("data-service-studio-relation-id");
      await root.locator('[data-service-studio-action="select-focus"]').click();
      await root.locator('[data-service-studio-action="select-reassembled"]').click();
      await expect(root).toHaveAttribute("data-service-studio-state", "reassembled");
      await expect(root).toHaveAttribute(composition.phase, "idle");
      await expect(root).toHaveAttribute("data-service-studio-relation", newestRelation);
      await expect(root.locator(`${composition.scene}:visible`)).toHaveAttribute("data-service-studio-scene", "reassembled");
      await expect(root.locator(`${composition.scene}:visible`)).toHaveAttribute("data-service-studio-relation-id", newestRelation);
      await expect(root.locator(`${composition.panel}:visible`)).toHaveAttribute("data-service-studio-panel", "reassembled");
      await expect(root.locator(`${composition.panel}:visible`)).toHaveAttribute("data-service-studio-relation-id", newestRelation);
    } else if (composition.smartHome) {
      const systems = root.locator("button[data-phone-system]");
      await systems.nth(1).click();
      const newestSystem = await systems.nth(2).getAttribute("data-phone-system");
      await systems.nth(2).click();
      await expect(root).toHaveAttribute("data-system", newestSystem);
      const presets = root.locator("input[data-preset-radio]");
      await presets.nth(1).click();
      const newestPreset = await presets.nth(2).getAttribute("value");
      await presets.nth(2).click();
      await expect(root).toHaveAttribute("data-preset", newestPreset);
      await expect(root).toHaveAttribute(composition.phase, "idle");
      await expect(root.locator(`${composition.scene} picture[data-scene-picture]:visible`)).toHaveAttribute("data-scene-picture", newestSystem);
    } else {
      const newestSolution = await root.getAttribute("data-cinematic-solutions-solution-id");
      await root.locator('[data-cinematic-solutions-action="select-focus"]').click();
      await root.locator('[data-cinematic-solutions-action="select-reassembled"]').click();
      await expect(root).toHaveAttribute("data-cinematic-solutions-state", "reassembled");
      await expect(root).toHaveAttribute(composition.phase, "idle");
      await expect(root).toHaveAttribute("data-cinematic-solutions-solution-id", newestSolution);
      await expect(root.locator(`${composition.scene}:visible`)).toHaveAttribute("data-cinematic-solutions-scene", "reassembled");
      await expect(root.locator(`${composition.scene}:visible`)).toHaveAttribute("data-cinematic-solutions-solution-id", newestSolution);
      await expect(root.locator(`${composition.panel}:visible`)).toHaveAttribute("data-cinematic-solutions-panel", "reassembled");
      await expect(root.locator(`${composition.panel}:visible`)).toHaveAttribute("data-cinematic-solutions-solution-id", newestSolution);
    }
    await expect(root).toHaveAttribute(composition.phase, "idle");
    await expect(root.locator(`${composition.panel}:visible`)).toHaveCount(1);
  }
});

test("reduced motion bypasses the choreography without hiding the selected state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const composition of compositions) {
    const root = await ready(page, composition);
    const trigger = composition.route === "/"
      ? root.locator("[data-cinematic-direction-control]").first()
      : root.locator(composition.trigger).nth(composition.smartHome ? 1 : 0);
    await trigger.click();
    await expect(root).toHaveAttribute(composition.phase, "idle");
    await expect(root.locator(composition.snapshot)).toBeHidden();
    await expect(root.locator(`${composition.scene}:visible`)).toHaveCount(1);
    await expect(root.locator(`${composition.panel}:visible`)).toHaveCount(1);
    expect(await root.locator("*").evaluateAll((elements) => elements.filter((element) => {
      const style = getComputedStyle(element);
      return [style.animationDuration, style.transitionDuration].some((value) => value.split(",").some((duration) => Number.parseFloat(duration) > 0));
    }).length)).toBe(0);
  }
});

test("route journeys use the same lifecycle without replacing their existing SVG connector", async ({ page }) => {
  await page.goto("/process/");
  const root = page.locator("[data-route-journey-root]");
  await expect(root).toHaveAttribute("data-route-journey-enhanced", "true");
  await recordPhaseTimeline(root, "data-route-journey-motion-phase");
  await root.getByRole("button", { name: "Звернення", exact: true }).click();
  await expect(root).toHaveAttribute("data-route-journey-motion-phase", "disassemble");
  await expect(root).toHaveAttribute("data-route-journey-motion-phase", "hold");
  await expect(root.locator("[data-route-journey-panel]")).toBeHidden();
  await expect(root).toHaveAttribute("data-route-journey-motion-phase", "reassemble");
  await expect(root.locator("svg[data-route-journey-connector]")).toBeVisible();
  await expect(root).toHaveAttribute("data-route-journey-motion-phase", "idle");
  await expectDeliberatePhaseDurations(root, "/process/ journey");
});

test("residence panels remain wholly inside the dominant scene frame at every target width", async ({ page }) => {
  test.setTimeout(45_000);

  const assertPanelBounds = async () => {
    const bounds = await page.locator("[data-cinematic-composition]").evaluate((composition) => {
      const panel = composition.querySelector("[data-cinematic-panel]:not([hidden])");
      const view = composition.querySelector("[data-cinematic-view]");
      if (!panel || !view) return null;
      const within = (inner, outer) =>
        inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 &&
        inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;
      const panelBounds = panel.getBoundingClientRect();
      const viewBounds = view.getBoundingClientRect();
      const overflow = [...panel.querySelectorAll("*")].flatMap((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 &&
          (!within(rect, panelBounds) || !within(rect, viewBounds))
          ? [`${element.tagName}${element.className ? `.${element.className}` : ""} left:${(rect.left - panelBounds.left).toFixed(1)} right:${(rect.right - panelBounds.right).toFixed(1)} top:${(rect.top - panelBounds.top).toFixed(1)} bottom:${(rect.bottom - panelBounds.bottom).toFixed(1)}`]
          : [];
      });
      return { state: `${window.innerWidth}:${panel.dataset.cinematicPanel}`, panelInView: within(panelBounds, viewBounds), overflow };
    });
    expect(bounds?.panelInView).toBe(true);
    expect(bounds?.overflow, bounds?.state).toEqual([]);
  };

  for (const width of [375, 768, 900, 1024, 1440, 1980]) {
    await page.setViewportSize({ width, height: width === 375 ? 844 : 1100 });
    await page.goto("/");
    const root = page.locator("[data-cinematic-root]");
    await expect(root).toHaveAttribute("data-cinematic-enhanced", "true");
    expect(await root.locator("[data-cinematic-direction-control]").evaluateAll((controls) =>
      controls.every((control) => control.getBoundingClientRect().height >= 44)
    )).toBe(true);
    await assertPanelBounds();

    await root.getByRole("button", { name: "Освітлення", exact: true }).click();
    await expect(root).toHaveAttribute("data-cinematic-motion-phase", "idle");
    await assertPanelBounds();

    await root.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
    await expect(root).toHaveAttribute("data-cinematic-motion-phase", "idle");
    await assertPanelBounds();
  }
});
