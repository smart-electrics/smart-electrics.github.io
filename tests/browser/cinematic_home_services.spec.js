import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const surfaceRoutes = ["/", "/services/"];
const directions = [
  ["electrical-design", "Електромонтажне проєктування", 0, "stairs"],
  ["electrical-installation", "Електромонтажні роботи", 0, "panel"],
  ["panels-and-protection", "Щити й захист", 1, "panel"],
  ["lighting", "Освітлення", 2, "stairs"],
  ["low-voltage", "Слабкострумові системи", 2, "surveillance"],
  ["backup-power", "Резервне живлення", 1, "backup"],
  ["smart-home-integration", "Розумний будинок", 2, "climate"],
  ["diagnostics-and-service", "Діагностика й сервіс", 1, "diagnostics"]
];
const sceneFamilies = ["panel", "stairs", "exterior", "surveillance", "audio", "backup", "climate", "shading", "diagnostics"];

async function stageFor(page) {
  const root = page.locator("[data-cinematic-root]");
  await expect(root).toHaveCount(1);
  const stage = root.locator("[data-cinematic-stage]");
  await expect(stage).toBeVisible();
  return { root, stage };
}

async function chooseDirection(stage, label) {
  const control = stage.getByRole("button", { name: label, exact: true });
  await expect(control).toHaveCount(1);
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
}

async function expectOneVisibleScene(stage) {
  await expect(stage.locator("[data-cinematic-scene]:visible")).toHaveCount(1);
  await expect(stage.locator("[data-cinematic-panel]:visible")).toHaveCount(1);
}

test("the enhanced residence spine shows one scene beside an eight-control rail", async ({ page }) => {
  await page.goto("/");

  const { root, stage } = await stageFor(page);
  await expect(root.locator("[data-cinematic-fallback]")).toBeHidden();
  await expect(root).toHaveAttribute("data-cinematic-state", "assembled");
  await expectOneVisibleScene(stage);
  await expect(stage.locator("[data-cinematic-direction-control]:visible")).toHaveCount(8);
  await expect(stage.locator("[data-cinematic-relation-switcher]:visible")).toHaveCount(0);
  await expect(stage.locator("[data-cinematic-relation-scene]:visible")).toHaveCount(0);
});

test("both surfaces turn a direction and relation into one causal scene and real destination", async ({ page }) => {
  for (const route of surfaceRoutes) {
    await page.goto(route);
    const { root, stage } = await stageFor(page);

    await chooseDirection(stage, "Освітлення");
    await expect(root).toHaveAttribute("data-cinematic-state", "focus");
    await expect(root).toHaveAttribute("data-cinematic-direction", "lighting");
    await expectOneVisibleScene(stage);
    await expect(stage.locator("[data-cinematic-focus-panel=lighting]:visible")).toHaveCount(1);
    await expect(stage.locator("[data-cinematic-focus-destination=lighting]:visible")).toHaveAttribute("href", "/services/lighting/");
    await expect(stage.locator("[data-cinematic-relation-switcher=lighting]:visible button")).toHaveCount(2);

    await stage.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
    await expect(root).toHaveAttribute("data-cinematic-state", "reassembled");
    await expect(root).toHaveAttribute("data-cinematic-relation", "lighting--stair-lighting");
    await expectOneVisibleScene(stage);
    await expect(stage.locator("[data-cinematic-relation-scene='lighting--stair-lighting']:visible")).toHaveCount(1);
    await expect(stage.locator("[data-cinematic-reassembled-panel='lighting--stair-lighting']:visible")).toHaveCount(1);
    await expect(stage.locator("[data-cinematic-reassembled-destination='lighting--stair-lighting']:visible")).toHaveAttribute("href", "/services/lighting/");
    await expect(stage.locator("[data-cinematic-related='lighting--stair-lighting']:visible a")).toHaveCount(2);
    await expect(stage.locator("[data-cinematic-relation-switcher]:visible")).toHaveCount(0);

    await stage.getByRole("button", { name: "Повернутися до всієї системи", exact: true }).click();
    await expect(root).toHaveAttribute("data-cinematic-state", "assembled");
    await expectOneVisibleScene(stage);
  }
});

