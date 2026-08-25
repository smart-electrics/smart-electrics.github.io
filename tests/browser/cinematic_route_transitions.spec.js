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
  await page.evaluate(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, delay === 420 ? 60_000 : delay, ...args);
  });
}

async function visiblePrimaryNavigation(page) {
  const desktop = page.getByRole("navigation", { name: "Основна навігація" });
  if (await desktop.isVisible()) return desktop;
  const mobileMenu = page.locator(".mobile-nav");
  if (!(await mobileMenu.evaluate((menu) => menu.open))) await mobileMenu.locator("summary").click();
  return page.getByRole("navigation", { name: "Мобільна навігація" });
}

function expectGeometryToMatch(actual, expected) {
  expect(Object.keys(actual)).toEqual(Object.keys(expected));
  Object.keys(expected).forEach((field) => {
    expect(Math.abs(Number.parseFloat(actual[field]) - Number.parseFloat(expected[field]))).toBeLessThanOrEqual(0.01);
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
    const sourceContainer = document.querySelector('[data-cinematic-route-source="cinematic-stage-home"]');
    const source = [...sourceContainer.querySelectorAll("img")].find((image) => image.getBoundingClientRect().width > 0);
    const snapshotImage = document.querySelector("[data-cinematic-route-snapshot] img");
    const snapshotNode = document.querySelector("[data-cinematic-route-snapshot]");
    const sourceBox = sourceContainer?.getBoundingClientRect();
    const imageBox = source?.getBoundingClientRect();
    return {
      source: source?.currentSrc,
      snapshot: snapshotImage?.src,
      left: snapshotNode?.style.left,
      top: snapshotNode?.style.top,
      width: snapshotNode?.style.width,
      height: snapshotNode?.style.height,
      sourceBox: sourceBox && {
        left: `${sourceBox.left}px`, top: `${sourceBox.top}px`, width: `${sourceBox.width}px`, height: `${sourceBox.height}px`
      },
      imageRelativeGeometry: sourceBox && imageBox && {
        left: `${imageBox.left - sourceBox.left}px`, top: `${imageBox.top - sourceBox.top}px`, width: `${imageBox.width}px`, height: `${imageBox.height}px`
      },
      snapshotImageGeometry: snapshotImage && {
        left: snapshotImage.style.left, top: snapshotImage.style.top, width: snapshotImage.style.width, height: snapshotImage.style.height
      },
      sourceStyle: source && {
        objectFit: getComputedStyle(source).objectFit,
        objectPosition: getComputedStyle(source).objectPosition,
        transformOrigin: getComputedStyle(source).transformOrigin,
        filter: getComputedStyle(source).filter
      },
      snapshotStyle: snapshotImage && {
        objectFit: getComputedStyle(snapshotImage).objectFit,
        objectPosition: getComputedStyle(snapshotImage).objectPosition,
        transformOrigin: getComputedStyle(snapshotImage).transformOrigin,
        filter: getComputedStyle(snapshotImage).filter
      }
    };
  });
  expect(sourceAndSnapshot.snapshot).toBe(sourceAndSnapshot.source);
  ["left", "top", "width", "height"].forEach((field) => {
    expect(Number.parseFloat(sourceAndSnapshot[field])).toBeCloseTo(Number.parseFloat(sourceAndSnapshot.sourceBox[field]), 2);
  });
  expectGeometryToMatch(sourceAndSnapshot.snapshotImageGeometry, sourceAndSnapshot.imageRelativeGeometry);
  expect(sourceAndSnapshot.snapshotStyle).toEqual(sourceAndSnapshot.sourceStyle);

  await expect(new AxeBuilder({ page }).analyze()).resolves.toMatchObject({ violations: [] });
  await snapshot.dispatchEvent("animationend");
  await expect(page).toHaveURL(/\/smart-home\/$/);
});

