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
const acceptanceViewportDimensions = Object.freeze([
  { width: 375, height: 812 },
  { width: 414, height: 896 },
  { width: 540, height: 960 },
  { width: 768, height: 1024 },
  { width: 900, height: 900 },
  { width: 1024, height: 768 },
  { width: 1280, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1536, height: 1000 },
  { width: 1720, height: 1100 },
  { width: 1980, height: 1200 }
]);
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
const unicodeClaim = (source) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`, "iu");
const unicodeGlobalSpan = (source) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`, "giu");
const dynamicClaimRules = Object.freeze([
  ["telemetry/status", [
    unicodeClaim(String.raw`телеметр[\p{L}\p{N}]*`),
    unicodeClaim(String.raw`(?:live|онлайн)[\s-]*(?:статус|status)`),
    unicodeClaim(String.raw`(?:поточн[\p{L}\p{N}]*|актуальн[\p{L}\p{N}]*|реальн[\p{L}\p{N}]*(?:\s+час[\p{L}\p{N}]*)?)\s+(?:стан|статус|показник[\p{L}\p{N}]*)\s+(?:систем[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*|інженер[\p{L}\p{N}]*)`),
    unicodeClaim(String.raw`(?:статус|показник[\p{L}\p{N}]*)\s+(?:систем[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*|інженер[\p{L}\p{N}]*)`)
  ]],
  ["portal/account/control", [
    unicodeClaim(String.raw`(?:портал[\p{L}\p{N}]*|особист[\p{L}\p{N}]*\s+кабінет[\p{L}\p{N}]*|кабінет[\p{L}\p{N}]*\s+(?:клієнт[\p{L}\p{N}]*|користувач[\p{L}\p{N}]*)|account[\p{L}\p{N}]*|dashboard[\p{L}\p{N}]*)`),
    unicodeClaim(String.raw`(?:віддален[\p{L}\p{N}]*|дистанційн[\p{L}\p{N}]*)\s+(?:керуван[\p{L}\p{N}]*|контрол[\p{L}\p{N}]*)`)
  ]],
  ["vendor compatibility", [
    unicodeClaim(String.raw`(?:knx|loxone|control4|crestron|zigbee|z-wave|matter|homekit|alexa|google\s+home|philips\s+hue)`),
    unicodeClaim(String.raw`(?:сумісн[\p{L}\p{N}]*|підтрим[\p{L}\p{N}]*)\s+(?:з|із)\s+(?:(?:конкретн[\p{L}\p{N}]*\s+)?(?:виробник[\p{L}\p{N}]*|бренд[\p{L}\p{N}]*|платформ[\p{L}\p{N}]*|протокол[\p{L}\p{N}]*|систем[\p{L}\p{N}]*))`),
    unicodeClaim(String.raw`(?:compatible|compatibility)\s+(?:with|vendor|protocol)`)
  ]],
  ["price", [
    unicodeClaim(String.raw`(?:ціна|вартіст[\p{L}\p{N}]*|кошту[\p{L}\p{N}]*|бюджет[\p{L}\p{N}]*|кошторис[\p{L}\p{N}]*)`),
    /[₴€]/u,
    unicodeClaim("грн"),
    /\$\s*\d/u
  ]],
  ["guarantee", [unicodeClaim(String.raw`(?:гаранті[\p{L}\p{N}]*|гаранту[\p{L}\p{N}]*)`)]],
  ["certificate", [unicodeClaim(String.raw`(?:сертифік[\p{L}\p{N}]*|certified)`)]],
  ["review", [unicodeClaim(String.raw`(?:відгук[\p{L}\p{N}]*|рейтинг[\p{L}\p{N}]*|testimonial[\p{L}\p{N}]*|review[\p{L}\p{N}]*)`)]],
  ["client project as fact", [
    unicodeClaim(String.raw`(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт)\s+(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)`),
    unicodeClaim(String.raw`(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)\s+(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт|систем[\p{L}\p{N}]*|рішенн[\p{L}\p{N}]*)`),
    unicodeClaim(String.raw`(?:кейс|case)\s+(?:клієнт[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*)`),
    unicodeClaim(String.raw`(?:клієнт[\p{L}\p{N}]*|власник[\p{L}\p{N}]*)\s+(?:отримав[\p{L}\p{N}]*|отримала[\p{L}\p{N}]*|підтверд[\p{L}\p{N}]*)\s+(?:результат[\p{L}\p{N}]*|рішенн[\p{L}\p{N}]*)`)
  ]]
]);
const negativeDisclosureItemSource = [
  String.raw`телеметр[\p{L}\p{N}]*`,
  String.raw`(?:live|онлайн)[\s-]*(?:статус|status)(?:\s+(?:систем[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*|інженер[\p{L}\p{N}]*))?`,
  String.raw`(?:поточн[\p{L}\p{N}]*|актуальн[\p{L}\p{N}]*|реальн[\p{L}\p{N}]*(?:\s+час[\p{L}\p{N}]*)?)\s+(?:стан|статус|показник[\p{L}\p{N}]*)\s+(?:систем[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*|інженер[\p{L}\p{N}]*)`,
  String.raw`(?:статус|показник[\p{L}\p{N}]*)\s+(?:систем[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*|інженер[\p{L}\p{N}]*)`,
  String.raw`(?:портал[\p{L}\p{N}]*|особист[\p{L}\p{N}]*\s+кабінет[\p{L}\p{N}]*|кабінет[\p{L}\p{N}]*\s+(?:клієнт[\p{L}\p{N}]*|користувач[\p{L}\p{N}]*)|account[\p{L}\p{N}]*|dashboard[\p{L}\p{N}]*)`,
  String.raw`(?:віддален[\p{L}\p{N}]*|дистанційн[\p{L}\p{N}]*)\s+(?:керуван[\p{L}\p{N}]*|контрол[\p{L}\p{N}]*)(?:\s+точк[\p{L}\p{N}]*\s+вход[\p{L}\p{N}]*)?`,
  String.raw`(?:knx|loxone|control4|crestron|zigbee|z-wave|matter|homekit|alexa|google\s+home|philips\s+hue)`,
  String.raw`(?:сумісн[\p{L}\p{N}]*|підтрим[\p{L}\p{N}]*)\s+(?:з|із)\s+(?:(?:конкретн[\p{L}\p{N}]*\s+)?(?:виробник[\p{L}\p{N}]*|бренд[\p{L}\p{N}]*|платформ[\p{L}\p{N}]*|протокол[\p{L}\p{N}]*|систем[\p{L}\p{N}]*))`,
  String.raw`(?:compatible|compatibility)\s+(?:with|vendor|protocol)`,
  String.raw`(?:цін[\p{L}\p{N}]*|вартіст[\p{L}\p{N}]*|кошту[\p{L}\p{N}]*|бюджет[\p{L}\p{N}]*|кошторис[\p{L}\p{N}]*)`,
  String.raw`(?:гаранті[\p{L}\p{N}]*|гаранту[\p{L}\p{N}]*)`,
  String.raw`(?:сертифік[\p{L}\p{N}]*|certified)(?:\s+(?:рішенн[\p{L}\p{N}]*|систем[\p{L}\p{N}]*|продукт[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*))?`,
  String.raw`(?:відгук[\p{L}\p{N}]*|рейтинг[\p{L}\p{N}]*|testimonial[\p{L}\p{N}]*|review[\p{L}\p{N}]*)`,
  String.raw`(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт)\s+(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)`,
  String.raw`(?:реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|завершен[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)\s+(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт|систем[\p{L}\p{N}]*|рішенн[\p{L}\p{N}]*)`,
  String.raw`(?:кейс|case)\s+(?:клієнт[\p{L}\p{N}]*|об[’']?єкт[\p{L}\p{N}]*)`,
  String.raw`(?:клієнт[\p{L}\p{N}]*|власник[\p{L}\p{N}]*)\s+(?:отримав[\p{L}\p{N}]*|отримала[\p{L}\p{N}]*|підтверд[\p{L}\p{N}]*)\s+(?:результат[\p{L}\p{N}]*|рішенн[\p{L}\p{N}]*)`
].join("|");
const negativeDisclosureTerminatorSource = String.raw`(?=(?:\s*[.!?])?\s*(?![\s\S])|\s+(?:і|та|або|чи)\s+(?:не(?=$|[^\p{L}\p{N}_])|без(?=$|[^\p{L}\p{N}_])))`;
const truthfulNegativeDisclosureSpans = Object.freeze([
  unicodeGlobalSpan(String.raw`не\s+публіку[\p{L}\p{N}]*\s+(?:тут\s+)?підтверджен[\p{L}\p{N}]*\s+кейс[\p{L}\p{N}]*\s+(?:чи|або|та|і)\s+матеріал[\p{L}\p{N}]*\s+про\s+виконан[\p{L}\p{N}]*\s+об[’']?єкт[\p{L}\p{N}]*${negativeDisclosureTerminatorSource}`),
  unicodeGlobalSpan(String.raw`не\s+(?:є\s+)?(?:підтверджен[\p{L}\p{N}]*|документальн[\p{L}\p{N}]*|реалізован[\p{L}\p{N}]*|виконан[\p{L}\p{N}]*|встановлен[\p{L}\p{N}]*|змонтован[\p{L}\p{N}]*)\s+(?:клієнтськ[\p{L}\p{N}]*\s+)?(?:кейс|проєкт|об[’']?єкт)[\p{L}\p{N}]*${negativeDisclosureTerminatorSource}`),
  unicodeGlobalSpan(String.raw`не\s+публіку[\p{L}\p{N}]*\s+цін[\p{L}\p{N}]*,\s*гаранті[\p{L}\p{N}]*,\s*сертифік[\p{L}\p{N}]*,\s*відгук[\p{L}\p{N}]*,\s*телеметр[\p{L}\p{N}]*,\s*портал[\p{L}\p{N}]*\s+чи\s+тверджен[\p{L}\p{N}]*\s+про\s+сумісн[\p{L}\p{N}]*\s+із\s+конкретн[\p{L}\p{N}]*\s+виробник[\p{L}\p{N}]*${negativeDisclosureTerminatorSource}`),
  unicodeGlobalSpan(String.raw`не\s+публіку[\p{L}\p{N}]*\s+цін[\p{L}\p{N}]*,\s*гаранті[\p{L}\p{N}]*,\s*сертифік[\p{L}\p{N}]*\s+(?:та|і)\s+відгук[\p{L}\p{N}]*${negativeDisclosureTerminatorSource}`),
  unicodeGlobalSpan(String.raw`не\s+гаранту[\p{L}\p{N}]*(?:\s+(?:жодн[\p{L}\p{N}]*\s+)?(?:результат[\p{L}\p{N}]*|гаранті[\p{L}\p{N}]*))?${negativeDisclosureTerminatorSource}`),
  unicodeGlobalSpan(String.raw`не\s+(?:публіку[\p{L}\p{N}]*|ма[єе]мо|нада[\p{L}\p{N}]*|пропону[\p{L}\p{N}]*|підтрим[\p{L}\p{N}]*|заявля[\p{L}\p{N}]*|гаранту[\p{L}\p{N}]*)\s+(?:${negativeDisclosureItemSource})${negativeDisclosureTerminatorSource}`),
  unicodeGlobalSpan(String.raw`без\s+(?:підтверджен[\p{L}\p{N}]*|${negativeDisclosureItemSource})${negativeDisclosureTerminatorSource}`)
]);
const publicCopyAttributes = Object.freeze(["alt", "aria-label", "aria-description", "aria-valuetext", "aria-roledescription", "title", "placeholder"]);
const publicCopyAttributeSelector = publicCopyAttributes.map((attribute) => "[" + attribute + "]").join(", ");
const nonCopyInputTypes = Object.freeze(["checkbox", "color", "file", "hidden", "image", "password", "radio", "range"]);
const claimCategories = (fragment) => dynamicClaimRules
  .filter(([, patterns]) => patterns.some((pattern) => pattern.test(fragment)))
  .map(([category]) => category);
