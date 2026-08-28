import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
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
      if (element.closest("[data-outgoing-snapshot], [data-physical-scene-svg-overlay]") || getComputedStyle(element).display === "none" || getComputedStyle(element).visibility === "hidden") return false;
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
    const activeImage = simulatorRoot.querySelector("picture[data-scene-picture]:not([hidden]) img");
    return {
      pixels: getComputedStyle(preview).getPropertyValue("--smart-home-preview-control-1").trim(),
      exposure: getComputedStyle(activeImage).filter,
      svgSignature: simulatorRoot.dataset.physicalSceneSvgSignature,
      signature: simulatorRoot.dataset.previewSignature,
      topology: simulatorRoot.querySelector("[data-topology-result]").textContent.trim(),
      explanation: simulatorRoot.querySelector("[data-phone-signature]").textContent.trim()
    };
  });
}

async function renderedPixelSignature(page, surface) {
  await surface.scrollIntoViewIfNeeded();
  const bounds = await surface.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error("SVG pixel evidence needs a bounded visible surface");
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const right = Math.min(viewport.width, bounds.x + bounds.width);
  const bottom = Math.min(viewport.height, bounds.y + bounds.height);
  if (right <= x || bottom <= y) throw new Error("SVG pixel evidence needs viewport intersection");
  const pixels = await page.screenshot({ animations: "disabled", clip: { x, y, width: right - x, height: bottom - y } });
  return createHash("sha256").update(pixels).digest("hex");
}

async function chooseAlternateSegment(root, systemId, controlId) {
  const alternate = root.locator(
    `[data-phone-segment][data-control-system="${systemId}"][data-control-id="${controlId}"]:not([aria-pressed="true"])`
  ).first();
  await expect(alternate, `${systemId}:${controlId} needs an alternate contextual value`).toHaveCount(1);
  await alternate.click();
}

async function expectSubordinatePhysicalContext(physical, systemId, effect) {
  const overlay = physical.locator("[data-physical-scene-svg-overlay][data-physical-scene-svg-instance='smart-home-physical']");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-physical-scene-svg-enhanced", "true");
  await expect(overlay).toHaveAttribute("data-physical-scene-svg-active-system", systemId);
  await expect(overlay).toHaveAttribute("data-physical-scene-svg-signature", new RegExp(`^${systemId}:`, "u"));
  await expect(overlay.locator(`[data-physical-scene-svg-system="${systemId}"]:not([hidden])`)).toHaveCount(1);
  await expect(overlay.locator(`[data-physical-scene-svg-system="${systemId}"] [data-physical-scene-svg-effect="${effect}"]:not([hidden])`).first()).toHaveCount(1);
  expect(await overlay.locator("[data-physical-scene-svg-system]").evaluateAll((groups, activeId) => groups
    .filter((group) => group.getAttribute("data-physical-scene-svg-system") !== activeId)
    .every((group) => group.hasAttribute("hidden")), systemId), `${systemId} must be the only subordinate visual context`).toBe(true);
}

async function activeSvgParameterSignature(overlay, systemId) {
  return overlay.locator(`[data-physical-scene-svg-system="${systemId}"]:not([hidden])`).evaluate((group) => [...group.querySelectorAll("[data-physical-scene-svg-layer]:not([hidden])")]
    .map((layer) => `${layer.dataset.physicalSceneSvgLayer}:${layer.dataset.physicalSceneSvgParameters}`)
    .join("|"));
}

