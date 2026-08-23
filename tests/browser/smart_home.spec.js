import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const route = "/smart-home/";
const scenarioIds = ["arrival", "evening", "away", "night", "backup"];
const scenarios = [
  { id: "arrival", label: "Повернення" },
  { id: "evening", label: "Вечір" },
  { id: "away", label: "Вихід" },
  { id: "night", label: "Нічний контур" },
  { id: "backup", label: "Резерв" }
];

const placeholderCopy = /placeholder|lorem ipsum|page-note|контент готується|сторінка готується|текст готується|coming soon/i;
const forbiddenCopy = [
  /(?:відгук\w*|рейтинг\w*|зірк\w*|оцінк\w*)/i,
  /\b\d+(?:[.,]\d+)?\s*\/\s*5\b/i,
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
  for (const phrase of forbiddenCopy) {
    expect(text, "smart-home page should not expose unsupported marketing or vendor copy").not.toMatch(phrase);
  }
}

async function simulatorRoot(page) {
  const root = page.locator("[data-smart-home-simulator]");
  await expect(root).toHaveCount(1);
  return root;
}

async function scenarioRadios(page) {
  const fieldset = page.getByRole("group", { name: /оберіть.*момент|сценарі/i });
  await expect(fieldset).toHaveCount(1);
  const radios = fieldset.getByRole("radio");
  await expect(radios).toHaveCount(scenarios.length);
  return radios;
}

async function assertScenarioOrder(page) {
  const radios = await scenarioRadios(page);
  for (const [index, scenario] of scenarios.entries()) {
    const radio = radios.nth(index);
    await expect(radio).toHaveAccessibleName(scenario.label);
    await expect(radio).toHaveAttribute("value", scenario.id);
  }
}

async function assertSelectedScenario(page, id) {
  const root = await simulatorRoot(page);
  await expect(root).toHaveAttribute("data-scenario", id);

  const radio = page.getByRole("radio", { name: scenarios.find((scenario) => scenario.id === id).label });
  await expect(radio).toBeChecked();

  const panels = root.locator("[data-scenario-panel]");
  await expect(panels).toHaveCount(scenarios.length);
  const visiblePanels = root.locator("[data-scenario-panel]:visible");
  await expect(visiblePanels).toHaveCount(1);
  await expect(visiblePanels).toHaveAttribute("data-scenario-panel", id);
  await expect(visiblePanels.getByRole("heading")).not.toHaveText("");

  const live = root.locator('[aria-live="polite"]');
  await expect(live).toHaveCount(1);
  await expect(live).not.toHaveText("");
}

async function selectScenario(page, id, method = "pointer") {
  const scenario = scenarios.find((candidate) => candidate.id === id);
  const radio = page.getByRole("radio", { name: scenario.label });
  await radio.focus();

  if (method === "pointer") {
    await radio.click();
  } else {
    await radio.press(method);
  }

  await assertSelectedScenario(page, id);
}

async function assertNoOverflowOrClipping(page, context) {
  const measurements = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll("a, button, summary, label[for], input[type='radio']")]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.getAttribute("aria-label") || element.textContent.trim() || element.getAttribute("value"),
          left: rect.left,
          right: rect.right
        };
      })
      .filter(({ left, right }) => left < -1 || right > viewportWidth + 1);
    const sections = [...document.querySelectorAll("main [data-smart-home-section]")]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.getAttribute("aria-label") || element.querySelector("h1, h2")?.textContent.trim(),
          left: rect.left,
          right: rect.right,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth
        };
      })
      .filter(({ left, right, scrollWidth, clientWidth }) =>
        left < -1 || right > viewportWidth + 1 || scrollWidth > clientWidth + 1
      );

    return {
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      controls,
      sections
    };
  });

  expect(measurements.overflow, `${context} should not scroll horizontally`).toBe(0);
  expect(measurements.controls, `${context} should not clip interactive controls`).toEqual([]);
  expect(measurements.sections, `${context} should not clip a smart-home section`).toEqual([]);
}

async function assertMobileTargetSize(page) {
  const undersized = await page.evaluate(() => {
    const targets = [
      ...document.querySelectorAll("header a, header summary, main label[for], main a, main button, footer a")
    ];
    return targets
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.getAttribute("aria-label") || element.textContent.trim(),
          width: rect.width,
          height: rect.height
        };
      })
      .filter(({ width, height }) => width < 44 || height < 44);
  });
  expect(undersized, "mobile smart-home controls and chrome need 44px touch targets").toEqual([]);
}

