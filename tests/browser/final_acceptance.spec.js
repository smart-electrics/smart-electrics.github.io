import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
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
    /телеметр[\p{L}\p{N}]*/iu,
    /\bтелеметр[\p{L}\p{N}]*/iu,
    /\b(?:live|онлайн)[\s-]*(?:статус|status)\b/iu,
    /\b(?:поточн[\p{L}\p{N}]*|актуальн[\p{L}\p{N}]*|реальн[\p{L}\p{N}]*(?:\s+час[\p{L}\p{N}]*)?)\s+(?:стан|статус|показник[\p{L}\p{N}]*)\s+(?:систем[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*|інженер[\p{L}\p{N}]*)\b/iu,
    /\b(?:статус|показник[\p{L}\p{N}]*)\s+(?:систем[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*|інженер[\p{L}\p{N}]*)\b/iu
  ]],
  ["portal/account/control", [
    /(?:портал[\p{L}\p{N}]*|особист[\p{L}\p{N}]*\s+кабінет[\p{L}\p{N}]*|кабінет[\p{L}\p{N}]*\s+(?:клієнт[\p{L}\p{N}]*|користувач[\p{L}\p{N}]*))|account[\p{L}\p{N}]*|dashboard[\p{L}\p{N}]*/iu,
    /\b(?:портал[\p{L}\p{N}]*|особист[\p{L}\p{N}]*\s+кабінет[\p{L}\p{N}]*|кабінет[\p{L}\p{N}]*\s+(?:клієнт[\p{L}\p{N}]*|користувач[\p{L}\p{N}]*)|account[\p{L}\p{N}]*|dashboard[\p{L}\p{N}]*)\b/iu,
    /\b(?:віддален[\p{L}\p{N}]*|дистанційн[\p{L}\p{N}]*)\s+(?:керуван[\p{L}\p{N}]*|контрол[\p{L}\p{N}]*)\b/iu
  ]],
  ["vendor compatibility", [
    /(?:knx|loxone|control4|crestron|zigbee|z-wave|matter|homekit|alexa|google\s+home|philips\s+hue)/iu,
    /\b(?:knx|loxone|control4|crestron|zigbee|z-wave|matter|homekit|alexa|google\s+home|philips\s+hue)\b/iu,
    /\b(?:сумісн[\p{L}\p{N}]*|підтрим[\p{L}\p{N}]*)\s+(?:з|із)\s+(?:(?:конкретн[\p{L}\p{N}]*\s+)?(?:виробник[\p{L}\p{N}]*|бренд[\p{L}\p{N}]*|платформ[\p{L}\p{N}]*|протокол[\p{L}\p{N}]*|систем[\p{L}\p{N}]*))\b/iu,
    /\b(?:compatible|compatibility)\s+(?:with|vendor|protocol)\b/iu
  ]],
  ["price", [/(?:ціна|вартіст[\p{L}\p{N}]*|кошту[\p{L}\p{N}]*|бюджет[\p{L}\p{N}]*|кошторис[\p{L}\p{N}]*)/iu, /[₴€]/u, /грн/iu, /\$\s*\d/u]],
  ["guarantee", [/(?:гаранті[\p{L}\p{N}]*|гаранту[\p{L}\p{N}]*)/iu]],
  ["certificate", [/(?:сертифік[\p{L}\p{N}]*|certified)/iu]],
  ["review", [/(?:відгук[\p{L}\p{N}]*|рейтинг[\p{L}\p{N}]*|testimonial[\p{L}\p{N}]*|review[\p{L}\p{N}]*)/iu]],
  ["client project as fact", [
    /(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт)\s+(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)/iu,
    /(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)\s+(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт|систем[\p{L}\p{N}]*|рішенн[\p{L}\p{N}]*)/iu
  ]]
]);
const unicodeWord = (value) => new RegExp("(?:^|[^\\p{L}\\p{N}])" + value + "(?=$|[^\\p{L}\\p{N}])", "iu");
const truthfulNegativeDisclosure = /(?:не\s+(?:є\s+)?(?:підтверджен[\p{L}\p{N}]*|публіку[\p{L}\p{N}]*|документальн[\p{L}\p{N}]*|реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*|маємо|надаємо|пропонуємо|гаранту[\p{L}\p{N}]*|підтрим[\p{L}\p{N}]*|заявля[\p{L}\p{N}]*)|без\s+(?:підтверджен[\p{L}\p{N}]*|гаранті[\p{L}\p{N}]*|сертифік[\p{L}\p{N}]*|відгук[\p{L}\p{N}]*|телеметр[\p{L}\p{N}]*|портал[\p{L}\p{N}]*|сумісн[\p{L}\p{N}]*|(?:віддален[\p{L}\p{N}]*|дистанційн[\p{L}\p{N}]*)\s+(?:керуван[\p{L}\p{N}]*|контрол[\p{L}\p{N}]*)))/iu;
const contrastingClauseSeparator = /\s*,?\s*(?:але|однак|проте|but)\s*/iu;
const positiveClaimAfterDisclosure = Object.freeze([
  /телеметрія/iu,
  /(?:онлайн|live)[\s-]*(?:статус|status)/iu,
  /портал[\p{L}\p{N}]*\s+(?:дає|доступн|дозвол|керуван)/iu,
  /особист[\p{L}\p{N}]*\s+кабінет/iu,
  /(?:віддален[\p{L}\p{N}]*|дистанційн[\p{L}\p{N}]*)\s+(?:керуван[\p{L}\p{N}]*|контрол[\p{L}\p{N}]*)/iu,
  /(?:сумісн(?:ий|а|е|і)|підтримує(?:мо|те)?|підтримується)\s+(?:з|із)/iu,
  /(?:knx|loxone|control4|crestron|zigbee|z-wave|matter|homekit|alexa|google\s+home|philips\s+hue)/iu,
  unicodeWord("ціна"),
  /[₴€]/u,
  unicodeWord("грн"),
  /\$\s*\d/u,
  /гаранту[\p{L}\p{N}]*/iu,
  /сертифікован[\p{L}\p{N}]*/iu,
  unicodeWord("сертифікат"),
  unicodeWord("відгук"),
  /(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт)\s+(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)/iu,
  /(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)\s+(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт|систем[\p{L}\p{N}]*|рішенн[\p{L}\p{N}]*)/iu
]);
const dynamicFallbacks = Object.freeze([
  { route: "/", root: "[data-cinematic-root]", fallback: "[data-cinematic-fallback]", stage: "[data-cinematic-stage]", fallbackLink: "[data-cinematic-fallback] a[data-cinematic-direction-link]" },
  { route: "/services/electrical-design/", root: "[data-service-studio-root]", fallback: "[data-service-studio-fallback]", stage: "[data-service-studio-stage]", fallbackLink: "[data-service-studio-fallback] a[href='/services/']" },
  { route: "/solutions/private-house-full-automation/", root: "[data-cinematic-solutions-root]", fallback: "[data-cinematic-solutions-fallback]", stage: "[data-cinematic-solutions-stage]", fallbackLink: "[data-cinematic-solutions-fallback] a[href='/solutions/']" },
  { route: "/smart-home/", root: "[data-smart-home-simulator]", fallback: "[data-static-explainer]", stage: "[data-smart-home-phone]", fallbackLink: "[data-smart-home-physical-fallback] a[href='/services/lighting/']" },
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

async function followOrdinaryLink(page, selector, label) {
  const link = page.locator(selector).first();
  await expect(link, label + " must remain a visible semantic anchor").toBeVisible();
  await expect(link, label + " must not masquerade as disabled").not.toHaveAttribute("aria-disabled", "true");
  const href = await link.getAttribute("href");
  expect(href, label + " must retain href without JavaScript").toBeTruthy();
  const destination = new URL(href, baseURL);
  expect(destination.origin, label + " must remain same-origin").toBe(new URL(baseURL).origin);
  await Promise.all([
    page.waitForURL((url) => url.pathname + url.search === destination.pathname + destination.search),
    link.click()
  ]);
  await expect(page.locator("main"), label + " destination must retain a visible main landmark").toBeVisible();
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

async function withInteractionDiagnostics(page, action) {
  const assertDiagnostics = addDiagnostics(page);
  try {
    return await action();
  } finally {
    assertDiagnostics();
  }
}

async function publicSurface(page, route, width) {
  await expect(page.locator('html[lang="uk"]')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u);
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
  await expect(page.locator("main h1:visible")).toHaveCount(1);

  const evidence = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return !element.hidden && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0;
    };
    const flowingInlineEditorial = (control, style) => {
      if (!control.matches("p > a[href][data-inline-editorial-link]") || style.display !== "inline") return false;
      const hasProseText = (direction) => {
        let sibling = control[direction];
        while (sibling) {
          if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim() !== "") return true;
          sibling = sibling[direction];
        }
        return false;
      };
      return hasProseText("previousSibling") && hasProseText("nextSibling");
    };
    const interactiveSelector = [
      "a[href]",
      "button",
      "summary",
      "input:not([type=hidden])",
      "select",
      "textarea",
      "[role=button]",
      "[role=link]",
      "[role=radio]",
      "[role=checkbox]",
      "[role=switch]"
    ].join(", ");
    const controls = [...document.querySelectorAll(interactiveSelector)]
      .filter(visible)
      .map((control) => {
        const style = getComputedStyle(control);
        const bounds = control.getBoundingClientRect();
        return {
          name: control.getAttribute("aria-label") || control.textContent.trim(),
          width: bounds.width,
          height: bounds.height,
          horizontallyVisible: bounds.left >= -1 && bounds.right <= window.innerWidth + 1,
          inlineEditorial: flowingInlineEditorial(control, style),
          disabled: control.hasAttribute("disabled") || control.getAttribute("aria-disabled") === "true",
          inert: control.closest("[inert]") !== null
        };
      });
    const statuses = [...document.querySelectorAll('[role="status"]')]
      .filter(visible)
      .map((status) => ({
        name: status.getAttribute("aria-label") || status.textContent.trim(),
        liveStatus: true
      }));
    const links = [...document.querySelectorAll("a[href]")]
      .filter(visible)
      .map((link) => {
        const bounds = link.getBoundingClientRect();
        return {
          href: link.getAttribute("href"),
          name: link.getAttribute("aria-label") || link.textContent.trim(),
          horizontallyVisible: bounds.left >= -1 && bounds.right <= window.innerWidth + 1
        };
      });
    const stages = [
      "[data-cinematic-stage]",
      "[data-service-studio-stage]",
      "[data-cinematic-solutions-stage]",
      "[data-route-journey-stage]",
      "[data-smart-home-experience]"
    ].flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(visible)
      .map((stage) => {
        const bounds = stage.getBoundingClientRect();
        return { selector: stage.getAttribute("data-cinematic-stage") === "" ? "cinematic" : stage.className, height: bounds.height, width: bounds.width };
      });
    const mainText = document.querySelector("main")?.innerText ?? "";
    return {
      anchors: [...document.querySelectorAll("a[href]")].map((anchor) => anchor.href),
      controls: controls.length,
      minimumStageHeight: Math.min(480, window.innerHeight * 0.45),
      stages,
      ordinalMarkers: mainText.match(/(?:^|\s)0[1-9](?=\s|$)/gmu) ?? [],
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clipped: controls.filter(({ horizontallyVisible }) => !horizontallyVisible),
      clippedLinks: links.filter(({ horizontallyVisible }) => !horizontallyVisible),
      forbidden: controls.filter(({ disabled, inert }) => disabled || inert).concat(statuses),
      undersized: controls.filter(({ inlineEditorial, width, height }) => !inlineEditorial && (width < 44 || height < 44))
    };
  });

  expect(evidence.overflow, route + " at " + width + "px must not overflow").toBe(0);
  expect(evidence.ordinalMarkers, route + " must not expose decorative ordinals").toEqual([]);
  expect(evidence.forbidden, route + " must not expose a disabled, inert, or live-status surface").toEqual([]);
  expect(evidence.clipped, route + " at " + width + "px must keep every visible control inside the viewport").toEqual([]);
  expect(evidence.clippedLinks, route + " at " + width + "px must keep every visible link inside the viewport").toEqual([]);
  expect(evidence.undersized, route + " at " + width + "px must retain 44px action controls").toEqual([]);
  for (const stage of evidence.stages) {
    expect(stage.height, route + " at " + width + "px must retain a substantial visible stage height").toBeGreaterThanOrEqual(evidence.minimumStageHeight);
  }
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

