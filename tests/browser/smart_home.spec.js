import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const route = "/smart-home/";
const scenarios = [
  { id: "morning", label: "Ранок", primary: "shading", zone: "living", visual: "shading" },
  { id: "arrival", label: "Повернення", primary: "lighting" },
  { id: "evening", label: "Вечір", primary: "lighting" },
  { id: "away", label: "Вихід", primary: "security" },
  { id: "night", label: "Нічний маршрут", primary: "lighting" },
  { id: "heat", label: "Спека", primary: "climate" },
  { id: "backup", label: "Резерв", primary: "backup-power" }
];
const systemIds = ["lighting", "climate", "access", "security", "panel", "low-voltage", "backup-power", "audio", "shading"];
const placeholderCopy = /placeholder|lorem ipsum|page-note|контент готується|сторінка готується|текст готується|coming soon/i;
const forbiddenCopy = [
  /(?:відгук\w*|рейтинг\w*|зірк\w*|оцінк\w*)/i,
  /24\s*\/\s*7/i,
  /\b(?:гаранті\w*|сертифікат\w*|ціна|ціни|вартіст\w*|коштує|кошторис|бюджет|строк\w*|площ\w*|адрес\w*)\b/i,
  /(?:\d[\d\s.,]*)\s*(?:грн|₴|uah|usd|долар\w*|євро)\b/i,
  /\b(?:knx|loxone|control4|crestron|savant|legrand|schneider|ajax|fibaro|tuya|homekit|alexa|philips\s+hue)\b/i,
  /\b(?:zigbee|z-wave|matter|dali|modbus)\b/i,
  /\b(?:vendor|протокол\w*|сумісн\w*|телефон\w*|email|e-mail|formspree|ga4)\b/i,
  /\b(?:онлайн|online|live|telemetry|телеметр\w*|у\s+мережі)\b/i,
  /\bsmart[\s_-]*home\b/i,
  /\bдомашн\w*\s+автоматизац\w*\b/i,
  /\b(?:магі\w*|режим\w*|пакет\w*)\b/i
];

function assertTruthfulCopy(text) {
  expect(text, "smart-home page should not expose placeholder copy").not.toMatch(placeholderCopy);
  expect(text, "smart-home route should not claim that anything is being prepared").not.toMatch(/готується/i);
  for (const phrase of forbiddenCopy) {
    expect(text, "smart-home page should not expose unsupported marketing or vendor copy").not.toMatch(phrase);
  }
}

async function rootFor(page) {
  const root = page.locator("[data-smart-home-simulator]");
  await expect(root).toHaveCount(1);
  return root;
}

async function assertOrder(page) {
  const radios = page.getByRole("group", { name: /оберіть.*момент|сценарі/i }).getByRole("radio");
  await expect(radios).toHaveCount(scenarios.length);
  for (const [index, scenario] of scenarios.entries()) {
    await expect(radios.nth(index)).toHaveAccessibleName(scenario.label);
    await expect(radios.nth(index)).toHaveAttribute("value", scenario.id);
  }
}

async function assertEnhanced(page, scenarioId) {
  const root = await rootFor(page);
  const scenario = scenarios.find((item) => item.id === scenarioId);
  await expect(root).toHaveAttribute("data-enhanced", "true");
  await expect(root).toHaveAttribute("data-scenario", scenarioId);
  await expect(root).toHaveAttribute("data-system", scenario.primary);
  await expect(root.locator("[data-scenario-panel]:visible")).toHaveCount(1);
  await expect(root.locator("picture[data-scene-picture]:visible")).toHaveCount(1);
  await expect(root.locator("[data-route-layer]:visible")).toHaveCount(1);
  await expect(root.locator("button[data-system-control]:visible")).toHaveCount(systemIds.length);
  await expect(root.locator("[data-system-label]:visible")).toHaveCount(0);
}