function instrumentForbiddenRuntime(page) {
  return page.addInitScript(() => {
    window.__smartHomeForbiddenRuntime = {
      canvasContexts: 0,
      fetch: 0,
      xhr: 0,
      beacon: 0,
      storage: 0,
      externalRequests: []
    };

    const captureRequest = (value) => {
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
      captureRequest(args[0]);
      return fetch.call(this, ...args);
    };

    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function trackedXhr(method, url, ...args) {
      window.__smartHomeForbiddenRuntime.xhr += 1;
      captureRequest(url);
      return open.call(this, method, url, ...args);
    };

    const beacon = navigator.sendBeacon?.bind(navigator);
    if (beacon) {
      navigator.sendBeacon = function trackedBeacon(url, ...args) {
        window.__smartHomeForbiddenRuntime.beacon += 1;
        captureRequest(url);
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

test("smart-home route delivers the complete five-scenario semantic experience", async ({ page }) => {
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  await expect(page).toHaveTitle(/Розумний будинок.*Smart Electrics/i);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Розумний будинок");
  await expect(main.locator("[data-smart-home-section]")).toHaveCount(7);
  await expect(main.getByText("Це демонстрація логіки. Вона не підключена до обладнання й адаптується під електромонтажний проєкт", { exact: true })).toBeVisible();

  const root = await simulatorRoot(page);
  const figure = root.locator("figure");
  await expect(figure).toHaveCount(1);
  await expect(figure.locator("picture")).toHaveCount(1);
  await expect(figure.getByRole("img")).toHaveAccessibleName(/\S.{7,}/);
  await expect(figure.getByRole("img")).toHaveAttribute("alt", /\S{8,}/);
  await expect(figure.locator("figcaption")).toContainText(/сценар|об['’ʼ`]?єкт/i);

  await assertScenarioOrder(page);
  await assertSelectedScenario(page, "arrival");

  const configuration = main.getByRole("region", { name: "Поточна конфігурація" });
  await expect(configuration).toBeVisible();
  for (const label of ["Подія", "Що змінюється в об’єкті", "Що визначаємо під час проєктування"]) {
    await expect(configuration.getByText(label, { exact: true })).toBeVisible();
  }

  const systems = main.getByRole("region", { name: "Системи, що узгоджуються між собою" });
  await expect(systems).toBeVisible();
  for (const label of ["Освітлення", "Клімат", "Доступ", "Безпека", "Резервне живлення"]) {
    await expect(systems.getByText(label, { exact: true })).toBeVisible();
  }

  const formation = main.getByRole("region", { name: "Як формується сценарій автоматизації" });
  await expect(formation).toBeVisible();
  await expect(formation.getByRole("listitem")).toHaveCount(5);
  const related = main.getByRole("region", { name: "Пов’язані послуги й готові рішення" });
  await expect(related).toBeVisible();
  expect(await related.getByRole("link").count()).toBeGreaterThanOrEqual(3);

  const contact = main.getByRole("button", { name: "Обговорити об’єкт", exact: true });
  await expect(contact).toBeDisabled();
  await expect(main.getByText(/контактна форма готується/i)).toBeVisible();
  assertTruthfulCopy(await main.innerText());
});

test("scenario selection stays deterministic across pointer, Enter, Space, and native arrow keys", async ({ page }) => {
  await page.goto(route);
  await assertSelectedScenario(page, "arrival");

  await selectScenario(page, "evening");
  await selectScenario(page, "away", "Space");
  await selectScenario(page, "night", "Enter");

  const night = page.getByRole("radio", { name: "Нічний контур" });
  await night.focus();
  await night.press("ArrowRight");
  await assertSelectedScenario(page, "backup");

  await page.reload();
  await assertSelectedScenario(page, "arrival");
});

test("smart-home navigation is active in both desktop and mobile navigation", async ({ page }) => {
  await page.goto(route);

  const desktop = page.getByRole("navigation", { name: "Основна навігація" });
  const desktopLink = desktop.getByRole("link", { name: "Розумний будинок", exact: true });
  await expect(desktopLink).toHaveAttribute("aria-current", "page");

  const mobileMenu = page.locator(".mobile-nav");
  const mobileNavigation = mobileMenu.getByRole("navigation", { name: "Мобільна навігація" });
  const mobileLink = mobileNavigation.getByRole("link", { name: "Розумний будинок", exact: true });
  await expect(mobileLink).toHaveAttribute("aria-current", "page");
  if (await mobileMenu.locator("summary").isVisible()) {
    await mobileMenu.locator("summary").click();
    await expect(mobileLink).toBeVisible();
  }
});

test("all five scenarios remain complete and meaningful without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4000",
    colorScheme: "dark",
    javaScriptEnabled: false,
    locale: "uk-UA"
  });
  const page = await context.newPage();
  try {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator("[data-smart-home-simulator]")).toHaveCount(1);
    await assertScenarioOrder(page);

    const panels = page.locator("[data-scenario-panel]");
    await expect(panels).toHaveCount(scenarios.length);
    for (const [index, scenario] of scenarios.entries()) {
      const panel = panels.nth(index);
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute("data-scenario-panel", scenario.id);
      await expect(panel.getByRole("heading")).not.toHaveText("");
      const outcomes = panel.getByRole("listitem");
      expect(await outcomes.count(), `${scenario.id} should explain 2 to 4 outcomes without JavaScript`).toBeGreaterThanOrEqual(2);
      expect(await outcomes.count(), `${scenario.id} should explain 2 to 4 outcomes without JavaScript`).toBeLessThanOrEqual(4);
      await expect(panel.getByText(/що визначаємо під час проєктування/i)).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("malformed enhancement markup keeps every static scenario readable", async ({ page }) => {
  await page.route("**/smart-home/", async (routeRequest) => {
    const response = await routeRequest.fetch();
    const html = (await response.text()).replace('value="backup"', 'value="malformed-backup"');
    await routeRequest.fulfill({ response, body: html });
  });

  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  const root = await simulatorRoot(page);
  await expect(root).not.toHaveAttribute("data-scenario", /./);

  const panels = root.locator("[data-scenario-panel]");
  await expect(panels).toHaveCount(scenarios.length);
  for (const panel of await panels.all()) {
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading")).not.toHaveText("");
  }
});

test("the simulator avoids forbidden browser capabilities and external runtime requests", async ({ page }) => {
  const externalRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4000") externalRequests.push(url.href);
  });
  await instrumentForbiddenRuntime(page);
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);

  for (const id of scenarioIds) {
    await selectScenario(page, id);
  }

  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("main form, main textarea, main select, main input:not([type='radio'])")).toHaveCount(0);
  const runtime = await page.evaluate(() => window.__smartHomeForbiddenRuntime);
  expect(runtime).toEqual({
    canvasContexts: 0,
    fetch: 0,
    xhr: 0,
    beacon: 0,
    storage: 0,
    externalRequests: []
  });
  expect(externalRequests).toEqual([]);
});

test("the smart-home page is keyboard reachable with visible focus", async ({ page }) => {
  await page.goto(route);
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();

  const arrival = page.getByRole("radio", { name: "Повернення" });
  for (let step = 0; step < 40 && !(await arrival.evaluate((element) => element === document.activeElement)); step += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(arrival).toBeFocused();

  for (const [index, scenario] of scenarios.entries()) {
    const radio = page.getByRole("radio", { name: scenario.label });
    await expect(radio).toBeFocused();
    expect(await radio.evaluate((element) => element.matches(":focus-visible")), `${scenario.label} should show keyboard focus`).toBeTruthy();
    if (index < scenarios.length - 1) await page.keyboard.press("ArrowRight");
  }
});

test("initial state and every scenario state pass axe", async ({ page }) => {
  await page.goto(route);
  for (const id of scenarioIds) {
    await selectScenario(page, id);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${id} state should pass axe`).toEqual([]);
  }
});

test("reduced motion preserves scenario controls without active animation or transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route);
  await selectScenario(page, "backup");

  const activeMotion = await (await simulatorRoot(page)).locator("*").evaluateAll((elements) =>
    elements.filter((element) => {
      const style = getComputedStyle(element);
      const hasAnimation = style.animationName !== "none" && style.animationDuration
        .split(",")
        .some((duration) => Number.parseFloat(duration) > 0);
      const hasTransition = style.transitionDuration
        .split(",")
        .some((duration) => Number.parseFloat(duration) > 0);
      return hasAnimation || hasTransition;
    }).length
  );
  expect(activeMotion).toBe(0);
});

test("smart-home scene imagery loads with meaningful text and keeps the copy readable on image failure", async ({ page }) => {
  await page.goto(route);
  const figure = (await simulatorRoot(page)).locator("figure");
  const image = figure.getByRole("img");
  await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  await expect(image).toHaveAttribute("alt", /\S{8,}/);
  await expect(figure.locator("figcaption")).toContainText(/сценар|об['’ʼ`]?єкт/i);

  await page.route("**/assets/images/**", (routeRequest) => routeRequest.abort());
  await page.reload();
  const fallbackFigure = (await simulatorRoot(page)).locator("figure");
  await expect(fallbackFigure.locator("figcaption")).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("Розумний будинок");
  await expect(page.getByRole("main").getByText("Поточна конфігурація", { exact: true })).toBeVisible();
});

test("all scenario states stay fluid at every required viewport", async ({ page }) => {
  await page.goto(route);
  await expect(page.getByRole("main").locator("[data-smart-home-section]")).toHaveCount(7);
  for (const id of scenarioIds) {
    await selectScenario(page, id);
    await assertNoOverflowOrClipping(page, `${id} at ${page.viewportSize()?.width}px`);
    if ((page.viewportSize()?.width ?? 0) <= 414) await assertMobileTargetSize(page);
  }
});

test("all five scenario states stay fluid at intermediate widths", async ({ page }) => {
  for (const width of [414, 900, 1280, 1720]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    await expect(page.getByRole("main").locator("[data-smart-home-section]")).toHaveCount(7);
    for (const id of scenarioIds) {
      await selectScenario(page, id);
      await assertNoOverflowOrClipping(page, `${id} at intermediate ${width}px`);
      if (width <= 414) await assertMobileTargetSize(page);
    }
  }
});
