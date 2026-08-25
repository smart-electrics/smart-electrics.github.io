import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const surfaceRoutes = ["/", "/services/"];
const directions = [
  ["electrical-design", "Електромонтажне проєктування", 0, "stairs"],
  ["electrical-installation", "Електромонтажні роботи", 0, "electrical-installation"],
  ["panels-and-protection", "Щити й захист", 1, "panel"],
  ["lighting", "Освітлення", 2, "stairs"],
  ["low-voltage", "Слабкострумові системи", 2, "surveillance"],
  ["backup-power", "Резервне живлення", 1, "backup"],
  ["smart-home-integration", "Розумний будинок", 2, "climate"],
  ["diagnostics-and-service", "Діагностика й сервіс", 1, "diagnostics"]
];
const sceneFamilies = ["panel", "stairs", "exterior", "surveillance", "audio", "backup", "climate", "shading", "diagnostics"];

async function stageFor(page) {
  const root = page.locator("[data-cinematic-root]");
  await expect(root).toHaveCount(1);
  const stage = root.locator("[data-cinematic-stage]");
  await expect(stage).toBeVisible();
  return { root, stage };
}

async function chooseDirection(stage, label) {
  const control = stage.getByRole("button", { name: label, exact: true });
  await expect(control).toHaveCount(1);
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
}

async function expectOneVisibleScene(stage) {
  await expect(stage.locator("[data-cinematic-scene]:visible")).toHaveCount(1);
  await expect(stage.locator("[data-cinematic-panel]:visible")).toHaveCount(1);
}

async function physicalSignature(stage) {
  return stage.locator("[data-cinematic-physical-picture]:visible img").evaluate(async (image) => {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 16;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (const channel of pixels) hash = ((hash << 5) - hash + channel) | 0;
    const src = image.currentSrc || image.src;
    return { src, asset: src.replace(/-(?:768|1536)(?=\.webp$)/u, ""), hash, width: image.naturalWidth, height: image.naturalHeight };
  });
}

async function focusSceneSignature(stage) {
  return stage.locator("[data-cinematic-focus-scene]:visible img").evaluate(async (image) => {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 16;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (const channel of pixels) hash = ((hash << 5) - hash + channel) | 0;
    return { src: image.currentSrc || image.src, hash };
  });
}

async function mediaAnchorGeometry(stage) {
  const [media, anchor] = await Promise.all([
    stage.locator("[data-cinematic-media]").boundingBox(),
    stage.locator("[data-cinematic-view]").boundingBox()
  ]);
  return {
    width: media?.width,
    height: media?.height,
    left: media && anchor ? media.x - anchor.x : undefined,
    top: media && anchor ? media.y - anchor.y : undefined
  };
}

test("the enhanced residence spine shows one scene beside an eight-control rail", async ({ page }) => {
  await page.goto("/");

  const { root, stage } = await stageFor(page);
  await expect(root.locator("[data-cinematic-fallback]")).toBeHidden();
  await expect(root).toHaveAttribute("data-cinematic-state", "assembled");
  await expectOneVisibleScene(stage);
  await expect(stage.locator("[data-cinematic-direction-control]:visible")).toHaveCount(8);
  await expect(stage.locator("[data-cinematic-relation-switcher]:visible")).toHaveCount(0);
  await expect(stage.locator("[data-cinematic-relation-scene]:visible")).toHaveCount(0);
});

test("both public cinematic surfaces expose the validated physical controls only after enhancement", async ({ page }) => {
  for (const route of surfaceRoutes) {
    await page.goto(route);
    const { root, stage } = await stageFor(page);
    await expect(root).toHaveAttribute("data-cinematic-physical-enhanced", "true");
    const picture = stage.locator("[data-cinematic-physical-picture]");
    const image = picture.locator("img");
    await expect(picture).toHaveCount(1);
    await expect(picture.locator("source")).toHaveCount(0);
    await expect(image).toHaveAttribute("srcset", /-768\.webp 768w, .*?-1536\.webp 1536w/u);
    await expect(image).toHaveAttribute("sizes", "(max-width: 767px) 100vw, 52vw");
    await image.evaluate((element) => element.decode());
    const expectedVariant = page.viewportSize().width <= 767 ? "-768.webp" : null;
    await expect.poll(() => image.evaluate((element, suffix) => {
      if (!element.currentSrc) return false;
      const path = new URL(element.currentSrc).pathname;
      return suffix ? path.endsWith(suffix) : /-(?:768|1536)\.webp$/u.test(path);
    }, expectedVariant)).toBe(true);
    await expect(stage.locator("[data-cinematic-physical-controls]:visible")).toHaveCount(1);
  }
});

