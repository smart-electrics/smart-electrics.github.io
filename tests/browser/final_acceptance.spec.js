import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4000";
const evidenceDirectory = resolve(process.cwd(), "artifacts", "final-evidence");
const publicRoutes = Object.freeze([
  "/",
  "/services/",
  "/services/electrical-design/",
  "/services/electrical-installation/",
  "/services/panels-and-protection/",
  "/services/lighting/",
  "/services/low-voltage/",
  "/services/backup-power/",
  "/services/smart-home-integration/",
  "/services/diagnostics-and-service/",
  "/solutions/",
  "/solutions/apartment-comfort-and-control/",
  "/solutions/private-house-full-automation/",
  "/solutions/architectural-lighting/",
  "/solutions/energy-autonomy/",
  "/solutions/security-and-access-control/",
  "/solutions/commercial-space/",
  "/smart-home/",
  "/process/",
  "/about/",
  "/projects/",
  "/contact/",
  "/privacy/",
  "/404.html"
]);
const acceptanceWidths = Object.freeze([375, 414, 540, 768, 900, 1024, 1280, 1440, 1536, 1720, 1980]);
const sceneFamilies = Object.freeze([
  "panel",
  "stairs",
  "exterior",
  "surveillance",
  "audio",
  "backup",
  "climate",
  "shading",
  "diagnostics"
]);
const dynamicClaimRules = Object.freeze([
  ["telemetry/status", [
    /\bтелеметр[\p{L}\p{N}]*/iu,
    /\b(?:live|онлайн)[\s-]*(?:статус|status)\b/iu,
    /\b(?:поточн[\p{L}\p{N}]*|актуальн[\p{L}\p{N}]*|реальн[\p{L}\p{N}]*(?:\s+час[\p{L}\p{N}]*)?)\s+(?:стан|статус|показник[\p{L}\p{N}]*)\s+(?:систем[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*|інженер[\p{L}\p{N}]*)\b/iu,
    /\b(?:статус|показник[\p{L}\p{N}]*)\s+(?:систем[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*|інженер[\p{L}\p{N}]*)\b/iu
  ]],
  ["portal/account/control", [
    /\b(?:портал[\p{L}\p{N}]*|особист[\p{L}\p{N}]*\s+кабінет[\p{L}\p{N}]*|кабінет[\p{L}\p{N}]*\s+(?:клієнт[\p{L}\p{N}]*|користувач[\p{L}\p{N}]*)|account[\p{L}\p{N}]*|dashboard[\p{L}\p{N}]*)\b/iu,
    /\b(?:віддален[\p{L}\p{N}]*|дистанційн[\p{L}\p{N}]*)\s+(?:керуван[\p{L}\p{N}]*|контрол[\p{L}\p{N}]*)\b/iu
  ]],
  ["vendor compatibility", [
    /\b(?:knx|loxone|control4|crestron|zigbee|z-wave|matter|homekit|alexa|google\s+home|philips\s+hue)\b/iu,
    /\b(?:сумісн[\p{L}\p{N}]*|підтрим[\p{L}\p{N}]*)\s+(?:з|із)\s+(?:(?:конкретн[\p{L}\p{N}]*\s+)?(?:виробник[\p{L}\p{N}]*|бренд[\p{L}\p{N}]*|платформ[\p{L}\p{N}]*|протокол[\p{L}\p{N}]*|систем[\p{L}\p{N}]*))\b/iu,
    /\b(?:compatible|compatibility)\s+(?:with|vendor|protocol)\b/iu
  ]],
  ["price", [/\b(?:ціна|вартіст[\p{L}\p{N}]*|кошту[\p{L}\p{N}]*|бюджет[\p{L}\p{N}]*|кошторис[\p{L}\p{N}]*)\b/iu, /[₴€]/u, /\bгрн\b/iu, /\$\s*\d/u]],
  ["guarantee", [/\b(?:гаранті[\p{L}\p{N}]*|гаранту[\p{L}\p{N}]*)\b/iu]],
  ["certificate", [/\b(?:сертифік[\p{L}\p{N}]*|certified)\b/iu]],
  ["review", [/\b(?:відгук[\p{L}\p{N}]*|рейтинг[\p{L}\p{N}]*|testimonial[\p{L}\p{N}]*|review[\p{L}\p{N}]*)\b/iu]],
  ["client project as fact", [
    /\b(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт)\s+(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)\b/iu,
    /\b(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)\s+(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт|систем[\p{L}\p{N}]*|рішенн[\p{L}\p{N}]*)\b/iu
  ]]
]);
const truthfulNegativeDisclosure = /\b(?:не\s+(?:є\s+)?(?:підтверджен[\p{L}\p{N}]*|публіку[\p{L}\p{N}]*|документальн[\p{L}\p{N}]*|реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*|маємо|надаємо|пропонуємо|гаранту[\p{L}\p{N}]*|підтрим[\p{L}\p{N}]*|заявля[\p{L}\p{N}]*)|без\s+(?:підтверджен[\p{L}\p{N}]*|гаранті[\p{L}\p{N}]*|сертифік[\p{L}\p{N}]*|відгук[\p{L}\p{N}]*|телеметр[\p{L}\p{N}]*|портал[\p{L}\p{N}]*|сумісн[\p{L}\p{N}]*|(?:віддален[\p{L}\p{N}]*|дистанційн[\p{L}\p{N}]*)\s+(?:керуван[\p{L}\p{N}]*|контрол[\p{L}\p{N}]*)))\b/iu;
const dynamicFallbacks = Object.freeze([
  { route: "/", root: "[data-cinematic-root]", fallback: "[data-cinematic-fallback]", stage: "[data-cinematic-stage]" },
  { route: "/services/electrical-design/", root: "[data-service-studio-root]", fallback: "[data-service-studio-fallback]", stage: "[data-service-studio-stage]" },
  { route: "/solutions/private-house-full-automation/", root: "[data-cinematic-solutions-root]", fallback: "[data-cinematic-solutions-fallback]", stage: "[data-cinematic-solutions-stage]" },
  { route: "/smart-home/", root: "[data-smart-home-simulator]", fallback: "[data-static-explainer]", stage: "[data-smart-home-phone]" },
  { route: "/process/", root: "[data-route-journey-root]", fallback: "[data-route-journey-fallback]", stage: "[data-route-journey-stage]" },
  { route: "/about/", root: "[data-route-journey-root]", fallback: "[data-route-journey-fallback]", stage: "[data-route-journey-stage]" }
]);
const serviceStudioRoutes = publicRoutes.filter((route) => route.startsWith("/services/") && route !== "/services/");
const solutionRoutes = publicRoutes.filter((route) => route.startsWith("/solutions/"));

test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
  writeEvidence("manifest.json", {
    publicRoutes,
    acceptanceWidths,
    sceneFamilies,
    project: "final-acceptance"
  });
});