test("each activated anchor gives the bounded snapshot a causal direction on desktop and mobile", async ({ page }) => {
  await page.goto("/");
  await holdSnapshot(page);

  const link = page.locator('.home-hero a[data-cinematic-route][href="/smart-home/"]');
  await expect(link).toBeVisible();
  const expected = await link.evaluate((anchor) => {
    const source = document.querySelector('[data-cinematic-route-source="cinematic-stage-home"]');
    const sourceBox = source?.getBoundingClientRect();
    const anchorBox = anchor.getBoundingClientRect();
    const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
    return {
      x: clamp((anchorBox.left + anchorBox.width / 2) - (sourceBox.left + sourceBox.width / 2), 72),
      y: clamp((anchorBox.top + anchorBox.height / 2) - (sourceBox.top + sourceBox.height / 2), 54)
    };
  });

  await link.click();
  const vector = await page.locator("[data-cinematic-route-snapshot]").evaluate((snapshot) => ({
    x: Number.parseFloat(snapshot.style.getPropertyValue("--cinematic-route-vector-x")),
    y: Number.parseFloat(snapshot.style.getPropertyValue("--cinematic-route-vector-y")),
    midX: Number.parseFloat(snapshot.style.getPropertyValue("--cinematic-route-vector-mid-x")),
    midY: Number.parseFloat(snapshot.style.getPropertyValue("--cinematic-route-vector-mid-y"))
  }));

  expect(Math.abs(vector.x)).toBeLessThanOrEqual(72);
  expect(Math.abs(vector.y)).toBeLessThanOrEqual(54);
  expect(vector.x).toBeCloseTo(expected.x, 2);
  expect(vector.y).toBeCloseTo(expected.y, 2);
  expect(vector.midX).toBeCloseTo(vector.x * 0.48, 2);
  expect(vector.midY).toBeCloseTo(vector.y * 0.48, 2);
});

test("a replacement click clears the active handoff and only navigates to its final destination", async ({ page }) => {
  await page.goto("/");
  await holdSnapshot(page);
  const destinations = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) destinations.push(frame.url());
  });

  await page.locator('.home-hero a[data-cinematic-route][href="/smart-home/"]').click();
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(1);

  await page.locator('.audience-card[data-cinematic-route][href="/services/"]').click();
  const snapshot = page.locator("[data-cinematic-route-snapshot]");
  await expect(snapshot).toHaveCount(1);
  await expect(snapshot).toHaveClass(/cinematic-route-snapshot--geometry/);

  await snapshot.dispatchEvent("animationend");
  await expect(page).toHaveURL(/\/services\/$/);
  expect(destinations.filter((href) => /\/(?:smart-home|services)\/$/.test(href))).toEqual([
    expect.stringMatching(/\/services\/$/)
  ]);
});

test("an animation cancellation wins the timeout race and assigns its destination once", async ({ page }) => {
  await page.goto("/");
  await page.addStyleTag({ content: "[data-cinematic-route-snapshot] { animation-duration: 60s !important; }" });
  const destinations = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) destinations.push(frame.url());
  });

  await page.locator('.home-hero a[data-cinematic-route][href="/smart-home/"]').click();
  const snapshot = page.locator("[data-cinematic-route-snapshot]");
  await expect(snapshot).toHaveCount(1);
  await snapshot.dispatchEvent("animationcancel");
  await expect(page).toHaveURL(/\/smart-home\/$/);
  await page.waitForTimeout(500);
  expect(destinations.filter((href) => /\/smart-home\/$/.test(href))).toEqual([
    expect.stringMatching(/\/smart-home\/$/)
  ]);
});

test("native back during a held handoff remains native after pagehide and animation cancellation", async ({ page }) => {
  await page.goto("/services/");
  await page.goto("/");
  await holdSnapshot(page);

  await page.locator('.home-hero a[data-cinematic-route][href="/smart-home/"]').click();
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(1);

  await page.goBack();
  await expect(page).toHaveURL(/\/services\/$/);
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/services\/$/);
});

test("pagehide clears a held snapshot without assigning its old destination", async ({ page }) => {
  await page.goto("/");
  await holdSnapshot(page);
  await page.locator('.home-hero a[data-cinematic-route][href="/smart-home/"]').click();
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(1);

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/$/);
});