async function chooseScenario(page, scenarioId, method = "click") {
  const scenario = scenarios.find((item) => item.id === scenarioId);
  const radio = page.getByRole("radio", { name: scenario.label });
  await radio.focus();
  if (method === "click") await radio.click();
  else await radio.press(method);
  await assertEnhanced(page, scenarioId);
}

async function assertRouteGeometry(page, scenarioId) {
  const root = await rootFor(page);
  const geometry = await root.evaluate((element, id) => {
    const scene = element.querySelector("[data-scenario-scene]");
    const route = element.querySelector('[data-route-layer="' + id + '"]');
    const panel = element.querySelector('[data-scenario-panel="' + id + '"]');
    const sceneRect = scene.getBoundingClientRect();
    const routeRect = route.getBoundingClientRect();
    return {
      points: route.points.numberOfItems,
      routeZones: panel.querySelectorAll("[data-route-zone]").length,
      withinScene:
        routeRect.left >= sceneRect.left - 1 &&
        routeRect.right <= sceneRect.right + 1 &&
        routeRect.top >= sceneRect.top - 1 &&
        routeRect.bottom <= sceneRect.bottom + 1
    };
  }, scenarioId);
  expect(geometry.points, scenarioId + " route point count").toBe(geometry.routeZones);
  expect(geometry.withinScene, scenarioId + " route bounds").toBe(true);
}

async function assertViewportBounds(page, label) {
  const bounds = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const width = window.innerWidth;
    return {
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      children: [...document.querySelectorAll("main *")]
        .filter(visible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, left: rect.left, right: rect.right };
        })
        .filter((rect) => rect.left < -1 || rect.right > width + 1)
    };
  });
  expect(bounds.overflow, label + ": document horizontal overflow").toBe(0);
  expect(bounds.children, label + ": actual visible child bounds").toEqual([]);
}

async function assertMobileTargetSize(page) {
  const undersized = await page.evaluate(() =>
    [...document.querySelectorAll("header a, header summary, main label[for], main a, main button, footer a")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { name: element.getAttribute("aria-label") || element.textContent.trim(), width: rect.width, height: rect.height };
      })
      .filter((target) => target.width < 44 || target.height < 44)
  );
  expect(undersized, "mobile controls need 44px targets").toEqual([]);
}