function writeEvidence(name, value) {
  writeFileSync(resolve(evidenceDirectory, name), JSON.stringify(value, null, 2) + "\n");
}

function viewportFor(width) {
  return { width, height: width < 768 ? 900 : 1100 };
}

async function visit(page, route) {
  const response = await page.goto(route, { waitUntil: "load" });
  expect(response?.ok(), route + " must return a successful document").toBeTruthy();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("main")).toBeVisible();
  return response;
}

function addDiagnostics(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const onConsole = (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  };
  const onPageError = (error) => pageErrors.push(error.message);
  const onRequestFailed = (request) => failedRequests.push({
    url: request.url(),
    failure: request.failure()?.errorText ?? "unknown request failure"
  });
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  return () => {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
    expect(consoleErrors, "public pages must not emit console errors").toEqual([]);
    expect(pageErrors, "public pages must not raise browser errors").toEqual([]);
    expect(failedRequests, "public pages must not have failed requests").toEqual([]);
  };
}

async function publicSurface(page, route, width) {
  await expect(page.locator('html[lang="uk"]')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u);
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
  await expect(page.locator("main h1:visible")).toHaveCount(1);
  await expect(page.locator('button[disabled], [aria-disabled="true"], [role=status]')).toHaveCount(0);

  const evidence = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && bounds.width > 0 && bounds.height > 0;
    };
    const horizontalScroller = (element) => {
      let ancestor = element.parentElement;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        if (
          ancestor.scrollWidth > ancestor.clientWidth + 1 &&
          /(auto|scroll)/u.test(style.overflowX)
        ) return ancestor;
        ancestor = ancestor.parentElement;
      }
      return null;
    };
    const controls = [...document.querySelectorAll("button, summary, [role=button]")]
      .filter(visible)
      .map((control) => {
        const bounds = control.getBoundingClientRect();
        const outsideViewport = bounds.left < -1 || bounds.right > window.innerWidth + 1;
        const scroller = outsideViewport ? horizontalScroller(control) : null;
        const scrollerBounds = scroller?.getBoundingClientRect();
        const contentLeft = scrollerBounds && scroller ? scrollerBounds.left - scroller.scrollLeft : null;
        const safelyInsideScroller = Boolean(
          scrollerBounds &&
          scroller &&
          scrollerBounds.left >= -1 &&
          scrollerBounds.right <= window.innerWidth + 1 &&
          bounds.left >= contentLeft - 1 &&
          bounds.right <= contentLeft + scroller.scrollWidth + 1
        );
        return {
          name: control.getAttribute("aria-label") || control.textContent.trim(),
          width: bounds.width,
          height: bounds.height,
          horizontallyReachable: !outsideViewport || safelyInsideScroller
        };
      });
    const mainText = document.querySelector("main")?.innerText ?? "";
    return {
      anchors: [...document.querySelectorAll("a[href]")].map((anchor) => anchor.href),
      controls: controls.length,
      ordinalMarkers: mainText.match(/(?:^|\s)0[1-9](?=\s|$)/gmu) ?? [],
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clipped: controls.filter(({ horizontallyReachable }) => !horizontallyReachable),
      undersized: controls.filter(({ width, height }) => width < 44 || height < 44)
    };
  });

  expect(evidence.overflow, route + " at " + width + "px must not overflow").toBe(0);
  expect(evidence.ordinalMarkers, route + " must not expose decorative ordinals").toEqual([]);
  expect(evidence.clipped, route + " at " + width + "px must keep controls in the viewport or a reachable scroller").toEqual([]);
  expect(evidence.undersized, route + " at " + width + "px must retain 44px action controls").toEqual([]);
  return evidence;
}