function mixedNegativePositiveClaim(clause) {
  const disclosure = clause.match(truthfulNegativeDisclosure);
  if (!disclosure || disclosure.index === undefined) return false;
  const tail = clause.slice(disclosure.index + disclosure[0].length);
  return positiveClaimAfterDisclosure.some((pattern) => pattern.test(tail));
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
    const claimable = fragment
      .split(contrastingClauseSeparator)
      .map((clause) => truthfulNegativeDisclosure.test(clause) && !mixedNegativePositiveClaim(clause) ? " " : clause)
      .join(" ");
    for (const [category, patterns] of dynamicClaimRules) {
      if (patterns.some((pattern) => pattern.test(claimable))) violations.push({ category, fragment });
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
  expect(geometry.scene.area, name + " scene must occupy at least one quarter of its composition").toBeGreaterThanOrEqual(geometry.root.area * 0.25);
  expect(geometry.scene.area, name + " scene must remain at least as large as its explanatory panel").toBeGreaterThanOrEqual(geometry.panel.area);
}

async function expectSmartHomeScenePriority(page, simulator, width, state) {
  const phone = simulator.locator("[data-smart-home-phone]");
  const activeControl = phone.locator("[data-phone-control-panel]:not([hidden]) input, [data-phone-control-panel]:not([hidden]) button").first();
  await expect(phone, "smart-home phone must remain available for " + state).toBeVisible();
  await expect(activeControl, "smart-home active control must remain available for " + state).toBeVisible();
  await phone.scrollIntoViewIfNeeded();
  await activeControl.evaluate((element) => element.scrollIntoView({ block: "nearest", inline: "nearest" }));

  const geometry = await simulator.evaluate((root) => {
    const boundsFor = (selector) => {
      const candidate = root.querySelector(selector);
      if (!candidate) return null;
      const bounds = candidate.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
        area: bounds.width * bounds.height
      };
    };
    const scene = boundsFor(".smart-home__scene");
    const phone = boundsFor("[data-smart-home-phone]");
    const controls = boundsFor("[data-phone-controls]");
    const experience = boundsFor("[data-smart-home-experience]");
    const activeControl = boundsFor("[data-phone-control-panel]:not([hidden]) input, [data-phone-control-panel]:not([hidden]) button");
    return {
      scene,
      phone,
      controls,
      experience,
      activeControl,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  });

  expect(geometry.scene, "smart-home needs a main scene for " + state).not.toBeNull();
  expect(geometry.phone, "smart-home needs a phone surface for " + state).not.toBeNull();
  expect(geometry.controls, "smart-home needs a control surface for " + state).not.toBeNull();
  expect(geometry.experience, "smart-home needs an experience surface for " + state).not.toBeNull();
  expect(geometry.activeControl, "smart-home needs a reachable active control for " + state).not.toBeNull();
  expect(geometry.scene.area, "smart-home scene must exceed its whole phone surface at " + width + "px for " + state).toBeGreaterThan(geometry.phone.area);
  expect(geometry.scene.area, "smart-home scene must exceed its active control surface at " + width + "px for " + state).toBeGreaterThan(geometry.controls.area);
  expect(geometry.scene.area, "smart-home scene must retain a substantial share of the experience at " + width + "px for " + state).toBeGreaterThanOrEqual(geometry.experience.area * 0.25);
  expect(geometry.phone.left, "smart-home phone must not clip on the left at " + width + "px for " + state).toBeGreaterThanOrEqual(-2);
  expect(geometry.phone.right, "smart-home phone must not clip on the right at " + width + "px for " + state).toBeLessThanOrEqual(geometry.viewport.width + 2);
  expect(geometry.phone.top, "smart-home phone must be wholly inspectable at " + width + "px for " + state).toBeGreaterThanOrEqual(-2);
  expect(geometry.phone.bottom, "smart-home phone must be wholly inspectable at " + width + "px for " + state).toBeLessThanOrEqual(geometry.viewport.height + 2);
  expect(geometry.activeControl.left, "smart-home active control must not clip on the left at " + width + "px for " + state).toBeGreaterThanOrEqual(geometry.phone.left - 1);
  expect(geometry.activeControl.right, "smart-home active control must not clip on the right at " + width + "px for " + state).toBeLessThanOrEqual(geometry.phone.right + 1);
  expect(geometry.activeControl.top, "smart-home active control must remain visible in the phone at " + width + "px for " + state).toBeGreaterThanOrEqual(geometry.phone.top - 1);
  expect(geometry.activeControl.bottom, "smart-home active control must remain visible in the phone at " + width + "px for " + state).toBeLessThanOrEqual(geometry.phone.bottom + 1);
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

async function renderedPixelSignature(surface) {
  const pixels = await surface.screenshot({ animations: "disabled" });
  return createHash("sha256").update(pixels).digest("hex");
}

async function smartHomeTopologySignature(simulator) {
  const topology = simulator.locator("[data-scene-topology]");
  return topology.evaluate((element) => {
    const text = (selector) => element.querySelector(selector)?.textContent?.trim() ?? "";
    return {
      source: text("[data-topology-source]"),
      logic: text("[data-topology-logic]"),
      result: text("[data-topology-result]"),
      connectors: element.querySelectorAll("[data-topology-connector]").length
    };
  });
}

function expectMeaningfulTopologyChange(before, after, name) {
  expect(after.connectors, name + " must retain its visible relationship structure").toBe(2);
  for (const [key, value] of Object.entries(after)) {
    if (key !== "connectors") expect(value, name + " must retain a populated " + key).not.toBe("");
  }
  const changed = ["source", "logic", "result"].filter((key) => before[key] !== after[key]);
  expect(changed.length, name + " must change at least two topology facts, not only an active attribute").toBeGreaterThanOrEqual(2);
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
    await followOrdinaryLink(page, 'a[href="/services/"]:visible', "no-JavaScript mobile navigation");
    for (const contract of dynamicFallbacks.filter(({ fallbackLink }) => fallbackLink)) {
      await visit(page, contract.route);
      await followOrdinaryLink(page, contract.fallbackLink, contract.route + " no-JavaScript fallback");
    }
  } finally {
    await context.close();
  }

  expect(matrix).toHaveLength(publicRoutes.length * acceptanceWidths.length);
  writeEvidence("no-javascript-route-matrix.json", { matrix });
});