const serviceStudioRoutes = publicRoutes.filter((route) => route.startsWith("/services/") && route !== "/services/");
const solutionRoutes = publicRoutes.filter((route) => route.startsWith("/solutions/"));
const expectedDynamicFallbackRoutes = Object.freeze([
  "/",
  "/services/",
  ...serviceStudioRoutes,
  ...solutionRoutes,
  "/smart-home/",
  "/process/",
  "/about/"
]);
const dynamicFallbacks = Object.freeze([
  ...["/", "/services/"].map((route) => ({
    route,
    root: "[data-cinematic-root]",
    fallback: "[data-cinematic-fallback]",
    fallbackContent: "[data-cinematic-fallback-directions] > li",
    stage: "[data-cinematic-stage]",
    enhancedAttribute: "data-cinematic-enhanced",
    fallbackLink: "[data-cinematic-fallback] a[data-cinematic-direction-link]"
  })),
  ...serviceStudioRoutes.map((route) => ({
    route,
    root: "[data-service-studio-root]",
    fallback: "[data-service-studio-fallback]",
    fallbackContent: ".service-studio__fallback-relations section",
    stage: "[data-service-studio-stage]",
    enhancedAttribute: "data-service-studio-enhanced",
    fallbackLink: "[data-service-studio-fallback] a[href='/services/']"
  })),
  ...solutionRoutes.map((route) => ({
    route,
    root: "[data-cinematic-solutions-root]",
    fallback: "[data-cinematic-solutions-fallback]",
    fallbackContent: ".cinematic-solutions__fallback-item",
    stage: "[data-cinematic-solutions-stage]",
    enhancedAttribute: "data-cinematic-solutions-enhanced",
    fallbackLink: route === "/solutions/"
      ? "[data-cinematic-solutions-fallback] a[href^='/solutions/']:not([href='/solutions/'])"
      : "[data-cinematic-solutions-fallback] a[href='/solutions/']"
  })),
  {
    route: "/smart-home/",
    root: "[data-smart-home-simulator]",
    fallback: "[data-static-explainer]",
    fallbackContent: ".smart-home__static-systems > li",
    stage: "[data-smart-home-phone]",
    enhancedAttribute: "data-enhanced",
    fallbackLinkScope: "[data-smart-home-physical-fallback]",
    fallbackLink: "[data-smart-home-physical-fallback] a[href='/services/lighting/']"
  },
  ...["/process/", "/about/"].map((route) => ({
    route,
    root: "[data-route-journey-root]",
    fallback: "[data-route-journey-fallback]",
    fallbackContent: "ol > li",
    stage: "[data-route-journey-stage]",
    enhancedAttribute: "data-route-journey-enhanced"
  }))
]);
const geometryWidths = Object.freeze([375, 768, 900, 1024, 1440, 1980]);
const compositionGeometryContracts = Object.freeze([
  ...["/", "/services/"].map((route) => ({
    family: "residence",
    route,
    root: "[data-cinematic-root]",
    enhancedAttribute: "data-cinematic-enhanced",
    phaseAttribute: "data-cinematic-motion-phase",
    stateAttribute: "data-cinematic-state",
    stage: "[data-cinematic-stage]",
    composition: ".residence-spine__composition",
    scene: "[data-cinematic-scene]:not([hidden])",
    panel: "[data-cinematic-panel]:not([hidden])",
    control: ".residence-spine__rail",
    overlay: "residence"
  })),
  ...serviceStudioRoutes.map((route) => ({
    family: "service-studio",
    route,
    root: "[data-service-studio-root]",
    enhancedAttribute: "data-service-studio-enhanced",
    phaseAttribute: "data-service-studio-motion-phase",
    stateAttribute: "data-service-studio-state",
    stage: "[data-service-studio-stage]",
    composition: ".service-studio__composition",
    scene: "[data-service-studio-scene]:not([hidden])",
    panel: "[data-service-studio-panel]:not([hidden])",
    control: ".service-studio__rail"
  })),
  ...solutionRoutes.map((route) => ({
    family: "solutions",
    route,
    root: "[data-cinematic-solutions-root]",
    enhancedAttribute: "data-cinematic-solutions-enhanced",
    phaseAttribute: "data-cinematic-solutions-motion-phase",
    stateAttribute: "data-cinematic-solutions-state",
    stage: "[data-cinematic-solutions-stage]",
    composition: ".cinematic-solutions__composition",
    scene: "[data-cinematic-solutions-scene]:not([hidden])",
    panel: "[data-cinematic-solutions-panel]:not([hidden])",
    control: ".cinematic-solutions__rail"
  })),
  ...["/process/", "/about/"].map((route) => ({
    family: "journey",
    route,
    root: "[data-route-journey-root]",
    enhancedAttribute: "data-route-journey-enhanced",
    phaseAttribute: "data-route-journey-motion-phase",
    stateAttribute: "data-route-journey-state",
    stage: "[data-route-journey-stage]",
    composition: ".route-journey__composition",
    scene: "[data-route-journey-scene]",
    panel: "[data-route-journey-panel]",
    control: ".route-journey__rail"
  })),
  {
    family: "smart-home",
    route: "/smart-home/",
    root: "[data-smart-home-simulator]",
    enhancedAttribute: "data-enhanced",
    stage: "[data-smart-home-experience]",
    composition: "[data-smart-home-experience]",
    scene: ".smart-home__scene",
    panel: "[data-smart-home-phone]"
  }
]);

test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

test.beforeAll(() => {
  mkdirSync(evidenceDirectory, { recursive: true });
  writeEvidence("manifest.json", {
    publicRoutes,
    acceptanceWidths,
    acceptanceViewportDimensions,
    sceneFamilies,
    project: "final-acceptance"
  });
});

test("final acceptance keeps the canonical viewport evidence contract", () => {
  expect(acceptanceViewportDimensions).toEqual([
    { width: 375, height: 812 },
    { width: 414, height: 896 },
    { width: 540, height: 960 },
    { width: 768, height: 1024 },
    { width: 900, height: 900 },
    { width: 1024, height: 768 },
    { width: 1280, height: 900 },
    { width: 1440, height: 1000 },
    { width: 1536, height: 1000 },
    { width: 1720, height: 1100 },
    { width: 1980, height: 1200 }
  ]);
  expect(acceptanceWidths).toEqual(acceptanceViewportDimensions.map(({ width }) => width));
  expect(acceptanceWidths.map((width) => viewportFor(width))).toEqual(acceptanceViewportDimensions);
});

function writeEvidence(name, value) {
  writeFileSync(resolve(evidenceDirectory, name), JSON.stringify(value, null, 2) + "\n");
}

function viewportFor(width) {
  const viewport = acceptanceViewportDimensions.find((candidate) => candidate.width === width);
  if (!viewport) throw new Error("No final-acceptance viewport contract for " + width + "px");
  return { ...viewport };
}

async function visit(page, route) {
  const response = await page.goto(route, { waitUntil: "load" });
  expect(response?.ok(), route + " must return a successful document").toBeTruthy();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("main")).toBeVisible();
  await page.locator('main img:visible:not([loading="lazy"])').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
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

async function expectSemanticFallback(page, contract, label) {
  const root = page.locator(contract.root);
  await expect(root, label + " must retain one composition root").toHaveCount(1);
  const fallback = root.locator(contract.fallback);
  await expect(fallback, label + " must retain a visible static fallback").toBeVisible();
  await expect(fallback, label + " must not hide static fallback content from assistive technology").not.toHaveAttribute("aria-hidden", "true");
  await expect(root.locator(contract.stage), label + " must keep its enhanced stage hidden").toBeHidden();
  await expect(root, label + " must not expose the enhanced adapter state").not.toHaveAttribute(contract.enhancedAttribute);
  const semanticContent = fallback.locator(contract.fallbackContent);
  await expect(semanticContent, label + " must retain readable fallback content").not.toHaveCount(0);
  await expect(semanticContent.first(), label + " must expose the first fallback item").toBeVisible();
  const linkScope = contract.fallbackLinkScope ? page.locator(contract.fallbackLinkScope) : fallback;
  await expect(linkScope, label + " must retain its fallback link scope").toBeVisible();
  const links = await linkScope.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => ({
    href: anchor.href,
    name: anchor.getAttribute("aria-label") || anchor.textContent.trim(),
    disabled: anchor.getAttribute("aria-disabled") === "true"
  })));
  for (const link of links) {
    expect(link.name, label + " fallback anchors need an accessible label").not.toBe("");
    expect(link.disabled, label + " fallback anchors must not masquerade as disabled").toBe(false);
  }
  if (contract.fallbackLink) expect(links.length, label + " must retain an owned semantic fallback anchor").toBeGreaterThan(0);
  return { links, root };
}

function expectExactDynamicFallbackInventory() {
  const routes = dynamicFallbacks.map(({ route }) => route);
  expect(routes).toHaveLength(20);
  expect(new Set(routes).size, "dynamic fallback routes must be unique").toBe(20);
  expect([...routes].sort(), "dynamic fallback routes must cover the exact public composition inventory").toEqual([...expectedDynamicFallbackRoutes].sort());
  expect(routes.every((route) => publicRoutes.includes(route)), "dynamic fallback routes must remain public routes").toBe(true);
}

async function expectFallbackInternalTargets(page, hrefs, label) {
  for (const route of internalRoutes(hrefs)) {
    const response = await page.request.get(new URL(route, baseURL).href);
    expect(response.ok(), label + " fallback target " + route + " must resolve").toBe(true);
  }
}