function internalRoutes(anchorHrefs) {
  const origin = new URL(baseURL).origin;
  return anchorHrefs
    .map((href) => new URL(href, baseURL))
    .filter((href) => href.origin === origin && (href.protocol === "http:" || href.protocol === "https:"))
    .map((href) => href.pathname + href.search)
    .filter((href) => href !== "");
}

async function expectNoMotion(page) {
  const moving = await page.locator("*").evaluateAll((elements) => elements
    .filter((element) => {
      const style = getComputedStyle(element);
      const duration = (value) => value.split(",").some((item) => Number.parseFloat(item) > 0);
      return (style.animationName !== "none" && duration(style.animationDuration)) || duration(style.transitionDuration);
    })
    .map((element) => ({ className: element.className, tagName: element.tagName }))
    .slice(0, 20));
  expect(moving, "reduced-motion must remove all running CSS animation and transition durations").toEqual([]);
}

async function expectNoVisibleSnapshots(page) {
  const snapshots = page.locator([
    "[data-cinematic-outgoing-snapshot]:visible",
    "[data-cinematic-physical-snapshot]:visible",
    "[data-service-studio-outgoing-snapshot]:visible",
    "[data-cinematic-solutions-outgoing-snapshot]:visible",
    "[data-route-journey-outgoing]:visible",
    "[data-outgoing-snapshot]:visible",
    "[data-cinematic-route-snapshot]:visible"
  ].join(", "));
  await expect(snapshots, "reduced-motion interactions must not create outgoing snapshots").toHaveCount(0);
}

async function expectGroundedDynamicCopy(root, name) {
  const text = await root.evaluate((element) => {
    const visible = (candidate) => {
      const style = getComputedStyle(candidate);
      const bounds = candidate.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && bounds.width > 0 && bounds.height > 0;
    };
    const labels = [...element.querySelectorAll("[aria-label], [aria-live]")]
      .filter(visible)
      .flatMap((candidate) => [candidate.getAttribute("aria-label"), candidate.textContent])
      .filter(Boolean);
    return [element.innerText, ...labels].join("\n");
  });
  const violations = [];
  for (const fragment of text.split(/(?<=[.!?])\s+/u)) {
    if (truthfulNegativeDisclosure.test(fragment)) continue;
    for (const [category, patterns] of dynamicClaimRules) {
      if (patterns.some((pattern) => pattern.test(fragment))) violations.push({ category, fragment });
    }
  }
  expect(violations, name + " must not surface unsupported public claims through dynamic copy").toEqual([]);
}

