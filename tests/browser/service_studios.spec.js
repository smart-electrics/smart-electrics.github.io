import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const studios = [
  {
    route: "/services/electrical-design/",
    controls: ["План", "Групи й навантаження", "Рішення для щита"],
    direction: "electrical-design",
    related: [
      ["/services/electrical-installation/", "/services/panels-and-protection/", "/services/lighting/"],
      ["/services/electrical-installation/", "/services/panels-and-protection/"],
      ["/services/panels-and-protection/", "/services/electrical-installation/", "/services/backup-power/"]
    ]
  },
  {
    route: "/services/electrical-installation/",
    controls: ["Траси й точки", "Підключення", "Розподіл"],
    direction: "electrical-installation",
    related: [
      ["/services/electrical-design/", "/services/panels-and-protection/", "/services/lighting/", "/services/low-voltage/"],
      ["/services/electrical-design/", "/services/panels-and-protection/"],
      ["/services/panels-and-protection/", "/services/electrical-installation/", "/services/backup-power/"]
    ]
  },
  {
    route: "/services/panels-and-protection/",
    controls: ["Ввід", "Захист", "Розподіл і пріоритети"],
    direction: "panels-and-protection",
    related: [
      ["/services/electrical-design/", "/services/electrical-installation/", "/services/backup-power/", "/services/smart-home-integration/"],
      ["/services/electrical-design/", "/services/electrical-installation/"],
      ["/services/panels-and-protection/", "/services/electrical-installation/", "/services/backup-power/"]
    ]
  }
];

async function studioFor(page) {
  const root = page.locator("[data-service-studio-root]");
  await expect(root).toHaveAttribute("data-service-studio-enhanced", "true");
  return { root, stage: root.locator("[data-service-studio-stage]") };
}

test("the three service studios retain their complete semantic reading order without JavaScript", async ({ page }) => {
  await page.route("**/assets/js/service-studio.js", (route) => route.abort());

  for (const studio of studios) {
    await page.goto(studio.route);
    const root = page.locator("[data-service-studio-root]");
    const fallback = root.locator("[data-service-studio-fallback]");
    await expect(fallback).toBeVisible();
    await expect(root.locator("[data-service-studio-stage]")).toBeHidden();
    await expect(fallback.getByRole("link")).not.toHaveCount(0);
    await expect(fallback.getByText(studio.controls[0], { exact: true })).toBeVisible();
    await expect(fallback.getByText(studio.controls[1], { exact: true })).toBeVisible();
    await expect(fallback.getByText(studio.controls[2], { exact: true })).toBeVisible();
  }
});

test("each studio rail changes the canonical state, explanation, scene and exact related links", async ({ page }) => {
  for (const studio of studios) {
    await page.goto(studio.route);
    const { root, stage } = await studioFor(page);

    for (const [index, label] of studio.controls.entries()) {
      await stage.getByRole("button", { name: label, exact: true }).click();
      await expect(root).toHaveAttribute("data-service-studio-state", ["assembled", "focus", "reassembled"][index]);
      await expect(stage.locator("[data-service-studio-scene]:visible")).toHaveCount(1);
      await expect(stage.locator("[data-service-studio-panel]:visible")).toHaveCount(1);
      await expect(stage.locator("[data-service-studio-panel]:visible [data-service-studio-summary]")).not.toHaveText("");
      const relatedLinks = stage.locator("[data-service-studio-panel]:visible [data-service-studio-related] a");
      await expect(relatedLinks).toHaveCount(studio.related[index].length);
      expect(await relatedLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(studio.related[index]);
      await expect(stage.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    }

    await expect(root).toHaveAttribute("data-service-studio-direction", "panels-and-protection");
    await expect(root).toHaveAttribute("data-service-studio-relation", "panels-and-protection--panel-assembly");
  }
});

test("keyboard and touch operate the same studio states", async ({ page, browser }) => {
  const studio = studios[0];
  await page.goto(studio.route);
  const { root, stage } = await studioFor(page);
  const keyboardControl = stage.getByRole("button", { name: studio.controls[1], exact: true });
  await keyboardControl.focus();
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-service-studio-state", "focus");

  const touchContext = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 812 } });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(new URL(studio.route, page.url()).href);
  const touchRoot = touchPage.locator("[data-service-studio-root]");
  await touchRoot.locator("[data-service-studio-stage]").getByRole("button", { name: studio.controls[2], exact: true }).tap();
  await expect(touchRoot).toHaveAttribute("data-service-studio-state", "reassembled");
  await touchContext.close();
});

test("outgoing snapshots animate and rapid rail changes clean up to one settled scene and panel", async ({ page }) => {
  await page.goto(studios[1].route);
  const { root, stage } = await studioFor(page);
  await page.addStyleTag({ content: "[data-service-studio-outgoing-snapshot][data-service-studio-snapshot-active] { animation-duration: 10s !important; }" });
  const snapshot = stage.locator("[data-service-studio-outgoing-snapshot]");
  await stage.getByRole("button", { name: "Підключення", exact: true }).click();
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveAttribute("data-service-studio-snapshot-active", "true");
  await expect(snapshot).toHaveCSS("animation-name", "service-studio-outgoing");
  await stage.getByRole("button", { name: "Траси й точки", exact: true }).click();
  await stage.getByRole("button", { name: "Розподіл", exact: true }).click();

  await expect(root).toHaveAttribute("data-service-studio-state", "reassembled");
  await expect(stage.locator("[data-service-studio-scene]:visible")).toHaveCount(1);
  await expect(stage.locator("[data-service-studio-panel]:visible")).toHaveCount(1);
  await expect(snapshot).toBeVisible();
  await snapshot.dispatchEvent("animationcancel");
  await expect(snapshot).toBeHidden();
  await expect(root).not.toHaveAttribute("data-service-studio-transition");
});

test("service studios are still, accessible and overflow-free at the required widths", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [375, 414, 768, 900, 1024, 1280, 1440, 1720, 1980]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1000 });
    await page.goto(studios[1].route);
    const { stage } = await studioFor(page);
    await stage.getByRole("button", { name: "Розподіл", exact: true }).click();
    await expect(stage.locator("[data-service-studio-outgoing-snapshot]")).toBeHidden();
    expect(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))).toBe(0);
    expect(await stage.locator("*").evaluateAll((elements) => elements.filter((element) => {
      const style = getComputedStyle(element);
      return [style.animationDuration, style.transitionDuration].some((value) => value.split(",").some((duration) => Number.parseFloat(duration) > 0));
    }).length)).toBe(0);
  }

  await page.goto(studios[2].route);
  const { stage } = await studioFor(page);
  for (const label of studios[2].controls) {
    await stage.getByRole("button", { name: label, exact: true }).click();
    expect((await new AxeBuilder({ page }).include("[data-service-studio-stage]").analyze()).violations).toEqual([]);
  }
});
