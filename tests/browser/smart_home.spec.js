import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const route = "/smart-home/";
const presets = ["Ранок", "Повернення", "Вечір", "Вихід", "Нічний маршрут", "Спека", "Резерв"];
const systems = [
  ["lighting", "Освітлення"], ["climate", "Клімат-контроль"], ["access", "Доступ"],
  ["security", "Безпека й відео"], ["panel", "Щит і захист"], ["low-voltage", "Слабкострумна інфраструктура"],
  ["backup-power", "Резервне живлення"], ["audio", "Аудіо"], ["shading", "Сонцезахист"]
];
const forbiddenCopy = /(?:24\s*\/\s*7|гаранті\w*|сертифікат\w*|ціна|вартіст\w*|knx|loxone|control4|crestron|ajax|zigbee|z-wave|matter|dali|modbus|онлайн|telemetry|телеметр|smart[\s_-]*home|домашн\w*\s+автоматизац\w*)/i;

async function simulator(page) {
  const root = page.locator("[data-smart-home-simulator]");
  await expect(root).toHaveCount(1);
  return root;
}

async function assertEnhancedPhone(page, preset = "morning") {
  const root = await simulator(page);
  await expect(root).toHaveAttribute("data-enhanced", "true");
  await expect(root).toHaveAttribute("data-preset", preset);
  await expect(root.locator("[data-smart-home-phone]")).toBeVisible();
  await expect(root.locator("[data-static-explainer]")).toBeHidden();
  await expect(root.locator("[aria-live]")).toHaveCount(1);
  await expect(root.locator("[data-phone-control-panel]:visible")).toHaveCount(1);
  await expect(root.locator("picture[data-scene-picture]:visible")).toHaveCount(1);
}