async function expectDominantScene(root, sceneSelector, panelSelector, name) {
  const geometry = await root.evaluate((element, [sceneSelector, panelSelector]) => {
    const visible = (selector) => [...element.querySelectorAll(selector)].filter((candidate) => {
      const style = getComputedStyle(candidate);
      const bounds = candidate.getBoundingClientRect();
      return !candidate.hidden && style.visibility !== "hidden" && style.display !== "none" && bounds.width > 0 && bounds.height > 0;
    });
    const [scene] = visible(sceneSelector);
    const [panel] = visible(panelSelector);
    const rootBounds = element.getBoundingClientRect();
    const boundsFor = (candidate) => {
      const bounds = candidate?.getBoundingClientRect();
      return bounds && { width: bounds.width, height: bounds.height, area: bounds.width * bounds.height };
    };
    return {
      scene: boundsFor(scene),
      panel: boundsFor(panel),
      root: { width: rootBounds.width, height: rootBounds.height, area: rootBounds.width * rootBounds.height }
    };
  }, [sceneSelector, panelSelector]);
  expect(geometry.scene, name + " needs a visible dominant scene").not.toBeNull();
  expect(geometry.panel, name + " needs one visible explanatory panel").not.toBeNull();
  expect(geometry.scene.area, name + " scene must retain a substantial visual area").toBeGreaterThanOrEqual(geometry.root.area * 0.08);
  expect(geometry.scene.area, name + " scene must not collapse beneath its explanatory panel").toBeGreaterThanOrEqual(geometry.panel.area * 0.45);
}

async function expectVisibleState(root, sceneSelector, panelSelector) {
  await expect(root.locator(sceneSelector + ":visible")).toHaveCount(1);
  await expect(root.locator(panelSelector + ":visible")).toHaveCount(1);
}

async function inspectCompositionState(page, root, sceneSelector, panelSelector, name) {
  await expectVisibleState(root, sceneSelector, panelSelector);
  await expectDominantScene(root, sceneSelector, panelSelector, name);
  await expectGroundedDynamicCopy(root, name);
  expect((await new AxeBuilder({ page }).analyze()).violations, name + " must pass Axe").toEqual([]);
}