test("runtime claim scanning keeps a truthful negative clause but rejects a positive claim after contrast", async ({ page }) => {
  await page.setContent("<main><p>Ми не публікуємо цін і не надаємо гарантій.</p></main>");
  await expectGroundedDynamicCopy(page.locator("main"), "truthful negative dynamic copy");
  await page.setContent("<main><p>Ми не публікуємо ціни, гарантії, сертифікати та відгуки.</p></main>");
  await expectGroundedDynamicCopy(page.locator("main"), "truthful negative list dynamic copy");
  await page.setContent("<main><p>Ми не публікуємо цін, але ціна конфігурації становить 24 000 грн.</p></main>");
  await expect(expectGroundedDynamicCopy(page.locator("main"), "mixed dynamic copy")).rejects.toThrow(/unsupported public claims/u);
  await page.setContent("<main><p>Не публікуємо ціну і ціна системи становить 24 000 грн.</p></main>");
  await expect(expectGroundedDynamicCopy(page.locator("main"), "same-clause mixed dynamic copy")).rejects.toThrow(/unsupported public claims/u);
  for (const [category, copy] of [
    ["telemetry", "Не публікуємо телеметрію і live-статус системи доступний."],
    ["portal", "Не надаємо портал і портал дає доступ до керування."],
    ["vendor", "Не заявляємо сумісність і конфігурація сумісна з KNX."],
    ["price", "Не публікуємо ціну і ціна системи становить 24 000 грн."],
    ["guarantee", "Не надаємо гарантій і гарантуємо результат."],
    ["certificate", "Без сертифікатів і маємо сертифікат відповідності."],
    ["review", "Не публікуємо відгуків і показуємо відгук замовника."],
    ["project", "Не публікуємо проєктів і реалізований клієнтський проєкт підтверджує підхід."]
  ]) {
    await page.setContent("<main><p>" + copy + "</p></main>");
    await expect(expectGroundedDynamicCopy(page.locator("main"), "same-clause " + category + " dynamic copy")).rejects.toThrow(/unsupported public claims/u);
  }
});