test("visibility cleanup completes the active handoff once without leaving a snapshot", async ({ page }) => {
  await page.goto("/");
  await holdSnapshot(page);
  const destinations = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) destinations.push(frame.url());
  });

  await page.locator('.home-hero a[data-cinematic-route][href="/smart-home/"]').click();
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page).toHaveURL(/\/smart-home\/$/);
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(0);
  expect(destinations.filter((href) => /\/smart-home\/$/.test(href))).toEqual([
    expect.stringMatching(/\/smart-home\/$/)
  ]);
});

test("a dynamic reduced-motion preference completes the held handoff once and cleans up", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await holdSnapshot(page);
  const destinations = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) destinations.push(frame.url());
  });

  await page.locator('.home-hero a[data-cinematic-route][href="/smart-home/"]').click();
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page).toHaveURL(/\/smart-home\/$/);
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(0);
  expect(destinations.filter((href) => /\/smart-home\/$/.test(href))).toEqual([
    expect.stringMatching(/\/smart-home\/$/)
  ]);
});

test("unqualified and malformed anchors remain native without a snapshot", async ({ page }) => {
  await page.goto("/");

  const results = await page.evaluate(() => {
    const source = document.querySelectorAll('[data-cinematic-route-source="cinematic-stage-home"]');
    const scenarios = [
      { href: "#main-content", source: "cinematic-stage-home" },
      { href: "/services/", source: "missing-source" },
      { href: "/services/", source: "cinematic-stage-home", target: "_blank" },
      { href: "/services/", source: "cinematic-stage-home", target: "_self" },
      { href: "/services/", source: "cinematic-stage-home", target: "" }
    ];
    return { sourceCount: source.length, results: scenarios.map((scenario) => {
      const anchor = document.createElement("a");
      anchor.href = scenario.href;
      anchor.dataset.cinematicRoute = "";
      anchor.dataset.cinematicRouteSourceRef = scenario.source;
      if ("target" in scenario) anchor.setAttribute("target", scenario.target);
      document.body.append(anchor);
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      anchor.dispatchEvent(event);
      anchor.remove();
      return event.defaultPrevented;
    }) };
  });

  expect(results.sourceCount).toBe(1);
  expect(results.results).toEqual([false, false, false, false, false]);
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(0);
});

test("a downstream utility handler can cancel an opted-in anchor without a route handoff", async ({ page }) => {
  await page.goto("/");

  const prevented = await page.evaluate(() => {
    const anchor = document.createElement("a");
    anchor.href = "/services/";
    anchor.dataset.cinematicRoute = "";
    anchor.dataset.cinematicRouteSourceRef = "cinematic-stage-home";
    anchor.addEventListener("click", (event) => event.preventDefault());
    document.body.append(anchor);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);
    anchor.remove();
    return event.defaultPrevented;
  });

  expect(prevented).toBe(true);
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("Enter preserves semantic keyboard navigation through one bounded handoff", async ({ page }) => {
  await page.goto("/");
  await holdSnapshot(page);
  const link = page.locator('.home-hero a[data-cinematic-route][href="/smart-home/"]');
  await link.focus();
  await page.keyboard.press("Enter");
  const snapshot = page.locator("[data-cinematic-route-snapshot]");
  await expect(snapshot).toHaveCount(1);
  await snapshot.dispatchEvent("animationend");
  await expect(page).toHaveURL(/\/smart-home\/$/);
});

test("a mobile touch tap preserves semantic navigation through one bounded handoff", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto(`${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4000"}/`);
  await holdSnapshot(page);
  const link = page.locator('.home-hero a[data-cinematic-route][href="/smart-home/"]');
  await link.tap();
  const snapshot = page.locator("[data-cinematic-route-snapshot]");
  await expect(snapshot).toHaveCount(1);
  await snapshot.dispatchEvent("animationend");
  await expect(page).toHaveURL(/\/smart-home\/$/);
  await context.close();
});