test("the nine public systems project their selected context into one visible SVG physical layer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route);
  const root = await simulator(page);
  const scene = root.locator("[data-scenario-scene]");
  const overlay = scene.locator("[data-physical-scene-svg-overlay][data-physical-scene-svg-instance='smart-home-main']");
  const systems = [
    {
      id: "lighting", effect: "glow",
      change: () => root.locator('[data-phone-range][data-control-system="lighting"][data-control-id="brightness"]').evaluate((input) => {
        input.value = input.value === input.max ? input.min : input.max;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })
    },
    { id: "climate", effect: "thermal", change: () => chooseAlternateSegment(root, "climate", "comfort") },
    { id: "access", effect: "coverage", change: () => root.locator('[data-phone-toggle][data-control-system="access"][data-control-id="arrival_route"]').click() },
    { id: "security", effect: "coverage", change: () => chooseAlternateSegment(root, "security", "coverage") },
    { id: "panel", effect: "topology", change: () => chooseAlternateSegment(root, "panel", "layer") },
    { id: "low-voltage", effect: "topology", change: () => chooseAlternateSegment(root, "low-voltage", "route") },
    { id: "backup-power", effect: "topology", change: () => chooseAlternateSegment(root, "backup-power", "restore_intent") },
    { id: "audio", effect: "audio", change: () => root.locator('[data-phone-toggle][data-control-system="audio"][data-control-id="muted"]').click() },
    {
      id: "shading", effect: "tulle",
      change: () => root.locator('[data-phone-range][data-control-system="shading"][data-control-id="position"]').evaluate((input) => {
        input.value = input.value === input.min ? input.max : input.min;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })
    }
  ];

  for (const system of systems) {
    const systemButton = root.locator(`[data-phone-system="${system.id}"]`);
    await systemButton.click();
    await expect(root).toHaveAttribute("data-system", system.id);
    const selectedSystemContext = await systemButton.evaluate((button) => ({
      label: button.textContent.trim(),
      eyebrow: button.dataset.topologyLabel,
      summary: button.closest("[data-smart-home-simulator]")
        .querySelector(`[data-preset-panel]:not([hidden]) [data-system-detail="${button.dataset.phoneSystem}"]`)
        .dataset.summary
    }));
    await expect(scene.locator("[data-scene-title]")).toHaveText(selectedSystemContext.label);
    await expect(scene.locator("[data-scene-eyebrow]")).toHaveText(selectedSystemContext.eyebrow);
    await expect(scene.locator("[data-active-scene-label]")).toHaveText(selectedSystemContext.summary);
    await expect(scene.locator("[data-topology-result]")).toContainText(selectedSystemContext.label);
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute("data-physical-scene-svg-enhanced", "true");
    await expect(overlay).toHaveAttribute("data-physical-scene-svg-active-system", system.id);
    const rootSignature = await root.getAttribute("data-physical-scene-svg-signature");
    expect(rootSignature, `${system.id} must expose one public SVG signature on the selected simulator state`).toMatch(new RegExp(`^${system.id}:`, "u"));
    await expect(overlay).toHaveAttribute("data-physical-scene-svg-signature", rootSignature);
    const registration = await scene.evaluate((surface) => {
      const image = surface.querySelector("picture[data-scene-picture]:not([hidden]) img");
      const svg = surface.querySelector("[data-physical-scene-svg-overlay]");
      const imageStyle = getComputedStyle(image);
      const svgStyle = getComputedStyle(svg);
      return {
        objectFit: imageStyle.objectFit,
        transform: imageStyle.transform,
        imagePositionX: Number.parseFloat(imageStyle.objectPosition),
        overlayPositionX: Number.parseFloat(svgStyle.getPropertyValue("--physical-crop-x")) * 100
      };
    });
    expect(registration.objectFit, `${system.id} WebP must use the same cover model as its SVG crop`).toBe("cover");
    expect(registration.transform, `${system.id} WebP must not drift away from the SVG registration`).toBe("none");
    expect(registration.imagePositionX, `${system.id} WebP and SVG must share their horizontal focal point`).toBeCloseTo(registration.overlayPositionX, 4);

    const activeSystem = overlay.locator(`[data-physical-scene-svg-system="${system.id}"]:not([hidden])`);
    await expect(activeSystem).toHaveCount(1);
    const nonSelectedSystemsAreHidden = await overlay.locator("[data-physical-scene-svg-system]").evaluateAll((groups, activeId) => groups
      .filter((group) => group.getAttribute("data-physical-scene-svg-system") !== activeId)
      .every((group) => group.hasAttribute("hidden")), system.id);
    expect(nonSelectedSystemsAreHidden, system.id + " must hide every non-selected SVG system").toBe(true);
    const relevantLayer = activeSystem.locator(`[data-physical-scene-svg-effect="${system.effect}"]:not([hidden])`).first();
    await expect(relevantLayer, `${system.id} needs its context-specific SVG effect`).toHaveCount(1);
    const geometry = await relevantLayer.locator("[data-physical-scene-svg-shape]").first().evaluate((shape) => {
      const box = shape.getBBox();
      const svg = shape.ownerSVGElement;
      const viewBox = svg?.viewBox.baseVal;
      return {
        finite: [box.x, box.y, box.width, box.height].every(Number.isFinite),
        hasExtent: box.width > 0 || box.height > 0,
        withinSource: box.x >= 0 && box.y >= 0 && box.x + box.width <= 1536 && box.y + box.height <= 1024,
        intersectsCrop: Boolean(viewBox) && box.x + box.width > viewBox.x && box.y + box.height > viewBox.y && box.x < viewBox.x + viewBox.width && box.y < viewBox.y + viewBox.height
      };
    });
    expect(geometry, `${system.id} physical shape geometry`).toEqual({ finite: true, hasExtent: true, withinSource: true, intersectsCrop: true });

    const before = {
      rootSignature,
      overlaySignature: await overlay.getAttribute("data-physical-scene-svg-signature"),
      parameters: await activeSvgParameterSignature(overlay, system.id),
      pixels: await renderedPixelSignature(page, scene)
    };
    expect(before.parameters, `${system.id} layer must expose its rendered public parameters`).toBeTruthy();
    await system.change();
    await expect.poll(() => root.getAttribute("data-physical-scene-svg-signature")).not.toBe(before.rootSignature);
    await expect.poll(() => overlay.getAttribute("data-physical-scene-svg-signature")).not.toBe(before.overlaySignature);
    await expect.poll(() => activeSvgParameterSignature(overlay, system.id)).not.toBe(before.parameters);
    expect(await renderedPixelSignature(page, scene), `${system.id} native control must change rendered scene pixels`).not.toBe(before.pixels);
  }
});