async function expectCompositionGeometry(root, contract, width, state) {
  const geometry = await root.evaluate((element, selectors) => {
    const visible = (candidate) => {
      const style = getComputedStyle(candidate);
      const bounds = candidate.getBoundingClientRect();
      return !candidate.hidden && style.visibility !== "hidden" && style.display !== "none" && bounds.width > 0 && bounds.height > 0;
    };
    const boundsFor = (candidate) => {
      if (!candidate) return null;
      const bounds = candidate.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
        finite: [bounds.left, bounds.top, bounds.right, bounds.bottom, bounds.width, bounds.height].every(Number.isFinite)
      };
    };
    const single = (selector) => {
      if (!selector) return { count: 0, bounds: null };
      const matches = [...element.querySelectorAll(selector)].filter(visible);
      return { count: matches.length, bounds: boundsFor(matches[0]) };
    };
    const scroll = (candidate) => candidate && {
      clientWidth: candidate.clientWidth,
      clientHeight: candidate.clientHeight,
      scrollWidth: candidate.scrollWidth,
      scrollHeight: candidate.scrollHeight,
      overflowX: getComputedStyle(candidate).overflowX,
      overflowY: getComputedStyle(candidate).overflowY
    };
    const stage = single(selectors.stage);
    const composition = single(selectors.composition);
    const scene = single(selectors.scene);
    const panel = single(selectors.panel);
    const control = single(selectors.control);
    const structural = [scene.bounds, panel.bounds, control.bounds].filter(Boolean);
    const maxStructuralBottom = Math.max(...structural.map(({ bottom }) => bottom));
    const overlap = (left, right) => {
      if (!left || !right) return null;
      return {
        width: Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)),
        height: Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
      };
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      stage,
      composition,
      scene,
      panel,
      control,
      stageScroll: scroll(element.querySelector(selectors.stage)),
      compositionScroll: scroll(element.querySelector(selectors.composition)),
      trailingStageSpace: stage.bounds ? stage.bounds.bottom - maxStructuralBottom : null,
      overlaps: {
        scenePanel: overlap(scene.bounds, panel.bounds),
        controlScene: overlap(control.bounds, scene.bounds),
        controlPanel: overlap(control.bounds, panel.bounds)
      }
    };
  }, contract);

  const name = contract.family + " " + state + " at " + width + "px";
  for (const [part, required] of [["stage", true], ["composition", true], ["scene", true], ["panel", true], ["control", Boolean(contract.control)]]) {
    if (!required) continue;
    expect(geometry[part].count, name + " needs exactly one visible " + part).toBe(1);
    expect(geometry[part].bounds.finite, name + " needs finite " + part + " bounds").toBe(true);
    expect(geometry[part].bounds.width, name + " needs positive " + part + " width").toBeGreaterThan(0);
    expect(geometry[part].bounds.height, name + " needs positive " + part + " height").toBeGreaterThan(0);
  }

  const inside = (inner, outer) => inner.left >= outer.left - 2 && inner.right <= outer.right + 2 && inner.top >= outer.top - 2 && inner.bottom <= outer.bottom + 2;
  for (const part of ["composition", "scene", "panel", ...(contract.control ? ["control"] : [])]) {
    expect(inside(geometry[part].bounds, geometry.stage.bounds), name + " " + part + " must stay wholly inside its stage").toBe(true);
  }
  for (const part of ["scene", "panel", ...(contract.control ? ["control"] : [])]) {
    expect(inside(geometry[part].bounds, geometry.composition.bounds), name + " " + part + " must stay wholly inside its composition").toBe(true);
  }

  expect(geometry.stage.bounds.height, name + " must not grow into a runaway empty stage").toBeLessThanOrEqual(Math.max(geometry.viewport.height * 2.25, 1400));
  expect(geometry.trailingStageSpace, name + " stage must not clip its structural union").toBeGreaterThanOrEqual(-2);
  expect(geometry.trailingStageSpace, name + " stage must not end in uncontrolled empty height").toBeLessThanOrEqual(Math.max(80, geometry.stage.bounds.height * 0.1));
  for (const [part, scroll] of [["stage", geometry.stageScroll], ["composition", geometry.compositionScroll]]) {
    expect(scroll.scrollWidth, name + " " + part + " must not hide horizontal overflow").toBeLessThanOrEqual(scroll.clientWidth + 2);
    expect(scroll.scrollHeight, name + " " + part + " must not hide vertical overflow").toBeLessThanOrEqual(scroll.clientHeight + 2);
  }

  const disjoint = (overlap, pair) => {
    expect(overlap.width <= 2 || overlap.height <= 2, name + " " + pair + " must not overlap").toBe(true);
  };
  if (contract.overlay === "residence" && width > 864) {
    const { scene, panel } = geometry;
    expect(inside(panel.bounds, scene.bounds), name + " residence panel overlay must remain wholly inside the scene frame").toBe(true);
    expect(geometry.overlaps.scenePanel.width, name + " residence panel must overlap the full panel width").toBeGreaterThanOrEqual(panel.bounds.width - 2);
    expect(geometry.overlaps.scenePanel.height, name + " residence panel must overlap the full panel height").toBeGreaterThanOrEqual(panel.bounds.height - 2);
    expect(scene.bounds.width * scene.bounds.height, name + " residence scene must remain larger than its overlay panel").toBeGreaterThanOrEqual(panel.bounds.width * panel.bounds.height);
  } else {
    disjoint(geometry.overlaps.scenePanel, "scene and panel");
  }
  if (contract.control) {
    disjoint(geometry.overlaps.controlScene, "control rail and scene");
    disjoint(geometry.overlaps.controlPanel, "control rail and panel");
  }
  return { family: contract.family, route: contract.route, width, state, geometry };
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
      ordinalMarkers: mainText.match(/(?:^|[\s([{])0[1-9](?=$|[\s)\]}]|[.:](?:\s|$))/gmu) ?? [],
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
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  const motion = await page.evaluate(async () => {
    const elements = [...document.querySelectorAll("*")];
    const css = elements
      .filter((element) => {
        const style = getComputedStyle(element);
        const duration = (value) => value.split(",").some((item) => Number.parseFloat(item) > 0);
        return (style.animationName !== "none" && duration(style.animationDuration)) || duration(style.transitionDuration);
      })
      .map((element) => ({ className: String(element.className), tagName: element.tagName }))
      .slice(0, 20);
    const animations = document.getAnimations();
    const before = new Map(animations.map((animation) => [animation, animation.currentTime]));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 60));
    const waapi = animations
      .filter((animation) => {
        const previous = before.get(animation);
        const current = animation.currentTime;
        const advancing = typeof previous === "number" && typeof current === "number" && Math.abs(current - previous) > 0.5;
        return animation.playState === "running" || animation.pending || advancing;
      })
      .map((animation) => ({
        currentTime: animation.currentTime,
        playState: animation.playState,
        target: animation.effect?.target?.tagName || "unknown"
      }))
      .slice(0, 20);
    return { css, waapi };
  });
  expect(motion.css, "reduced-motion must remove all CSS animation and transition durations").toEqual([]);
  expect(motion.waapi, "reduced-motion must leave no running, pending, or advancing Web Animations").toEqual([]);
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
  const text = await root.evaluate((element, [attributeSelector, attributes, ignoredInputTypes]) => {
    const visible = (candidate) => {
      const style = getComputedStyle(candidate);
      const bounds = candidate.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && bounds.width > 0 && bounds.height > 0;
    };
    const liveLabels = [...element.querySelectorAll("[aria-live]")]
      .filter(visible)
      .map((candidate) => candidate.textContent)
      .filter(Boolean);
    const attributeCandidates = [element, ...element.querySelectorAll(attributeSelector)]
      .filter((candidate) => candidate.matches(attributeSelector) && visible(candidate));
    const attributeCopy = attributeCandidates
      .flatMap((candidate) => attributes.map((attribute) => candidate.getAttribute(attribute)))
      .filter(Boolean);
    const valueCopy = [element, ...element.querySelectorAll("input, textarea")]
      .filter((candidate) => visible(candidate) && (
        candidate instanceof HTMLTextAreaElement ||
        (candidate instanceof HTMLInputElement && !ignoredInputTypes.includes(candidate.type))
      ))
      .map((candidate) => candidate.value)
      .filter(Boolean);
    return [element.innerText, ...liveLabels, ...attributeCopy, ...valueCopy].join("\n");
  }, [publicCopyAttributeSelector, publicCopyAttributes, nonCopyInputTypes]);
  const violations = [];
  for (const fragment of text.split(/(?<=[.!?])\s+/u)) {
    const claimable = truthfulNegativeDisclosureSpans.reduce(
      (copy, pattern) => copy.replace(pattern, " "),
      fragment
    );
    claimCategories(claimable).forEach((category) => violations.push({ category, fragment }));
  }
  expect(violations, name + " must not surface unsupported public claims through dynamic copy").toEqual([]);
}

async function expectGroundedSettledRouteCopy(page, name) {
  return expectGroundedDynamicCopy(page.locator("body"), name);
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
      phone: phone && {
        ...phone,
        clientHeight: root.querySelector("[data-smart-home-phone]").clientHeight,
        scrollHeight: root.querySelector("[data-smart-home-phone]").scrollHeight,
        overflowY: getComputedStyle(root.querySelector("[data-smart-home-phone]")).overflowY
      },
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
  expect(geometry.phone.left, "smart-home phone must not clip on the left at " + width + "px for " + state).toBeGreaterThanOrEqual(-2);
  expect(geometry.phone.right, "smart-home phone must not clip on the right at " + width + "px for " + state).toBeLessThanOrEqual(geometry.viewport.width + 2);
  expect(geometry.activeControl.left, "smart-home active control must not clip on the left at " + width + "px for " + state).toBeGreaterThanOrEqual(geometry.phone.left - 1);
  expect(geometry.activeControl.right, "smart-home active control must not clip on the right at " + width + "px for " + state).toBeLessThanOrEqual(geometry.phone.right + 1);
  if (width <= 864) {
    expect(geometry.scene.width, "mobile smart-home scene must span the experience at " + width + "px for " + state).toBeGreaterThanOrEqual(geometry.experience.width - 2);
    expect(geometry.phone.width, "mobile configurator must span the experience at " + width + "px for " + state).toBeGreaterThanOrEqual(geometry.experience.width - 2);
    expect(geometry.scene.height, "mobile smart-home scene must retain its cinematic frame at " + width + "px for " + state).toBeGreaterThanOrEqual(geometry.scene.width * 0.82);
    expect(geometry.phone.scrollHeight - geometry.phone.clientHeight, "mobile controls must use natural page flow at " + width + "px for " + state).toBeLessThanOrEqual(1);
    expect(["visible", "clip"], "mobile configurator must not capture vertical swipes at " + width + "px for " + state).toContain(geometry.phone.overflowY);
    expect(geometry.activeControl.top, "mobile active control must be reachable in the viewport at " + width + "px for " + state).toBeGreaterThanOrEqual(-2);
    expect(geometry.activeControl.bottom, "mobile active control must be reachable in the viewport at " + width + "px for " + state).toBeLessThanOrEqual(geometry.viewport.height + 2);
  } else {
    expect(geometry.scene.area, "smart-home scene must exceed its whole phone surface at " + width + "px for " + state).toBeGreaterThan(geometry.phone.area);
    expect(geometry.scene.area, "smart-home scene must exceed its active control surface at " + width + "px for " + state).toBeGreaterThan(geometry.controls.area);
    expect(geometry.scene.area, "smart-home scene must retain a substantial share of the experience at " + width + "px for " + state).toBeGreaterThanOrEqual(geometry.experience.area * 0.25);
    expect(geometry.phone.scrollHeight - geometry.phone.clientHeight, "desktop controls must remain in one natural document surface at " + width + "px for " + state).toBeLessThanOrEqual(1);
    expect(geometry.activeControl.top, "desktop active control must be reachable in the viewport at " + width + "px for " + state).toBeGreaterThanOrEqual(-2);
    expect(geometry.activeControl.bottom, "desktop active control must be reachable in the viewport at " + width + "px for " + state).toBeLessThanOrEqual(geometry.viewport.height + 2);
  }
}

