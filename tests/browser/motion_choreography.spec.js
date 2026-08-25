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
    connector: "svg[data-cinematic-relationship-connector]"
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
    connector: "svg[data-service-studio-relationship-connector]"
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
    connector: "svg[data-cinematic-solutions-relationship-connector]"
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
      await expect(root).toHaveAttribute(composition.phase, "hold");
      await expect(root.locator(`${composition.scene}:visible`)).toHaveCount(1);
      await expect(root.locator(`${composition.panel}:visible`)).toHaveCount(0);
      await expect(root).toHaveAttribute(composition.phase, "reassemble");
      const connector = root.locator(composition.connector);
      await expect(connector).toBeVisible();
      await expect(connector).toHaveAttribute("aria-hidden", "true");
      await expect(connector.locator("path[pathLength='1']")).toHaveCount(1);
      await expect(root).toHaveAttribute(composition.phase, "idle");
      await expect(root.locator(`${composition.panel}:visible`)).toHaveCount(1);
    }
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