async function assertViewport(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(route);
  const root = await simulator(page);
  const bounds = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    escaped: [...document.querySelectorAll("main *")].filter((element) => {
      if (element.closest("[data-outgoing-snapshot]") || getComputedStyle(element).display === "none" || getComputedStyle(element).visibility === "hidden") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).length,
    sceneWidth: document.querySelector("[data-scenario-scene]").getBoundingClientRect().width
  }));
  expect(bounds.overflow, `${width}px document overflow`).toBe(0);
  expect(bounds.escaped, `${width}px visible child bounds`).toBe(0);
  if (width <= 414) {
    const undersized = await root.locator('button:visible, input[type="range"]:visible, .smart-home__preset-choice label:visible, a:visible').evaluateAll((elements) => elements
      .map((element) => ({ label: element.textContent.trim() || element.getAttribute("aria-label") || "", rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width < 44 || rect.height < 44));
    expect(undersized, `${width}px interactive targets`).toEqual([]);
  }
  if (width === 1980) expect(bounds.sceneWidth, "1980px stage width").toBeGreaterThanOrEqual(1400);
}

async function readPresetPreview(root) {
  return root.evaluate((simulatorRoot) => {
    const preview = simulatorRoot.querySelector("[data-scene-preview]");
    return {
      background: getComputedStyle(preview).backgroundImage,
      pixels: getComputedStyle(preview).getPropertyValue("--smart-home-preview-control-1").trim(),
      signature: simulatorRoot.dataset.previewSignature,
      topology: simulatorRoot.querySelector("[data-topology-result]").textContent.trim(),
      explanation: simulatorRoot.querySelector("[data-phone-signature]").textContent.trim()
    };
  });
}

test("upgrades the complete nine-system, seven-preset configuration into one interactive phone", async ({ page }) => {
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  const root = await simulator(page);
  await expect(root.locator(".smart-home__simulator-heading").getByText("Демонстраційна панель сценаріїв", { exact: true })).toBeVisible();
  await expect(page.getByText("Звернення через сайт поки не приймаються", { exact: true })).toBeVisible();
  await expect(page.getByText("На сайті немає форми й оприлюднених контактних каналів.", { exact: true })).toBeVisible();
  await assertEnhancedPhone(page);
  await expect(root.locator("picture[data-scene-picture]")).toHaveCount(9);
  await expect(root.locator("[data-active-scene-label]")).toHaveCount(1);
  await expect(root.getByRole("radio")).toHaveCount(presets.length);
  for (const preset of presets) await expect(root.getByRole("radio", { name: preset })).toHaveCount(1);
  await expect(root.locator("button[data-phone-system]")).toHaveCount(systems.length);
  for (const [id, label] of systems) {
    const button = root.locator(`button[data-phone-system="${id}"]`);
    await expect(button).toHaveAccessibleName(label);
  }
  await expect(root.locator("[data-phone-control]")).toHaveCount(20);
  await expect(root.locator("[data-phone-range]")).toHaveCount(2);
  await expect(root.locator("[data-phone-segment]")).toHaveCount(43);
  await expect(root.locator("[data-phone-toggle]")).toHaveCount(4);
  const audioControlIds = await root.locator('[data-phone-control-panel="audio"] [data-phone-control]').evaluateAll((controls) => controls.map((control) => control.dataset.phoneControl));
  expect(audioControlIds).toEqual(["audio:source", "audio:zone", "audio:group", "audio:muted"]);
  await expect(root.locator("[data-phone-live]")).toContainText("Ранок");
  expect(await page.getByRole("main").innerText()).not.toMatch(forbiddenCopy);
});

test("physical stair and exterior scenes are subordinate to the canonical phone and swap exact media", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  const physical = root.locator("[data-smart-home-physical]");
  await expect(physical).toHaveAttribute("data-smart-home-physical-enhanced", "true");
  await expect(root.locator("button[data-phone-system]")).toHaveCount(systems.length);
  const picture = physical.locator("[data-smart-home-physical-picture]");
  await expect(picture).toHaveAttribute("data-smart-home-physical-picture", "stairs:stair_lighting=off");
  await physical.getByRole("button", { name: "Маршрут сходами", exact: true }).click();
  await expect(picture).toHaveAttribute("data-smart-home-physical-picture", "stairs:stair_lighting=route");
  await expect(picture.locator("img")).toHaveAttribute("src", /stairs-route-1536\.webp$/);
  await physical.getByRole("button", { name: "Зовнішнє освітлення", exact: true }).click();
  await physical.getByRole("button", { name: "Нічне зниження", exact: true }).click();
  await expect(picture).toHaveAttribute("data-smart-home-physical-picture", "exterior:exterior_lighting=reduced-night");
  await expect(picture.locator("img")).toHaveAttribute("src", /exterior-reduced-night-1536\.webp$/);
});

test("malformed subordinate physical picker, control, or initial media fails closed", async ({ page }) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const physical = node.matches("[data-smart-home-physical]") ? node : node.querySelector("[data-smart-home-physical]");
        if (!physical) continue;
        physical.querySelector("button[data-smart-home-physical-system='stairs']").dataset.smartHomePhysicalSystem = "unknown";
        physical.querySelector("button[data-smart-home-physical-action]").dataset.physicalValueId = "unknown";
        physical.querySelector("[data-smart-home-physical-source]").setAttribute("srcset", "/assets/images/cinematic/residence/wrong-768.webp");
        observer.disconnect();
        return;
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto(route);
  const root = await simulator(page);
  const physical = root.locator("[data-smart-home-physical]");
  await expect(physical).not.toHaveAttribute("data-smart-home-physical-enhanced", "true");
  await expect(physical.locator("[data-smart-home-physical-fallback]")).toBeVisible();
  await expect(physical.locator("[data-smart-home-physical-stage]")).toBeHidden();
  await expect(root.locator("button[data-phone-system]")).toHaveCount(systems.length);
});