test("assembled residence controls swap the physical room pixels without moving its stable media anchor", async ({ page }) => {
  await page.goto("/");
  const { root, stage } = await stageFor(page);
  const layer = stage.locator("[data-cinematic-physical-layer]");
  const controls = stage.locator("[data-cinematic-physical-controls='room']");
  const snapshot = stage.locator("[data-cinematic-physical-snapshot]");
  const media = stage.locator("[data-cinematic-media]");

  await expect(layer).toBeVisible();
  await expect(controls).toBeVisible();
  await expect(root).toHaveAttribute("data-cinematic-physical-enhanced", "true");
  await expect(stage.locator("[data-cinematic-physical-picture]")).toHaveCount(1);
  await expect(stage.getByRole("group", { name: "Освітлення" }).getByRole("button")).toHaveCount(4);
  await expect(stage.getByRole("group", { name: "Сонцезахист" }).getByRole("button")).toHaveCount(5);
  for (const control of await controls.getByRole("button").all()) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  const before = await physicalSignature(stage);
  const geometry = await Promise.all([layer.boundingBox(), media.boundingBox()]);

  const blackout = stage.getByRole("button", { name: "Ролети blackout", exact: true });
  await blackout.focus();
  await page.keyboard.press("Enter");
  await expect(blackout).toHaveAttribute("aria-pressed", "true");
  await expect(stage.getByRole("button", { name: "Вечір", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveCSS("animation-duration", "0.76s");
  await expect(stage.locator("[aria-live]")).toHaveCount(1);
  await expect(stage.locator("[data-cinematic-live]")).toHaveText("Освітлення: Вечір; сонцезахист: Ролети blackout.");
  expect(await controls.evaluate((element) => [...element.querySelectorAll("*, button")].map((candidate) => {
    const style = getComputedStyle(candidate);
    return { opacity: style.opacity, filter: style.filter };
  }).every((style) => style.opacity === "1" && style.filter === "none"))).toBeTruthy();
  const afterWindow = await physicalSignature(stage);
  expect(afterWindow.src).toMatch(/room-evening-blackout-(768|1536)\.webp$/);
  expect(afterWindow.hash).not.toBe(before.hash);

  await stage.getByRole("button", { name: "Маршрут", exact: true }).click();
  await expect(stage.getByRole("button", { name: "Маршрут", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(blackout).toHaveAttribute("aria-pressed", "true");
  const afterLighting = await physicalSignature(stage);
  expect(afterLighting.src).toMatch(/room-route-blackout-(768|1536)\.webp$/);
  expect(afterLighting.hash).not.toBe(afterWindow.hash);
  const afterGeometry = await Promise.all([layer.boundingBox(), media.boundingBox()]);
  expect(afterGeometry.map((box) => ({ width: box?.width, height: box?.height }))).toEqual(geometry.map((box) => ({ width: box?.width, height: box?.height })));
  expect(afterGeometry[0] && afterGeometry[1] && {
    left: afterGeometry[0].left - afterGeometry[1].left,
    top: afterGeometry[0].top - afterGeometry[1].top
  }).toEqual(geometry[0] && geometry[1] && {
    left: geometry[0].left - geometry[1].left,
    top: geometry[0].top - geometry[1].top
  });

  await expect(snapshot).toBeHidden({ timeout: 2_000 });
  const cinematicSnapshot = stage.locator("[data-cinematic-outgoing-snapshot]");
  await expect(snapshot).toBeHidden();
  await chooseDirection(stage, "Освітлення");
  await expect(cinematicSnapshot).toHaveAttribute("data-cinematic-snapshot-active", "true");
  expect(await cinematicSnapshot.evaluate((element) => element.style.getPropertyValue("--cinematic-snapshot-image"))).toMatch(/room-route-blackout-(768|1536)\.webp/);
  await expect(layer).toBeHidden();
  await expect(stage.locator("[data-cinematic-physical-controls]:visible")).toHaveCount(0);
  await stage.getByRole("button", { name: "Повернутися до всієї системи", exact: true }).click();
  await expect(root).toHaveAttribute("data-cinematic-state", "assembled");
  await expect(layer).toBeVisible();
  await expect(controls).toBeVisible();
  expect((await physicalSignature(stage)).asset).toBe(afterLighting.asset);
});

test("stair and exterior relations use the same physical layer to swap their own exact pixels", async ({ page }) => {
  for (const route of surfaceRoutes) {
    await page.goto(route);
    const { root, stage } = await stageFor(page);
    const layer = stage.locator("[data-cinematic-physical-layer]");
    const media = stage.locator("[data-cinematic-media]");
    const geometry = await Promise.all([layer.boundingBox(), media.boundingBox()]);

    await chooseDirection(stage, "Освітлення");
    await stage.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
    const stairControls = stage.locator("[data-cinematic-physical-controls='stairs']");
    await expect(root).toHaveAttribute("data-cinematic-relation", "lighting--stair-lighting");
    await expect(stairControls).toBeVisible();
    await expect(stairControls.getByRole("button")).toHaveCount(3);
    const stairsBefore = await physicalSignature(stage);
    await stairControls.getByRole("button", { name: "Маршрут сходами", exact: true }).click();
    await expect(stage.locator("[data-cinematic-physical-picture]")).toHaveAttribute("data-cinematic-physical-picture", "stairs:stair_lighting=route");
    await expect(stage.locator("[data-cinematic-live]")).toHaveText("Підсвітка сходів: Маршрут сходами.");
    const stairsRoute = await physicalSignature(stage);
    expect(stairsRoute.src).toMatch(/stairs-route-(768|1536)\.webp$/);
    expect(stairsRoute.hash).not.toBe(stairsBefore.hash);

    await stage.getByRole("button", { name: "Повернутися до всієї системи", exact: true }).click();
    await chooseDirection(stage, "Освітлення");
    await stage.getByRole("button", { name: "Показати зв’язок: Зовнішнє освітлення", exact: true }).click();
    const exteriorControls = stage.locator("[data-cinematic-physical-controls='exterior']");
    await expect(root).toHaveAttribute("data-cinematic-relation", "lighting--outdoor-lighting");
    await expect(exteriorControls).toBeVisible();
    await expect(exteriorControls.getByRole("button")).toHaveCount(3);
    const exteriorBefore = await physicalSignature(stage);
    await exteriorControls.getByRole("button", { name: "Нічне зниження", exact: true }).click();
    await expect(stage.locator("[data-cinematic-physical-picture]")).toHaveAttribute("data-cinematic-physical-picture", "exterior:exterior_lighting=reduced-night");
    await expect(stage.locator("[data-cinematic-live]")).toHaveText("Зовнішнє освітлення: Нічне зниження.");
    const exteriorReduced = await physicalSignature(stage);
    expect(exteriorReduced.src).toMatch(/exterior-reduced-night-(768|1536)\.webp$/);
    expect(exteriorReduced.hash).not.toBe(exteriorBefore.hash);
    const afterGeometry = await Promise.all([layer.boundingBox(), media.boundingBox()]);
    expect(afterGeometry.map((box) => ({ width: box?.width, height: box?.height, left: box?.left, top: box?.top }))).toEqual(geometry.map((box) => ({ width: box?.width, height: box?.height, left: box?.left, top: box?.top })));
  }
});

test("physical controls fail closed for malformed state data", async ({ page }) => {
  await page.addInitScript(() => {
    const originalParse = JSON.parse;
    JSON.parse = function physicalSceneParse(value, ...rest) {
      if (typeof value === "string" && value.includes('"systems"') && value.includes('"initial_state"')) return { systems: [] };
      return originalParse.call(this, value, ...rest);
    };
  });
  await page.goto("/");
  const { stage } = await stageFor(page);
  await expect(stage.locator("[data-cinematic-physical-controls]:visible")).toHaveCount(0);
  await expect(stage.locator("[data-cinematic-physical-layer]")).toBeHidden();
});

test("a unique but wrong physical control ID fails closed before controls become interactive", async ({ page }) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const control = node.matches("button[data-physical-control-id='lighting']") ? node : node.querySelector("button[data-physical-control-id='lighting']");
        if (control) {
          control.dataset.physicalValueId = "not-evening";
          observer.disconnect();
          return;
        }
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  const { root, stage } = await stageFor(page);
  await expect(root).not.toHaveAttribute("data-cinematic-physical-enhanced", "true");
  await expect(stage.locator("[data-cinematic-physical-controls]:visible")).toHaveCount(0);
  await expect(stage.locator("[data-cinematic-physical-layer]")).toBeHidden();
});

test("physical controls respect reduced motion with an instant image swap", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const reduced = await stageFor(page);
  const snapshot = reduced.stage.locator("[data-cinematic-physical-snapshot]");
  await reduced.stage.getByRole("button", { name: "Жалюзі", exact: true }).click();
  await expect(snapshot).toBeHidden();
  await expect(reduced.stage.locator("[data-cinematic-physical-layer]")).not.toHaveAttribute("data-cinematic-physical-transition", "true");
  await expect.poll(() => reduced.stage.locator("[data-cinematic-physical-layer], [data-cinematic-physical-layer] *").evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return [style.animationDuration, style.transitionDuration].some((value) => value.split(",").some((duration) => Number.parseFloat(duration) > 0));
  }).length)).toBe(0);
});

test("both surfaces turn a direction and relation into one causal scene and real destination", async ({ page }) => {
  for (const route of surfaceRoutes) {
    await page.goto(route);
    const { root, stage } = await stageFor(page);

    await chooseDirection(stage, "Освітлення");
    await expect(root).toHaveAttribute("data-cinematic-state", "focus");
    await expect(root).toHaveAttribute("data-cinematic-direction", "lighting");
    await expectOneVisibleScene(stage);
    await expect(stage.locator("[data-cinematic-focus-panel=lighting]:visible")).toHaveCount(1);
    await expect(stage.locator("[data-cinematic-focus-destination=lighting]:visible")).toHaveAttribute("href", "/services/lighting/");
    await expect(stage.locator("[data-cinematic-relation-switcher=lighting]:visible button")).toHaveCount(2);

    await stage.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
    await expect(root).toHaveAttribute("data-cinematic-state", "reassembled");
    await expect(root).toHaveAttribute("data-cinematic-relation", "lighting--stair-lighting");
    await expectOneVisibleScene(stage);
    await expect(stage.locator("[data-cinematic-relation-scene='lighting--stair-lighting']:visible")).toHaveCount(1);
    await expect(stage.locator("[data-cinematic-reassembled-panel='lighting--stair-lighting']:visible")).toHaveCount(1);
    await expect(stage.locator("[data-cinematic-reassembled-destination='lighting--stair-lighting']:visible")).toHaveAttribute("href", "/services/lighting/");
    await expect(stage.locator("[data-cinematic-related='lighting--stair-lighting']:visible a")).toHaveCount(2);
    await expect(stage.locator("[data-cinematic-relation-switcher]:visible")).toHaveCount(0);

    await stage.getByRole("button", { name: "Повернутися до всієї системи", exact: true }).click();
    await expect(root).toHaveAttribute("data-cinematic-state", "assembled");
    await expectOneVisibleScene(stage);
  }
});

test("one live region announces the active direction and relation", async ({ page }) => {
  await page.goto("/");
  const { stage } = await stageFor(page);
  const live = stage.locator("[data-cinematic-live]");

  await expect(stage.locator("[aria-live]")).toHaveCount(1);
  await expect(live).toBeEmpty();

  await chooseDirection(stage, "Освітлення");
  await expect(live).toHaveText("Групи світла формують повсякденні й маршрутні сценарії простору.");

  await stage.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
  await expect(live).toHaveText("Маршрутне світло для сходів розглядають разом із групами освітлення.");
});

test("every enhanced direction has one 44px control and no same-name destination link", async ({ page }) => {
  await page.goto("/services/");
  const { stage } = await stageFor(page);

  for (const [, label] of directions) {
    const control = stage.getByRole("button", { name: label, exact: true });
    await expect(control).toHaveCount(1);
    await expect(control).toBeVisible();
    await expect(stage.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    const box = await control.boundingBox();
    expect(box?.width, `${label} needs a 44px target width`).toBeGreaterThanOrEqual(44);
    expect(box?.height, `${label} needs a 44px target height`).toBeGreaterThanOrEqual(44);
  }
});

test("each direction focuses exactly one pre-rendered panel and exposes relation choices only for its owner", async ({ page }) => {
  await page.goto("/");
  const { root, stage } = await stageFor(page);

  for (const [id, label, relationCount, sceneFamily] of directions) {
    await chooseDirection(stage, label);
    await expect(root).toHaveAttribute("data-cinematic-state", "focus");
    await expect(root).toHaveAttribute("data-cinematic-direction", id);
    await expectOneVisibleScene(stage);
    await expect(stage.locator("[data-cinematic-scene]:visible")).toHaveAttribute("data-cinematic-scene-family", sceneFamily);
    await expect(stage.locator(`[data-cinematic-focus-panel='${id}']:visible`)).toHaveCount(1);
    await expect(stage.locator("[data-cinematic-relation-switcher]:visible button")).toHaveCount(relationCount);
  }
});

test("electrical installation and panels use distinct focus images without moving the media anchor", async ({ page }) => {
  for (const route of surfaceRoutes) {
    await page.goto(route);
    const { stage } = await stageFor(page);

    await chooseDirection(stage, "Електромонтажні роботи");
    const installation = await focusSceneSignature(stage);
    const installationGeometry = await mediaAnchorGeometry(stage);

    await chooseDirection(stage, "Щити й захист");
    const panels = await focusSceneSignature(stage);
    const panelsGeometry = await mediaAnchorGeometry(stage);

    expect(installation.src).toMatch(/\/smart-home\/electrical-installation-(768|1536)\.webp$/);
    expect(panels.src).toMatch(/\/smart-home\/panel-(768|1536)\.webp$/);
    expect(panels.src).not.toBe(installation.src);
    expect(panels.hash).not.toBe(installation.hash);
    expect(panelsGeometry).toEqual(installationGeometry);
  }
});

test("the static fallback retains eight real destinations and nine relation explanations when enhancement aborts", async ({ page }) => {
  await page.route("**/assets/js/cinematic-stage.js", (route) => route.abort());

  for (const route of surfaceRoutes) {
    await page.goto(route);
    const root = page.locator("[data-cinematic-root]");
    const fallback = root.locator("[data-cinematic-fallback]");
    await expect(fallback).toBeVisible();
    await expect(root.locator("[data-cinematic-stage]")).toBeHidden();
    await expect(fallback.locator("[data-cinematic-fallback-direction]:visible")).toHaveCount(8);
    await expect(fallback.locator("[data-cinematic-fallback-relation]:visible")).toHaveCount(9);
    await expect(fallback.locator("[data-cinematic-physical-fallback]")).toBeVisible();
    const physicalFallback = fallback.locator("[data-cinematic-physical-fallback]");
    await expect(physicalFallback.getByRole("link", { name: "Освітлення", exact: true })).toHaveAttribute("href", "/services/lighting/");
    await expect(physicalFallback.getByRole("link", { name: "Розумний будинок", exact: true })).toHaveAttribute("href", "/services/smart-home-integration/");
    await expect(root.locator("button[data-cinematic-action]:visible")).toHaveCount(0);
    for (const link of await fallback.locator("[data-cinematic-direction-link]").all()) {
      await expect(link).toHaveAttribute("href", /\/services\/.+\/$/);
    }
  }
});

test("a malformed graph keeps the server fallback visible instead of exposing inert controls", async ({ page }) => {
  await page.addInitScript(() => {
    const originalParse = JSON.parse;
    JSON.parse = function cinematicFallbackParse(value, ...rest) {
      if (typeof value === "string" && value.includes('"directions"') && value.includes('"relations"')) {
        return originalParse('{"directions":[],"relations":[]}');
      }
      return originalParse.call(this, value, ...rest);
    };
  });
  await page.goto("/");

  const root = page.locator("[data-cinematic-root]");
  await expect(root.locator("[data-cinematic-fallback]")).toBeVisible();
  await expect(root.locator("[data-cinematic-stage]")).toBeHidden();
  await expect(root).not.toHaveAttribute("data-cinematic-enhanced", "true");
});

test("all nine residence scene families remain pre-rendered on both public surfaces", async ({ page }) => {
  for (const route of surfaceRoutes) {
    await page.goto(route);
    const { stage } = await stageFor(page);
    const relationScenes = stage.locator("[data-cinematic-relation-scene]");
    await expect(relationScenes).toHaveCount(sceneFamilies.length);
    for (const family of sceneFamilies) {
      const scene = stage.locator(`[data-cinematic-relation-scene][data-cinematic-scene-family='${family}']`);
      await expect(scene).toHaveCount(1);
      await expect(scene.locator("img")).toHaveAttribute("src", new RegExp(`/smart-home/${family}-1536\\.webp$`));
      await expect(scene.locator("img")).toHaveAttribute("alt", /Візуальна концепція:/);
    }
  }
});

test("rapid replacement retains one image-only snapshot and clears it on animation end or reduced motion", async ({ page }) => {
  await page.goto("/services/");
  const { root, stage } = await stageFor(page);
  const snapshot = stage.locator("[data-cinematic-outgoing-snapshot]");

  await chooseDirection(stage, "Освітлення");
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveAttribute("aria-hidden", "true");
  await expect(snapshot).toHaveCSS("animation-name", "residence-spine-outgoing");
  await expect(snapshot).toBeEmpty();

  await chooseDirection(stage, "Резервне живлення");
  await expect(stage.locator("[data-cinematic-outgoing-snapshot]:visible")).toHaveCount(1);
  await snapshot.dispatchEvent("animationcancel");
  await expect(snapshot).toBeHidden();

  await chooseDirection(stage, "Освітлення");
  await expect(snapshot).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(snapshot).toBeHidden();
  await expect(root).toHaveAttribute("data-cinematic-state", "focus");
});

test("reduced motion changes state without snapshots, transitions, or non-opaque text", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const { root, stage } = await stageFor(page);

  await chooseDirection(stage, "Освітлення");
  await stage.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
  await expect(root).toHaveAttribute("data-cinematic-state", "reassembled");
  await expect(stage.locator("[data-cinematic-outgoing-snapshot]:visible")).toHaveCount(0);
  await expect.poll(() => stage.locator("*").evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return [style.animationDuration, style.transitionDuration].some((value) =>
      value.split(",").some((duration) => Number.parseFloat(duration) > 0)
    );
  }).length)).toBe(0);

  const textStyles = await stage.locator("[data-cinematic-panel]:visible, [data-cinematic-panel]:visible *").evaluateAll((elements) =>
    elements.map((element) => ({ opacity: getComputedStyle(element).opacity, filter: getComputedStyle(element).filter }))
  );
  expect(textStyles).toEqual(expect.arrayContaining([{ opacity: "1", filter: "none" }]));
  expect(textStyles.every((style) => style.opacity === "1" && style.filter === "none")).toBeTruthy();
});

