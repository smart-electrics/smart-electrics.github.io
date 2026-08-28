import { chromium } from "playwright";

const baseUrl = process.env.ISSUE61_BASE_URL || "https://smart-electrics.github.io";
const failures = [];
const evidence = {};
const browser = await chromium.launch({ headless: true });

const requireOutcome = (condition, message) => {
  if (!condition) failures.push(message);
};

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
    locale: "uk-UA",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  const response = await page.goto(`${baseUrl}/smart-home/`, { waitUntil: "networkidle" });
  requireOutcome(response?.ok(), `smart-home returned ${response?.status() || "no response"}`);
  await page.waitForFunction(() => document.querySelector("[data-smart-home-simulator]")?.dataset.enhanced === "true");

  const simulator = page.locator("[data-smart-home-simulator]");
  const overlay = page.locator('[data-physical-scene-svg-instance="smart-home-main"]');

  const selectSystem = async (name, id) => {
    await simulator.getByRole("button", { name, exact: true }).click();
    await page.waitForFunction((systemId) => document.querySelector("[data-smart-home-simulator]")?.dataset.system === systemId, id);
  };

  const layerGeometry = async (layerName) => overlay.locator(`[data-physical-scene-svg-layer="${layerName}"]`).evaluate((layer) => {
    const shape = layer.querySelector("[data-physical-scene-svg-shape]");
    return {
      layerTransform: layer.getAttribute("transform") || "",
      parameters: layer.dataset.physicalSceneSvgParameters || "",
      shape: shape?.tagName.toLowerCase() || "",
      x: shape?.getAttribute("x") || "",
      y: shape?.getAttribute("y") || "",
      width: shape?.getAttribute("width") || "",
      height: shape?.getAttribute("height") || "",
      points: shape?.getAttribute("points") || "",
      transform: shape?.getAttribute("transform") || "",
      computedTransform: getComputedStyle(layer).transform,
      clipPath: getComputedStyle(layer).clipPath
    };
  });

  await selectSystem("Сонцезахист", "shading");
  await simulator.getByRole("button", { name: "Тюль", exact: true }).click();
  const shadingPanel = simulator.locator('[data-phone-control-panel="shading"]:not([hidden])');
  const tullePosition = shadingPanel.locator('input[type="range"]').first();
  requireOutcome(await overlay.locator('[data-physical-scene-svg-layer^="shading-tulle-"]').count() === 2, "Тюль не має двох фізичних бокових панелей");
  await tullePosition.fill("0");
  const tulleClosed = await layerGeometry("shading-tulle-left");
  await tullePosition.fill("100");
  const tulleOpen = await layerGeometry("shading-tulle-left");
  evidence.tulle = { closed: tulleClosed, open: tulleOpen };
  const { parameters: closedParameters, ...closedGeometry } = tulleClosed;
  const { parameters: openParameters, ...openGeometry } = tulleOpen;
  requireOutcome(
    JSON.stringify(closedGeometry) !== JSON.stringify(openGeometry),
    "Тюль не змінює геометрію між 0% і 100%; рух підмінено opacity/tint"
  );

  await simulator.getByRole("button", { name: "Жалюзі", exact: true }).click();
  const blindSliderNames = await shadingPanel.locator('input[type="range"]:visible').evaluateAll((sliders) => sliders.map((slider) =>
    slider.getAttribute("aria-label") || document.querySelector(`label[for="${slider.id}"]`)?.textContent.trim() || ""
  ));
  evidence.blindSliderNames = blindSliderNames;
  requireOutcome(blindSliderNames.includes("Підняття жалюзі"), "Жалюзі не мають окремого control для підняття/складання");
  requireOutcome(blindSliderNames.includes("Кут ламелей"), "Жалюзі не мають окремого control для кута ламелей");

  const presets = [
    ["Ранок", "morning"],
    ["Повернення", "arrival"],
    ["Вечір", "evening"],
    ["Вихід", "away"],
    ["Нічний маршрут", "night"],
    ["Спека", "heat"],
    ["Резерв", "backup"]
  ];
  await simulator.getByRole("radio", { name: "Резерв", exact: true }).check();
  const presetContexts = [];
  for (const [label, id] of presets) {
    await simulator.getByRole("radio", { name: label, exact: true }).check();
    await page.waitForFunction((presetId) => document.querySelector("[data-smart-home-simulator]")?.dataset.preset === presetId, id);
    const contextEvidence = await simulator.evaluate((root) => {
      const image = root.querySelector('.smart-home__scene picture[data-scene-picture]:not([hidden]) img');
      return {
        system: root.dataset.system,
        source: image?.currentSrc || image?.src || "",
        signature: root.dataset.physicalSceneSvgSignature || ""
      };
    });
    presetContexts.push({ preset: id, ...contextEvidence });
  }
  evidence.presets = presetContexts;
  requireOutcome(new Set(presetContexts.map(({ system }) => system)).size === presets.length, "Сім готових конфігурацій не мають семи різних фізичних контекстів");
  requireOutcome(new Set(presetContexts.map(({ source }) => source)).size === presets.length, "Сім готових конфігурацій повторюють ті самі raster scenes");

  const abstractSystems = [
    ["Щит і захист", "panel"],
    ["Слабкострумна інфраструктура", "low-voltage"],
    ["Резервне живлення", "backup-power"]
  ];
  evidence.abstractSystems = {};
  for (const [label, id] of abstractSystems) {
    await selectSystem(label, id);
    const primitives = await overlay.locator(`[data-physical-scene-svg-system="${id}"] [data-physical-scene-svg-layer]`).evaluateAll((layers) => layers.map((layer) => ({
      layer: layer.dataset.physicalSceneSvgLayer,
      effect: layer.dataset.physicalSceneSvgEffect,
      shape: layer.querySelector("[data-physical-scene-svg-shape]")?.tagName.toLowerCase() || ""
    })));
    evidence.abstractSystems[id] = primitives;
    requireOutcome(
      primitives.every(({ effect, shape }) => !["topology", "node"].includes(effect) && !["path", "circle"].includes(shape)),
      `${label} все ще використовує абстрактні topology/node lines або circles`
    );
  }

  await selectSystem("Клімат-контроль", "climate");
  const climateLayers = await overlay.locator('[data-physical-scene-svg-system="climate"] [data-physical-scene-svg-layer]').evaluateAll((layers) => layers.map((layer) => ({
    layer: layer.dataset.physicalSceneSvgLayer,
    shape: layer.querySelector("[data-physical-scene-svg-shape]")?.tagName.toLowerCase() || ""
  })));
  evidence.climate = climateLayers;
  requireOutcome(climateLayers.some(({ layer }) => layer === "climate-heating-floor-field"), "Клімат не має фізичного поля обігріву від підлоги/джерела");
  requireOutcome(climateLayers.some(({ layer }) => layer === "climate-cooling-air-field"), "Клімат не має фізичного поля охолодження від вентиляції/джерела");
  requireOutcome(climateLayers.every(({ shape }) => shape !== "path"), "Клімат усе ще малює ламані path-лінії");

  await selectSystem("Аудіо", "audio");
  const audioPanel = simulator.locator('[data-phone-control-panel="audio"]:not([hidden])');
  const audioSliderNames = await audioPanel.locator('input[type="range"]:visible').evaluateAll((sliders) => sliders.map((slider) =>
    slider.getAttribute("aria-label") || document.querySelector(`label[for="${slider.id}"]`)?.textContent.trim() || ""
  ));
  const audioLayers = await overlay.locator('[data-physical-scene-svg-system="audio"] [data-physical-scene-svg-layer]').evaluateAll((layers) => layers.map((layer) => layer.dataset.physicalSceneSvgLayer));
  evidence.audio = { sliderNames: audioSliderNames, layers: audioLayers };
  requireOutcome(audioSliderNames.includes("Гучність"), "Аудіо не має зрозумілого control гучності");
  requireOutcome(audioLayers.filter((layer) => layer.includes("speaker")).length >= 2, "Аудіо не показує щонайменше дві фізично прив’язані speaker points");
  requireOutcome(audioLayers.some((layer) => layer.includes("zone-field")), "Аудіо не показує обрану фізичну зону/групу");

  await selectSystem("Безпека й відео", "security");
  const securityPanel = simulator.locator('[data-phone-control-panel="security"]:not([hidden])');
  const securitySliderNames = await securityPanel.locator('input[type="range"]:visible').evaluateAll((sliders) => sliders.map((slider) =>
    slider.getAttribute("aria-label") || document.querySelector(`label[for="${slider.id}"]`)?.textContent.trim() || ""
  ));
  const securityLayers = await overlay.locator('[data-physical-scene-svg-system="security"] [data-physical-scene-svg-layer]').evaluateAll((layers) => layers.map((layer) => layer.dataset.physicalSceneSvgLayer));
  evidence.security = { sliderNames: securitySliderNames, layers: securityLayers };
  requireOutcome(securitySliderNames.includes("Кут огляду"), "Безпека й відео не мають control кута огляду камери");
  requireOutcome(securityLayers.some((layer) => layer.includes("camera-body")), "Безпека й відео не показують фізичну камеру");
  requireOutcome(securityLayers.some((layer) => layer.includes("camera-view")), "Безпека й відео не показують поле огляду камери");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  requireOutcome(overflow <= 1, `smart-home overflows horizontally by ${overflow}px`);
  requireOutcome(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join(" | ")}`);

  console.log(JSON.stringify({ status: failures.length ? "FAIL" : "PASS", failures, evidence }, null, 2));
  if (failures.length) process.exitCode = 1;
  await context.close();
} finally {
  await browser.close();
}