function instrumentForbiddenRuntime(page) {
  return page.addInitScript(() => {
    window.__smartHomeForbiddenRuntime = { canvasContexts: 0, fetch: 0, xhr: 0, beacon: 0, storage: 0, externalRequests: [] };
    const capture = (value) => {
      try {
        const url = new URL(typeof value === "string" ? value : value.url, window.location.href);
        if (url.origin !== window.location.origin) window.__smartHomeForbiddenRuntime.externalRequests.push(url.href);
      } catch (_) {
        window.__smartHomeForbiddenRuntime.externalRequests.push(String(value));
      }
    };
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function trackedCanvasContext(...args) {
      window.__smartHomeForbiddenRuntime.canvasContexts += 1;
      return getContext.call(this, ...args);
    };
    const fetch = window.fetch;
    window.fetch = function trackedFetch(...args) {
      window.__smartHomeForbiddenRuntime.fetch += 1;
      capture(args[0]);
      return fetch.call(this, ...args);
    };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function trackedXhr(method, url, ...args) {
      window.__smartHomeForbiddenRuntime.xhr += 1;
      capture(url);
      return open.call(this, method, url, ...args);
    };
    const beacon = navigator.sendBeacon?.bind(navigator);
    if (beacon) {
      navigator.sendBeacon = function trackedBeacon(url, ...args) {
        window.__smartHomeForbiddenRuntime.beacon += 1;
        capture(url);
        return beacon(url, ...args);
      };
    }
    for (const method of ["getItem", "setItem", "removeItem", "clear"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function trackedStorage(...args) {
        window.__smartHomeForbiddenRuntime.storage += 1;
        return original.call(this, ...args);
      };
    }
  });
}

test("delivers the canonical seven-scenario nine-system model with morning shading as the initial state", async ({ page }) => {
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await assertOrder(page);
  await assertEnhanced(page, "morning");

  const root = await rootFor(page);
  await expect(root).toHaveAttribute("data-zone", "living");
  await expect(root).toHaveAttribute("data-visual", "shading");
  await expect(root.locator("picture[data-scene-picture]:visible")).toHaveAttribute("data-scene-picture", "shading");
  await expect(root.locator("[data-zone-node]")).toHaveCount(7);
  await expect(root.locator("button[data-system-control]")).toHaveCount(systemIds.length);
  await expect(root.locator("picture[data-scene-picture]")).toHaveCount(5);
  await expect(root.locator("video, audio, [autoplay], [data-autoplay]")).toHaveCount(0);
  await expect(root.locator("[data-route-marker], .smart-home__scenario-marker, .smart-home__scenario-index")).toHaveCount(0);
  await assertRouteGeometry(page, "morning");
});

test("plays one cinematic initial assemble without changing the declared morning scenario or looping", async ({ page }) => {
  await page.goto(route);
  const root = await rootFor(page);
  await expect(root).toHaveAttribute("data-motion-phase", "initial");
  await expect(root).toHaveAttribute("data-scenario", "morning");
  await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(0);

  const initialMotion = await root.locator("[data-motion-layer]").evaluateAll((elements) =>
    elements.some((element) => {
      const style = getComputedStyle(element);
      return style.animationName !== "none" && style.animationIterationCount === "1";
    })
  );
  expect(initialMotion).toBe(true);

  await page.waitForTimeout(1200);
  await assertEnhanced(page, "morning");
  await expect(page.getByRole("radio", { name: "Ранок" })).toBeChecked();
});

test("keeps the complete semantic page baseline, truthful copy, and disabled contact CTA", async ({ page }) => {
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  await expect(page).toHaveTitle(/Розумний будинок.*Smart Electrics/i);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Розумний будинок");
  await expect(main.locator("[data-smart-home-section]")).toHaveCount(7);
  await expect(main.getByText(/демонстрація логіки.*не керування обладнанням/i)).toBeVisible();

  const figure = (await rootFor(page)).locator("figure");
  await expect(figure).toHaveCount(1);
  await expect(figure.locator("picture[data-scene-picture]")).toHaveCount(5);
  await expect(figure.locator("picture[data-scene-picture]:visible img")).toHaveAccessibleName(/\S.{7,}/);
  await expect(figure.locator("figcaption")).toContainText(/сценар|об['’ʼ\x60]?єкт/i);

  const configuration = main.getByRole("region", { name: "Поточна конфігурація" });
  const activeConfiguration = configuration.locator("[data-scenario-panel]:visible");
  for (const label of ["Подія", "Що змінюється в об’єкті", "Що визначаємо під час проєктування"]) {
    await expect(activeConfiguration.getByText(label, { exact: true })).toBeVisible();
  }
  const formation = main.getByRole("region", { name: "Як формується сценарій автоматизації" });
  await expect(formation.getByRole("listitem")).toHaveCount(5);
  const related = main.getByRole("region", { name: "Пов’язані послуги й готові рішення" });
  expect(await related.getByRole("link").count()).toBeGreaterThanOrEqual(3);
  await expect(main.getByRole("button", { name: "Обговорити об’єкт", exact: true })).toBeDisabled();
  assertTruthfulCopy(await main.innerText());
  expect(await page.content(), "smart-home HTML must not retain a preparing-status copy in header, CTA, or body").not.toMatch(/готується/i);
});

test("every scenario preserves one panel, picture, route, and valid route geometry", async ({ page }) => {
  await page.goto(route);
  for (const scenario of scenarios) {
    await chooseScenario(page, scenario.id);
    await assertRouteGeometry(page, scenario.id);
  }
});

test("system focus changes the actual zone, visual, explanation, and cinematic A/B phase", async ({ page }) => {
  await page.goto(route);
  const root = await rootFor(page);
  const before = await root.getAttribute("data-motion-phase");
  const control = root.locator('button[data-system-control="climate"]');
  await control.focus();

  await expect(root).toHaveAttribute("data-system", "climate");
  await expect(root).toHaveAttribute("data-zone", "living");
  await expect(root).toHaveAttribute("data-visual", "climate");
  await expect(root.locator("picture[data-scene-picture]:visible")).toHaveAttribute("data-scene-picture", "climate");
  await expect(root.locator("[data-zone-node='living']")).toHaveAttribute("data-active", "true");
  await expect(root.locator("[data-active-system-summary]")).toHaveText(
    await root.locator("[data-scenario-panel='morning'] [data-system-detail='climate']").getAttribute("data-summary")
  );
  await expect(root).not.toHaveAttribute("data-motion-phase", before ?? "");
  const focusedPhase = await root.getAttribute("data-motion-phase");
  await control.click();
  await expect(root).not.toHaveAttribute("data-motion-phase", focusedPhase ?? "");
});

test("each explicit scenario or system selection immediately updates state and disassembles one aria-hidden outgoing snapshot", async ({ page }) => {
  await page.goto(route);
  const root = await rootFor(page);

  await page.getByRole("radio", { name: "Повернення" }).check();
  await assertEnhanced(page, "arrival");
  const outgoingScenario = root.locator("[data-outgoing-snapshot]");
  await expect(outgoingScenario).toHaveCount(1);
  await expect(outgoingScenario).toHaveAttribute("aria-hidden", "true");
  await expect(outgoingScenario).toHaveCSS("animation-name", "smart-home-disassemble");
  const transitionalSnapshotStyles = await outgoingScenario.evaluate((snapshot) => {
    const animation = snapshot.getAnimations().find((candidate) => candidate.animationName === "smart-home-disassemble");
    if (!animation) return { opacity: getComputedStyle(snapshot).opacity, filter: getComputedStyle(snapshot).filter };
    animation.pause();
    animation.currentTime = 460;
    const styles = getComputedStyle(snapshot);
    const result = { opacity: styles.opacity, filter: styles.filter };
    animation.finish();
    return result;
  });
  expect(transitionalSnapshotStyles, "the outgoing scene must disassemble geometrically without dimming or filtering readable labels").toEqual({ opacity: "1", filter: "none" });
  const transitionalCalloutOpacity = await root.locator('button[data-system-control="climate"]').evaluate((button) => {
    const animation = button.getAnimations().find((candidate) => candidate.animationName.startsWith("smart-home-"));
    if (!animation) return getComputedStyle(button).opacity;
    animation.pause();
    animation.currentTime = 290;
    const opacity = getComputedStyle(button).opacity;
    animation.finish();
    return opacity;
  });
  expect(transitionalCalloutOpacity, "interactive callout text must remain fully opaque during its masked reveal").toBe("1");
  const transitionalCoreOpacity = await root.locator('[data-motion-layer="core"]').evaluate((core) => {
    const animation = core.getAnimations().find((candidate) => candidate.animationName.startsWith("smart-home-lens-"));
    if (!animation) return getComputedStyle(core).opacity;
    animation.pause();
    animation.currentTime = 320;
    const opacity = getComputedStyle(core).opacity;
    animation.finish();
    return opacity;
  });
  expect(transitionalCoreOpacity, "central engineering labels must remain fully opaque during their masked reveal").toBe("1");
  await expect(outgoingScenario).toHaveCount(0, { timeout: 1300 });

  await root.locator('button[data-system-control="climate"]').click();
  await expect(root).toHaveAttribute("data-scenario", "arrival");
  await expect(root).toHaveAttribute("data-system", "climate");
  const outgoingSystem = root.locator("[data-outgoing-snapshot]");
  await expect(outgoingSystem).toHaveCount(1);
  await expect(outgoingSystem).toHaveAttribute("aria-hidden", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(outgoingSystem, "animationcancel must remove a snapshot when reduced motion changes mid-transition").toHaveCount(0);
});

test("the central simulator plate is opaque architectural geometry, not a glass widget", async ({ page }) => {
  await page.goto(route);
  const root = await rootFor(page);
  await expect(root.locator(".smart-home__control-glass")).toHaveCount(0);
  const spine = root.locator(".smart-home__control-spine");
  await expect(spine).toHaveCount(1);
  await expect(spine).toHaveCSS("backdrop-filter", "none");
  await expect(spine).toHaveCSS("border-radius", "0px");
  expect(await spine.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
});

test("selection remains deterministic through pointer, Enter, Space, and native arrow keys", async ({ page }) => {
  await page.goto(route);
  await chooseScenario(page, "arrival");
  await chooseScenario(page, "evening", "Enter");
  await chooseScenario(page, "away", "Space");
  await page.getByRole("radio", { name: "Вихід" }).press("ArrowRight");
  await assertEnhanced(page, "night");
  await page.reload();
  await assertEnhanced(page, "morning");
});

test("smart-home navigation is active in desktop and mobile navigation", async ({ page }) => {
  await page.goto(route);
  const desktop = page.locator(".desktop-nav");
  await expect(desktop.locator('a[href="/smart-home/"]')).toHaveAttribute("aria-current", "page");

  const mobile = page.locator(".mobile-nav");
  const mobileLink = mobile.locator('nav a[href="/smart-home/"]');
  await expect(mobileLink).toHaveAttribute("aria-current", "page");
  if (await mobile.locator("summary").isVisible()) {
    await mobile.locator("summary").click();
    await expect(mobileLink).toBeVisible();
  }
});

test("no-JS retains static panels and labels without inert buttons and emits one initial picture and route", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4000",
    colorScheme: "dark",
    javaScriptEnabled: false,
    locale: "uk-UA"
  });
  const page = await context.newPage();
  try {
    await page.goto(route);
    const root = await rootFor(page);
    await expect(root).not.toHaveAttribute("data-enhanced", /./);
    await assertOrder(page);
    await expect(root.locator("[data-scenario-panel]:visible")).toHaveCount(scenarios.length);
    await expect(root.locator("[data-system-label]:visible")).toHaveCount(systemIds.length);
    await expect(root.locator("button[data-system-control]:visible")).toHaveCount(0);
    const staticState = await root.evaluate((element) => ({
      pictures: [...element.querySelectorAll("picture[data-scene-picture]")].filter((node) => !node.hasAttribute("hidden")).length,
      routes: [...element.querySelectorAll("[data-route-layer]")].filter((node) => !node.hasAttribute("hidden")).length
    }));
    expect(staticState).toEqual({ pictures: 1, routes: 1 });
    for (const scenario of scenarios) {
      const panel = root.locator('[data-scenario-panel="' + scenario.id + '"]');
      await expect(panel.getByRole("heading")).not.toHaveText("");
      const outcomes = panel.locator(".smart-home__scenario-outcomes li");
      expect(await outcomes.count(), scenario.id + " outcome lower bound").toBeGreaterThanOrEqual(2);
      expect(await outcomes.count(), scenario.id + " outcome upper bound").toBeLessThanOrEqual(4);
      await expect(panel.getByText(/що визначаємо під час проєктування/i)).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("malformed markup fails closed and keeps static content readable", async ({ page }) => {
  await page.route("**/smart-home/", async (request) => {
    const response = await request.fetch();
    await request.fulfill({ response, body: (await response.text()).replace('value="backup"', 'value="malformed-backup"') });
  });
  await page.goto(route);
  const root = await rootFor(page);
  await expect(root).not.toHaveAttribute("data-enhanced", /./);
  await expect(root.locator("[data-scenario-panel]:visible")).toHaveCount(scenarios.length);
  await expect(root.locator("[data-system-label]:visible")).toHaveCount(systemIds.length);
  await expect(root.locator("button[data-system-control]:visible")).toHaveCount(0);
});

test("the simulator avoids canvas, forms, storage, network APIs, and external runtime requests", async ({ page }) => {
  const externalRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4000") externalRequests.push(url.href);
  });
  await instrumentForbiddenRuntime(page);
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  for (const scenario of scenarios) await chooseScenario(page, scenario.id);

  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("main form, main textarea, main select, main input:not([type='radio'])")).toHaveCount(0);
  expect(await page.evaluate(() => window.__smartHomeForbiddenRuntime)).toEqual({
    canvasContexts: 0,
    fetch: 0,
    xhr: 0,
    beacon: 0,
    storage: 0,
    externalRequests: []
  });
  expect(externalRequests).toEqual([]);
});

test("keyboard traversal exposes visible focus for scenarios and all nine system controls", async ({ page }) => {
  await page.goto(route);
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();

  const firstRadio = page.getByRole("radio", { name: "Ранок" });
  for (let step = 0; step < 48 && !(await firstRadio.evaluate((element) => element === document.activeElement)); step += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(firstRadio).toBeFocused();
  expect(await firstRadio.evaluate((element) => element.matches(":focus-visible"))).toBe(true);

  for (const scenario of scenarios.slice(1)) {
    await page.keyboard.press("ArrowRight");
    const radio = page.getByRole("radio", { name: scenario.label });
    await expect(radio).toBeFocused();
    expect(await radio.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  }

  for (const systemId of systemIds) {
    const control = (await rootFor(page)).locator('button[data-system-control="' + systemId + '"]');
    await control.focus();
    await expect(control).toBeFocused();
    expect(await control.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  }
});

test("all scenario states pass axe and reduced motion resolves to zero animation and transition", async ({ page }) => {
  await page.goto(route);
  for (const scenario of scenarios) {
    await chooseScenario(page, scenario.id);
    expect((await new AxeBuilder({ page }).analyze()).violations, scenario.id + " axe").toEqual([]);
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await chooseScenario(page, "heat");
  await expect((await rootFor(page)).locator("[data-outgoing-snapshot]")).toHaveCount(0);
  const activeMotion = await (await rootFor(page)).locator("*").evaluateAll((elements) =>
    elements.filter((element) => {
      const style = getComputedStyle(element);
      return [style.animationDuration, style.transitionDuration].some((value) =>
        value.split(",").some((duration) => Number.parseFloat(duration) > 0)
      );
    }).length
  );
  expect(activeMotion).toBe(0);
});

test("scene imagery loads with meaningful alt text and leaves copy readable after image abort", async ({ page }) => {
  await page.goto(route);
  const figure = (await rootFor(page)).locator("figure");
  const image = figure.locator("picture[data-scene-picture]:visible img");
  await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  await expect(image).toHaveAttribute("alt", /\S{8,}/);
  await page.route("**/assets/images/**", (request) => request.abort());
  await page.reload();
  const fallbackFigure = (await rootFor(page)).locator("figure");
  await expect(fallbackFigure.locator("figcaption")).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("Розумний будинок");
  await expect(page.getByRole("main").getByText("Поточна конфігурація", { exact: true })).toBeVisible();
});

test("all required viewports retain document and actual child bounds", async ({ page }) => {
  for (const width of [375, 768, 1024, 1440, 1980]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    for (const scenario of scenarios) {
      await chooseScenario(page, scenario.id);
      await assertViewportBounds(page, scenario.id + " at " + width + "px");
      if (width === 375) await assertMobileTargetSize(page);
    }
  }
});

test("intermediate widths retain mobile target sizes and actual child bounds", async ({ page }) => {
  for (const width of [414, 900, 1280, 1720]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    for (const scenario of scenarios) {
      await chooseScenario(page, scenario.id);
      await assertViewportBounds(page, scenario.id + " at intermediate " + width + "px");
      if (width <= 414) await assertMobileTargetSize(page);
    }
  }
});