test("lighting intensity grows from registered lamps across one clean scene without guide lines", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route);
  const root = await simulator(page);
  const scene = root.locator("[data-scenario-scene]");
  const slider = root.locator('[data-phone-range][data-control-system="lighting"][data-control-id="brightness"]');
  const overlay = scene.locator("[data-physical-scene-svg-overlay][data-physical-scene-svg-instance='smart-home-main']");
  const lighting = overlay.locator('[data-physical-scene-svg-system="lighting"]');

  const cleanScene = await scene.evaluate((surface) => ({
    decorativeBackgroundSize: getComputedStyle(surface, "::before").backgroundSize,
    previewBackground: getComputedStyle(surface.querySelector("[data-scene-preview]")).backgroundImage,
    linearShapes: surface.querySelectorAll('[data-physical-scene-svg-system="lighting"] [data-physical-scene-svg-shape="line"], [data-physical-scene-svg-system="lighting"] [data-physical-scene-svg-shape="path"]').length,
    localShapes: surface.querySelectorAll('[data-physical-scene-svg-system="lighting"] [data-physical-scene-svg-shape="circle"], [data-physical-scene-svg-system="lighting"] [data-physical-scene-svg-shape="ellipse"]').length
  }));
  expect(cleanScene.decorativeBackgroundSize).not.toMatch(/(?:^|, )[^,]*1px(?:,|$)/u);
  expect(cleanScene.previewBackground).toBe("none");
  expect(cleanScene.linearShapes).toBe(0);
  expect(cleanScene.localShapes).toBeGreaterThanOrEqual(4);

  for (const groupId of ["route", "evening", "full"]) {
    await root.locator(`[data-phone-segment][data-control-system="lighting"][data-control-id="layer"][data-control-value="${groupId}"]`).click();
    const visibleGeometry = await lighting.locator("[data-physical-scene-svg-layer]:not([hidden])").evaluateAll((layers) => layers.map((layer) => ({
      kind: layer.querySelector("[data-physical-scene-svg-shape]")?.dataset.physicalSceneSvgShape,
      opacity: Number.parseFloat(getComputedStyle(layer).opacity)
    })));
    expect(visibleGeometry.length, `${groupId} must illuminate at least one registered lamp`).toBeGreaterThan(0);
    expect(visibleGeometry.every(({ kind }) => ["circle", "ellipse"].includes(kind)), `${groupId} uses only local lamp geometry`).toBe(true);
  }

  await root.locator('[data-phone-segment][data-control-system="lighting"][data-control-id="layer"][data-control-value="full"]').click();
  const frameAt = async (value) => {
    await slider.evaluate((input, nextValue) => {
      input.value = String(nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    const rendered = await scene.evaluate((surface) => {
      const filter = getComputedStyle(surface.querySelector("picture[data-scene-picture]:not([hidden]) img")).filter;
      const brightness = Number.parseFloat(filter.match(/brightness\(([-\d.]+)\)/u)?.[1] || "NaN");
      return {
        brightness,
        washOpacity: Number.parseFloat(getComputedStyle(surface.querySelector(".smart-home__scene-wash")).opacity),
        lampOpacities: [...surface.querySelectorAll('[data-physical-scene-svg-system="lighting"] [data-physical-scene-svg-layer]:not([hidden])')].map((layer) => Number.parseFloat(getComputedStyle(layer).opacity))
      };
    });
    return { ...rendered, pixels: await renderedPixelSignature(page, scene) };
  };

  const low = await frameAt(0);
  const middle = await frameAt(50);
  const high = await frameAt(100);
  expect([low.brightness, middle.brightness, high.brightness].every(Number.isFinite)).toBe(true);
  expect(low.brightness).toBeLessThan(middle.brightness);
  expect(middle.brightness).toBeLessThan(high.brightness);
  expect(low.washOpacity).toBeGreaterThan(middle.washOpacity);
  expect(middle.washOpacity).toBeGreaterThan(high.washOpacity);
  expect(low.lampOpacities.every((opacity) => opacity === 0)).toBe(true);
  expect(high.lampOpacities.some((opacity) => opacity >= 0.45)).toBe(true);
  expect(new Set([low.pixels, middle.pixels, high.pixels]).size).toBe(3);
});

test("access security and audio use soft object-registered fields instead of HUD guide lines", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route);
  const root = await simulator(page);
  const overlay = root.locator("[data-physical-scene-svg-overlay][data-physical-scene-svg-instance='smart-home-main']");

  for (const systemId of ["access", "security"]) {
    await root.locator(`[data-phone-system="${systemId}"]`).click();
    const geometry = await overlay.locator(`[data-physical-scene-svg-system="${systemId}"] [data-physical-scene-svg-layer]:not([hidden])`).evaluateAll((layers) => layers.map((layer) => ({
      effect: layer.dataset.physicalSceneSvgEffect,
      kind: layer.querySelector("[data-physical-scene-svg-shape]")?.dataset.physicalSceneSvgShape,
      stroke: getComputedStyle(layer).stroke,
      dash: getComputedStyle(layer).strokeDasharray
    })));
    expect(geometry.length, `${systemId} needs a visible registered field`).toBeGreaterThan(0);
    expect(geometry.some(({ effect }) => ["coverage", "zone", "node"].includes(effect)), `${systemId} uses a physical field or device marker`).toBe(true);
    expect(geometry.every(({ kind }) => !["line", "path"].includes(kind)), `${systemId} must not draw a floating guide line`).toBe(true);
  }

  await root.locator('[data-phone-system="audio"]').click();
  const audio = overlay.locator('[data-physical-scene-svg-system="audio"] [data-physical-scene-svg-effect="audio"]:not([hidden])');
  const audioStyle = await audio.evaluate((layer) => ({
    fill: getComputedStyle(layer).fill,
    stroke: getComputedStyle(layer).stroke,
    dash: getComputedStyle(layer).strokeDasharray
  }));
  expect(audioStyle.fill).not.toBe("none");
  expect(audioStyle.stroke).toBe("none");
  expect(audioStyle.dash).toBe("none");
});

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
  const image = picture.locator("img");
  await expect(picture.locator("source")).toHaveCount(0);
  await expect(image).toHaveAttribute("srcset", /-768\.webp 768w, .*?-1536\.webp 1536w/u);
  await expect(image).toHaveAttribute("sizes", "(max-width: 767px) 100vw, 100vw");
  await image.evaluate((element) => element.decode());
  const expectedInitialVariant = page.viewportSize().width <= 768 ? "-768.webp" : "-1536.webp";
  await expect.poll(() => image.evaluate((element, suffix) => element.currentSrc ? new URL(element.currentSrc).pathname.endsWith(suffix) : false, expectedInitialVariant)).toBe(true);
  await expect(picture).toHaveAttribute("data-smart-home-physical-picture", "stairs:stair_lighting=off");
  await expectSubordinatePhysicalContext(physical, "stairs", "route");
  const directControl = await physical.getByRole("button", { name: "Маршрут сходами", exact: true }).evaluate((button) => {
    const physicalRoot = button.closest("[data-smart-home-physical]");
    const phases = [];
    const observer = new MutationObserver(() => phases.push(physicalRoot.dataset.smartHomePhysicalMotionPhase));
    observer.observe(physicalRoot, { attributes: true, attributeFilter: ["data-smart-home-physical-motion-phase"] });
    button.click();
    observer.disconnect();
    return {
      phase: physicalRoot.dataset.smartHomePhysicalMotionPhase,
      phases,
      snapshots: physicalRoot.querySelectorAll("[data-smart-home-physical-snapshot]").length,
      picture: physicalRoot.querySelector("[data-smart-home-physical-picture]")?.dataset.smartHomePhysicalPicture,
      svgSignature: physicalRoot.dataset.smartHomePhysicalSvgSignature
    };
  });
  expect(directControl).toEqual({
    phase: "idle",
    phases: [],
    snapshots: 0,
    picture: "stairs:stair_lighting=route",
    svgSignature: "stairs:stair_lighting=route"
  });
  await expect(picture).toHaveAttribute("data-smart-home-physical-picture", "stairs:stair_lighting=route");
  expect(await picture.evaluate((element) => ({
    animations: element.getAnimations().length,
    clipPath: getComputedStyle(element).clipPath,
    transform: getComputedStyle(element).transform,
    visibility: getComputedStyle(element).visibility
  }))).toEqual({ animations: 0, clipPath: "none", transform: "none", visibility: "visible" });
  await expectSubordinatePhysicalContext(physical, "stairs", "route");
  await expect.poll(() => image.evaluate((element, suffix) => element.currentSrc ? new URL(element.currentSrc).pathname.endsWith(suffix) : false, `stairs-route${expectedInitialVariant}`)).toBe(true);
  await expect(physical).toHaveAttribute("data-smart-home-physical-motion-phase", "idle");
  await physical.getByRole("button", { name: "Зовнішнє освітлення", exact: true }).click();
  await physical.getByRole("button", { name: "Нічне зниження", exact: true }).click();
  await expect(picture).toHaveAttribute("data-smart-home-physical-picture", "exterior:exterior_lighting=reduced-night");
  await expectSubordinatePhysicalContext(physical, "exterior", "route");
  await expect.poll(() => image.evaluate((element, suffix) => element.currentSrc ? new URL(element.currentSrc).pathname.endsWith(suffix) : false, `exterior-reduced-night${expectedInitialVariant}`)).toBe(true);
  await expect(physical).toHaveAttribute("data-smart-home-physical-motion-phase", "idle");
});