test("focus and reassembled handoffs preserve the visible scene crop", async ({ page }) => {
  for (const state of ["focus", "reassembled"]) {
    await page.goto("/services/");
    await holdSnapshot(page);
    await page.getByRole("button", { name: "Освітлення", exact: true }).click();
    if (state === "reassembled") {
      await page.locator('[data-cinematic-relation-switcher="lighting"] button').first().click();
    }
    await page.waitForTimeout(850);

    const link = state === "focus"
      ? page.locator('[data-cinematic-focus-destination="lighting"]')
      : page.locator("[data-cinematic-reassembled-destination]:visible").first();
    await expect(link).toBeVisible();
    await link.scrollIntoViewIfNeeded();
    const destination = await link.evaluate((anchor) => anchor.href);
    const sourceFidelity = await page.evaluate(() => {
      const sourceContainer = document.querySelector('[data-cinematic-route-source="cinematic-stage-services"]');
      const source = [...sourceContainer.querySelectorAll("img")]
        .find((image) => image.getBoundingClientRect().width > 0);
      const sourceBox = sourceContainer?.getBoundingClientRect();
      const imageBox = source?.getBoundingClientRect();
      const styles = (element) => ({
        currentSrc: element?.currentSrc || element?.src,
        objectFit: element && getComputedStyle(element).objectFit,
        objectPosition: element && getComputedStyle(element).objectPosition,
        transformOrigin: element && getComputedStyle(element).transformOrigin,
        filter: element && getComputedStyle(element).filter
      });
      return {
        source: styles(source),
        sourceBox: sourceBox && { left: `${sourceBox.left}px`, top: `${sourceBox.top}px`, width: `${sourceBox.width}px`, height: `${sourceBox.height}px` },
        imageRelative: sourceBox && imageBox && { left: `${imageBox.left - sourceBox.left}px`, top: `${imageBox.top - sourceBox.top}px`, width: `${imageBox.width}px`, height: `${imageBox.height}px` }
      };
    });
    await link.evaluate((anchor) => anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, cancelable: true })));

    const snapshotFidelity = await page.evaluate(() => {
      const snapshotNode = document.querySelector("[data-cinematic-route-snapshot]");
      const snapshot = snapshotNode?.querySelector("img");
      const styles = (element) => ({
        currentSrc: element?.currentSrc || element?.src,
        objectFit: element && getComputedStyle(element).objectFit,
        objectPosition: element && getComputedStyle(element).objectPosition,
        transformOrigin: element && getComputedStyle(element).transformOrigin,
        filter: element && getComputedStyle(element).filter
      });
      return {
        snapshot: styles(snapshot),
        snapshotBox: snapshotNode && { left: snapshotNode.style.left, top: snapshotNode.style.top, width: snapshotNode.style.width, height: snapshotNode.style.height },
        snapshotImage: snapshot && { left: snapshot.style.left, top: snapshot.style.top, width: snapshot.style.width, height: snapshot.style.height }
      };
    });
    expect(snapshotFidelity.snapshot).toEqual(sourceFidelity.source);
    expectGeometryToMatch(snapshotFidelity.snapshotBox, sourceFidelity.sourceBox);
    expectGeometryToMatch(snapshotFidelity.snapshotImage, sourceFidelity.imageRelative);

    await page.locator("[data-cinematic-route-snapshot]").dispatchEvent("animationend");
    await expect(page).toHaveURL(destination);
  }
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
    await expect(page.locator("body")).not.toContainText(/(?:онлайн|офлайн|портал|акаунт)/i);
  }
});

test("back and forward stay native and preserve the current section marker", async ({ page }) => {
  await page.goto("/services/");
  await holdSnapshot(page);
  const navigation = await visiblePrimaryNavigation(page);
  await navigation.getByRole("link", { name: "Готові рішення", exact: true }).click();
  await page.locator("[data-cinematic-route-snapshot]").dispatchEvent("animationend");
  await expect(page).toHaveURL(/\/solutions\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/services\/$/);
  const backNavigation = await visiblePrimaryNavigation(page);
  await expect(backNavigation.getByRole("link", { name: "Послуги", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(page).toHaveURL(/\/solutions\/$/);
  const forwardNavigation = await visiblePrimaryNavigation(page);
  await expect(forwardNavigation.getByRole("link", { name: "Готові рішення", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(0);
});