async function expectFocusVisible(control) {
  await control.focus();
  expect(await control.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
}

async function waitForIdle(root, attribute) {
  await expect(root).toHaveAttribute(attribute, "idle");
}

async function mediaSignature(image) {
  return image.evaluate(async (element) => {
    await element.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 16;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return {
      src: element.currentSrc,
      signature: [...pixels].reduce((hash, pixel) => ((hash << 5) - hash + pixel) | 0, 0)
    };
  });
}

async function transitResidence(page, route) {
  await visit(page, route);
  const root = page.locator("[data-cinematic-root]");
  const stage = root.locator("[data-cinematic-stage]");
  await expect(root).toHaveAttribute("data-cinematic-enhanced", "true");
  await waitForIdle(root, "data-cinematic-motion-phase");
  await expect(root).toHaveAttribute("data-cinematic-state", "assembled");
  await inspectCompositionState(page, root, "[data-cinematic-scene]", "[data-cinematic-panel]", route + " assembled");
  const focus = stage.locator("button[data-cinematic-direction-control]").first();
  await expectFocusVisible(focus);
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-cinematic-state", "focus");
  await waitForIdle(root, "data-cinematic-motion-phase");
  await inspectCompositionState(page, root, "[data-cinematic-scene]", "[data-cinematic-panel]", route + " focus");
  await stage.locator("[data-cinematic-relation-switcher]:visible button").first().click();
  await expect(root).toHaveAttribute("data-cinematic-state", "reassembled");
  await waitForIdle(root, "data-cinematic-motion-phase");
  await inspectCompositionState(page, root, "[data-cinematic-scene]", "[data-cinematic-panel]", route + " reassembled");
  return root;
}

async function transitServiceStudio(page, route) {
  await visit(page, route);
  const root = page.locator("[data-service-studio-root]");
  const stage = root.locator("[data-service-studio-stage]");
  await expect(root).toHaveAttribute("data-service-studio-enhanced", "true");
  await waitForIdle(root, "data-service-studio-motion-phase");
  await expect(root).toHaveAttribute("data-service-studio-state", "assembled");
  await inspectCompositionState(page, root, "[data-service-studio-scene]", "[data-service-studio-panel]", route + " assembled");
  const focus = stage.locator('button[data-service-studio-action="select-focus"]');
  await expectFocusVisible(focus);
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-service-studio-state", "focus");
  await waitForIdle(root, "data-service-studio-motion-phase");
  await inspectCompositionState(page, root, "[data-service-studio-scene]", "[data-service-studio-panel]", route + " focus");
  await stage.locator('button[data-service-studio-action="select-reassembled"]').click();
  await expect(root).toHaveAttribute("data-service-studio-state", "reassembled");
  await waitForIdle(root, "data-service-studio-motion-phase");
  await inspectCompositionState(page, root, "[data-service-studio-scene]", "[data-service-studio-panel]", route + " reassembled");
  return root;
}

async function transitSolution(page, route) {
  await visit(page, route);
  const root = page.locator("[data-cinematic-solutions-root]");
  const stage = root.locator("[data-cinematic-solutions-stage]");
  await expect(root).toHaveAttribute("data-cinematic-solutions-enhanced", "true");
  await waitForIdle(root, "data-cinematic-solutions-motion-phase");
  await expect(root).toHaveAttribute("data-cinematic-solutions-state", "assembled");
  await inspectCompositionState(page, root, "[data-cinematic-solutions-scene]", "[data-cinematic-solutions-panel]", route + " assembled");
  const focus = stage.locator('button[data-cinematic-solutions-action="select-focus"]');
  await expectFocusVisible(focus);
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-cinematic-solutions-state", "focus");
  await waitForIdle(root, "data-cinematic-solutions-motion-phase");
  await inspectCompositionState(page, root, "[data-cinematic-solutions-scene]", "[data-cinematic-solutions-panel]", route + " focus");
  await stage.locator('button[data-cinematic-solutions-action="select-reassembled"]').click();
  await expect(root).toHaveAttribute("data-cinematic-solutions-state", "reassembled");
  await waitForIdle(root, "data-cinematic-solutions-motion-phase");
  await inspectCompositionState(page, root, "[data-cinematic-solutions-scene]", "[data-cinematic-solutions-panel]", route + " reassembled");
  return root;
}

async function transitJourney(page, route) {
  await visit(page, route);
  const root = page.locator("[data-route-journey-root]");
  const stage = root.locator("[data-route-journey-stage]");
  await expect(root).toHaveAttribute("data-route-journey-enhanced", "true");
  await waitForIdle(root, "data-route-journey-motion-phase");
  await expect(root).toHaveAttribute("data-route-journey-state", "assembled");
  await inspectCompositionState(page, root, "[data-route-journey-scene]", "[data-route-journey-panel]", route + " assembled");
  const focus = stage.locator('button[data-route-journey-action="select-node"]').first();
  await expectFocusVisible(focus);
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-route-journey-state", "focus");
  await waitForIdle(root, "data-route-journey-motion-phase");
  await inspectCompositionState(page, root, "[data-route-journey-scene]", "[data-route-journey-panel]", route + " focus");
  await stage.locator('button[data-route-journey-action="show-relationship"]:visible').click();
  await expect(root).toHaveAttribute("data-route-journey-state", "reassembled");
  await waitForIdle(root, "data-route-journey-motion-phase");
  await inspectCompositionState(page, root, "[data-route-journey-scene]", "[data-route-journey-panel]", route + " reassembled");
  return root;
}

test("all twenty-four public routes stay semantic, linked, fluid, and error-free in the full JavaScript matrix", async ({ browser }) => {
  expect(publicRoutes).toHaveLength(24);
  const context = await browser.newContext({ baseURL, locale: "uk-UA" });
  const page = await context.newPage();
  const checkedInternalRoutes = new Set();
  const matrix = [];

  try {
    for (const width of acceptanceWidths) {
      await page.setViewportSize(viewportFor(width));
      for (const route of publicRoutes) {
        const assertDiagnostics = addDiagnostics(page);
        await visit(page, route);
        const surface = await publicSurface(page, route, width);
        assertDiagnostics();
        for (const href of internalRoutes(surface.anchors)) checkedInternalRoutes.add(href);
        matrix.push({ route, width, controls: surface.controls, overflow: surface.overflow });
      }
    }

    for (const route of [...checkedInternalRoutes].sort()) {
      const response = await page.request.get(new URL(route, baseURL).href);
      expect(response.ok(), route + " linked by a public page must resolve").toBe(true);
    }
  } finally {
    await context.close();
  }

  expect(matrix).toHaveLength(publicRoutes.length * acceptanceWidths.length);
  writeEvidence("javascript-route-matrix.json", { checkedInternalRoutes: [...checkedInternalRoutes].sort(), matrix });
});

test("all twenty-four public routes retain complete, ordinary navigation with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, locale: "uk-UA" });
  const page = await context.newPage();
  const matrix = [];

  try {
    for (const width of acceptanceWidths) {
      await page.setViewportSize(viewportFor(width));
      for (const route of publicRoutes) {
        await visit(page, route);
        const surface = await publicSurface(page, route, width);
        const enhancedRoots = await page.locator([
          '[data-cinematic-root][data-cinematic-enhanced="true"]',
          '[data-service-studio-root][data-service-studio-enhanced="true"]',
          '[data-cinematic-solutions-root][data-cinematic-solutions-enhanced="true"]',
          '[data-route-journey-root][data-route-journey-enhanced="true"]',
          '[data-smart-home-simulator][data-enhanced="true"]'
        ].join(", ")).count();
        expect(enhancedRoots, route + " must not require JavaScript to reveal its reading order").toBe(0);
        matrix.push({ route, width, controls: surface.controls, overflow: surface.overflow });
      }
    }

    await page.setViewportSize(viewportFor(375));
    await visit(page, "/");
    const mobileNavigation = page.locator(".mobile-nav");
    if (await mobileNavigation.isVisible()) await mobileNavigation.locator("summary").click();
    await page.locator('a[href="/services/"]:visible').first().click();
    await expect(page).toHaveURL(/\/services\/$/u);
  } finally {
    await context.close();
  }

  expect(matrix).toHaveLength(publicRoutes.length * acceptanceWidths.length);
  writeEvidence("no-javascript-route-matrix.json", { matrix });
});