test("malformed subordinate physical picker, control, or initial media fails closed", async ({ page }) => {
  await page.addInitScript(() => {
    const corruptPhysicalScene = () => {
      const physical = document.querySelector("[data-smart-home-physical]");
      const picker = physical?.querySelector("button[data-smart-home-physical-system='stairs']");
      const control = physical?.querySelector("button[data-smart-home-physical-action]");
      const image = physical?.querySelector("[data-smart-home-physical-image]");
      if (!physical || !picker || !control || !image) return false;

      picker.dataset.smartHomePhysicalSystem = "unknown";
      control.dataset.physicalValueId = "unknown";
      image.setAttribute("srcset", "/assets/images/cinematic/residence/wrong-768.webp 768w, /assets/images/cinematic/residence/wrong-1536.webp 1536w");
      return true;
    };
    const observer = new MutationObserver(() => {
      if (!corruptPhysicalScene()) return;
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
    if (corruptPhysicalScene()) observer.disconnect();
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
    await expect.poll(
      async () => (await readPresetPreview(root)).exposure,
      { message: `${label} computed scene exposure` }
    ).not.toBe(manualPreview.exposure);
    const presetPreview = await readPresetPreview(root);
    expect(presetPreview.pixels, `${label} computed scene pixels`).not.toBe(manualPreview.pixels);
    expect(presetPreview.svgSignature, `${label} physical scene state`).not.toBe(manualPreview.svgSignature);
    expect(presetPreview.signature, `${label} preview signature`).not.toBe(manualPreview.signature);
    expect(presetPreview.topology, `${label} causal topology`).not.toBe(manualPreview.topology);
    expect(presetPreview.explanation, `${label} visible explanation`).not.toBe(manualPreview.explanation);
    expect(presetPreview.explanation).toContain(label);
  }
});

test("every system selector changes the real scene, active panel, and engineering explanation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route);
  const root = await simulator(page);
  await expect(root.locator("picture[data-scene-picture] source")).toHaveCount(0);
  await expect(root.locator('picture[data-scene-picture] img[srcset]')).toHaveCount(0);
  const expectedVariant = page.viewportSize().width <= 767 ? "-768.webp" : "-1536.webp";
  for (const [id, label] of systems) {
    await root.locator(`button[data-phone-system="${id}"]`).click();
    await expect(root).toHaveAttribute("data-system", id);
    await expect(root).toHaveAttribute("data-visual", id);
    await expect(root.locator("picture[data-scene-picture]:visible")).toHaveAttribute("data-scene-picture", id);
    await expect(root.locator("[data-phone-control-panel]:visible")).toHaveAttribute("data-phone-control-panel", id);
    await expect(root.locator("[data-phone-system-label]")).toHaveText(label);
    await expect(root.locator(`button[data-phone-system="${id}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect(root.locator("[data-phone-topology-detail]")).not.toHaveText("");
    const image = root.locator(`picture[data-scene-picture="${id}"] img`);
    await expect(image).toHaveAttribute("data-scene-mobile", /-768\.webp$/u);
    await expect(image).toHaveAttribute("data-scene-desktop", /-1536\.webp$/u);
    await image.evaluate((element) => element.decode());
    await expect.poll(() => image.evaluate((element, suffix) => new URL(element.currentSrc).pathname.endsWith(suffix), expectedVariant)).toBe(true);
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

test("range controls update one continuous scene without cinematic replacement and presets still restore all values", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  const slider = root.locator('[data-phone-range][data-control-system="lighting"]');
  const overlay = root.locator("[data-physical-scene-svg-overlay][data-physical-scene-svg-instance='smart-home-main']");
  const firstInput = await slider.evaluate((input) => {
    const simulatorRoot = input.closest("[data-smart-home-simulator]");
    const activeImage = simulatorRoot.querySelector("picture[data-scene-picture]:not([hidden]) img");
    const sourceBefore = activeImage.currentSrc;
    input.value = "78";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return {
      motionPhase: simulatorRoot.dataset.motionPhase,
      snapshots: simulatorRoot.querySelectorAll("[data-outgoing-snapshot]").length,
      visiblePicture: simulatorRoot.querySelector("picture[data-scene-picture]:not([hidden])")?.dataset.scenePicture,
      sourceBefore,
      sourceAfter: simulatorRoot.querySelector("picture[data-scene-picture]:not([hidden]) img")?.currentSrc
    };
  });
  expect(firstInput).toEqual({
    motionPhase: "idle",
    snapshots: 0,
    visiblePicture: "lighting",
    sourceBefore: firstInput.sourceBefore,
    sourceAfter: firstInput.sourceBefore
  });
  await expect(root).toHaveAttribute("data-manual", "true");
  await expect(root.locator("[data-scene-preview]")).toHaveAttribute("data-value", "78");
  await expect(root.locator("[data-phone-signature]")).toContainText("Ручне коригування на основі");
  await expect(root.locator("[data-topology-result]")).toContainText("Рівень світла: 78%");
  await expect(root.locator('[data-control-output="lighting:brightness"]')).toHaveText("Яскравість: 78%");
  await expect(root).toHaveAttribute("data-physical-scene-svg-signature", /lighting:brightness=78(?:\||$)/u);
  await expect(overlay).toHaveAttribute("data-physical-scene-svg-signature", /lighting:brightness=78(?:\||$)/u);

  const burst = await slider.evaluate((input) => {
    const simulatorRoot = input.closest("[data-smart-home-simulator]");
    const phases = [];
    const observer = new MutationObserver(() => phases.push(simulatorRoot.dataset.motionPhase));
    observer.observe(simulatorRoot, { attributes: true, attributeFilter: ["data-motion-phase"] });
    input.value = "20";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = "90";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    observer.disconnect();
    return {
      motionPhase: simulatorRoot.dataset.motionPhase,
      phases,
      snapshots: simulatorRoot.querySelectorAll("[data-outgoing-snapshot]").length,
      visiblePictures: simulatorRoot.querySelectorAll("picture[data-scene-picture]:not([hidden])").length
    };
  });
  expect(burst).toEqual({ motionPhase: "idle", phases: [], snapshots: 0, visiblePictures: 1 });
  await expect(slider).toHaveValue("90");
  await expect(root.locator('[data-control-output="lighting:brightness"]')).toHaveText("Яскравість: 90%");
  await expect(root).toHaveAttribute("data-physical-scene-svg-signature", /lighting:brightness=90(?:\||$)/u);
  await expect(overlay).toHaveAttribute("data-physical-scene-svg-signature", /lighting:brightness=90(?:\||$)/u);

  await root.getByRole("radio", { name: "Ранок" }).click();
  await expect(root).toHaveAttribute("data-motion-phase", "idle");
  await expect(root).toHaveAttribute("data-manual", "false");
  await expect(slider).not.toHaveValue("90");

  await root.getByRole("radio", { name: "Вечір" }).check();
  await expect(root).toHaveAttribute("data-motion-phase", "idle");
  await expect(root).toHaveAttribute("data-preset", "evening");
  await expect(root).toHaveAttribute("data-manual", "false");
  await expect(slider).not.toHaveValue("90");
  await expect(root.locator("[data-phone-live]")).toContainText("Вечір");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route);
  const reducedRoot = await simulator(page);
  const reducedSlider = reducedRoot.locator('[data-phone-range][data-control-system="lighting"]');
  await reducedSlider.evaluate((input) => {
    input.value = "55";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(reducedRoot).toHaveAttribute("data-motion-phase", "idle");
  await expect(reducedRoot.locator("[data-outgoing-snapshot]")).toHaveCount(0);
  await expect(reducedRoot.locator('[data-control-output="lighting:brightness"]')).toHaveText("Яскравість: 55%");
  await expect(reducedRoot).toHaveAttribute("data-physical-scene-svg-signature", /lighting:brightness=55(?:\||$)/u);
});

test("segment and toggle controls have native keyboard actions and update their own visible outputs", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  await root.locator('[data-phone-system="climate"]').click();
  await expect(root).toHaveAttribute("data-motion-phase", "idle");
  const cooling = root.locator('[data-phone-segment][data-control-system="climate"][data-control-id="comfort"][data-control-value="cool"]');
  await cooling.focus();
  await cooling.press("Enter");
  await expect(cooling).toHaveAttribute("aria-pressed", "true");
  await expect(root.locator('[data-control-output="climate:comfort"]')).toContainText("Прохолодніше");
  await expect(root.locator("[data-scene-preview]")).toHaveAttribute("data-control", "comfort");
  await expect(root.locator("[data-topology-result]")).toContainText("Стан комфорту: Прохолодніше");

  await root.locator('[data-phone-system="panel"]').click();
  await expect(root).toHaveAttribute("data-motion-phase", "idle");
  const toggle = root.locator('[data-phone-toggle][data-control-system="panel"]');
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(root.locator('[data-control-output="panel:priority_groups"]')).toContainText("Пріоритетні групи враховано");
  await expect(root.locator("[data-scene-preview]")).toHaveAttribute("data-control", "priority_groups");
  await expect(root.locator("[data-topology-result]")).toContainText("Наступна інженерна перевірка. Врахувати пріоритетні групи: Пріоритетні групи враховано.");
});

test("audio follows source to zone to group and mute or restore changes visible scene pixels", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  await root.locator('[data-phone-system="audio"]').click();
  const mute = root.locator('[data-phone-toggle][data-control-system="audio"][data-control-id="muted"]');
  const scene = root.locator("[data-scenario-scene]");
  const overlay = scene.locator("[data-physical-scene-svg-overlay]");
  const audioLayer = overlay.locator('[data-physical-scene-svg-system="audio"] [data-physical-scene-svg-effect="audio"]');
  const before = {
    parameters: await audioLayer.getAttribute("data-physical-scene-svg-parameters"),
    pixels: await renderedPixelSignature(page, scene)
  };

  await mute.click();
  await expect(root.locator('[data-control-output="audio:muted"]')).toContainText("Звук приглушено");
  await expect(root.locator("[data-topology-result]")).toContainText("Звук приглушено");
  await expect.poll(() => audioLayer.getAttribute("data-physical-scene-svg-parameters")).not.toBe(before.parameters);
  expect(await renderedPixelSignature(page, scene)).not.toBe(before.pixels);

  await mute.click();
  await expect(root.locator('[data-control-output="audio:muted"]')).toContainText("Звук відновлено");
});

test("every one of the twenty manual controls changes its active scene preview signature and causal result", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(route);
  const root = await simulator(page);
  const scene = root.locator("[data-scenario-scene]");
  const overlay = root.locator("[data-physical-scene-svg-overlay][data-physical-scene-svg-instance='smart-home-main']");
  let mutated = 0;
  for (const [systemId] of systems) {
    await root.locator(`[data-phone-system="${systemId}"]`).click();
    await expect(overlay).toHaveAttribute("data-physical-scene-svg-active-system", systemId);
    const controls = root.locator("[data-phone-control-panel]:visible [data-phone-control]");
    for (let index = 0; index < await controls.count(); index += 1) {
      const control = controls.nth(index);
      const signature = await root.getAttribute("data-preview-signature");
      const svgSignature = await overlay.getAttribute("data-physical-scene-svg-signature");
      const svgParameters = await activeSvgParameterSignature(overlay, systemId);
      const renderedPixels = await renderedPixelSignature(page, scene);
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
      await expect(overlay).not.toHaveAttribute("data-physical-scene-svg-signature", svgSignature || "");
      await expect.poll(() => activeSvgParameterSignature(overlay, systemId)).not.toBe(svgParameters);
      expect(await renderedPixelSignature(page, scene), `${systemId} control ${index + 1} must change rendered Chromium pixels`).not.toBe(renderedPixels);
      await expect(root.locator("[data-topology-result]")).not.toHaveText("");
      await expect(root.locator("[data-phone-signature]")).toContainText("Ручне коригування на основі");
      await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(0);
      mutated += 1;
    }
  }
  expect(mutated).toBe(20);
});

test("system switching applies the new context immediately behind one calm decoded-image crossfade", async ({ page }) => {
  await page.goto(route);
  const root = await simulator(page);
  const result = await root.locator('[data-phone-system="climate"]').evaluate(async (button) => {
    const simulatorRoot = button.closest("[data-smart-home-simulator]");
    const outgoingSignature = simulatorRoot.querySelector("[data-physical-scene-svg-overlay][data-physical-scene-svg-instance='smart-home-main']")?.dataset.physicalSceneSvgSignature;
    button.click();
    const snapshot = simulatorRoot.querySelector("[data-outgoing-snapshot]");
    for (let frame = 0; frame < 60 && !snapshot?.getAnimations().length; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const animation = snapshot?.getAnimations().find((candidate) => candidate.animationName === "smart-home-disassemble");
    if (animation) {
      animation.pause();
      animation.currentTime = 120;
    }
    const style = snapshot ? getComputedStyle(snapshot) : null;
    const activePanel = simulatorRoot.querySelector("[data-preset-panel]:not([hidden])");
    const activePicture = simulatorRoot.querySelector("picture[data-scene-picture]:not([hidden])");
    const svgSnapshot = snapshot?.querySelector("[data-physical-scene-svg-snapshot]");
    const activeSvg = simulatorRoot.querySelector("[data-physical-scene-svg-overlay][data-physical-scene-svg-instance='smart-home-main']");
    const copy = simulatorRoot.querySelector("[data-motion-layer='type']");
    const evidence = {
      system: simulatorRoot.dataset.system,
      picture: activePicture?.dataset.scenePicture,
      imageReady: Boolean(activePicture?.querySelector("img")?.complete && activePicture.querySelector("img")?.naturalWidth > 0),
      snapshots: simulatorRoot.querySelectorAll("[data-outgoing-snapshot]").length,
      panelInert: Boolean(activePanel?.inert),
      outgoingSignature,
      frozenSvgSignature: svgSnapshot?.dataset.physicalSceneSvgSnapshot,
      frozenSvgCount: snapshot?.querySelectorAll("[data-physical-scene-svg-snapshot]").length,
      snapshotZ: Number.parseInt(style?.zIndex || "0", 10),
      activeSvgZ: Number.parseInt(activeSvg ? getComputedStyle(activeSvg).zIndex : "0", 10),
      copyZ: Number.parseInt(copy ? getComputedStyle(copy).zIndex : "0", 10),
      clipPath: style?.clipPath,
      transform: style?.transform,
      opacity: Number.parseFloat(style?.opacity || "NaN")
    };
    animation?.play();
    return evidence;
  });

  expect(result.system).toBe("climate");
  expect(result.picture).toBe("climate");
  expect(result.imageReady).toBe(true);
  expect(result.snapshots).toBe(1);
  expect(result.panelInert).toBe(false);
  expect(result.frozenSvgCount).toBe(1);
  expect(result.frozenSvgSignature).toBe(result.outgoingSignature);
  expect(result.snapshotZ).toBeGreaterThanOrEqual(result.activeSvgZ);
  expect(result.copyZ).toBeGreaterThan(result.snapshotZ);
  expect(result.clipPath).toBe("none");
  expect(result.transform).toBe("none");
  expect(result.opacity).toBeGreaterThan(0);
  expect(result.opacity).toBeLessThan(1);
  await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(0, { timeout: 500 });
  await expect(root.locator('[data-phone-system="audio"]')).toBeEnabled();
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

test("keeps rapid scene replacement bounded and supplies inert responsive metadata for all nine scenes", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeDecode = HTMLImageElement.prototype.decode;
    window.__slowSmartHomeDecode = false;
    window.__slowSmartHomeDecodePending = false;
    window.__releaseSlowSmartHomeDecode = null;
    HTMLImageElement.prototype.decode = function decode() {
      const pending = nativeDecode.call(this);
      if (!window.__slowSmartHomeDecode || !this.dataset.sceneDesktop?.includes("surveillance")) return pending;
      return new Promise((resolve, reject) => {
        window.__slowSmartHomeDecodePending = true;
        window.__releaseSlowSmartHomeDecode = () => pending.then(resolve, reject);
      });
    };
  });
  await page.goto(route);
  const root = await simulator(page);
  await root.locator('[data-phone-system="climate"]').click();
  await expect(root).toHaveAttribute("data-motion-phase", "disassemble");
  await root.evaluate((simulatorRoot) => { window.__slowSmartHomeDecode = true; simulatorRoot.querySelector('[data-phone-system="security"]').click(); });
  await expect.poll(() => root.evaluate(() => window.__slowSmartHomeDecodePending)).toBe(true);
  await page.waitForTimeout(330);
  await expect(root).toHaveAttribute("data-system", "security");
  await expect(root).toHaveAttribute("data-motion-phase", "idle");
  await expect(root.locator("[data-outgoing-snapshot]"), "the previous generation must not clear the newest cold-image snapshot").toHaveCount(1);
  await root.evaluate(() => window.__releaseSlowSmartHomeDecode());
  await expect(root).toHaveAttribute("data-motion-phase", "disassemble");
  await expect(root).toHaveAttribute("data-motion-phase", "idle");
  await root.evaluate(() => { window.__slowSmartHomeDecode = false; });
  for (const [systemId] of systems) await root.locator(`[data-phone-system="${systemId}"]`).click();
  await root.locator('[data-phone-range][data-control-system="shading"][data-control-id="position"]').evaluate((input) => {
    input.value = "37";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(root.locator("[data-outgoing-snapshot]")).toHaveCount(0);
  await expect(root).toHaveAttribute("data-motion-phase", "idle");
  await expect(root).toHaveAttribute("data-system", "shading");
  await expect(root).toHaveAttribute("data-physical-scene-svg-signature", /shading:position=37(?:\||$)/u);
  await expect(root.locator("[data-scene-title]")).toHaveText("Сонцезахист");
  const overlay = root.locator("[data-physical-scene-svg-overlay][data-physical-scene-svg-instance='smart-home-main']");
  await expect(overlay).toHaveAttribute("data-physical-scene-svg-active-system", "shading");
  await expect(overlay.locator('[data-physical-scene-svg-system="shading"]:not([hidden])')).toHaveCount(1);
  await expect(overlay.locator("[data-physical-scene-svg-system]:not([hidden])")).toHaveCount(1);
  for (const [systemId] of systems) {
    const picture = root.locator(`picture[data-scene-picture="${systemId}"]`);
    const image = picture.locator("img");
    await expect(picture.locator("source")).toHaveCount(0);
    await expect(image).not.toHaveAttribute("srcset", /./u);
    await expect(image).toHaveAttribute("data-scene-mobile", /-768\.webp$/u);
    await expect(image).toHaveAttribute("data-scene-desktop", /-1536\.webp$/u);
    await expect(image).toHaveAttribute("sizes", "(max-width: 767px) 100vw, 1536px");
    await expect(image).toHaveAttribute("alt", /\S{8,}/);
  }
  const activeImage = root.locator("picture[data-scene-picture]:visible img");
  await activeImage.evaluate((image) => image.decode());
  const expectedVariant = page.viewportSize().width <= 767 ? "-768.webp" : "-1536.webp";
  await expect.poll(() => activeImage.evaluate((image, suffix) => new URL(image.currentSrc).pathname.endsWith(suffix), expectedVariant)).toBe(true);
});

test("compact navigation never starts the desktop smart-home scene candidate", async ({ browser }) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4000";
  const context = await browser.newContext({ baseURL, locale: "uk-UA" });
  const page = await context.newPage();
  const requested = [];
  const failures = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/images/home/control-room-")) requested.push(request.url());
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/assets/images/home/control-room-")) failures.push({ url: request.url(), error: request.failure()?.errorText });
  });

  try {
    for (const width of [375, 414, 540]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto("/about/");
      await page.locator('img[src*="/control-room-"]').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
      requested.length = 0;
      failures.length = 0;

      await page.goto(route);
      const image = page.locator('[data-scene-picture="lighting"] img');
      await image.evaluate((element) => element.decode());

      expect(await image.evaluate((element) => new URL(element.currentSrc).pathname), `${width}px selected scene candidate`).toMatch(/control-room-768\.webp$/u);
      expect(requested.filter((url) => url.endsWith("control-room-1536.webp")), `${width}px must not start the desktop scene candidate`).toEqual([]);
      expect(failures, `${width}px scene candidate requests`).toEqual([]);
    }
  } finally {
    await context.close();
  }
});

test("viewport boundary starts only the selected smart-home scene candidate", async ({ browser }) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4000";
  const context = await browser.newContext({ baseURL, locale: "uk-UA" });
  const page = await context.newPage();
  const requested = [];
  const failures = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/images/home/control-room-")) requested.push(request.url());
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/assets/images/home/control-room-")) failures.push({ url: request.url(), error: request.failure()?.errorText });
  });

  try {
    for (const width of [767, 768, 900, 1980]) {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto("/about/");
      await page.locator('img[src*="/control-room-"]').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
      requested.length = 0;
      failures.length = 0;

      await page.goto(route);
      const image = page.locator('[data-scene-picture="lighting"] img');
      await image.evaluate((element) => element.decode());

      const expectedSuffix = width <= 767 ? "control-room-768.webp" : "control-room-1536.webp";
      const unexpectedSuffix = width <= 767 ? "control-room-1536.webp" : "control-room-768.webp";
      expect(await image.evaluate((element) => new URL(element.currentSrc).pathname), `${width}px selected scene candidate`).toMatch(new RegExp(`${expectedSuffix}$`, "u"));
      expect(requested.filter((url) => url.endsWith(unexpectedSuffix)), `${width}px must not start an unselected scene candidate`).toEqual([]);
      expect(failures, `${width}px scene candidate requests`).toEqual([]);
    }
  } finally {
    await context.close();
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
    const noJsScene = noJsRoot.locator('[data-scene-picture="lighting"] img');
    await noJsScene.evaluate((image) => image.decode());
    const expectedNoJsVariant = noJsPage.viewportSize().width <= 767 ? "-768.webp" : "-1536.webp";
    await expect.poll(() => noJsScene.evaluate((image, suffix) => new URL(image.currentSrc).pathname.endsWith(suffix), expectedNoJsVariant)).toBe(true);
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

  await page.unroute("**/smart-home/");
  await page.route("**/smart-home/", async (request) => {
    const response = await request.fetch();
    const body = (await response.text()).replaceAll('"view_box":{"width":1536,"height":1024}', '"view_box":{"width":0,"height":1024}');
    await request.fulfill({ response, body });
  });
  await page.goto(route);
  const svgFallback = await simulator(page);
  await expect(svgFallback).toHaveAttribute("data-enhanced", "true");
  await expect(svgFallback.locator("[data-smart-home-phone]")).toBeVisible();
  await expect(svgFallback.locator("picture[data-scene-picture]:visible")).toHaveCount(1);
  await expect(svgFallback.locator('[data-physical-scene-svg-overlay][data-physical-scene-svg-enhanced="true"]')).toHaveCount(0);
  await svgFallback.locator('[data-phone-system="climate"]').click();
  await expect(svgFallback).toHaveAttribute("data-system", "climate");
  await expect(svgFallback.locator('[data-scene-picture="climate"]')).toBeVisible();
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
  await expect(wideRoot).toHaveAttribute("data-motion-phase", "idle");
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