test("public surface rejects disabled, inert, and undersized generic interactive targets", async ({ page }) => {
  await page.setViewportSize(viewportFor(375));
  await page.setContent(`
    <html lang="uk"><head><meta name="robots" content="noindex"></head><body>
      <header role="banner"></header>
      <main><h1>Перевірка поверхні</h1>
        <input type="button" disabled value="Недоступна дія" style="height:44px;width:160px">
        <div inert><button type="button" style="height:44px;width:160px">Інертна дія</button></div>
        <a href="/fixtures/target" style="display:inline">Коротке посилання</a>
      </main>
      <footer role="contentinfo"></footer>
    </body></html>
  `);

  await expect(publicSurface(page, "fixture", 375)).rejects.toThrow(/disabled, inert, or live-status surface/u);
});

test("public surface rejects visible live-status chrome", async ({ page }) => {
  await page.setViewportSize(viewportFor(375));
  await page.setContent(`
    <html lang="uk"><head><meta name="robots" content="noindex"></head><body>
      <header role="banner"></header>
      <main><h1>Перевірка стану</h1><p role="status">Нібито доступний оператор</p></main>
      <footer role="contentinfo"></footer>
    </body></html>
  `);

  await expect(publicSurface(page, "live-status", 375)).rejects.toThrow(/disabled, inert, or live-status surface/u);
});