async function expectNaturalMobileConfigurator(page, simulator, width, state) {
  const phone = simulator.locator("[data-smart-home-phone]");
  const geometry = await phone.evaluate((surface) => ({
    clientHeight: surface.clientHeight,
    scrollHeight: surface.scrollHeight,
    scrollTop: surface.scrollTop,
    overflowY: getComputedStyle(surface).overflowY,
    documentOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  }));
  expect(geometry.scrollHeight - geometry.clientHeight, `${width}px ${state} must expose every control in document flow`).toBeLessThanOrEqual(1);
  expect(["visible", "clip"], `${width}px ${state} must not capture the page swipe`).toContain(geometry.overflowY);
  expect(geometry.scrollTop, `${width}px ${state} must not create a nested scroll position`).toBe(0);
  expect(geometry.documentOverflow, `${width}px ${state} must not create horizontal overflow`).toBe(0);
}

async function tapRangeFarFromCurrent(range) {
  await range.scrollIntoViewIfNeeded();
  const before = await range.inputValue();
  const target = await range.evaluate((input) => {
    const current = Number(input.value);
    const minimum = Number(input.min);
    const maximum = Number(input.max);
    return current - minimum >= maximum - current ? 0.08 : 0.92;
  });
  const bounds = await range.boundingBox();
  if (!bounds) throw new Error("touch range needs visible geometry");
  await range.tap({ position: { x: Math.max(2, Math.min(bounds.width - 2, bounds.width * target)), y: bounds.height / 2 } });
  await expect.poll(() => range.inputValue()).not.toBe(before);
}

async function mutatePhoneControlByTouch(control) {
  const type = await control.getAttribute("data-control-type");
  if (type === "range") {
    await tapRangeFarFromCurrent(control.locator("input[type='range']"));
  } else if (type === "segment") {
    await control.locator('[data-phone-segment]:not([aria-pressed="true"])').first().tap();
  } else if (type === "toggle") {
    await control.locator("[data-phone-toggle]").tap();
  } else {
    throw new Error(`unknown mobile phone control type: ${type}`);
  }
}

async function expectVisibleState(root, sceneSelector, panelSelector) {
  await expect(root.locator(sceneSelector + ":visible")).toHaveCount(1);
  await expect(root.locator(panelSelector + ":visible")).toHaveCount(1);
}

async function expectAxeClean(page, name) {
  expect((await new AxeBuilder({ page }).analyze()).violations, name + " must pass Axe").toEqual([]);
}

async function inspectCompositionState(page, root, sceneSelector, panelSelector, name) {
  await expectVisibleState(root, sceneSelector, panelSelector);
  await expectDominantScene(root, sceneSelector, panelSelector, name);
  await expectGroundedDynamicCopy(root, name);
  await expectAxeClean(page, name);
}

async function expectFocusVisible(control) {
  await control.focus();
  expect(await control.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
}

async function waitForIdle(root, attribute) {
  await expect(root).toHaveAttribute(attribute, "idle");
}

async function residenceDirectionWithRelation(stage) {
  const relation = stage.locator("button[data-cinematic-relation-control]").first();
  const directionId = await relation.evaluate((button) => button.closest("[data-cinematic-focus-panel]")?.getAttribute("data-cinematic-focus-panel"));
  expect(directionId, "residence needs a relation-capable direction").toMatch(/^[a-z0-9-]+$/u);
  return stage.locator(`button[data-cinematic-direction-control][data-direction-id="${directionId}"]`);
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

async function renderedPixelSignature(page, surface) {
  await surface.scrollIntoViewIfNeeded();
  const bounds = await surface.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error("Visible scene pixels require a bounded viewport surface");
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const right = Math.min(viewport.width, bounds.x + bounds.width);
  const bottom = Math.min(viewport.height, bounds.y + bounds.height);
  if (right <= x || bottom <= y) throw new Error("Visible scene pixels require a non-empty viewport intersection");
  // Element screenshots can temporarily expand Chromium's render surface for a
  // tall scene. A viewport-bounded page clip keeps responsive request telemetry
  // attached to the actual acceptance width while still hashing visible pixels.
  const pixels = await page.screenshot({ animations: "disabled", clip: { x, y, width: right - x, height: bottom - y } });
  return createHash("sha256").update(pixels).digest("hex");
}

async function captureDeterministicScreenshot(page, file, width, route, state) {
  const smartHome = page.locator('[data-smart-home-simulator][data-enhanced="true"]');
  if (await smartHome.count()) await waitForIdle(smartHome, "data-motion-phase");
  await expect(page.locator("[data-outgoing-snapshot]"), file + " must settle its outgoing smart-home frame before capture").toHaveCount(0);
  await page.locator("main img:visible").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await page.evaluate(() => document.fonts.ready);
  const options = { animations: "disabled", caret: "hide" };
  const first = await page.screenshot({ ...options, path: resolve(evidenceDirectory, file) });
  const second = await page.screenshot(options);
  const pngSignature = "89504e470d0a1a0a";
  const expectedViewport = viewportFor(width);
  const inspect = (buffer, label) => {
    expect(buffer.length, label + " must contain encoded PNG bytes").toBeGreaterThan(24);
    expect(buffer.subarray(0, 8).toString("hex"), label + " must retain the PNG signature").toBe(pngSignature);
    const dimensions = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    expect(dimensions, label + " must decode to the requested viewport dimensions").toEqual(expectedViewport);
    return { bytes: buffer.length, dimensions, sha256: createHash("sha256").update(buffer).digest("hex") };
  };
  const primary = inspect(first, file);
  const repeat = inspect(second, file + " repeated capture");
  expect(repeat.sha256, file + " must be byte-deterministic within the same settled browser run").toBe(primary.sha256);
  return { file, route, state, width, ...primary };
}

async function establishCompositionEvidenceFrame(page, root, contract, width, state) {
  const composition = root.locator(contract.composition);
  await expect(composition, contract.family + " " + state + " must retain one evidence composition").toHaveCount(1);
  await composition.evaluate((element) => {
    document.documentElement.style.scrollBehavior = "auto";
    element.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" });
  });
  const adjustment = await root.evaluate((element, selectors) => {
    const control = element.querySelector(selectors.control);
    const bounds = control?.getBoundingClientRect();
    if (!bounds) return 0;
    const requiredVisibleHeight = Math.min(44, bounds.height);
    return Math.max(0, bounds.top - (window.innerHeight - requiredVisibleHeight));
  }, contract);
  if (adjustment > 0) {
    await page.evaluate((offset) => window.scrollBy({ top: offset, left: 0, behavior: "auto" }), adjustment);
  }
  await page.evaluate(() => new Promise((resolveAnimationFrame) => requestAnimationFrame(resolveAnimationFrame)));

  const frame = await root.evaluate((element, [selectors, scrollAdjustment]) => {
    const boundsFor = (selector) => {
      const candidate = element.querySelector(selector);
      const bounds = candidate?.getBoundingClientRect();
      return bounds && {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height
      };
    };
    const visibleHeight = (bounds) => Math.max(0, Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0));
    const composition = boundsFor(selectors.composition);
    const scene = boundsFor(selectors.scene);
    const panel = boundsFor(selectors.panel);
    const control = boundsFor(selectors.control);
    return {
      name: "composition-scene-control-frame",
      scrollY: window.scrollY,
      adjustment: scrollAdjustment,
      composition,
      scene,
      panel,
      control,
      visibleSceneHeight: visibleHeight(scene),
      visiblePanelHeight: visibleHeight(panel),
      visibleControlHeight: visibleHeight(control),
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  }, [contract, adjustment]);

  const label = contract.family + " " + state + " evidence at " + width + "px";
  for (const part of ["composition", "scene", "panel", "control"]) {
    expect(frame[part], label + " needs " + part + " bounds before capture").not.toBeNull();
    expect(frame[part].left, label + " " + part + " must not clip left").toBeGreaterThanOrEqual(-2);
    expect(frame[part].right, label + " " + part + " must not clip right").toBeLessThanOrEqual(frame.viewport.width + 2);
  }
  expect(Math.abs(frame.composition.top + frame.adjustment), label + " must use its explicit composition anchor").toBeLessThanOrEqual(2);
  expect(frame.visibleSceneHeight, label + " must retain scene depth in the captured viewport").toBeGreaterThanOrEqual(Math.min(frame.scene.height, frame.viewport.height * 0.25));
  expect(frame.visiblePanelHeight, label + " must retain explanatory copy in the captured viewport").toBeGreaterThanOrEqual(Math.min(frame.panel.height, 44));
  expect(frame.visibleControlHeight, label + " must retain a causal control surface in the captured viewport").toBeGreaterThanOrEqual(Math.min(frame.control.height, 44) - 1);
  return frame;
}

async function captureCompositionEvidence(page, root, contract, file, width, route, state) {
  const frame = await establishCompositionEvidenceFrame(page, root, contract, width, state);
  return {
    ...(await captureDeterministicScreenshot(page, file, width, route, state)),
    frame
  };
}

async function establishSmartHomeEvidenceFrame(page, simulator, width, state) {
  await simulator.evaluate((element) => {
    document.documentElement.style.scrollBehavior = "auto";
    element.scrollIntoView({ behavior: "instant", block: "start", inline: "nearest" });
    const phone = element.querySelector("[data-smart-home-phone]");
    if (phone) phone.scrollTop = 0;
  });
  await expect.poll(() => page.evaluate(() => {
    const simulator = document.querySelector("[data-smart-home-simulator]");
    const bounds = simulator?.getBoundingClientRect();
    const phone = simulator?.querySelector("[data-smart-home-phone]");
    return {
      scrollY: window.scrollY,
      simulatorTop: bounds?.top ?? null,
      phoneScrollTop: phone?.scrollTop ?? null
    };
  })).toEqual({ scrollY: expect.any(Number), simulatorTop: expect.any(Number), phoneScrollTop: 0 });

  const frame = await page.evaluate(() => {
    const simulator = document.querySelector("[data-smart-home-simulator]");
    const bounds = simulator.getBoundingClientRect();
    const phone = simulator.querySelector("[data-smart-home-phone]");
    return {
      name: "smart-home-simulator-top",
      scrollY: window.scrollY,
      simulatorTop: bounds.top,
      simulatorBottom: bounds.bottom,
      phoneScrollTop: phone.scrollTop
    };
  });
  expect(frame.scrollY, "smart-home " + state + " at " + width + "px must expose its explicit component frame").toBeGreaterThan(0);
  expect(frame.simulatorTop, "smart-home " + state + " at " + width + "px must align the simulator frame to the viewport top").toBeGreaterThanOrEqual(-2);
  expect(frame.simulatorTop, "smart-home " + state + " at " + width + "px must not drift below the viewport top").toBeLessThanOrEqual(2);
  expect(frame.simulatorBottom, "smart-home " + state + " at " + width + "px must leave the component frame visible").toBeGreaterThan(0);
  expect(frame.phoneScrollTop, "smart-home " + state + " at " + width + "px must capture the phone from its stable initial scroll position").toBe(0);
  return frame;
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
  const focus = await residenceDirectionWithRelation(stage);
  await expectFocusVisible(focus);
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-cinematic-state", "focus");
  await waitForIdle(root, "data-cinematic-motion-phase");
  await inspectCompositionState(page, root, "[data-cinematic-scene]", "[data-cinematic-panel]", route + " focus");
  await stage.locator("[data-cinematic-panel]:not([hidden]) button[data-cinematic-relation-control]").first().click();
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
  await stage.locator('button[data-route-journey-action="show-relationship"]:not([hidden])').click();
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
  expectExactDynamicFallbackInventory();
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, locale: "uk-UA" });
  const page = await context.newPage();
  const matrix = [];
  const fallbackByRoute = new Map(dynamicFallbacks.map((contract) => [contract.route, contract]));
  const fallbackHrefs = new Set();

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
        const contract = fallbackByRoute.get(route);
        if (contract) {
          const fallback = await expectSemanticFallback(page, contract, route + " no-JavaScript fallback at " + width + "px");
          fallback.links.forEach(({ href }) => fallbackHrefs.add(href));
        }
        matrix.push({ route, width, controls: surface.controls, fallback: Boolean(contract), overflow: surface.overflow });
      }
    }

    await page.setViewportSize(viewportFor(375));
    await visit(page, "/");
    const mobileNavigation = page.locator(".mobile-nav");
    if (await mobileNavigation.isVisible()) await mobileNavigation.locator("summary").click();
    await followOrdinaryLink(page, 'a[href="/services/"]:visible', "no-JavaScript mobile navigation");
    for (const contract of dynamicFallbacks) {
      await visit(page, contract.route);
      if (contract.fallbackLink) await followOrdinaryLink(page, contract.fallbackLink, contract.route + " no-JavaScript fallback");
    }
    await expectFallbackInternalTargets(page, [...fallbackHrefs], "no-JavaScript");
  } finally {
    await context.close();
  }

  expect(matrix).toHaveLength(publicRoutes.length * acceptanceWidths.length);
  expect(matrix.filter(({ fallback }) => fallback)).toHaveLength(dynamicFallbacks.length * acceptanceWidths.length);
  writeEvidence("no-javascript-route-matrix.json", { fallbackHrefs: [...fallbackHrefs].sort(), matrix });
});