test("every dynamic family fails closed to a visible semantic fallback when its adapters are unavailable", async ({ browser }) => {
  const context = await browser.newContext({ baseURL, locale: "uk-UA", viewport: viewportFor(768) });
  await context.route("**/assets/js/**", (route) => route.abort());
  const page = await context.newPage();
  const evidence = [];

  try {
    for (const contract of dynamicFallbacks) {
      await visit(page, contract.route);
      const root = page.locator(contract.root);
      await expect(root).toHaveCount(1);
      await expect(root.locator(contract.fallback)).toBeVisible();
      await expect(root.locator(contract.stage)).toBeHidden();
      const surface = await publicSurface(page, contract.route, 768);
      evidence.push({ route: contract.route, controls: surface.controls, overflow: surface.overflow });
    }
  } finally {
    await context.close();
  }

  expect(evidence).toHaveLength(dynamicFallbacks.length);
  writeEvidence("adapter-failure-fallbacks.json", evidence);
});

test("every stateful composition reaches assembled, focus, and reassembled with one dominant scene and panel", async ({ page }) => {
  await page.setViewportSize(viewportFor(1440));
  const completed = [];

  for (const route of ["/", "/services/"]) {
    const root = await transitResidence(page, route);
    completed.push({ route, family: "residence", state: await root.getAttribute("data-cinematic-state") });
  }
  for (const route of serviceStudioRoutes) {
    const root = await transitServiceStudio(page, route);
    completed.push({ route, family: "service-studio", state: await root.getAttribute("data-service-studio-state") });
  }
  for (const route of solutionRoutes) {
    const root = await transitSolution(page, route);
    completed.push({ route, family: "solution", state: await root.getAttribute("data-cinematic-solutions-state") });
  }
  for (const route of ["/process/", "/about/"]) {
    const root = await transitJourney(page, route);
    completed.push({ route, family: "journey", state: await root.getAttribute("data-route-journey-state") });
  }

  expect(completed).toHaveLength(2 + serviceStudioRoutes.length + solutionRoutes.length + 2);
  expect(completed.every(({ state }) => state === "reassembled")).toBe(true);
  writeEvidence("composition-states.json", completed);
});