test("every enhanced direction has one 44px control and no same-name destination link", async ({ page }) => {
  await page.goto("/services/");
  const { stage } = await stageFor(page);

  for (const [, label] of directions) {
    const control = stage.getByRole("button", { name: label, exact: true });
    await expect(control).toHaveCount(1);
    await expect(control).toBeVisible();
    await expect(stage.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    const box = await control.boundingBox();
    expect(box?.width, `${label} needs a 44px target width`).toBeGreaterThanOrEqual(44);
    expect(box?.height, `${label} needs a 44px target height`).toBeGreaterThanOrEqual(44);
  }
});

test("each direction focuses exactly one pre-rendered panel and exposes relation choices only for its owner", async ({ page }) => {
  await page.goto("/");
  const { root, stage } = await stageFor(page);

  for (const [id, label, relationCount, sceneFamily] of directions) {
    await chooseDirection(stage, label);
    await expect(root).toHaveAttribute("data-cinematic-state", "focus");
    await expect(root).toHaveAttribute("data-cinematic-direction", id);
    await expectOneVisibleScene(stage);
    await expect(stage.locator("[data-cinematic-scene]:visible")).toHaveAttribute("data-cinematic-scene-family", sceneFamily);
    await expect(stage.locator(`[data-cinematic-focus-panel='${id}']:visible`)).toHaveCount(1);
    await expect(stage.locator("[data-cinematic-relation-switcher]:visible button")).toHaveCount(relationCount);
  }
});

test("the static fallback retains eight real destinations and nine relation explanations when enhancement aborts", async ({ page }) => {
  await page.route("**/assets/js/cinematic-stage.js", (route) => route.abort());

  for (const route of surfaceRoutes) {
    await page.goto(route);
    const root = page.locator("[data-cinematic-root]");
    const fallback = root.locator("[data-cinematic-fallback]");
    await expect(fallback).toBeVisible();
    await expect(root.locator("[data-cinematic-stage]")).toBeHidden();
    await expect(fallback.locator("[data-cinematic-fallback-direction]:visible")).toHaveCount(8);
    await expect(fallback.locator("[data-cinematic-fallback-relation]:visible")).toHaveCount(9);
    await expect(root.locator("button[data-cinematic-action]:visible")).toHaveCount(0);
    for (const link of await fallback.locator("[data-cinematic-direction-link]").all()) {
      await expect(link).toHaveAttribute("href", /\/services\/.+\/$/);
    }
  }
});

test("a malformed graph keeps the server fallback visible instead of exposing inert controls", async ({ page }) => {
  await page.addInitScript(() => {
    const originalParse = JSON.parse;
    JSON.parse = function cinematicFallbackParse(value, ...rest) {
      if (typeof value === "string" && value.includes('"directions"') && value.includes('"relations"')) {
        return originalParse('{"directions":[],"relations":[]}');
      }
      return originalParse.call(this, value, ...rest);
    };
  });
  await page.goto("/");

  const root = page.locator("[data-cinematic-root]");
  await expect(root.locator("[data-cinematic-fallback]")).toBeVisible();
  await expect(root.locator("[data-cinematic-stage]")).toBeHidden();
  await expect(root).not.toHaveAttribute("data-cinematic-enhanced", "true");
});

test("all nine residence scene families remain pre-rendered on both public surfaces", async ({ page }) => {
  for (const route of surfaceRoutes) {
    await page.goto(route);
    const { stage } = await stageFor(page);
    const relationScenes = stage.locator("[data-cinematic-relation-scene]");
    await expect(relationScenes).toHaveCount(sceneFamilies.length);
    for (const family of sceneFamilies) {
      const scene = stage.locator(`[data-cinematic-relation-scene][data-cinematic-scene-family='${family}']`);
      await expect(scene).toHaveCount(1);
      await expect(scene.locator("img")).toHaveAttribute("src", new RegExp(`/smart-home/${family}-1536\\.webp$`));
      await expect(scene.locator("img")).toHaveAttribute("alt", /Візуальна концепція:/);
    }
  }
});

test("rapid replacement retains one image-only snapshot and clears it on animation end or reduced motion", async ({ page }) => {
  await page.goto("/services/");
  const { root, stage } = await stageFor(page);
  const snapshot = stage.locator("[data-cinematic-outgoing-snapshot]");

  await chooseDirection(stage, "Освітлення");
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveAttribute("aria-hidden", "true");
  await expect(snapshot).toHaveCSS("animation-name", "residence-spine-outgoing");
  await expect(snapshot).toBeEmpty();

  await chooseDirection(stage, "Резервне живлення");
  await expect(stage.locator("[data-cinematic-outgoing-snapshot]:visible")).toHaveCount(1);
  await snapshot.dispatchEvent("animationcancel");
  await expect(snapshot).toBeHidden();

  await chooseDirection(stage, "Освітлення");
  await expect(snapshot).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(snapshot).toBeHidden();
  await expect(root).toHaveAttribute("data-cinematic-state", "focus");
});

test("reduced motion changes state without snapshots, transitions, or non-opaque text", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const { root, stage } = await stageFor(page);

  await chooseDirection(stage, "Освітлення");
  await stage.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
  await expect(root).toHaveAttribute("data-cinematic-state", "reassembled");
  await expect(stage.locator("[data-cinematic-outgoing-snapshot]:visible")).toHaveCount(0);
  await expect.poll(() => stage.locator("*").evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return [style.animationDuration, style.transitionDuration].some((value) =>
      value.split(",").some((duration) => Number.parseFloat(duration) > 0)
    );
  }).length)).toBe(0);

  const textStyles = await stage.locator("[data-cinematic-panel]:visible, [data-cinematic-panel]:visible *").evaluateAll((elements) =>
    elements.map((element) => ({ opacity: getComputedStyle(element).opacity, filter: getComputedStyle(element).filter }))
  );
  expect(textStyles).toEqual(expect.arrayContaining([{ opacity: "1", filter: "none" }]));
  expect(textStyles.every((style) => style.opacity === "1" && style.filter === "none")).toBeTruthy();
});