test("runtime claim scanning keeps a truthful negative clause but rejects a positive claim after contrast", async ({ page }) => {
  await page.setContent("<main><p>Ми не публікуємо цін і не надаємо гарантій.</p></main>");
  await expectGroundedDynamicCopy(page.locator("main"), "truthful negative dynamic copy");
  await page.setContent("<main><p>Ми не публікуємо ціни, гарантії, сертифікати та відгуки.</p></main>");
  await expectGroundedDynamicCopy(page.locator("main"), "truthful negative list dynamic copy");
  for (const [category, copy] of [
    ["online status", "Не публікуємо онлайн-статус системи."],
    ["personal account", "Не надаємо особистий кабінет."],
    ["vendor", "Не заявляємо KNX."],
    ["cost", "Не публікуємо вартість."],
    ["rating", "Не публікуємо рейтинг."],
    ["current status", "Не публікуємо поточний статус системи."],
    ["realized project", "Не публікуємо реалізований проєкт."],
    ["guaranteed result", "Не гарантуємо результат."],
    ["any guarantee", "Не гарантуємо жодних гарантій."],
    ["certified solution", "Не публікуємо сертифіковане рішення."]
  ]) {
    await page.setContent("<main><p>" + copy + "</p></main>");
    await expectGroundedDynamicCopy(page.locator("main"), "truthful negative " + category + " dynamic copy");
  }
  await page.setContent("<main><p>Експертелеметрія — один внутрішній термін, а не окреме публічне твердження.</p></main>");
  await expectGroundedDynamicCopy(page.locator("main"), "unicode claim boundary dynamic copy");
  await page.setContent("<main><p>Ми не публікуємо цін, але ціна конфігурації становить 24 000 грн.</p></main>");
  await expect(expectGroundedDynamicCopy(page.locator("main"), "mixed dynamic copy")).rejects.toThrow(/unsupported public claims/u);
  await page.setContent("<main><p>Не публікуємо ціну і ціна системи становить 24 000 грн.</p></main>");
  await expect(expectGroundedDynamicCopy(page.locator("main"), "same-clause mixed dynamic copy")).rejects.toThrow(/unsupported public claims/u);
  await page.setContent("<main><p>Наразі ми не публікуємо тут підтверджених кейсів чи матеріалів про виконані об’єкти.</p></main>");
  await expectGroundedDynamicCopy(page.locator("main"), "scoped project disclosure");
  await page.setContent("<main><p>Наразі ми не публікуємо тут підтверджених кейсів чи матеріалів про виконані об’єкти і реалізований клієнтський проєкт вже завершено.</p></main>");
  await expect(expectGroundedDynamicCopy(page.locator("main"), "scoped mixed project copy")).rejects.toThrow(/unsupported public claims/u);
  for (const [category, copy] of [
    ["telemetry", "Не публікуємо телеметрію і live-статус системи доступний."],
    ["portal", "Не надаємо портал і портал дає доступ до керування."],
    ["vendor", "Не заявляємо сумісність і конфігурація сумісна з KNX."],
    ["price", "Не публікуємо ціну і ціна системи становить 24 000 грн."],
    ["guarantee", "Не надаємо гарантій і гарантуємо результат."],
    ["certificate", "Без сертифікатів і маємо сертифікат відповідності."],
    ["review", "Не публікуємо відгуків і показуємо відгук замовника."],
    ["project", "Не публікуємо проєктів і реалізований клієнтський проєкт підтверджує підхід."],
    ["telemetry repeated", "Ми не публікуємо телеметрії і телеметрії доступні в реальному часі."],
    ["review repeated", "Ми не публікуємо відгуків і відгуки клієнтів це підтверджують."],
    ["vendor repeated", "Ми не публікуємо тверджень про сумісність і сумісність із протоколом доступна."]
  ]) {
    await page.setContent("<main><p>" + copy + "</p></main>");
    await expect(expectGroundedDynamicCopy(page.locator("main"), "same-clause " + category + " dynamic copy")).rejects.toThrow(/unsupported public claims/u);
  }
  for (const [category, copy] of [
    ["telemetry full tail", "Не заявляємо, а поточний статус системи доступний."],
    ["review full tail", "Не публікуємо, а рейтинг клієнтів підтверджує якість робіт."],
    ["compatibility full tail", "Не заявляємо, а compatibility with protocol доступна."],
    ["telemetry live-status tail", "Не публікуємо live-status системи є."],
    ["guarantee assertion tail", "Не надаємо гарантій, гарантія діє."],
    ["certificate assertion tail", "Без сертифікатів, сертифікат додається."],
    ["negated guarantee assertion tail", "Не гарантуємо результат, гарантія діє."],
    ["negated certificate assertion tail", "Не публікуємо сертифіковане рішення, сертифікат додається."],
    ["owner result tail", "Не публікуємо проєктів, власник отримав результат."]
  ]) {
    await page.setContent("<main><p>" + copy + "</p></main>");
    await expect(expectGroundedDynamicCopy(page.locator("main"), category + " dynamic copy"), category).rejects.toThrow(/unsupported public claims/u);
  }
  for (const [category, copy] of [
    ["telemetry semicolon", "Не публікуємо; телеметрія."],
    ["telemetry comma", "Не публікуємо, телеметрія."],
    ["portal colon", "Не публікуємо, портал: особистий кабінет."],
    ["compatibility comma", "Не заявляємо; сумісність із конкретним виробником."],
    ["price semicolon", "Не публікуємо; ціна: значення."],
    ["guarantee colon", "Не надаємо; гарантія: гарантія діє."],
    ["certificate semicolon", "Без; сертифікат: сертифікат додається."],
    ["review comma", "Не публікуємо; відгуки, рейтинг."],
    ["project semicolon", "Не публікуємо; кейс клієнта."]
  ]) {
    await page.setContent("<main><p>" + copy + "</p></main>");
    await expect(expectGroundedDynamicCopy(page.locator("main"), category + " dynamic copy"), category).rejects.toThrow(/unsupported public claims/u);
  }
  await page.setContent("<main><p>Подію доступу пов’язують із потрібною дією без дистанційного керування точкою входу.</p></main>");
  await expectGroundedDynamicCopy(page.locator("main"), "negative remote-control disclosure");
});

test("runtime claim scanning covers all four client-project claim patterns", async ({ page }) => {
  for (const [category, copy] of [
    ["project noun after participle", "Реалізований клієнтський проєкт у приватному будинку."],
    ["system noun after participle", "Виконана система автоматизації працює у демонстраційній конфігурації."],
    ["client case noun", "Кейс клієнта описує погоджений підхід."],
    ["owner received result", "Власник отримав результат для свого об’єкта."]
  ]) {
    await page.setContent("<main><p>" + copy + "</p></main>");
    await expect(expectGroundedDynamicCopy(page.locator("main"), category)).rejects.toThrow(/unsupported public claims/u);
  }
});