test("public surface permits only flowing inline editorial links below 44px", async ({ page }) => {
  await page.setViewportSize(viewportFor(375));
  await page.setContent(`
    <html lang="uk"><head><meta name="robots" content="noindex"></head><body>
      <header role="banner"></header>
      <main><h1>Перевірка посилань</h1>
        <p>Пояснення містить <a href="/fixtures/editorial" data-inline-editorial-link style="display:inline">звичайне посилання</a> у реченні.</p>
      </main>
      <footer role="contentinfo"></footer>
    </body></html>
  `);

  await expect(publicSurface(page, "flowing-inline", 375)).resolves.toBeDefined();

  await page.setContent(`
    <html lang="uk"><head><meta name="robots" content="noindex"></head><body>
      <header role="banner"></header>
      <main><h1>Перевірка посилань</h1>
        <p><a href="/fixtures/action" data-inline-editorial-link style="display:inline">Дія</a></p>
      </main>
      <footer role="contentinfo"></footer>
    </body></html>
  `);

  await expect(publicSurface(page, "mislabelled-action", 375)).rejects.toThrow(/44px action controls/u);
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
      if (contract.fallbackLink) {
        await followOrdinaryLink(page, contract.fallbackLink, contract.route + " adapter-failure fallback");
      }
    }
  } finally {
    await context.close();
  }

  expect(evidence).toHaveLength(dynamicFallbacks.length);
  writeEvidence("adapter-failure-fallbacks.json", evidence);
});

