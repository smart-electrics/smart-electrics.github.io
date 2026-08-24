import { expect, test } from "@playwright/test";

const surfaceRoutes = ["/", "/services/"];
const sceneFamilies = ["panel", "stairs", "exterior", "surveillance", "audio", "backup", "climate", "shading", "diagnostics"];

async function chooseDirection(page, name) {
  const control = page.getByRole("button", { name, exact: true });
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
}

test("the shared cinematic surface turns a selected direction and relation into a real destination", async ({ page }) => {
  for (const route of surfaceRoutes) {
    await page.goto(route);

    const root = page.locator("[data-cinematic-root]");
    await expect(root).toHaveCount(1);
    await expect(root).toHaveAttribute("data-cinematic-state", "assembled");

    await chooseDirection(page, "Освітлення");
    await expect(root).toHaveAttribute("data-cinematic-state", "focus");
    await expect(root.locator("[data-cinematic-summary]")).toContainText("Групи світла");
    await expect(root.locator("[data-cinematic-destination]")).toHaveAttribute("href", "/services/lighting/");

    const relation = page.getByRole("button", { name: "Освітлення сходів", exact: true });
    await relation.click();
    await expect(root).toHaveAttribute("data-cinematic-state", "reassembled");
    await expect(root.locator("[data-cinematic-summary]")).toContainText("Маршрутне світло");
    await expect(root.locator("[data-cinematic-related] a:visible")).toHaveCount(2);
    await expect(root.locator("[data-cinematic-related] a:visible").first()).toHaveAttribute("href", /\/services\//);

    await root.getByRole("button", { name: "Повернутися до всієї системи" }).click();
    await expect(root).toHaveAttribute("data-cinematic-state", "assembled");
  }
});

test("without the adapter both surfaces retain their eight destinations and relation reading order", async ({ page }) => {
  await page.route("**/assets/js/cinematic-stage.js", (route) => route.abort());
  for (const route of surfaceRoutes) {
    await page.goto(route);
    const root = page.locator("[data-cinematic-root]");
    await expect(root).not.toHaveAttribute("data-cinematic-enhanced", "true");
    await expect(root.locator("[data-cinematic-direction-link]:visible")).toHaveCount(8);
    await expect(root.locator("[data-cinematic-relation-item]:visible")).toHaveCount(9);
    await expect(root.locator("[data-cinematic-action]:visible")).toHaveCount(0);
  }
});

test("every relation retains its matching residence scene family on both public surfaces", async ({ page }) => {
  for (const route of surfaceRoutes) {
    await page.goto(route);
    const scenes = page.locator("[data-cinematic-scene-family]");
    await expect(scenes).toHaveCount(sceneFamilies.length);
    for (const family of sceneFamilies) {
      const scene = page.locator(`[data-cinematic-scene-family="${family}"]`);
      await expect(scene).toHaveCount(1);
      await expect(scene.locator("img")).toHaveAttribute("src", new RegExp(`/smart-home/${family}-1536\\.webp$`));
      await expect(scene.locator("img")).toHaveAccessibleName(/Візуальна концепція:/);
    }
  }
});

test("reduced motion preserves the selected state and removes every outgoing geometry snapshot", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of surfaceRoutes) {
    await page.goto(route);
    const root = page.locator("[data-cinematic-root]");
    await chooseDirection(page, "Освітлення");
    await page.getByRole("button", { name: "Освітлення сходів", exact: true }).click();
    await expect(root).toHaveAttribute("data-cinematic-state", "reassembled");
    await expect(root.locator("[data-cinematic-outgoing-snapshot]")).toHaveCount(0);
    await expect.poll(() => root.locator("*").evaluateAll((elements) => elements.filter((element) => {
      const style = getComputedStyle(element);
      return [style.animationDuration, style.transitionDuration].some((value) =>
        value.split(",").some((duration) => Number.parseFloat(duration) > 0)
      );
    }).length)).toBe(0);
  }
});

test("the shared adapter keeps one aria-hidden outgoing geometry and clears it on replacement and motion cancellation", async ({ page }) => {
  await page.goto("/services/");
  const root = page.locator("[data-cinematic-root]");
  await chooseDirection(page, "Освітлення");
  const snapshot = root.locator("[data-cinematic-outgoing-snapshot]");
  await expect(snapshot).toHaveCount(1);
  await expect(snapshot).toHaveAttribute("aria-hidden", "true");
  await expect(snapshot).toHaveCSS("animation-name", "cinematic-topology-out");

  await page.getByRole("button", { name: "Освітлення сходів", exact: true }).click();
  await expect(snapshot).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(snapshot).toHaveCount(0);
});

test("direction controls keep pointer, keyboard, and touch selection on the same public state", async ({ page, browser }) => {
  await page.goto("/");
  const root = page.locator("[data-cinematic-root]");
  await page.getByRole("button", { name: "Освітлення", exact: true }).click();
  await expect(root).toHaveAttribute("data-cinematic-direction", "lighting");
  await root.getByRole("button", { name: "Повернутися до всієї системи" }).click();

  const keyboard = page.getByRole("button", { name: "Резервне живлення", exact: true });
  await keyboard.focus();
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-cinematic-direction", "backup-power");
  await root.getByRole("button", { name: "Повернутися до всієї системи" }).click();

  const touchContext = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 812 } });
  const touchPage = await touchContext.newPage();
  await touchPage.goto("/");
  await touchPage.getByRole("button", { name: "Освітлення", exact: true }).tap();
  await expect(touchPage.locator("[data-cinematic-root]")).toHaveAttribute("data-cinematic-direction", "lighting");
  await touchContext.close();
});
