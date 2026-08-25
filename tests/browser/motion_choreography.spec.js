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
  }
];

async function ready(page, composition) {
  await page.goto(composition.route);
  const root = page.locator(composition.root);
  await expect(root).toBeVisible();
  await expect(root.locator(composition.stage)).toBeVisible();
  return root;
}

test("cinematic compositions expose a bounded causal lifecycle with a clean single-scene hold", async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    for (const composition of compositions) {
      const root = await ready(page, composition);
      const trigger = composition.route === "/"
        ? root.locator("[data-cinematic-direction-control]").first()
        : root.locator(composition.trigger);
      await trigger.click();
      await expect(root).toHaveAttribute(composition.phase, "disassemble");
      await expect(root.locator(composition.snapshot)).toBeVisible();
      await expect(root.locator(composition.connector)).toBeHidden();
      await expect(root).toHaveAttribute(composition.phase, "hold");
      await expect(root.locator(composition.snapshot)).toBeHidden();
      await expect(root.locator(`${composition.scene}:visible`)).toHaveCount(1);
      await expect(root.locator(`${composition.panel}:visible`)).toHaveCount(0);
      await expect(root).toHaveAttribute(composition.phase, "reassemble");
      const connector = root.locator(composition.connector);
      await expect(connector).toBeVisible();
      await expect(connector).toHaveAttribute("aria-hidden", "true");
      await expect(connector.locator("path[pathLength='1']")).toHaveCount(1);
      expect(await root.locator(`${composition.panel}:not([hidden]), ${composition.panel}:not([hidden]) *`).evaluateAll((elements) =>
        elements.flatMap((element) => element.getAnimations()).some((animation) =>
          animation.effect?.getKeyframes().some((keyframe) => keyframe.opacity !== undefined || keyframe.filter !== undefined)
        )
      )).toBe(false);
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
      await expect(root).toHaveAttribute(composition.phase, "idle");
      await expect(root.locator(`${composition.panel}:visible`)).toHaveCount(1);
    }
  }
});

test("snapshot cancellation clears only the visual artifact and never aborts the causal lifecycle", async ({ page }) => {
  for (const composition of compositions) {
    const root = await ready(page, composition);
    const trigger = composition.route === "/"
      ? root.locator("[data-cinematic-direction-control]").first()
      : root.locator(composition.trigger);
    await trigger.click();
    const snapshot = root.locator(composition.snapshot);
    await expect(root).toHaveAttribute(composition.phase, "disassemble");
    await snapshot.dispatchEvent("animationcancel");
    await expect(snapshot).toBeHidden();
    await expect(root).toHaveAttribute(composition.phase, "hold");
    await expect(root.locator(composition.connector)).toBeHidden();
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
      await controls.nth(3).click();
      await expect(root).toHaveAttribute("data-cinematic-direction", await controls.nth(3).getAttribute("data-direction-id"));
    } else if (composition.route === "/services/lighting/") {
      await root.locator('[data-service-studio-action="select-focus"]').click();
      await root.locator('[data-service-studio-action="select-reassembled"]').click();
      await expect(root).toHaveAttribute("data-service-studio-state", "reassembled");
    } else {
      await root.locator('[data-cinematic-solutions-action="select-focus"]').click();
      await root.locator('[data-cinematic-solutions-action="select-reassembled"]').click();
      await expect(root).toHaveAttribute("data-cinematic-solutions-state", "reassembled");
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
      : root.locator(composition.trigger);
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
  await root.getByRole("button", { name: "Звернення", exact: true }).click();
  await expect(root).toHaveAttribute("data-route-journey-motion-phase", "disassemble");
  await expect(root).toHaveAttribute("data-route-journey-motion-phase", "hold");
  await expect(root.locator("[data-route-journey-panel]")).toBeHidden();
  await expect(root).toHaveAttribute("data-route-journey-motion-phase", "reassemble");
  await expect(root.locator("svg[data-route-journey-connector]")).toBeVisible();
  await expect(root).toHaveAttribute("data-route-journey-motion-phase", "idle");
});

test("residence panels remain wholly inside the dominant scene frame at every target width", async ({ page }) => {
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