test("runtime claim scanning includes public-copy attributes and visible form-control values", async ({ page }) => {
  for (const [category, markup] of [
    ["telemetry alt", '<img alt="Не заявляємо, а поточний статус системи доступний." src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" style="width:40px;height:20px">'],
    ["review aria-label", '<button aria-label="Не публікуємо, а рейтинг клієнтів підтверджує якість робіт.">Відкрити</button>'],
    ["compatibility title", '<span title="Не заявляємо, а compatibility with protocol доступна." style="display:block;width:100px;height:20px">Підпис</span>'],
    ["telemetry placeholder", '<input placeholder="Не заявляємо, а поточний статус системи доступний." style="width:220px">'],
    ["price button value", '<input type="button" value="Ціна електромонтажного проєкту — 24 000 грн." style="width:240px;height:44px">']
  ]) {
    await page.setContent("<main>" + markup + "</main>");
    await expect(expectGroundedDynamicCopy(page.locator("main"), category)).rejects.toThrow(/unsupported public claims/u);
  }

  await page.setContent('<main><input type="button" value="Нейтральна дія" style="width:240px;height:44px"></main>');
  await page.locator("input").evaluate((input) => {
    input.value = "Ціна електромонтажного проєкту — 24 000 грн.";
  });
  await expect(expectGroundedDynamicCopy(page.locator("main"), "dynamic price button value")).rejects.toThrow(/unsupported public claims/u);

  await page.setContent('<main><textarea style="width:240px;height:88px">Нейтральна примітка</textarea></main>');
  await page.locator("textarea").evaluate((textarea) => {
    textarea.value = "Ціна електромонтажного проєкту — 24 000 грн.";
  });
  await expect(expectGroundedDynamicCopy(page.locator("main"), "dynamic price textarea value")).rejects.toThrow(/unsupported public claims/u);

  await page.setContent('<main><input type="hidden" value="Ціна електромонтажного проєкту — 24 000 грн."><input type="radio" value="KNX"><textarea hidden>Гарантуємо результат.</textarea></main>');
  await expectGroundedDynamicCopy(page.locator("main"), "non-copy control values");
});

test("route-level runtime claim scanning includes visible public copy outside main", async ({ page }) => {
  await page.setContent(`
    <header>Ціна електромонтажного проєкту — 24 000 грн.</header>
    <main><p>Нейтральний інженерний опис.</p></main>
    <footer>Завершення сторінки.</footer>
  `);
  await expect(expectGroundedSettledRouteCopy(page, "whole settled route body")).rejects.toThrow(/unsupported public claims/u);
});

test("runtime claim scanning preserves copy before a negative attribute disclosure", async ({ page }) => {
  await page.setContent('<main><div title="Ціна електромонтажного проєкту — 24 000 грн." style="width:240px;height:40px"><span aria-label="Ми не публікуємо цін." style="display:block;width:120px;height:20px"></span></div></main>');
  await expect(expectGroundedDynamicCopy(page.locator("main"), "ordered attribute copy")).rejects.toThrow(/unsupported public claims/u);
});

test("runtime claim scanning covers every settled public route", async ({ page }) => {
  const evidence = [];
  await page.setViewportSize(viewportFor(1024));
  await withInteractionDiagnostics(page, async () => {
    for (const route of publicRoutes) {
      await visit(page, route);
      await expectGroundedSettledRouteCopy(page, route + " settled runtime copy");
      evidence.push(route);
    }
  });
  expect(evidence).toEqual(publicRoutes);
  writeEvidence("runtime-claim-routes.json", evidence);
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

test("visit readiness never waits for deliberately deferred lazy media", async ({ page }) => {
  test.setTimeout(5_000);
  await page.addInitScript(() => {
    const nativeDecode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function decode() {
      if (this.loading === "lazy") return new Promise(() => {});
      return nativeDecode.call(this);
    };
  });

  const startedAt = Date.now();
  await visit(page, "/solutions/");
  expect(Date.now() - startedAt).toBeLessThan(4_000);
});

test("every dynamic family fails closed to a visible semantic fallback when its adapters are unavailable", async ({ browser }) => {
  expectExactDynamicFallbackInventory();
  const fallbackWidths = [375, 768, 1440, 1980];
  const context = await browser.newContext({ baseURL, locale: "uk-UA" });
  await context.route("**/assets/js/**", (route) => route.abort());
  const page = await context.newPage();
  const evidence = [];
  const fallbackHrefs = new Set();

  try {
    for (const width of fallbackWidths) {
      await page.setViewportSize(viewportFor(width));
      for (const contract of dynamicFallbacks) {
        await visit(page, contract.route);
        const fallback = await expectSemanticFallback(page, contract, contract.route + " adapter-failure fallback at " + width + "px");
        fallback.links.forEach(({ href }) => fallbackHrefs.add(href));
        const surface = await publicSurface(page, contract.route, width);
        evidence.push({ route: contract.route, width, controls: surface.controls, overflow: surface.overflow });
        if (width === 768 && contract.fallbackLink) {
          await followOrdinaryLink(page, contract.fallbackLink, contract.route + " adapter-failure fallback");
        }
      }
    }
    await expectFallbackInternalTargets(page, [...fallbackHrefs], "adapter-failure");
  } finally {
    await context.close();
  }

  expect(evidence).toHaveLength(dynamicFallbacks.length * fallbackWidths.length);
  writeEvidence("adapter-failure-fallbacks.json", { fallbackHrefs: [...fallbackHrefs].sort(), fallbackWidths, evidence });
});

async function exerciseGeometryContract(page, contract, width, evidence) {
  await visit(page, contract.route);
  const root = page.locator(contract.root);
  const stage = root.locator(contract.stage);
  await expect(root).toHaveAttribute(contract.enhancedAttribute, "true");
  if (contract.phaseAttribute) await waitForIdle(root, contract.phaseAttribute);
  const capture = async (state) => {
    evidence.push(await expectCompositionGeometry(root, contract, width, state));
  };

  if (contract.family === "residence") {
    await expect(root).toHaveAttribute(contract.stateAttribute, "assembled");
    await capture("assembled");
    await (await residenceDirectionWithRelation(stage)).click();
    await expect(root).toHaveAttribute(contract.stateAttribute, "focus");
    await waitForIdle(root, contract.phaseAttribute);
    await capture("focus");
    await stage.locator("[data-cinematic-panel]:not([hidden]) button[data-cinematic-relation-control]").first().click();
    await expect(root).toHaveAttribute(contract.stateAttribute, "reassembled");
    await waitForIdle(root, contract.phaseAttribute);
    await capture("reassembled");
    return;
  }

  if (contract.family === "service-studio") {
    await expect(root).toHaveAttribute(contract.stateAttribute, "assembled");
    await capture("assembled");
    await stage.locator('button[data-service-studio-action="select-focus"]').click();
    await expect(root).toHaveAttribute(contract.stateAttribute, "focus");
    await waitForIdle(root, contract.phaseAttribute);
    await capture("focus");
    await stage.locator('button[data-service-studio-action="select-reassembled"]').click();
    await expect(root).toHaveAttribute(contract.stateAttribute, "reassembled");
    await waitForIdle(root, contract.phaseAttribute);
    await capture("reassembled");
    return;
  }

  if (contract.family === "solutions") {
    await expect(root).toHaveAttribute(contract.stateAttribute, "assembled");
    await capture("assembled");
    await stage.locator('button[data-cinematic-solutions-action="select-focus"]').click();
    await expect(root).toHaveAttribute(contract.stateAttribute, "focus");
    await waitForIdle(root, contract.phaseAttribute);
    await capture("focus");
    await stage.locator('button[data-cinematic-solutions-action="select-reassembled"]').click();
    await expect(root).toHaveAttribute(contract.stateAttribute, "reassembled");
    await waitForIdle(root, contract.phaseAttribute);
    await capture("reassembled");
    return;
  }

  if (contract.family === "journey") {
    await expect(root).toHaveAttribute(contract.stateAttribute, "assembled");
    await capture("assembled");
    await stage.locator('button[data-route-journey-action="select-node"]').first().click();
    await expect(root).toHaveAttribute(contract.stateAttribute, "focus");
    await waitForIdle(root, contract.phaseAttribute);
    await capture("focus");
    await stage.locator('button[data-route-journey-action="show-relationship"]:not([hidden])').click();
    await expect(root).toHaveAttribute(contract.stateAttribute, "reassembled");
    await waitForIdle(root, contract.phaseAttribute);
    await capture("reassembled");
    return;
  }

  await capture("assembled");
  await root.locator("button[data-phone-system]").nth(1).click();
  await capture("focus");
  await root.locator("input[data-preset-radio]").nth(2).click();
  await capture("reassembled");
}

test("every composition family retains bounded, non-overlapping settled geometry", async ({ page }) => {
  const evidence = [];
  const contractRoutes = (family) => compositionGeometryContracts.filter((contract) => contract.family === family).map(({ route }) => route).sort();
  expect(compositionGeometryContracts.map(({ route }) => route).sort()).toEqual([...expectedDynamicFallbackRoutes].sort());
  expect(contractRoutes("service-studio")).toEqual([...serviceStudioRoutes].sort());
  expect(contractRoutes("solutions")).toEqual([...solutionRoutes].sort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withInteractionDiagnostics(page, async () => {
    for (const width of geometryWidths) {
      await page.setViewportSize(viewportFor(width));
      for (const contract of compositionGeometryContracts) {
        await exerciseGeometryContract(page, contract, width, evidence);
      }
    }
  });
  expect(evidence).toHaveLength(geometryWidths.length * compositionGeometryContracts.length * 3);
  writeEvidence("composition-geometry.json", evidence);
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
    for (const width of [375, 768, 1440, 1980]) {
      await page.setViewportSize(viewportFor(width));
      await visit(page, "/smart-home/");
      const simulator = page.locator("[data-smart-home-simulator]");
      const phone = simulator.locator("[data-smart-home-phone]");
      await expect(simulator).toHaveAttribute("data-enhanced", "true");
      await expect(phone).not.toHaveAttribute("tabindex", /./u);
      await expect(phone).toHaveAttribute("aria-label", "Налаштування простору");
      await expectSmartHomeScenePriority(page, simulator, width, "initial");

      const phoneScroll = await phone.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop
      }));
      expect(phoneScroll.scrollHeight - phoneScroll.clientHeight, "configurator must expose every control through the document flow").toBeLessThanOrEqual(1);
      expect(phoneScroll.scrollTop).toBe(0);

      const system = simulator.locator("button[data-phone-system]").nth(1);
      const systemId = await system.getAttribute("data-phone-system");
      await system.click();
      await expect(simulator).toHaveAttribute("data-system", systemId);
      await waitForIdle(simulator, "data-motion-phase");
      await expectSmartHomeScenePriority(page, simulator, width, "system");

      const preset = simulator.locator("input[data-preset-radio]").nth(2);
      const presetId = await preset.getAttribute("value");
      await preset.click();
      await expect(simulator).toHaveAttribute("data-preset", presetId);
      await waitForIdle(simulator, "data-motion-phase");
      await expectSmartHomeScenePriority(page, simulator, width, "preset");

      const frame = await establishSmartHomeEvidenceFrame(page, simulator, width, "system-preset");
      const screenshot = "smart-home-component-" + width + "-system-preset.png";
      screenshots.push({
        ...(await captureDeterministicScreenshot(page, screenshot, width, "/smart-home/", "system-preset")),
        frame: frame.name,
        frameScrollY: frame.scrollY,
        frameTop: frame.simulatorTop
      });
    }

    expect(screenshots.map(({ file }) => file)).toEqual([375, 768, 1440, 1980].map((width) => "smart-home-component-" + width + "-system-preset.png"));
    expect(screenshots.every(({ dimensions, frame, frameTop }) =>
      dimensions && frame === "smart-home-simulator-top" && frameTop >= -2 && frameTop <= 2
    )).toBe(true);
    expect(screenshots.find(({ width }) => width === 1980)?.dimensions).toEqual({ width: 1980, height: 1200 });
    writeEvidence("smart-home-geometry.json", { widths: [375, 768, 1440, 1980], frame: "smart-home-simulator-top", screenshots });
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
  const smartHomeSceneRequests = [];
  const recordSmartHomeSceneRequest = (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/assets\/images\/(?:home\/control-room|smart-home\/[^/]+)-(?:768|1536)\.webp$/u.test(path)) smartHomeSceneRequests.push(path);
  };
  page.on("request", recordSmartHomeSceneRequest);
  await visit(page, "/smart-home/");
  const simulator = page.locator("[data-smart-home-simulator]");
  const smartHomeScene = simulator.locator(".smart-home__scene");
  const visibleSmartHomeImage = () => simulator.locator("picture[data-scene-picture]:visible img");
  const axeStates = [];
  await expect(simulator).toHaveAttribute("data-enhanced", "true");
  const systems = simulator.locator("button[data-phone-system]");
  await expect(systems).toHaveCount(9);
  const initialSystemId = await systems.first().getAttribute("data-phone-system");
  const selectedSystems = [initialSystemId];
  await expectAxeClean(page, "smart-home system " + initialSystemId);
  axeStates.push("system:" + initialSystemId);
  let previousSystemMedia = await mediaSignature(visibleSmartHomeImage());
  let previousSystemPixels = await renderedPixelSignature(page, smartHomeScene);
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
    const currentSystemPixels = await renderedPixelSignature(page, smartHomeScene);
    expect(currentSystemPixels, "each smart-home system must visibly recompose the main scene").not.toBe(previousSystemPixels);
    const currentSystemTopology = await smartHomeTopologySignature(simulator);
    expectMeaningfulTopologyChange(previousSystemTopology, currentSystemTopology, "smart-home system " + id);
    await expectAxeClean(page, "smart-home system " + id);
    axeStates.push("system:" + id);
    previousSystemMedia = currentSystemMedia;
    previousSystemPixels = currentSystemPixels;
    previousSystemTopology = currentSystemTopology;
    selectedSystems.push(id);
  }
  expect(new Set(selectedSystems).size).toBe(9);
  const presets = simulator.getByRole("radio");
  await expect(presets).toHaveCount(7);
  const initialPresetId = await presets.first().getAttribute("value");
  await presets.first().check();
  await expect(simulator).toHaveAttribute("data-preset", initialPresetId);
  const selectedPresets = [initialPresetId];
  const presetPrimarySystems = [];
  const presetMediaSources = [];
  const initialPanel = simulator.locator(`[data-preset-panel="${initialPresetId}"]`);
  const initialPrimarySystem = await initialPanel.getAttribute("data-primary-system");
  await expect(simulator).toHaveAttribute("data-system", initialPrimarySystem || "");
  presetPrimarySystems.push(initialPrimarySystem);
  presetMediaSources.push((await mediaSignature(visibleSmartHomeImage())).src);
  await expectAxeClean(page, "smart-home preset " + initialPresetId);
  axeStates.push("preset:" + initialPresetId);
  let previousPresetPixels = await renderedPixelSignature(page, smartHomeScene);
  let previousPresetTopology = await smartHomeTopologySignature(simulator);
  for (let index = 1; index < await presets.count(); index += 1) {
    const preset = presets.nth(index);
    const id = await preset.getAttribute("value");
    await preset.click();
    await expect(simulator).toHaveAttribute("data-preset", id);
    const panel = simulator.locator(`[data-preset-panel="${id}"]`);
    const primarySystem = await panel.getAttribute("data-primary-system");
    await expect(simulator).toHaveAttribute("data-system", primarySystem || "");
    const currentPresetPixels = await renderedPixelSignature(page, smartHomeScene);
    expect(currentPresetPixels, "each smart-home preset must visibly change its selected physical context").not.toBe(previousPresetPixels);
    presetPrimarySystems.push(primarySystem);
    presetMediaSources.push((await mediaSignature(visibleSmartHomeImage())).src);
    const currentPresetTopology = await smartHomeTopologySignature(simulator);
    expectMeaningfulTopologyChange(previousPresetTopology, currentPresetTopology, "smart-home preset " + id);
    await expectAxeClean(page, "smart-home preset " + id);
    axeStates.push("preset:" + id);
    previousPresetPixels = currentPresetPixels;
    previousPresetTopology = currentPresetTopology;
    selectedPresets.push(id);
  }
  expect(new Set(selectedPresets).size).toBe(7);
  expect(new Set(presetPrimarySystems).size, "every preset must select its own primary system").toBe(7);
  expect(new Set(presetMediaSources).size, "every preset must resolve to a distinct contextual raster source").toBe(7);
  expect(axeStates.filter((state) => state.startsWith("system:"))).toHaveLength(9);
  expect(axeStates.filter((state) => state.startsWith("preset:"))).toHaveLength(7);
  page.off("request", recordSmartHomeSceneRequest);
  expect(smartHomeSceneRequests.filter((path) => path.endsWith("-768.webp")), "1440px must never start a compact smart-home scene candidate").toEqual([]);
  expect(new Set(smartHomeSceneRequests.filter((path) => path.endsWith("-1536.webp"))).size, "all nine desktop smart-home scene families must load").toBe(9);
  await expectGroundedDynamicCopy(simulator, "smart-home controls and presets");
  writeEvidence("smart-home-axe-states.json", axeStates);
  });
});