test("keyboard and touch select the same residence-spine state", async ({ page, browser }) => {
  await page.goto("/");
  const { root, stage } = await stageFor(page);

  const keyboard = stage.getByRole("button", { name: "Резервне живлення", exact: true });
  await keyboard.focus();
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-cinematic-direction", "backup-power");

  const touchContext = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 812 } });
  const touchPage = await touchContext.newPage();
  await touchPage.goto("http://127.0.0.1:4000/");
  const touchStage = touchPage.locator("[data-cinematic-stage]");
  await touchStage.getByRole("button", { name: "Освітлення", exact: true }).tap();
  await expect(touchPage.locator("[data-cinematic-root]")).toHaveAttribute("data-cinematic-direction", "lighting");
  await touchContext.close();
});

test("mobile and desktop spine keep one-pixel connector lanes away from controls and copy", async ({ page }) => {
  for (const { width, height, maximumHeight, expectsLandscapeScene } of [
    { width: 375, height: 812, maximumHeight: 1100, expectsLandscapeScene: false },
    { width: 1440, height: 1000, maximumHeight: null, expectsLandscapeScene: true }
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const { root, stage } = await stageFor(page);
    await chooseDirection(stage, "Освітлення");

    const geometry = await root.evaluate((element) => {
    const visible = (candidate) => !candidate.hasAttribute("hidden") && getComputedStyle(candidate).display !== "none";
    const lane = element.querySelector("[data-cinematic-connector-lane]");
    const composition = element.querySelector("[data-cinematic-composition]");
    const laneRect = lane?.getBoundingClientRect();
    const compositionRect = composition?.getBoundingClientRect();
    const rootRect = element.getBoundingClientRect();
    const blockers = [...element.querySelectorAll("button, a, [data-cinematic-panel]")]
      .filter(visible)
      .map((candidate) => candidate.getBoundingClientRect());
    const overlaps = laneRect ? blockers.some((rect) =>
      laneRect.left < rect.right && laneRect.right > rect.left && laneRect.top < rect.bottom && laneRect.bottom > rect.top
    ) : true;
    return {
      scrollHeight: element.scrollHeight,
      laneThickness: laneRect ? Math.min(laneRect.width, laneRect.height) : 99,
      compositionAspect: compositionRect ? compositionRect.width / compositionRect.height : 0,
      bounded: Boolean(laneRect && laneRect.left >= rootRect.left && laneRect.right <= rootRect.right && laneRect.top >= rootRect.top && laneRect.bottom <= rootRect.bottom),
      overlaps
    };
    });

    if (maximumHeight) expect(geometry.scrollHeight).toBeLessThanOrEqual(maximumHeight);
    if (expectsLandscapeScene) expect(geometry.compositionAspect).toBeCloseTo(1.6, 2);
    expect(geometry.laneThickness).toBeLessThanOrEqual(2);
    expect(geometry.bounded).toBeTruthy();
    expect(geometry.overlaps).toBeFalsy();
  }
});

test("the spine has no horizontal overflow through every required width and passes axe in meaningful states", async ({ page }) => {
  for (const width of [375, 414, 540, 768, 900, 1024, 1280, 1440, 1720, 1980]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1000 });
    await page.goto("/services/");
    const { root, stage } = await stageFor(page);
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const compositionWidth = await root.locator("[data-cinematic-composition]").evaluate((element) => element.getBoundingClientRect().width);
    expect(overflow, `${width}px should not overflow`).toBe(0);
    if (width === 375) expect(await root.evaluate((element) => element.scrollHeight)).toBeLessThanOrEqual(1100);
    if (width === 1980) expect(compositionWidth, "the 1980px stage should not retain the rejected tablet-width cap").toBeGreaterThanOrEqual(1400);
    await chooseDirection(stage, "Освітлення");
    await stage.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
    await expectOneVisibleScene(stage);
  }

  await page.goto("/services/");
  const { stage: axeStage } = await stageFor(page);
  for (const state of ["assembled", "focus", "reassembled"]) {
    if (state === "focus") await chooseDirection(axeStage, "Освітлення");
    if (state === "reassembled") {
      await axeStage.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
    }
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${state} residence spine should pass axe`).toEqual([]);
  }
});