test("the nine residence scene families and physical controls produce real visible media changes", async ({ page }) => {
  await page.setViewportSize(viewportFor(1440));
  await visit(page, "/services/");
  const root = page.locator("[data-cinematic-root]");
  const stage = root.locator("[data-cinematic-stage]");
  await expect(root).toHaveAttribute("data-cinematic-enhanced", "true");
  const families = await stage.locator("[data-cinematic-scene-family]").evaluateAll((scenes) =>
    [...new Set(scenes.map((scene) => scene.getAttribute("data-cinematic-scene-family")))].sort()
  );
  expect(sceneFamilies.every((family) => families.includes(family)), "all nine visual scene families must be mapped").toBe(true);

  const physicalImage = stage.locator("[data-cinematic-physical-picture] img");
  const initial = await mediaSignature(physicalImage);
  await stage.getByRole("button", { name: "Ролети blackout", exact: true }).click();
  await expect.poll(() => mediaSignature(physicalImage)).not.toEqual(initial);
  const changed = await mediaSignature(physicalImage);
  expect(changed.signature).not.toBe(initial.signature);
  await stage.getByRole("button", { name: "Освітлення", exact: true }).click();
  await stage.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
  const stairs = await mediaSignature(physicalImage);
  await stage.getByRole("button", { name: "Маршрут сходами", exact: true }).click();
  await expect.poll(() => mediaSignature(physicalImage)).not.toEqual(stairs);
  const stairRoute = await mediaSignature(physicalImage);
  expect(stairRoute.src).toMatch(/stairs-route-(768|1536)\.webp$/u);
  expect(stairRoute.signature).not.toBe(stairs.signature);
  await stage.getByRole("button", { name: "Повернутися до всієї системи", exact: true }).click();
  await stage.getByRole("button", { name: "Освітлення", exact: true }).click();
  await stage.getByRole("button", { name: "Показати зв’язок: Зовнішнє освітлення", exact: true }).click();
  const exterior = await mediaSignature(physicalImage);
  await stage.getByRole("button", { name: "Нічне зниження", exact: true }).click();
  await expect.poll(() => mediaSignature(physicalImage)).not.toEqual(exterior);
  const exteriorReduced = await mediaSignature(physicalImage);
  expect(exteriorReduced.src).toMatch(/exterior-reduced-night-(768|1536)\.webp$/u);
  expect(exteriorReduced.signature).not.toBe(exterior.signature);

  await visit(page, "/smart-home/");
  const simulator = page.locator("[data-smart-home-simulator]");
  await expect(simulator).toHaveAttribute("data-enhanced", "true");
  const systems = simulator.locator("button[data-phone-system]");
  await expect(systems).toHaveCount(9);
  const selectedSystems = [];
  for (let index = 0; index < await systems.count(); index += 1) {
    const system = systems.nth(index);
    const id = await system.getAttribute("data-phone-system");
    await system.click();
    await expect(simulator).toHaveAttribute("data-system", id);
    await expect(simulator.locator("picture[data-scene-picture]:visible")).toHaveAttribute("data-scene-picture", id);
    await expect(simulator.locator("[data-phone-topology-detail]")).not.toHaveText("");
    selectedSystems.push(id);
  }
  expect(new Set(selectedSystems).size).toBe(9);
  const presets = simulator.getByRole("radio");
  await expect(presets).toHaveCount(7);
  const selectedPresets = [];
  for (let index = 0; index < await presets.count(); index += 1) {
    const preset = presets.nth(index);
    const id = await preset.getAttribute("value");
    await preset.click();
    await expect(simulator).toHaveAttribute("data-preset", id);
    await expect(simulator.locator("[data-phone-topology-detail]")).not.toHaveText("");
    selectedPresets.push(id);
  }
  expect(new Set(selectedPresets).size).toBe(7);
  await expectGroundedDynamicCopy(simulator, "smart-home controls and presets");
  expect((await new AxeBuilder({ page }).analyze()).violations, "smart-home active preset").toEqual([]);
});

test("touch dispatch follows the same state contracts as pointer and keyboard controls", async ({ browser }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: viewportFor(375), locale: "uk-UA" });
  const page = await context.newPage();
  const evidence = [];

  try {
    await visit(page, "/");
    await page.locator("[data-cinematic-stage] button[data-cinematic-direction-control]").first().tap();
    await expect(page.locator("[data-cinematic-root]")).toHaveAttribute("data-cinematic-state", "focus");
    await page.locator("[data-cinematic-stage] [data-cinematic-relation-switcher]:visible button").first().tap();
    await expect(page.locator("[data-cinematic-root]")).toHaveAttribute("data-cinematic-state", "reassembled");
    evidence.push("residence");

    await visit(page, "/services/electrical-design/");
    await page.locator('[data-service-studio-stage] button[data-service-studio-action="select-focus"]').tap();
    await expect(page.locator("[data-service-studio-root]")).toHaveAttribute("data-service-studio-state", "focus");
    await page.locator('[data-service-studio-stage] button[data-service-studio-action="select-reassembled"]').tap();
    await expect(page.locator("[data-service-studio-root]")).toHaveAttribute("data-service-studio-state", "reassembled");
    evidence.push("service-studio");

    await visit(page, "/solutions/");
    await page.locator('[data-cinematic-solutions-stage] button[data-cinematic-solutions-action="select-focus"]').tap();
    await expect(page.locator("[data-cinematic-solutions-root]")).toHaveAttribute("data-cinematic-solutions-state", "focus");
    await page.locator('[data-cinematic-solutions-stage] button[data-cinematic-solutions-action="select-reassembled"]').tap();
    await expect(page.locator("[data-cinematic-solutions-root]")).toHaveAttribute("data-cinematic-solutions-state", "reassembled");
    evidence.push("solution");

    await visit(page, "/process/");
    await page.locator('[data-route-journey-stage] button[data-route-journey-action="select-node"]').first().tap();
    await expect(page.locator("[data-route-journey-root]")).toHaveAttribute("data-route-journey-state", "focus");
    await page.locator('[data-route-journey-stage] button[data-route-journey-action="show-relationship"]:visible').tap();
    await expect(page.locator("[data-route-journey-root]")).toHaveAttribute("data-route-journey-state", "reassembled");
    evidence.push("journey");

    await visit(page, "/smart-home/");
    await page.locator("[data-smart-home-simulator] button[data-phone-system]").nth(1).tap();
    await expect(page.locator("[data-smart-home-simulator]")).toHaveAttribute("data-system", /\S/u);
    await page.locator("[data-smart-home-simulator] input[data-preset-radio]").nth(2).tap();
    await expect(page.locator("[data-smart-home-simulator]")).toHaveAttribute("data-preset", /\S/u);
    evidence.push("smart-home");
  } finally {
    await context.close();
  }

  expect(evidence).toEqual(["residence", "service-studio", "solution", "journey", "smart-home"]);
  writeEvidence("touch-contracts.json", evidence);
});