test("touch dispatch follows the same state contracts as pointer and keyboard controls", async ({ browser }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: viewportFor(375), locale: "uk-UA" });
  const page = await context.newPage();
  const evidence = [];

  try {
    await withInteractionDiagnostics(page, async () => {
    await visit(page, "/");
    const residence = page.locator("[data-cinematic-root]");
    await (await residenceDirectionWithRelation(page.locator("[data-cinematic-stage]"))).tap();
    await expect(residence).toHaveAttribute("data-cinematic-state", "focus");
    await waitForIdle(residence, "data-cinematic-motion-phase");
    await expectVisibleState(residence, "[data-cinematic-scene]", "[data-cinematic-panel]");
    await page.locator("[data-cinematic-stage] [data-cinematic-panel]:not([hidden]) button[data-cinematic-relation-control]").first().tap();
    await expect(residence).toHaveAttribute("data-cinematic-state", "reassembled");
    await waitForIdle(residence, "data-cinematic-motion-phase");
    await expectVisibleState(residence, "[data-cinematic-scene]", "[data-cinematic-panel]");
    evidence.push("residence");

    await visit(page, "/services/electrical-design/");
    const serviceStudio = page.locator("[data-service-studio-root]");
    await page.locator('[data-service-studio-stage] button[data-service-studio-action="select-focus"]').tap();
    await expect(serviceStudio).toHaveAttribute("data-service-studio-state", "focus");
    await waitForIdle(serviceStudio, "data-service-studio-motion-phase");
    await expectVisibleState(serviceStudio, "[data-service-studio-scene]", "[data-service-studio-panel]");
    await page.locator('[data-service-studio-stage] button[data-service-studio-action="select-reassembled"]').tap();
    await expect(serviceStudio).toHaveAttribute("data-service-studio-state", "reassembled");
    await waitForIdle(serviceStudio, "data-service-studio-motion-phase");
    await expectVisibleState(serviceStudio, "[data-service-studio-scene]", "[data-service-studio-panel]");
    evidence.push("service-studio");

    await visit(page, "/solutions/");
    const solution = page.locator("[data-cinematic-solutions-root]");
    await page.locator('[data-cinematic-solutions-stage] button[data-cinematic-solutions-action="select-focus"]').tap();
    await expect(solution).toHaveAttribute("data-cinematic-solutions-state", "focus");
    await waitForIdle(solution, "data-cinematic-solutions-motion-phase");
    await expectVisibleState(solution, "[data-cinematic-solutions-scene]", "[data-cinematic-solutions-panel]");
    await page.locator('[data-cinematic-solutions-stage] button[data-cinematic-solutions-action="select-reassembled"]').tap();
    await expect(solution).toHaveAttribute("data-cinematic-solutions-state", "reassembled");
    await waitForIdle(solution, "data-cinematic-solutions-motion-phase");
    await expectVisibleState(solution, "[data-cinematic-solutions-scene]", "[data-cinematic-solutions-panel]");
    evidence.push("solution");

    await visit(page, "/process/");
    const journey = page.locator("[data-route-journey-root]");
    await page.locator('[data-route-journey-stage] button[data-route-journey-action="select-node"]').first().tap();
    await expect(journey).toHaveAttribute("data-route-journey-state", "focus");
    await waitForIdle(journey, "data-route-journey-motion-phase");
    await expectVisibleState(journey, "[data-route-journey-scene]", "[data-route-journey-panel]");
    await page.locator('[data-route-journey-stage] button[data-route-journey-action="show-relationship"]:not([hidden])').tap();
    await expect(journey).toHaveAttribute("data-route-journey-state", "reassembled");
    await waitForIdle(journey, "data-route-journey-motion-phase");
    await expectVisibleState(journey, "[data-route-journey-scene]", "[data-route-journey-panel]");
    evidence.push("journey");

    await visit(page, "/smart-home/");
    const simulator = page.locator("[data-smart-home-simulator]");
    const phone = simulator.locator("[data-smart-home-phone]");
    const phoneScrollModel = await phone.evaluate((surface) => ({
      overflowY: getComputedStyle(surface).overflowY,
      hiddenContent: Math.max(0, surface.scrollHeight - surface.clientHeight),
      scrollTop: surface.scrollTop
    }));
    expect(phoneScrollModel.hiddenContent, "mobile configurator must use the page scroll instead of hiding controls in a nested scroller").toBeLessThanOrEqual(1);
    expect(["visible", "clip"], "mobile configurator must not capture the user's vertical swipe").toContain(phoneScrollModel.overflowY);
    expect(phoneScrollModel.scrollTop).toBe(0);
    const smartScene = simulator.locator(".smart-home__scene");
    const smartImage = () => simulator.locator("picture[data-scene-picture]:visible img");
    const beforeSystemMedia = await mediaSignature(smartImage());
    const beforeSystemPixels = await renderedPixelSignature(page, smartScene);
    const beforeSystemTopology = await smartHomeTopologySignature(simulator);
    const systemControl = simulator.locator("button[data-phone-system]").nth(1);
    const systemId = await systemControl.getAttribute("data-phone-system");
    await systemControl.tap();
    await expect(simulator).toHaveAttribute("data-system", systemId);
    await waitForIdle(simulator, "data-motion-phase");
    const afterSystemMedia = await mediaSignature(smartImage());
    expect(afterSystemMedia).not.toEqual(beforeSystemMedia);
    expect(await renderedPixelSignature(page, smartScene)).not.toBe(beforeSystemPixels);
    const afterSystemTopology = await smartHomeTopologySignature(simulator);
    expectMeaningfulTopologyChange(beforeSystemTopology, afterSystemTopology, "touch smart-home system");
    await expectSmartHomeScenePriority(page, simulator, 375, "touch system");
    const beforePresetPixels = await renderedPixelSignature(page, smartScene);
    const presetControl = simulator.locator("input[data-preset-radio]").nth(2);
    const presetId = await presetControl.getAttribute("value");
    await presetControl.tap();
    await expect(simulator).toHaveAttribute("data-preset", presetId);
    await waitForIdle(simulator, "data-motion-phase");
    expect(await renderedPixelSignature(page, smartScene)).not.toBe(beforePresetPixels);
    const afterPresetTopology = await smartHomeTopologySignature(simulator);
    expectMeaningfulTopologyChange(afterSystemTopology, afterPresetTopology, "touch smart-home preset");
    await expectSmartHomeScenePriority(page, simulator, 375, "touch preset");
    evidence.push("smart-home");
    });
  } finally {
    await context.close();
  }

  expect(evidence).toEqual(["residence", "service-studio", "solution", "journey", "smart-home"]);
  writeEvidence("touch-contracts.json", evidence);
});