test("every preset atomically changes the configuration and returns from manual mode", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  const presetIds = ["morning", "arrival", "evening", "away", "night", "heat", "backup"];

  for (const [index, label] of presets.entries()) {
    const slider = root.locator('[data-phone-range][data-control-system="lighting"]');
    await slider.evaluate((input) => {
      input.value = input.value === input.max ? input.min : input.max;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(root).toHaveAttribute("data-manual", "true");
    const manualPreview = await readPresetPreview(root);
    await root.getByRole("radio", { name: label }).click();
    await expect(root).toHaveAttribute("data-preset", presetIds[index]);
    await expect(root).toHaveAttribute("data-manual", "false");
    await expect(root.locator("[data-phone-live]")).toContainText(label);
    await expect(root.locator(`[data-preset-panel="${presetIds[index]}"]`)).toBeVisible();
    const presetPreview = await readPresetPreview(root);
    expect(presetPreview.background, `${label} computed scene background`).not.toBe(manualPreview.background);
    expect(presetPreview.pixels, `${label} computed scene pixels`).not.toBe(manualPreview.pixels);
    expect(presetPreview.signature, `${label} preview signature`).not.toBe(manualPreview.signature);
    expect(presetPreview.topology, `${label} causal topology`).not.toBe(manualPreview.topology);
    expect(presetPreview.explanation, `${label} visible explanation`).not.toBe(manualPreview.explanation);
    expect(presetPreview.explanation).toContain(label);
  }
});

test("every system selector changes the real scene, active panel, and engineering explanation", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  for (const [id, label] of systems) {
    await root.locator(`button[data-phone-system="${id}"]`).click();
    await expect(root).toHaveAttribute("data-system", id);
    await expect(root).toHaveAttribute("data-visual", id);
    await expect(root.locator("picture[data-scene-picture]:visible")).toHaveAttribute("data-scene-picture", id);
    await expect(root.locator("[data-phone-control-panel]:visible")).toHaveAttribute("data-phone-control-panel", id);
    await expect(root.locator("[data-phone-system-label]")).toHaveText(label);
    await expect(root.locator(`button[data-phone-system="${id}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect(root.locator("[data-phone-topology-detail]")).not.toHaveText("");
  }
});

test("panel and low-voltage controls expose observation, isolation, and the next engineering step", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  for (const id of ["panel", "low-voltage"]) {
    await root.locator(`[data-phone-system="${id}"]`).click();
    await expect(root.locator("[data-topology-source]")).toContainText("Обрана");
    await expect(root.locator("[data-topology-logic]")).toContainText("Ізоляція");
    await expect(root.locator("[data-topology-result]")).toContainText("Наступна інженерна перевірка");
    const topologyFontSizes = await root.locator("[data-scene-topology] > span").evaluateAll((labels) => labels.map((label) => Number.parseFloat(getComputedStyle(label).fontSize)));
    expect(topologyFontSizes.every((fontSize) => fontSize >= 12), `${id} topology text remains readable`).toBe(true);
    const topologyDoesNotOverlapCaption = await root.evaluate((simulatorRoot) => {
      const caption = simulatorRoot.querySelector("[data-scenario-scene] figcaption");
      const topology = simulatorRoot.querySelector("[data-scene-topology]");
      if (!caption || !topology || getComputedStyle(caption).display === "none") return true;
      return caption.getBoundingClientRect().bottom <= topology.getBoundingClientRect().top;
    });
    expect(topologyDoesNotOverlapCaption, `${id} topology does not overlap the scene caption`).toBe(true);
  }
});

test("manual controls update the visible preview without starting a scene transition, and a preset restores all values", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  const slider = root.locator('[data-phone-range][data-control-system="lighting"]');
  const phaseBeforeManual = await root.getAttribute("data-motion-phase");
  await slider.evaluate((input) => {
    input.value = "78";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(root).toHaveAttribute("data-manual", "true");
  await expect(root.locator("[data-scene-preview]")).toHaveAttribute("data-value", "78");
  await expect(root.locator("[data-phone-signature]")).toContainText("Ручне коригування на основі");
  await expect(root.locator("[data-topology-result]")).toContainText("Рівень світла: 78%");
  await expect(root.locator('[data-control-output="lighting:brightness"]')).toHaveText("Яскравість: 78%");
  await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(0);
  await expect(root).toHaveAttribute("data-motion-phase", phaseBeforeManual || "initial");

  await root.getByRole("radio", { name: "Ранок" }).click();
  await expect(root).toHaveAttribute("data-manual", "false");
  await expect(slider).not.toHaveValue("78");

  await root.getByRole("radio", { name: "Вечір" }).check();
  await expect(root).toHaveAttribute("data-preset", "evening");
  await expect(root).toHaveAttribute("data-manual", "false");
  await expect(slider).not.toHaveValue("78");
  await expect(root.locator("[data-phone-live]")).toContainText("Вечір");
});

test("segment and toggle controls have native keyboard actions and update their own visible outputs", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  await root.locator('[data-phone-system="climate"]').click();
  const cooling = root.locator('[data-phone-segment][data-control-system="climate"][data-control-id="comfort"][data-control-value="cool"]');
  await cooling.focus();
  await cooling.press("Enter");
  await expect(cooling).toHaveAttribute("aria-pressed", "true");
  await expect(root.locator('[data-control-output="climate:comfort"]')).toContainText("Прохолодніше");
  await expect(root.locator("[data-scene-preview]")).toHaveAttribute("data-control", "comfort");
  await expect(root.locator("[data-topology-result]")).toContainText("Стан комфорту: Прохолодніше");

  await root.locator('[data-phone-system="panel"]').click();
  const toggle = root.locator('[data-phone-toggle][data-control-system="panel"]');
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(root.locator('[data-control-output="panel:priority_groups"]')).toContainText("Пріоритетні групи враховано");
  await expect(root.locator("[data-scene-preview]")).toHaveAttribute("data-control", "priority_groups");
  await expect(root.locator("[data-topology-result]")).toContainText("Наступна інженерна перевірка: Врахувати пріоритетні групи, Пріоритетні групи враховано");
});

test("audio follows source to zone to group and mute or restore changes visible scene pixels", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  await root.locator('[data-phone-system="audio"]').click();
  const mute = root.locator('[data-phone-toggle][data-control-system="audio"][data-control-id="muted"]');
  const preview = root.locator("[data-scene-preview]");
  const before = await preview.evaluate((element) => getComputedStyle(element, "::after").opacity);

  await mute.click();
  await expect(root.locator('[data-control-output="audio:muted"]')).toContainText("Звук приглушено");
  await expect(root.locator("[data-topology-result]")).toContainText("Звук приглушено");
  await expect.poll(() => preview.evaluate((element) => getComputedStyle(element, "::after").opacity)).not.toBe(before);

  await mute.click();
  await expect(root.locator('[data-control-output="audio:muted"]')).toContainText("Звук відновлено");
});

test("every one of the twenty manual controls changes its active scene preview signature and causal result", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route);
  const root = await simulator(page);
  let mutated = 0;
  for (const [systemId] of systems) {
    await root.locator(`[data-phone-system="${systemId}"]`).click();
    const controls = root.locator("[data-phone-control-panel]:visible [data-phone-control]");
    for (let index = 0; index < await controls.count(); index += 1) {
      const control = controls.nth(index);
      const signature = await root.getAttribute("data-preview-signature");
      const type = await control.getAttribute("data-control-type");
      if (type === "range") {
        await control.locator("input").evaluate((input) => {
          input.value = input.value === input.max ? input.min : input.max;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
      } else if (type === "segment") {
        const values = await control.locator("[data-phone-segment]").evaluateAll((buttons) => buttons.map((button) => ({ value: button.dataset.controlValue, pressed: button.getAttribute("aria-pressed") })));
        const next = values.find((candidate) => candidate.pressed !== "true");
        await control.locator(`[data-phone-segment][data-control-value="${next.value}"]`).click();
      } else {
        await control.locator("[data-phone-toggle]").click();
      }
      await expect(root).not.toHaveAttribute("data-preview-signature", signature || "");
      await expect(root.locator("[data-topology-result]")).not.toHaveText("");
      await expect(root.locator("[data-phone-signature]")).toContainText("Ручне коригування на основі");
      await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(0);
      mutated += 1;
    }
  }
  expect(mutated).toBe(20);
});

test("preset and system selection use one cancellable outgoing snapshot, while reduced motion creates none", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  await root.getByRole("radio", { name: "Повернення" }).check();
  await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(1);
  await expect(root.locator("[data-outgoing-snapshot]")).toHaveAttribute("aria-hidden", "true");
  const snapshotGeometry = await root.evaluate((simulatorRoot) => {
    const rect = (selector) => simulatorRoot.querySelector(selector).getBoundingClientRect();
    const scene = rect("[data-scenario-scene]");
    const snapshotElement = simulatorRoot.querySelector("[data-outgoing-snapshot]");
    const snapshot = snapshotElement.getBoundingClientRect();
    const phone = rect("[data-smart-home-phone]");
    return {
      scene: { left: scene.left, top: scene.top, right: scene.right, bottom: scene.bottom, width: scene.width, height: scene.height },
      snapshot: { left: snapshot.left, top: snapshot.top, right: snapshot.right, bottom: snapshot.bottom, width: snapshot.width, height: snapshot.height },
      phone: { left: phone.left, top: phone.top, right: phone.right, bottom: phone.bottom },
      parentedToScene: snapshotElement.parentElement === simulatorRoot.querySelector("[data-scenario-scene]"),
      layoutSize: { snapshotWidth: snapshotElement.offsetWidth, snapshotHeight: snapshotElement.offsetHeight, sceneWidth: snapshotElement.parentElement.clientWidth, sceneHeight: snapshotElement.parentElement.clientHeight }
    };
  });
  expect(snapshotGeometry.parentedToScene).toBe(true);
  expect(Math.abs(snapshotGeometry.layoutSize.snapshotWidth - snapshotGeometry.layoutSize.sceneWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(snapshotGeometry.layoutSize.snapshotHeight - snapshotGeometry.layoutSize.sceneHeight)).toBeLessThanOrEqual(1);
  const overlapsPhone = !(
    snapshotGeometry.snapshot.right <= snapshotGeometry.phone.left ||
    snapshotGeometry.snapshot.left >= snapshotGeometry.phone.right ||
    snapshotGeometry.snapshot.bottom <= snapshotGeometry.phone.top ||
    snapshotGeometry.snapshot.top >= snapshotGeometry.phone.bottom
  );
  expect(overlapsPhone, "outgoing scene snapshot never covers the phone").toBe(false);
  await root.locator('[data-phone-system="audio"]').click();
  await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await root.locator('[data-phone-system="panel"]').click();
  await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(0);
});

test("keeps rapid scene replacement bounded and supplies responsive media for all nine scenes", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  for (const [systemId] of systems) await root.locator(`[data-phone-system="${systemId}"]`).click();
  await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(1);
  await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(0, { timeout: 1800 });
  for (const [systemId] of systems) {
    const picture = root.locator(`picture[data-scene-picture="${systemId}"]`);
    await expect(picture.locator("source")).toHaveCount(2);
    await expect(picture.locator("img")).toHaveAttribute("alt", /\S{8,}/);
  }
});

test("keeps a complete static explanation when JavaScript is unavailable or enhancement contract is malformed", async ({ browser, page }) => {
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4000", javaScriptEnabled: false, locale: "uk-UA" });
  const noJsPage = await context.newPage();
  try {
    await noJsPage.goto(route);
    const noJsRoot = await simulator(noJsPage);
    await expect(noJsRoot).not.toHaveAttribute("data-enhanced", /./);
    await expect(noJsRoot.locator("[data-smart-home-phone]")).toBeHidden();
    await expect(noJsRoot.locator("[data-static-explainer] li")).toHaveCount(systems.length);
    await expect(noJsRoot.locator("[data-preset-panel]:visible")).toHaveCount(presets.length);
  } finally {
    await context.close();
  }

  await page.route("**/smart-home/", async (request) => {
    const response = await request.fetch();
    await request.fulfill({ response, body: (await response.text()).replace('data-phone-system="audio"', 'data-phone-system="lighting"') });
  });
  await page.goto(route);
  const malformed = await simulator(page);
  await expect(malformed).not.toHaveAttribute("data-enhanced", /./);
  await expect(malformed.locator("[data-smart-home-phone]")).toBeHidden();
  await expect(malformed.locator("[data-static-explainer]")).toBeVisible();
  await expect(malformed.locator("[data-preset-panel]:visible")).toHaveCount(presets.length);
});

test("all enhanced interactive states are keyboard accessible and pass axe", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  for (const preset of presets) {
    const radio = root.getByRole("radio", { name: preset });
    await radio.focus();
    expect(await radio.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  }
  for (const [id] of systems) {
    const system = root.locator(`[data-phone-system="${id}"]`);
    await system.focus();
    expect(await system.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("keeps the experience elastic from phone to 1980px and removes all motion for reduced-motion", async ({ page }) => {
  for (const width of [375, 414, 768, 900, 1024, 1280, 1440, 1720, 1980]) await assertViewport(page, width);

  const wideRoot = await simulator(page);
  await wideRoot.locator('[data-phone-system="audio"]').click();
  const audioControlsContained = await wideRoot.evaluate((simulatorRoot) => {
    const phone = simulatorRoot.querySelector("[data-smart-home-phone]").getBoundingClientRect();
    return [...simulatorRoot.querySelectorAll('[data-phone-control-panel="audio"] [data-phone-control]')].every((control) => {
      const rect = control.getBoundingClientRect();
      return rect.left >= phone.left && rect.right <= phone.right && rect.top >= phone.top && rect.bottom <= phone.bottom;
    });
  });
  expect(audioControlsContained, "1980px audio controls remain inside the phone").toBe(true);

  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto(route);
  const sceneBounds = await page.locator("[data-scenario-scene]").boundingBox();
  expect(sceneBounds?.y, "1440px cinematic stage enters the first viewport").toBeLessThanOrEqual(760);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(route);
  const topology = await page.locator("[data-scene-topology] > span").evaluateAll((labels) => labels.map((label) => {
    const rect = label.getBoundingClientRect();
    return { top: rect.top, width: rect.width, fontSize: Number.parseFloat(getComputedStyle(label).fontSize) };
  }));
  expect(topology.every(({ width }) => width >= 280), "375px topology label width").toBe(true);
  expect(topology.every(({ fontSize }) => fontSize >= 12), "375px topology text remains readable").toBe(true);
  expect(topology[0].top).toBeLessThan(topology[1].top);
  expect(topology[1].top).toBeLessThan(topology[2].top);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route);
  const root = await simulator(page);
  await root.locator('[data-phone-system="audio"]').click();
  await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(0);
  const activeMotion = await root.locator("*").evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return [style.animationDuration, style.transitionDuration].some((value) => value.split(",").some((duration) => Number.parseFloat(duration) > 0));
  }).length);
  expect(activeMotion).toBe(0);
});

test("does not create a portal, media player, network runtime, canvas, or storage side effect", async ({ page }) => {
  await page.addInitScript(() => {
    window.__smartHomeRuntime = { fetches: 0, storage: 0, canvas: 0 };
    const fetch = window.fetch;
    window.fetch = (...args) => { window.__smartHomeRuntime.fetches += 1; return fetch(...args); };
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (...args) { window.__smartHomeRuntime.storage += 1; return getItem.apply(this, args); };
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) { window.__smartHomeRuntime.canvas += 1; return context.apply(this, args); };
  });
  await page.goto(route);
  const root = await simulator(page);
  await root.locator('[data-phone-system="audio"]').click();
  await expect(page.locator("canvas, video, audio, [autoplay], [data-autoplay], main form, main textarea, main select")).toHaveCount(0);
  expect(await page.evaluate(() => window.__smartHomeRuntime)).toEqual({ fetches: 0, storage: 0, canvas: 0 });
});