test("keyboard and touch select the same residence-spine state", async ({ page, browser }) => {
  await page.goto("/");
  const { root, stage } = await stageFor(page);

  const physicalKeyboard = stage.getByRole("button", { name: "Повне", exact: true });
  await physicalKeyboard.focus();
  await page.keyboard.press("Enter");
  await expect(stage.locator("[data-cinematic-physical-picture]")).toHaveAttribute("data-cinematic-physical-picture", "full:open");

  const keyboard = stage.getByRole("button", { name: "Резервне живлення", exact: true });
  await keyboard.focus();
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-cinematic-direction", "backup-power");

  const touchContext = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 812 } });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(new URL("/", page.url()).href);
  const touchStage = touchPage.locator("[data-cinematic-stage]");
  await touchStage.getByRole("button", { name: "Жалюзі", exact: true }).tap();
  await expect(touchStage.locator("[data-cinematic-physical-picture]")).toHaveAttribute("data-cinematic-physical-picture", "evening:blinds");
  await touchStage.getByRole("button", { name: "Освітлення", exact: true }).tap();
  await expect(touchPage.locator("[data-cinematic-root]")).toHaveAttribute("data-cinematic-direction", "lighting");
  await touchContext.close();
});

test("mobile and desktop spine keep one-pixel connector lanes away from controls and copy", async ({ page }) => {
  for (const { width, height, maximumHeight, expectsLandscapeScene } of [
    { width: 375, height: 812, maximumHeight: 1100, expectsLandscapeScene: false },
    { width: 1440, height: 1000, maximumHeight: null, expectsLandscapeScene: true }
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const { root, stage } = await stageFor(page);
    await chooseDirection(stage, "Освітлення");

    const geometry = await root.evaluate((element) => {
    const visible = (candidate) => !candidate.hasAttribute("hidden") && getComputedStyle(candidate).display !== "none";
    const lane = element.querySelector("[data-cinematic-connector-lane]");
    const composition = element.querySelector("[data-cinematic-composition]");
    const laneRect = lane?.getBoundingClientRect();
    const compositionRect = composition?.getBoundingClientRect();
    const rootRect = element.getBoundingClientRect();
    const blockers = [...element.querySelectorAll("button, a, [data-cinematic-panel]")]
      .filter(visible)
      .map((candidate) => candidate.getBoundingClientRect());
    const overlaps = laneRect ? blockers.some((rect) =>
      laneRect.left < rect.right && laneRect.right > rect.left && laneRect.top < rect.bottom && laneRect.bottom > rect.top
    ) : true;
    return {
      scrollHeight: element.scrollHeight,
      laneThickness: laneRect ? Math.min(laneRect.width, laneRect.height) : 99,
      compositionAspect: compositionRect ? compositionRect.width / compositionRect.height : 0,
      bounded: Boolean(laneRect && laneRect.left >= rootRect.left && laneRect.right <= rootRect.right && laneRect.top >= rootRect.top && laneRect.bottom <= rootRect.bottom),
      overlaps
    };
    });

    if (maximumHeight) expect(geometry.scrollHeight).toBeLessThanOrEqual(maximumHeight);
    if (expectsLandscapeScene) expect(geometry.compositionAspect).toBeCloseTo(4 / 3, 2);
    expect(geometry.laneThickness).toBeLessThanOrEqual(2);
    expect(geometry.bounded).toBeTruthy();
    expect(geometry.overlaps).toBeFalsy();
  }
});

test("the spine has no horizontal overflow through every required width and passes axe in meaningful states", async ({ page }) => {
  for (const width of [375, 414, 540, 768, 900, 1024, 1280, 1440, 1720, 1980]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1000 });
    await page.goto("/services/");
    const { root, stage } = await stageFor(page);
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const compositionWidth = await root.locator("[data-cinematic-composition]").evaluate((element) => element.getBoundingClientRect().width);
    expect(overflow, `${width}px should not overflow`).toBe(0);
    if (width === 375) expect(await root.evaluate((element) => element.scrollHeight)).toBeLessThanOrEqual(1100);
    if (width === 1980) expect(compositionWidth, "the 1980px stage should not retain the rejected tablet-width cap").toBeGreaterThanOrEqual(1400);
    await chooseDirection(stage, "Освітлення");
    await stage.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
    await expectOneVisibleScene(stage);
  }

  await page.goto("/services/");
  const { stage: axeStage } = await stageFor(page);
  for (const state of ["assembled", "focus", "reassembled"]) {
    if (state === "focus") await chooseDirection(axeStage, "Освітлення");
    if (state === "reassembled") {
      await axeStage.getByRole("button", { name: "Показати зв’язок: Освітлення сходів", exact: true }).click();
    }
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${state} residence spine should pass axe`).toEqual([]);
  }
});