test("mobile smart-home controls use one touch model across every compact width", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    locale: "uk-UA",
    reducedMotion: "reduce",
    viewport: { width: 320, height: 568 }
  });
  const page = await context.newPage();
  const evidence = [];

  try {
    await withInteractionDiagnostics(page, async () => {
      for (const { width, height } of [
        { width: 320, height: 568 },
        { width: 375, height: 812 },
        { width: 390, height: 844 },
        { width: 414, height: 896 },
        { width: 768, height: 1024 }
      ]) {
        await page.setViewportSize({ width, height });
        await visit(page, "/smart-home/");
        const simulator = page.locator("[data-smart-home-simulator]");
        await expect(simulator).toHaveAttribute("data-enhanced", "true");
        await expectNaturalMobileConfigurator(page, simulator, width, "initial");

        const presetLabel = simulator.locator(".smart-home__preset-choice label").nth(1);
        const presetId = await presetLabel.getAttribute("for");
        await presetLabel.tap();
        await expect(simulator).toHaveAttribute("data-preset", presetId?.replace(/^preset-/u, "") || "");

        for (const systemId of ["shading", "audio", "security", "climate"]) {
          await simulator.locator(`[data-phone-system="${systemId}"]`).tap();
          await expect(simulator).toHaveAttribute("data-system", systemId);
          const before = await simulator.getAttribute("data-preview-signature");
          const activeControl = simulator.locator("[data-phone-control-panel]:visible [data-phone-control]:visible").first();
          await mutatePhoneControlByTouch(activeControl);
          await expect(simulator).not.toHaveAttribute("data-preview-signature", before || "");
          await expect(simulator.locator("[data-physical-scene-svg-overlay][data-physical-scene-svg-instance='smart-home-main']")).toHaveAttribute("data-physical-scene-svg-active-system", systemId);
          await expectNaturalMobileConfigurator(page, simulator, width, systemId);
        }
        evidence.push(width);
      }
    });
  } finally {
    await context.close();
  }

  expect(evidence).toEqual([320, 375, 390, 414, 768]);
  writeEvidence("smart-home-mobile-widths.json", evidence);
});

test("mobile smart-home touch reaches and changes all twenty-four manual controls", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    isMobile: true,
    locale: "uk-UA",
    reducedMotion: "reduce",
    viewport: { width: 375, height: 812 }
  });
  const page = await context.newPage();
  const mutated = [];

  try {
    await withInteractionDiagnostics(page, async () => {
      await visit(page, "/smart-home/");
      const simulator = page.locator("[data-smart-home-simulator]");
      const overlay = simulator.locator("[data-physical-scene-svg-overlay][data-physical-scene-svg-instance='smart-home-main']");
      await expectNaturalMobileConfigurator(page, simulator, 375, "all controls");

      for (const systemId of ["lighting", "climate", "access", "security", "panel", "low-voltage", "backup-power", "audio", "shading"]) {
        await simulator.locator(`[data-phone-system="${systemId}"]`).tap();
        await expect(simulator).toHaveAttribute("data-system", systemId);
        await expect(overlay).toHaveAttribute("data-physical-scene-svg-active-system", systemId);

        while (true) {
          const visibleKeys = await simulator.locator("[data-phone-control-panel]:visible [data-phone-control]:visible").evaluateAll((controls) => controls.map((control) => control.dataset.phoneControl));
          const nextKey = visibleKeys.find((key) => !mutated.includes(key));
          if (!nextKey) break;
          const control = simulator.locator(`[data-phone-control="${nextKey}"]`);
          const previewBefore = await simulator.getAttribute("data-preview-signature");
          const svgBefore = await overlay.getAttribute("data-physical-scene-svg-signature");
          await mutatePhoneControlByTouch(control);
          await expect(simulator).not.toHaveAttribute("data-preview-signature", previewBefore || "");
          await expect(overlay).not.toHaveAttribute("data-physical-scene-svg-signature", svgBefore || "");
          mutated.push(nextKey);
        }
        await expectNaturalMobileConfigurator(page, simulator, 375, systemId);
      }
    });
  } finally {
    await context.close();
  }

  expect(mutated).toHaveLength(24);
  expect(new Set(mutated).size).toBe(24);
  writeEvidence("smart-home-mobile-controls.json", mutated);
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
    await (await residenceDirectionWithRelation(page.locator("[data-cinematic-stage]"))).click();
    await page.locator("[data-cinematic-stage] [data-cinematic-panel]:not([hidden]) button[data-cinematic-relation-control]").first().click();
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
    await page.locator('[data-route-journey-stage] button[data-route-journey-action="show-relationship"]:not([hidden])').click();
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

test("settled visual evidence spans every cinematic composition family at four representative widths", async ({ page }) => {
  const screenshots = [];
  const contractFor = (route) => {
    const contract = compositionGeometryContracts.find((candidate) => candidate.route === route);
    expect(contract, route + " must retain a geometry contract for visual evidence").toBeDefined();
    return contract;
  };
  await withInteractionDiagnostics(page, async () => {
    for (const width of [375, 768, 1440, 1980]) {
      await page.setViewportSize(viewportFor(width));
      await visit(page, "/services/");
      const root = page.locator("[data-cinematic-root]");
      const stage = root.locator("[data-cinematic-stage]");
      await waitForIdle(root, "data-cinematic-motion-phase");
      const assembled = "services-" + width + "-assembled.png";
      screenshots.push(await captureCompositionEvidence(page, root, contractFor("/services/"), assembled, width, "/services/", "assembled"));
      await (await residenceDirectionWithRelation(stage)).click();
      await expect(root).toHaveAttribute("data-cinematic-state", "focus");
      await waitForIdle(root, "data-cinematic-motion-phase");
      const focus = "services-" + width + "-focus.png";
      screenshots.push(await captureCompositionEvidence(page, root, contractFor("/services/"), focus, width, "/services/", "focus"));
      await stage.locator("[data-cinematic-panel]:not([hidden]) button[data-cinematic-relation-control]").first().click();
      await expect(root).toHaveAttribute("data-cinematic-state", "reassembled");
      await waitForIdle(root, "data-cinematic-motion-phase");
      const reassembled = "services-" + width + "-reassembled.png";
      screenshots.push(await captureCompositionEvidence(page, root, contractFor("/services/"), reassembled, width, "/services/", "reassembled"));

      await visit(page, "/services/electrical-design/");
      const serviceStudio = page.locator("[data-service-studio-root]");
      await serviceStudio.locator('button[data-service-studio-action="select-focus"]').click();
      await expect(serviceStudio).toHaveAttribute("data-service-studio-state", "focus");
      await waitForIdle(serviceStudio, "data-service-studio-motion-phase");
      const serviceFocus = "service-detail-" + width + "-focus.png";
      screenshots.push(await captureCompositionEvidence(page, serviceStudio, contractFor("/services/electrical-design/"), serviceFocus, width, "/services/electrical-design/", "focus"));

      await visit(page, "/solutions/");
      const solution = page.locator("[data-cinematic-solutions-root]");
      await solution.locator('button[data-cinematic-solutions-action="select-focus"]').click();
      await waitForIdle(solution, "data-cinematic-solutions-motion-phase");
      await solution.locator('button[data-cinematic-solutions-action="select-reassembled"]').click();
      await expect(solution).toHaveAttribute("data-cinematic-solutions-state", "reassembled");
      await waitForIdle(solution, "data-cinematic-solutions-motion-phase");
      const solutionReassembled = "solutions-" + width + "-reassembled.png";
      screenshots.push(await captureCompositionEvidence(page, solution, contractFor("/solutions/"), solutionReassembled, width, "/solutions/", "reassembled"));

      for (const [slug, route] of [["process", "/process/"], ["about", "/about/"]]) {
        await visit(page, route);
        const journey = page.locator("[data-route-journey-root]");
        await journey.locator('button[data-route-journey-action="select-node"]').first().click();
        await waitForIdle(journey, "data-route-journey-motion-phase");
        await journey.locator('button[data-route-journey-action="show-relationship"]:not([hidden])').click();
        await expect(journey).toHaveAttribute("data-route-journey-state", "reassembled");
        await waitForIdle(journey, "data-route-journey-motion-phase");
        const journeyReassembled = slug + "-" + width + "-reassembled.png";
        screenshots.push(await captureCompositionEvidence(page, journey, contractFor(route), journeyReassembled, width, route, "reassembled"));
      }
    }
    expect(screenshots).toHaveLength(28);
    expect(screenshots.every(({ width, dimensions }) => dimensions && dimensions.width === width && dimensions.height === viewportFor(width).height)).toBe(true);
    expect(screenshots.filter(({ width }) => width === 1980).every(({ dimensions }) =>
      dimensions?.width === 1980 && dimensions?.height === 1200
    )).toBe(true);
    expect(screenshots.every(({ frame }) => frame?.name === "composition-scene-control-frame" && frame.visibleSceneHeight > 0 && frame.visibleControlHeight >= 43)).toBe(true);
    expect(new Set(screenshots.map(({ route }) => route))).toEqual(new Set([
      "/services/",
      "/services/electrical-design/",
      "/solutions/",
      "/process/",
      "/about/"
    ]));
    writeEvidence("screenshots.json", screenshots);
  });
});