test("reduced-motion produces zero running animation or transition across every public route", async ({ browser }) => {
  const context = await browser.newContext({ baseURL, locale: "uk-UA", reducedMotion: "reduce" });
  const page = await context.newPage();
  const evidence = [];

  try {
    for (const route of publicRoutes) {
      await page.setViewportSize(viewportFor(1024));
      await visit(page, route);
      await expectNoMotion(page);
      evidence.push(route);
    }

    await visit(page, "/");
    await page.locator("[data-cinematic-stage] button[data-cinematic-direction-control]").first().click();
    await page.locator("[data-cinematic-stage] [data-cinematic-relation-switcher]:visible button").first().click();
    await expectNoVisibleSnapshots(page);
    await expectNoMotion(page);

    await visit(page, "/services/electrical-design/");
    await page.locator('[data-service-studio-stage] button[data-service-studio-action="select-focus"]').click();
    await page.locator('[data-service-studio-stage] button[data-service-studio-action="select-reassembled"]').click();
    await expectNoVisibleSnapshots(page);
    await expectNoMotion(page);

    await visit(page, "/solutions/");
    await page.locator('[data-cinematic-solutions-stage] button[data-cinematic-solutions-action="select-focus"]').click();
    await page.locator('[data-cinematic-solutions-stage] button[data-cinematic-solutions-action="select-reassembled"]').click();
    await expectNoVisibleSnapshots(page);
    await expectNoMotion(page);

    await visit(page, "/process/");
    await page.locator('[data-route-journey-stage] button[data-route-journey-action="select-node"]').first().click();
    await page.locator('[data-route-journey-stage] button[data-route-journey-action="show-relationship"]:visible').click();
    await expectNoVisibleSnapshots(page);
    await expectNoMotion(page);

    await visit(page, "/smart-home/");
    await page.locator("[data-smart-home-simulator] button[data-phone-system]").nth(1).click();
    await page.locator("[data-smart-home-simulator] input[data-preset-radio]").nth(2).click();
    await expectNoVisibleSnapshots(page);
    await expectNoMotion(page);
  } finally {
    await context.close();
  }

  expect(evidence).toHaveLength(publicRoutes.length);
  writeEvidence("reduced-motion.json", evidence);
});

test("selected assembled, focus, and reassembled evidence remains inspectable at four representative widths", async ({ page }) => {
  const screenshots = [];
  for (const width of [375, 768, 1440, 1980]) {
    await page.setViewportSize(viewportFor(width));
    await visit(page, "/services/");
    const root = page.locator("[data-cinematic-root]");
    const stage = root.locator("[data-cinematic-stage]");
    await waitForIdle(root, "data-cinematic-motion-phase");
    const assembled = "services-" + width + "-assembled.png";
    await page.screenshot({ path: resolve(evidenceDirectory, assembled) });
    screenshots.push(assembled);
    await stage.locator("button[data-cinematic-direction-control]").first().click();
    await expect(root).toHaveAttribute("data-cinematic-state", "focus");
    await waitForIdle(root, "data-cinematic-motion-phase");
    const focus = "services-" + width + "-focus.png";
    await page.screenshot({ path: resolve(evidenceDirectory, focus) });
    screenshots.push(focus);
    await stage.locator("[data-cinematic-relation-switcher]:visible button").first().click();
    await expect(root).toHaveAttribute("data-cinematic-state", "reassembled");
    await waitForIdle(root, "data-cinematic-motion-phase");
    const reassembled = "services-" + width + "-reassembled.png";
    await page.screenshot({ path: resolve(evidenceDirectory, reassembled) });
    screenshots.push(reassembled);
  }
  expect(screenshots).toHaveLength(12);
  writeEvidence("screenshots.json", screenshots);
});
