import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/services/",
  "/services/electrical-installation/",
  "/solutions/",
  "/solutions/private-house-full-automation/",
  "/smart-home/",
  "/process/",
  "/about/",
  "/contact/",
  "/privacy/"
];

async function holdSnapshot(page) {
  await page.addStyleTag({
    content: "[data-cinematic-route-snapshot] { animation-duration: 60s !important; }"
  });
}

test("an opted-in primary navigation creates one inert source snapshot and assigns location once", async ({ page }) => {
  await page.goto("/");
  await holdSnapshot(page);

  const link = page.locator('.home-hero a[data-cinematic-route][href="/smart-home/"]');
  await expect(link).toBeVisible();
  await link.click();

  const snapshot = page.locator("[data-cinematic-route-snapshot]");
  await expect(snapshot).toHaveCount(1);
  await expect(snapshot).toHaveAttribute("aria-hidden", "true");
  await expect(snapshot.locator("[id], a, button, input, select, textarea, summary")).toHaveCount(0);
  await expect(snapshot.locator("img")).toHaveCount(1);

  const sourceAndSnapshot = await page.evaluate(() => {
    const source = document.querySelector('[data-cinematic-route-source="home-hero"] img');
    const snapshotImage = document.querySelector("[data-cinematic-route-snapshot] img");
    const snapshotNode = document.querySelector("[data-cinematic-route-snapshot]");
    const sourceBox = source?.getBoundingClientRect();
    return {
      source: source?.currentSrc,
      snapshot: snapshotImage?.src,
      left: snapshotNode?.style.left,
      top: snapshotNode?.style.top,
      width: snapshotNode?.style.width,
      height: snapshotNode?.style.height,
      sourceBox: sourceBox && {
        left: `${sourceBox.left}px`, top: `${sourceBox.top}px`, width: `${sourceBox.width}px`, height: `${sourceBox.height}px`
      }
    };
  });
  expect(sourceAndSnapshot.snapshot).toBe(sourceAndSnapshot.source);
  expect(sourceAndSnapshot.left).toBe(sourceAndSnapshot.sourceBox.left);
  expect(sourceAndSnapshot.top).toBe(sourceAndSnapshot.sourceBox.top);
  expect(sourceAndSnapshot.width).toBe(sourceAndSnapshot.sourceBox.width);
  expect(sourceAndSnapshot.height).toBe(sourceAndSnapshot.sourceBox.height);

  await expect(new AxeBuilder({ page }).analyze()).resolves.toMatchObject({ violations: [] });
  await snapshot.dispatchEvent("animationend");
  await expect(page).toHaveURL(/\/smart-home\/$/);
});

test("unqualified and malformed anchors remain native without a snapshot", async ({ page }) => {
  await page.goto("/");

  const results = await page.evaluate(() => {
    const scenarios = [
      { href: "#main-content", source: "home-hero" },
      { href: "/services/", source: "missing-source" },
      { href: "/services/", source: "home-hero", target: "_blank" }
    ];
    return scenarios.map((scenario) => {
      const anchor = document.createElement("a");
      anchor.href = scenario.href;
      anchor.dataset.cinematicRoute = "";
      anchor.dataset.cinematicRouteSourceRef = scenario.source;
      if (scenario.target) anchor.target = scenario.target;
      document.body.append(anchor);
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      anchor.dispatchEvent(event);
      anchor.remove();
      return event.defaultPrevented;
    });
  });

  expect(results).toEqual([false, false, false]);
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(0);
});

test("reduced-motion users receive native navigation without an outgoing snapshot", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.locator('.home-hero a[data-cinematic-route][href="/smart-home/"]').click();
  await expect(page).toHaveURL(/\/smart-home\/$/);
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(0);
});

test("normal semantic navigation remains available with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  await page.locator('.home-hero a[href="/smart-home/"]').click();
  await expect(page).toHaveURL(/\/smart-home\/$/);
  await context.close();
});

test("all rendered public routes remove inert CTA and availability chrome", async ({ page }) => {
  for (const route of publicRoutes) {
    await page.goto(route);
    await expect(page.locator("button[disabled], [aria-disabled=\"true\"], [role=status]")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/(?:онлайн|офлайн|доступн(?:ий|а|і)|портал|акаунт)/i);
  }
});

test("back and forward stay native and preserve the current section marker", async ({ page }) => {
  await page.goto("/services/");
  await page.locator('.desktop-nav a[data-cinematic-route][href="/solutions/"]').click();
  await page.locator("[data-cinematic-route-snapshot]").dispatchEvent("animationend");
  await expect(page).toHaveURL(/\/solutions\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/services\/$/);
  await expect(page.locator('.desktop-nav a[href="/services/"]')).toHaveAttribute("aria-current", "page");
});