test("every stateful composition reaches assembled, focus, and reassembled with one dominant scene and panel", async ({ page }) => {
  await withInteractionDiagnostics(page, async () => {
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
});

test("smart-home keeps a dominant scene and a wholly usable phone surface after initial, system, and preset states", async ({ page }) => {
  const screenshots = [];
  await withInteractionDiagnostics(page, async () => {
    for (const width of [375, 1440]) {
      await page.setViewportSize(viewportFor(width));
      await visit(page, "/smart-home/");
      const simulator = page.locator("[data-smart-home-simulator]");
      const phone = simulator.locator("[data-smart-home-phone]");
      const scrollHint = phone.locator(".smart-home__phone-scroll-hint");
      await expect(simulator).toHaveAttribute("data-enhanced", "true");
      await expect(phone).toHaveAttribute("tabindex", "0");
      await expect(phone).toHaveAttribute("aria-label", /прокруч/iu);
      await expectSmartHomeScenePriority(page, simulator, width, "initial");

      if (width === 375) {
        await expect(scrollHint).toBeVisible();
        await expect(scrollHint).toContainText("Прокручуйте панель");
        await phone.focus();
        const before = await phone.evaluate((element) => ({ scrollHeight: element.scrollHeight, scrollTop: element.scrollTop, clientHeight: element.clientHeight }));
        expect(before.scrollHeight, "mobile phone must expose additional controls through its own scroll surface").toBeGreaterThan(before.clientHeight);
        await page.keyboard.press("End");
        await expect.poll(() => phone.evaluate((element) => element.scrollTop)).toBeGreaterThan(before.scrollTop);
        await page.keyboard.press("Home");
        await expect.poll(() => phone.evaluate((element) => element.scrollTop)).toBe(0);
      } else {
        await expect(scrollHint).toBeHidden();
      }

      const system = simulator.locator("button[data-phone-system]").nth(1);
      const systemId = await system.getAttribute("data-phone-system");
      await system.click();
      await expect(simulator).toHaveAttribute("data-system", systemId);
      await expectSmartHomeScenePriority(page, simulator, width, "system");

      const preset = simulator.locator("input[data-preset-radio]").nth(2);
      const presetId = await preset.getAttribute("value");
      await preset.click();
      await expect(simulator).toHaveAttribute("data-preset", presetId);
      await expectSmartHomeScenePriority(page, simulator, width, "preset");

      const screenshot = "smart-home-" + width + "-system-preset.png";
      await page.screenshot({ path: resolve(evidenceDirectory, screenshot) });
      screenshots.push(screenshot);
    }

    expect(screenshots).toEqual(["smart-home-375-system-preset.png", "smart-home-1440-system-preset.png"]);
    writeEvidence("smart-home-geometry.json", { widths: [375, 1440], screenshots });
  });
});

test("the nine residence scene families and physical controls produce real visible media changes", async ({ page }) => {
  await withInteractionDiagnostics(page, async () => {
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

  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit(page, "/smart-home/");
  const simulator = page.locator("[data-smart-home-simulator]");
  const smartHomeScene = simulator.locator(".smart-home__scene");
  const visibleSmartHomeImage = () => simulator.locator("picture[data-scene-picture]:visible img");
  await expect(simulator).toHaveAttribute("data-enhanced", "true");
  const systems = simulator.locator("button[data-phone-system]");
  await expect(systems).toHaveCount(9);
  const selectedSystems = [await systems.first().getAttribute("data-phone-system")];
  let previousSystemMedia = await mediaSignature(visibleSmartHomeImage());
  let previousSystemPixels = await renderedPixelSignature(smartHomeScene);
  let previousSystemTopology = await smartHomeTopologySignature(simulator);
  for (let index = 1; index < await systems.count(); index += 1) {
    const system = systems.nth(index);
    const id = await system.getAttribute("data-phone-system");
    await system.click();
    await expect(simulator).toHaveAttribute("data-system", id);
    await expect(simulator.locator("picture[data-scene-picture]:visible")).toHaveAttribute("data-scene-picture", id);
    const currentSystemMedia = await mediaSignature(visibleSmartHomeImage());
    expect(currentSystemMedia.src, "each smart-home system must switch to a distinct rendered media source").not.toBe(previousSystemMedia.src);
    expect(currentSystemMedia.signature, "each smart-home system must change source pixels, not only data attributes").not.toBe(previousSystemMedia.signature);
    const currentSystemPixels = await renderedPixelSignature(smartHomeScene);
    expect(currentSystemPixels, "each smart-home system must visibly recompose the main scene").not.toBe(previousSystemPixels);
    const currentSystemTopology = await smartHomeTopologySignature(simulator);
    expectMeaningfulTopologyChange(previousSystemTopology, currentSystemTopology, "smart-home system " + id);
    previousSystemMedia = currentSystemMedia;
    previousSystemPixels = currentSystemPixels;
    previousSystemTopology = currentSystemTopology;
    selectedSystems.push(id);
  }
  expect(new Set(selectedSystems).size).toBe(9);
  const presets = simulator.getByRole("radio");
  await expect(presets).toHaveCount(7);
  const selectedPresets = [await presets.first().getAttribute("value")];
  let previousPresetPixels = await renderedPixelSignature(smartHomeScene);
  let previousPresetTopology = await smartHomeTopologySignature(simulator);
  for (let index = 1; index < await presets.count(); index += 1) {
    const preset = presets.nth(index);
    const id = await preset.getAttribute("value");
    await preset.click();
    await expect(simulator).toHaveAttribute("data-preset", id);
    const currentPresetPixels = await renderedPixelSignature(smartHomeScene);
    expect(currentPresetPixels, "each smart-home preset must visibly change scene pixels, even when it retains the selected system source").not.toBe(previousPresetPixels);
    const currentPresetTopology = await smartHomeTopologySignature(simulator);
    expectMeaningfulTopologyChange(previousPresetTopology, currentPresetTopology, "smart-home preset " + id);
    previousPresetPixels = currentPresetPixels;
    previousPresetTopology = currentPresetTopology;
    selectedPresets.push(id);
  }
  expect(new Set(selectedPresets).size).toBe(7);
  await expectGroundedDynamicCopy(simulator, "smart-home controls and presets");
  expect((await new AxeBuilder({ page }).analyze()).violations, "smart-home active preset").toEqual([]);
  });
});

test("touch dispatch follows the same state contracts as pointer and keyboard controls", async ({ browser }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: viewportFor(375), locale: "uk-UA" });
  const page = await context.newPage();
  const evidence = [];

  try {
    await withInteractionDiagnostics(page, async () => {
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
    });
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
    await withInteractionDiagnostics(page, async () => {
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
    });
  } finally {
    await context.close();
  }

  expect(evidence).toHaveLength(publicRoutes.length);
  writeEvidence("reduced-motion.json", evidence);
});

test("selected assembled, focus, and reassembled evidence remains inspectable at four representative widths", async ({ page }) => {
  const screenshots = [];
  await withInteractionDiagnostics(page, async () => {
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
});
