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
const requiredViewportWidths = Object.freeze([375, 768, 1024, 1440, 1980]);
const meaningfulSnapshotVisibility = 0.5;

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

function activeViewport(page) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(requiredViewportWidths).toContain(viewport.width);
  return viewport;
}

async function snapshotViewportEvidence(page) {
  return page.locator("[data-cinematic-route-snapshot]").evaluate((snapshot) => {
    const bounds = snapshot.getBoundingClientRect();
    const left = Math.max(bounds.left, 0);
    const top = Math.max(bounds.top, 0);
    const right = Math.min(bounds.right, window.innerWidth);
    const bottom = Math.min(bounds.bottom, window.innerHeight);
    const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
    return {
      bounds: {
        height: `${bounds.height}px`, left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`
      },
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      surface: {
        height: snapshot.style.height, left: snapshot.style.left, top: snapshot.style.top, width: snapshot.style.width
      },
      visibilityRatio: bounds.width * bounds.height > 0 ? visibleArea / (bounds.width * bounds.height) : 0
    };
  });
}

async function expectOneInertSnapshot(page, { minimumVisibility = 0 } = {}) {
  const snapshot = page.locator("[data-cinematic-route-snapshot]");
  await expect(snapshot).toHaveCount(1);
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveAttribute("aria-hidden", "true");
  await expect(snapshot.locator("[id], a, button, input, select, textarea, summary")).toHaveCount(0);
  const evidence = await snapshotViewportEvidence(page);
  expect(evidence.visibilityRatio).toBeGreaterThanOrEqual(minimumVisibility);
  expect(evidence.horizontalOverflow).toBe(false);
  return { evidence, snapshot };
}

async function expectedHandoffSurface(page, sourceRef, anchor) {
  const anchorSurface = await anchor.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      height: String(bounds.height) + "px",
      left: String(bounds.left) + "px",
      top: String(bounds.top) + "px",
      width: String(bounds.width) + "px"
    };
  });
  return page.evaluate((sourceId) => {
    const ratio = (bounds) => {
      const left = Math.max(bounds.left, 0);
      const top = Math.max(bounds.top, 0);
      const right = Math.min(bounds.right, window.innerWidth);
      const bottom = Math.min(bounds.bottom, window.innerHeight);
      const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
      return bounds.width * bounds.height > 0 ? visibleArea / (bounds.width * bounds.height) : 0;
    };
    const toSurface = (bounds) => ({
      height: String(bounds.height) + "px",
      left: String(bounds.left) + "px",
      top: String(bounds.top) + "px",
      width: String(bounds.width) + "px"
    });
    const source = [...document.querySelectorAll("[data-cinematic-route-source]")]
      .find((candidate) => candidate.dataset.cinematicRouteSource === sourceId);
    const bounds = source?.getBoundingClientRect();
    return {
      source: bounds && toSurface(bounds),
      sourceVisibility: bounds && ratio(bounds)
    };
  }, sourceRef).then((source) => ({ anchor: anchorSurface, ...source }));
}

async function completeAtOneDestination(page, snapshot, destination) {
  const destinations = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) destinations.push(frame.url());
  });
  await snapshot.dispatchEvent("animationend");
  await expect(page).toHaveURL(destination);
  expect(destinations.filter((href) => href === destination)).toEqual([destination]);
  await expect(page.locator("[data-cinematic-route-snapshot]")).toHaveCount(0);
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

  const sourceAndSnapshot = await page.evaluate(() => {
    const ratio = (bounds) => {
      const left = Math.max(bounds.left, 0);
      const top = Math.max(bounds.top, 0);
      const right = Math.min(bounds.right, window.innerWidth);
      const bottom = Math.min(bounds.bottom, window.innerHeight);
      const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
      return bounds.width * bounds.height > 0 ? visibleArea / (bounds.width * bounds.height) : 0;
    };
    const sourceContainer = document.querySelector('[data-cinematic-route-source="cinematic-stage-home"]');
    const anchor = document.querySelector('.home-hero__actions a[data-cinematic-route][href="/smart-home/"]');
    const source = [...sourceContainer.querySelectorAll("img")].find((image) => image.getBoundingClientRect().width > 0);
    const snapshotImage = document.querySelector("[data-cinematic-route-snapshot] img");
    const snapshotNode = document.querySelector("[data-cinematic-route-snapshot]");
    const sourceBox = sourceContainer?.getBoundingClientRect();
    const anchorBox = anchor?.getBoundingClientRect();
    const imageBox = source?.getBoundingClientRect();
    return {
      anchorBox: anchorBox && {
        left: String(anchorBox.left) + "px", top: String(anchorBox.top) + "px", width: String(anchorBox.width) + "px", height: String(anchorBox.height) + "px"
      },
      source: source?.currentSrc,
      sourceVisibility: sourceBox && ratio(sourceBox),
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
  if (sourceAndSnapshot.sourceVisibility >= meaningfulSnapshotVisibility) {
    await expect(snapshot.locator("img")).toHaveCount(1);
    expect(sourceAndSnapshot.snapshot).toBe(sourceAndSnapshot.source);
    ["left", "top", "width", "height"].forEach((field) => {
      expect(Number.parseFloat(sourceAndSnapshot[field])).toBeCloseTo(Number.parseFloat(sourceAndSnapshot.sourceBox[field]), 2);
    });
    expectGeometryToMatch(sourceAndSnapshot.snapshotImageGeometry, sourceAndSnapshot.imageRelativeGeometry);
    expect(sourceAndSnapshot.snapshotStyle).toEqual(sourceAndSnapshot.sourceStyle);
  } else {
    await expect(snapshot).toHaveClass(/cinematic-route-snapshot--geometry/);
    await expect(snapshot.locator("img")).toHaveCount(0);
    expectGeometryToMatch(
      { left: sourceAndSnapshot.left, top: sourceAndSnapshot.top, width: sourceAndSnapshot.width, height: sourceAndSnapshot.height },
      sourceAndSnapshot.anchorBox
    );
  }

  await expect(new AxeBuilder({ page }).analyze()).resolves.toMatchObject({ violations: [] });
  await snapshot.dispatchEvent("animationend");
  await expect(page).toHaveURL(/\/smart-home\/$/);
});

test("real solutions and smart-home preset-related links keep one inert handoff through its destination", async ({ page }) => {
  await page.goto("/solutions/");
  await expect(page.locator('[data-cinematic-solutions-root][data-cinematic-solutions-enhanced="true"]')).toBeVisible();
  const solutionsSource = page.locator('[data-cinematic-route-source="cinematic-solutions-media"]');
  await expect(solutionsSource).toHaveCount(1);
  await solutionsSource.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-cinematic-route-source="cinematic-solutions-media"] img')]
    .some((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0));
  const solutionLink = page.locator('[data-cinematic-solutions-panel]:not([hidden]) [data-cinematic-solutions-related] a[data-cinematic-route]').first();
  await solutionLink.scrollIntoViewIfNeeded();
  await expect(solutionLink).toBeVisible();
  const solutionDestination = await solutionLink.evaluate((anchor) => anchor.href);
  const solutionSurface = await expectedHandoffSurface(page, "cinematic-solutions-media", solutionLink);
  await holdSnapshot(page);
  await solutionLink.click();
  const solutionHandoff = await expectOneInertSnapshot(page, { minimumVisibility: meaningfulSnapshotVisibility });
  expectGeometryToMatch(
    solutionHandoff.evidence.surface,
    solutionSurface.sourceVisibility >= meaningfulSnapshotVisibility ? solutionSurface.source : solutionSurface.anchor
  );
  if (solutionSurface.sourceVisibility < meaningfulSnapshotVisibility) {
    await expect(solutionHandoff.snapshot).toHaveClass(/cinematic-route-snapshot--geometry/);
    await expect(solutionHandoff.snapshot.locator("img")).toHaveCount(0);
  } else {
    await expect(solutionHandoff.snapshot.locator("img")).toHaveCount(1);
  }
  await completeAtOneDestination(page, solutionHandoff.snapshot, solutionDestination);

  await page.goto("/smart-home/");
  await expect(page.locator('[data-smart-home-simulator][data-enhanced="true"]')).toBeVisible();
  const presetLink = page.locator('[data-preset-panel]:not([hidden]) .smart-home__preset-related a[data-cinematic-route]').first();
  await presetLink.scrollIntoViewIfNeeded();
  await expect(presetLink).toBeVisible();
  const presetDestination = await presetLink.evaluate((anchor) => anchor.href);
  const presetSurface = await expectedHandoffSurface(page, "smart-home-preset-morning", presetLink);
  await holdSnapshot(page);
  await presetLink.click();
  const presetHandoff = await expectOneInertSnapshot(page, { minimumVisibility: meaningfulSnapshotVisibility });
  expectGeometryToMatch(
    presetHandoff.evidence.surface,
    presetSurface.sourceVisibility >= meaningfulSnapshotVisibility ? presetSurface.source : presetSurface.anchor
  );
  await expect(presetHandoff.snapshot).toHaveClass(/cinematic-route-snapshot--geometry/);
  await expect(presetHandoff.snapshot.locator("img")).toHaveCount(0);
  await completeAtOneDestination(page, presetHandoff.snapshot, presetDestination);
});

test("an opted-in anchor with an unloaded selected image stays native without a snapshot", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => {
    const source = document.querySelector('[data-cinematic-route-source="cinematic-stage-home"]');
    const anchor = document.querySelector('.home-hero__actions a[data-cinematic-route][href="/smart-home/"]');
    const images = source ? [...source.querySelectorAll("img")].filter((image) => {
      const bounds = image.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0;
    }) : [];
    const initiallyUsable = images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
    images.forEach((image) => {
      Object.defineProperties(image, {
        complete: { configurable: true, value: false },
        naturalHeight: { configurable: true, value: 0 },
        naturalWidth: { configurable: true, value: 0 }
      });
    });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    anchor?.dispatchEvent(event);
    return {
      initiallyUsable,
      prevented: event.defaultPrevented,
      snapshotCount: document.querySelectorAll("[data-cinematic-route-snapshot]").length
    };
  });

  expect(result.initiallyUsable).toBe(true);
  expect(result.prevented).toBe(false);
  expect(result.snapshotCount).toBe(0);
  await expect(page).toHaveURL(/\/$/);
});

test("a visible source leaves an offscreen activated anchor native without a snapshot", async ({ page }) => {
  activeViewport(page);
  await page.goto("/");
  await page.waitForFunction(() => [...document.querySelectorAll('[data-cinematic-route-source="cinematic-stage-home"] img')]
    .some((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0));

  const result = await page.evaluate(() => {
    const ratio = (bounds) => {
      const left = Math.max(bounds.left, 0);
      const top = Math.max(bounds.top, 0);
      const right = Math.min(bounds.right, window.innerWidth);
      const bottom = Math.min(bounds.bottom, window.innerHeight);
      const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
      return bounds.width * bounds.height > 0 ? visibleArea / (bounds.width * bounds.height) : 0;
    };
    const source = document.querySelector('[data-cinematic-route-source="cinematic-stage-home"]');
    const anchor = document.querySelector('.home-hero__actions a[data-cinematic-route][href="/smart-home/"]');
    const image = source && [...source.querySelectorAll("img")].find((candidate) => {
      const bounds = candidate.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && candidate.complete && candidate.naturalWidth > 0 && candidate.naturalHeight > 0;
    });
    if (!source || !anchor || !image) return null;

    Object.assign(source.style, {
      height: "160px",
      left: "20px",
      position: "fixed",
      top: "20px",
      width: "240px",
      zIndex: "1"
    });
    Object.assign(anchor.style, {
      left: "20px",
      position: "fixed",
      top: "-120px"
    });

    const sourceVisibility = ratio(source.getBoundingClientRect());
    const anchorVisibility = ratio(anchor.getBoundingClientRect());
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);
    return {
      anchorVisibility,
      imageSnapshotCount: document.querySelectorAll("[data-cinematic-route-snapshot] img").length,
      prevented: event.defaultPrevented,
      snapshotCount: document.querySelectorAll("[data-cinematic-route-snapshot]").length,
      sourceVisibility
    };
  });

  expect(result).not.toBeNull();
  expect(result.sourceVisibility).toBe(1);
  expect(result.anchorVisibility).toBeLessThan(meaningfulSnapshotVisibility);
  expect(result.prevented).toBe(false);
  expect(result.snapshotCount).toBe(0);
  expect(result.imageSnapshotCount).toBe(0);
  await expect(page).toHaveURL(/\/$/);
});

test("service related handoffs replace an offscreen hero with a visible bounded anchor surface", async ({ page }) => {
  activeViewport(page);
  await page.goto("/services/electrical-installation/");
  const link = page.locator(".service-detail__related-link").first();
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  const before = await page.evaluate(() => {
    const ratio = (bounds) => {
      const left = Math.max(bounds.left, 0);
      const top = Math.max(bounds.top, 0);
      const right = Math.min(bounds.right, window.innerWidth);
      const bottom = Math.min(bounds.bottom, window.innerHeight);
      const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
      return bounds.width * bounds.height > 0 ? visibleArea / (bounds.width * bounds.height) : 0;
    };
    const source = document.querySelector('[data-cinematic-route-source="service-detail-hero"]')?.getBoundingClientRect();
    const anchor = document.querySelector(".service-detail__related-link")?.getBoundingClientRect();
    return {
      anchor: anchor && { height: `${anchor.height}px`, left: `${anchor.left}px`, top: `${anchor.top}px`, width: `${anchor.width}px` },
      sourceVisibility: source && ratio(source)
    };
  });
  expect(before.sourceVisibility).toBe(0);
  const destination = await link.evaluate((anchor) => anchor.href);
  await holdSnapshot(page);
  await link.click();
  const handoff = await expectOneInertSnapshot(page, { minimumVisibility: meaningfulSnapshotVisibility });
  await expect(handoff.snapshot).toHaveClass(/cinematic-route-snapshot--geometry/);
  await expect(handoff.snapshot.locator("img")).toHaveCount(0);
  expectGeometryToMatch(handoff.evidence.surface, before.anchor);
  await completeAtOneDestination(page, handoff.snapshot, destination);
});

test("home hero handoffs retain a meaningful visible surface at every required width", async ({ page }) => {
  const viewport = activeViewport(page);
  await page.goto("/");
  const link = page.locator('.home-hero__actions a[data-cinematic-route][href="/smart-home/"]');
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  const before = await page.evaluate(() => {
    const ratio = (bounds) => {
      const left = Math.max(bounds.left, 0);
      const top = Math.max(bounds.top, 0);
      const right = Math.min(bounds.right, window.innerWidth);
      const bottom = Math.min(bounds.bottom, window.innerHeight);
      const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
      return bounds.width * bounds.height > 0 ? visibleArea / (bounds.width * bounds.height) : 0;
    };
    const source = document.querySelector('[data-cinematic-route-source="cinematic-stage-home"]')?.getBoundingClientRect();
    const anchor = document.querySelector('.home-hero__actions a[data-cinematic-route][href="/smart-home/"]')?.getBoundingClientRect();
    return {
      anchor: anchor && { height: `${anchor.height}px`, left: `${anchor.left}px`, top: `${anchor.top}px`, width: `${anchor.width}px` },
      sourceVisibility: source && ratio(source)
    };
  });
  const requiresAnchorFallback = [375, 1024].includes(viewport.width);
  if (requiresAnchorFallback) expect(before.sourceVisibility).toBeLessThan(meaningfulSnapshotVisibility);
  else expect(before.sourceVisibility).toBeGreaterThanOrEqual(meaningfulSnapshotVisibility);

  const destination = await link.evaluate((anchor) => anchor.href);
  await holdSnapshot(page);
  await link.click();
  const handoff = await expectOneInertSnapshot(page, { minimumVisibility: meaningfulSnapshotVisibility });
  if (requiresAnchorFallback) {
    await expect(handoff.snapshot).toHaveClass(/cinematic-route-snapshot--geometry/);
    await expect(handoff.snapshot.locator("img")).toHaveCount(0);
    expectGeometryToMatch(handoff.evidence.surface, before.anchor);
  }
  await completeAtOneDestination(page, handoff.snapshot, destination);
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
    const ratio = (bounds) => {
      const left = Math.max(bounds.left, 0);
      const top = Math.max(bounds.top, 0);
      const right = Math.min(bounds.right, window.innerWidth);
      const bottom = Math.min(bounds.bottom, window.innerHeight);
      const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
      return bounds.width * bounds.height > 0 ? visibleArea / (bounds.width * bounds.height) : 0;
    };
    const surfaceBox = ratio(sourceBox) >= 0.5 ? sourceBox : anchorBox;
    const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
    return {
      x: clamp((anchorBox.left + anchorBox.width / 2) - (surfaceBox.left + surfaceBox.width / 2), 72),
      y: clamp((anchorBox.top + anchorBox.height / 2) - (surfaceBox.top + surfaceBox.height / 2), 54)
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
    await expect(page.locator('[data-cinematic-root][data-cinematic-enhanced="true"]')).toHaveAttribute("data-cinematic-motion-phase", "idle");

    const link = state === "focus"
      ? page.locator('[data-cinematic-focus-destination="lighting"]')
      : page.locator("[data-cinematic-reassembled-destination]:visible").first();
    await expect(link).toBeVisible();
    await link.scrollIntoViewIfNeeded();
    const destination = await link.evaluate((anchor) => anchor.href);
    const anchorGeometry = await link.evaluate((anchor) => {
      const bounds = anchor.getBoundingClientRect();
      return {
        left: String(bounds.left) + "px",
        top: String(bounds.top) + "px",
        width: String(bounds.width) + "px",
        height: String(bounds.height) + "px"
      };
    });
    const sourceFidelity = await page.evaluate(() => {
      const sourceContainer = document.querySelector('[data-cinematic-route-source="cinematic-stage-services"]');
      const source = [...sourceContainer.querySelectorAll("img")]
        .find((image) => image.getBoundingClientRect().width > 0);
      const sourceBox = sourceContainer?.getBoundingClientRect();
      const imageBox = source?.getBoundingClientRect();
      const ratio = (bounds) => {
        const left = Math.max(bounds.left, 0);
        const top = Math.max(bounds.top, 0);
        const right = Math.min(bounds.right, window.innerWidth);
        const bottom = Math.min(bounds.bottom, window.innerHeight);
        const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
        return bounds.width * bounds.height > 0 ? visibleArea / (bounds.width * bounds.height) : 0;
      };
      const styles = (element) => ({
        currentSrc: element?.currentSrc || element?.src,
        objectFit: element && getComputedStyle(element).objectFit,
        objectPosition: element && getComputedStyle(element).objectPosition,
        transformOrigin: element && getComputedStyle(element).transformOrigin,
        filter: element && getComputedStyle(element).filter
      });
      return {
        sourceVisibility: sourceBox && ratio(sourceBox),
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
        geometryFallback: snapshotNode?.classList.contains("cinematic-route-snapshot--geometry") || false,
        imageCount: snapshotNode?.querySelectorAll("img").length || 0,
        snapshot: styles(snapshot),
        snapshotBox: snapshotNode && { left: snapshotNode.style.left, top: snapshotNode.style.top, width: snapshotNode.style.width, height: snapshotNode.style.height },
        snapshotImage: snapshot && { left: snapshot.style.left, top: snapshot.style.top, width: snapshot.style.width, height: snapshot.style.height }
      };
    });
    if (sourceFidelity.sourceVisibility >= meaningfulSnapshotVisibility) {
      expect(snapshotFidelity.imageCount).toBe(1);
      expect(snapshotFidelity.snapshot).toEqual(sourceFidelity.source);
      expectGeometryToMatch(snapshotFidelity.snapshotBox, sourceFidelity.sourceBox);
      expectGeometryToMatch(snapshotFidelity.snapshotImage, sourceFidelity.imageRelative);
    } else {
      expect(snapshotFidelity.geometryFallback).toBe(true);
      expect(snapshotFidelity.imageCount).toBe(0);
      expectGeometryToMatch(snapshotFidelity.snapshotBox, anchorGeometry);
    }

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
