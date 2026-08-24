import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const studios = [
  {
    route: "/services/electrical-design/",
    controls: ["План", "Групи й навантаження", "Рішення для щита"],
    direction: "electrical-design",
    related: [
      ["/services/electrical-installation/", "/services/panels-and-protection/", "/services/lighting/"],
      ["/services/electrical-installation/", "/services/panels-and-protection/"],
      ["/services/panels-and-protection/", "/services/electrical-installation/", "/services/backup-power/"]
    ]
  },
  {
    route: "/services/electrical-installation/",
    controls: ["Траси й точки", "Підключення", "Розподіл"],
    direction: "electrical-installation",
    related: [
      ["/services/electrical-design/", "/services/panels-and-protection/", "/services/lighting/", "/services/low-voltage/"],
      ["/services/electrical-design/", "/services/panels-and-protection/"],
      ["/services/panels-and-protection/", "/services/electrical-installation/", "/services/backup-power/"]
    ]
  },
  {
    route: "/services/panels-and-protection/",
    controls: ["Ввід", "Захист", "Розподіл і пріоритети"],
    direction: "panels-and-protection",
    related: [
      ["/services/electrical-design/", "/services/electrical-installation/", "/services/backup-power/", "/services/smart-home-integration/"],
      ["/services/electrical-design/", "/services/electrical-installation/"],
      ["/services/panels-and-protection/", "/services/electrical-installation/", "/services/backup-power/"]
    ]
  }
];

const multiRelationStudios = [
  {
    route: "/services/lighting/",
    controls: ["Групи світла", "Маршрут", "Зв’язок"],
    related: [
      ["/services/electrical-design/", "/services/electrical-installation/", "/services/smart-home-integration/"],
      ["/services/electrical-design/", "/services/electrical-installation/"]
    ],
    relations: [
      { label: "Освітлення сходів", id: "lighting--stair-lighting", image: "/assets/images/smart-home/stairs-1536.webp", related: ["/services/lighting/", "/services/electrical-design/", "/services/smart-home-integration/"] },
      { label: "Зовнішнє освітлення", id: "lighting--outdoor-lighting", image: "/assets/images/smart-home/exterior-1536.webp", related: ["/services/lighting/", "/services/electrical-installation/", "/services/low-voltage/"] }
    ]
  },
  {
    route: "/services/low-voltage/",
    controls: ["Топологія", "Вузол", "Маршрутизація"],
    related: [
      ["/services/electrical-design/", "/services/electrical-installation/", "/services/smart-home-integration/"],
      ["/services/electrical-design/", "/services/electrical-installation/"]
    ],
    relations: [
      { label: "Відеоконтроль", id: "low-voltage--cctv", image: "/assets/images/smart-home/surveillance-1536.webp", related: ["/services/low-voltage/", "/services/electrical-installation/", "/services/diagnostics-and-service/"] },
      { label: "Аудіо", id: "low-voltage--audio", image: "/assets/images/smart-home/audio-1536.webp", related: ["/services/low-voltage/", "/services/electrical-design/", "/services/smart-home-integration/"] }
    ]
  }
];

async function studioFor(page) {
  const root = page.locator("[data-service-studio-root]");
  await expect(root).toHaveAttribute("data-service-studio-enhanced", "true");
  return { root, stage: root.locator("[data-service-studio-stage]") };
}

test("the three service studios retain their complete semantic reading order without JavaScript", async ({ page }) => {
  await page.route("**/assets/js/service-studio.js", (route) => route.abort());

  for (const studio of studios) {
    await page.goto(studio.route);
    const root = page.locator("[data-service-studio-root]");
    const fallback = root.locator("[data-service-studio-fallback]");
    await expect(fallback).toBeVisible();
    await expect(root.locator("[data-service-studio-stage]")).toBeHidden();
    await expect(fallback.getByRole("link")).not.toHaveCount(0);
    await expect(fallback.getByText(studio.controls[0], { exact: true })).toBeVisible();
    await expect(fallback.getByText(studio.controls[1], { exact: true })).toBeVisible();
    await expect(fallback.getByText(studio.controls[2], { exact: true })).toBeVisible();
  }
});

test("each studio rail changes the canonical state, explanation, scene and exact related links", async ({ page }) => {
  for (const studio of studios) {
    await page.goto(studio.route);
    const { root, stage } = await studioFor(page);

    for (const [index, label] of studio.controls.entries()) {
      await stage.getByRole("button", { name: label, exact: true }).click();
      await expect(root).toHaveAttribute("data-service-studio-state", ["assembled", "focus", "reassembled"][index]);
      await expect(stage.locator("[data-service-studio-scene]:visible")).toHaveCount(1);
      await expect(stage.locator("[data-service-studio-panel]:visible")).toHaveCount(1);
      await expect(stage.locator("[data-service-studio-panel]:visible [data-service-studio-summary]")).not.toHaveText("");
      const relatedLinks = stage.locator("[data-service-studio-panel]:visible [data-service-studio-related] a");
      await expect(relatedLinks).toHaveCount(studio.related[index].length);
      expect(await relatedLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(studio.related[index]);
      await expect(stage.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    }

    await expect(root).toHaveAttribute("data-service-studio-direction", "panels-and-protection");
    await expect(root).toHaveAttribute("data-service-studio-relation", "panels-and-protection--panel-assembly");
  }
});

test("keyboard and touch operate the same studio states", async ({ page, browser }) => {
  const studio = studios[0];
  await page.goto(studio.route);
  const { root, stage } = await studioFor(page);
  const keyboardControl = stage.getByRole("button", { name: studio.controls[1], exact: true });
  await keyboardControl.focus();
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-service-studio-state", "focus");

  const touchContext = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 812 } });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(new URL(studio.route, page.url()).href);
  const touchRoot = touchPage.locator("[data-service-studio-root]");
  await touchRoot.locator("[data-service-studio-stage]").getByRole("button", { name: studio.controls[2], exact: true }).tap();
  await expect(touchRoot).toHaveAttribute("data-service-studio-state", "reassembled");
  await touchContext.close();
});

test("outgoing snapshots animate and rapid rail changes clean up to one settled scene and panel", async ({ page }) => {
  await page.goto(studios[1].route);
  const { root, stage } = await studioFor(page);
  await page.addStyleTag({ content: "[data-service-studio-outgoing-snapshot][data-service-studio-snapshot-active] { animation-duration: 10s !important; }" });
  const snapshot = stage.locator("[data-service-studio-outgoing-snapshot]");
  await stage.getByRole("button", { name: "Підключення", exact: true }).click();
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveAttribute("data-service-studio-snapshot-active", "true");
  await expect(snapshot).toHaveCSS("animation-name", "service-studio-outgoing");
  await stage.getByRole("button", { name: "Траси й точки", exact: true }).click();
  await stage.getByRole("button", { name: "Розподіл", exact: true }).click();

  await expect(root).toHaveAttribute("data-service-studio-state", "reassembled");
  await expect(stage.locator("[data-service-studio-scene]:visible")).toHaveCount(1);
  await expect(stage.locator("[data-service-studio-panel]:visible")).toHaveCount(1);
  await expect(snapshot).toBeVisible();
  await snapshot.dispatchEvent("animationcancel");
  await expect(snapshot).toBeHidden();
  await expect(root).not.toHaveAttribute("data-service-studio-transition");
});

test("service studios are still, accessible and overflow-free at the required widths", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [375, 414, 768, 900, 1024, 1280, 1440, 1720, 1980]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1000 });
    await page.goto(studios[1].route);
    const { stage } = await studioFor(page);
    await stage.getByRole("button", { name: "Розподіл", exact: true }).click();
    await expect(stage.locator("[data-service-studio-outgoing-snapshot]")).toBeHidden();
    expect(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))).toBe(0);
    expect(await stage.locator("*").evaluateAll((elements) => elements.filter((element) => {
      const style = getComputedStyle(element);
      return [style.animationDuration, style.transitionDuration].some((value) => value.split(",").some((duration) => Number.parseFloat(duration) > 0));
    }).length)).toBe(0);
  }

  await page.goto(studios[2].route);
  const { stage } = await studioFor(page);
  for (const label of studios[2].controls) {
    await stage.getByRole("button", { name: label, exact: true }).click();
    expect((await new AxeBuilder({ page }).include("[data-service-studio-stage]").analyze()).violations).toEqual([]);
  }
});

test("lighting and low-voltage expose every owned relation through the shared cinematic studio", async ({ page }) => {
  for (const studio of multiRelationStudios) {
    await page.goto(studio.route);
    const { root, stage } = await studioFor(page);
    for (const relation of studio.relations) {
      await stage.getByRole("button", { name: relation.label, exact: true }).click();
      await expect(root).toHaveAttribute("data-service-studio-relation", relation.id);
      for (const [index, control] of studio.controls.entries()) {
        await stage.getByRole("button", { name: control, exact: true }).click();
        await expect(root).toHaveAttribute("data-service-studio-state", ["assembled", "focus", "reassembled"][index]);
        await expect(stage.locator("[data-service-studio-scene]:visible img")).toHaveAttribute("src", relation.image);
        await expect(stage.locator("[data-service-studio-panel]:visible .service-studio__relation-label")).toContainText(relation.label);
        await expect(stage.locator("[data-service-studio-live]")).toContainText(relation.label);
        const relatedLinks = stage.locator("[data-service-studio-panel]:visible [data-service-studio-related] a");
        const expectedRelated = index === 2 ? relation.related : studio.related[index];
        expect(await relatedLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(expectedRelated);
        expect((await new AxeBuilder({ page }).include("[data-service-studio-stage]").analyze()).violations).toEqual([]);
      }
    }
  }
});

test("relation controls retain a 44px pointer target", async ({ page }) => {
  for (const studio of multiRelationStudios) {
    await page.goto(studio.route);
    const { stage } = await studioFor(page);
    for (const relation of studio.relations) {
      const box = await stage.getByRole("button", { name: relation.label, exact: true }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test("multi-relation studios retain semantic fallback and keyboard or touch parity", async ({ page, browser }) => {
  await page.route("**/assets/js/service-studio.js", (route) => route.abort());
  for (const studio of multiRelationStudios) {
    await page.goto(studio.route);
    const root = page.locator("[data-service-studio-root]");
    const fallback = root.locator("[data-service-studio-fallback]");
    await expect(fallback).toBeVisible();
    await expect(root.locator("[data-service-studio-stage]")).toBeHidden();
    for (const relation of studio.relations) {
      await expect(fallback.getByRole("heading", { name: relation.label, exact: true })).toBeVisible();
      await expect(fallback.locator(`a[href="${relation.related[1]}"]`)).not.toHaveCount(0);
    }
  }
  await page.unroute("**/assets/js/service-studio.js");

  const lighting = multiRelationStudios[0];
  await page.goto(lighting.route);
  const { root, stage } = await studioFor(page);
  const keyboardRelation = stage.getByRole("button", { name: lighting.relations[1].label, exact: true });
  await keyboardRelation.focus();
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-service-studio-relation", lighting.relations[1].id);
  await expect(stage.locator("[data-service-studio-live]")).toContainText(lighting.relations[1].label);

  const touchContext = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 812 } });
  const touchPage = await touchContext.newPage();
  const lowVoltage = multiRelationStudios[1];
  await touchPage.goto(new URL(lowVoltage.route, page.url()).href);
  const touchRoot = touchPage.locator("[data-service-studio-root]");
  await touchRoot.getByRole("button", { name: lowVoltage.relations[1].label, exact: true }).tap();
  await expect(touchRoot).toHaveAttribute("data-service-studio-relation", lowVoltage.relations[1].id);
  await touchContext.close();
});

test("multi-relation studios cancel rapid scene changes and remain still, accessible, and fluid", async ({ page }) => {
  await page.goto("/services/lighting/");
  const { root, stage } = await studioFor(page);
  await page.addStyleTag({ content: "[data-service-studio-outgoing-snapshot][data-service-studio-snapshot-active] { animation-duration: 10s !important; }" });
  const snapshot = stage.locator("[data-service-studio-outgoing-snapshot]");
  await stage.getByRole("button", { name: "Зовнішнє освітлення", exact: true }).click();
  await expect(snapshot).toBeVisible();
  await stage.getByRole("button", { name: "Освітлення сходів", exact: true }).click();
  await expect(root).toHaveAttribute("data-service-studio-relation", "lighting--stair-lighting");
  await snapshot.dispatchEvent("animationcancel");
  await expect(snapshot).toBeHidden();
  await expect(root).not.toHaveAttribute("data-service-studio-transition");

  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [375, 414, 768, 900, 1024, 1280, 1440, 1720, 1980]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1000 });
    await page.goto("/services/low-voltage/");
    const current = await studioFor(page);
    await current.stage.getByRole("button", { name: "Аудіо", exact: true }).click();
    await expect(current.stage.locator("[data-service-studio-outgoing-snapshot]")).toBeHidden();
    expect(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))).toBe(0);
    expect(await current.stage.locator("*").evaluateAll((elements) => elements.filter((element) => {
      const style = getComputedStyle(element);
      return [style.animationDuration, style.transitionDuration].some((value) => value.split(",").some((duration) => Number.parseFloat(duration) > 0));
    }).length)).toBe(0);
  }
  expect((await new AxeBuilder({ page }).include("[data-service-studio-stage]").analyze()).violations).toEqual([]);
});

test("invalid studio JSON, DOM, or non-owner relation keeps the complete fallback", async ({ page }) => {
  const brokenDocuments = [
    (body) => body.replace(/(<script type="application\/json" data-service-studio-config>)[\s\S]*?(<\/script>)/, "$1{$2"),
    (body) => body.replace('data-service-studio-scene="focus" data-service-studio-relation-id="lighting--stair-lighting"', 'data-service-studio-scene="assembled" data-service-studio-relation-id="lighting--stair-lighting"'),
    (body) => {
      const graphIndex = body.indexOf('<script type="application/json" data-service-studio-graph>');
      return `${body.slice(0, graphIndex).replaceAll("lighting--outdoor-lighting", "low-voltage--cctv")}${body.slice(graphIndex)}`;
    }
  ];

  for (const breakDocument of brokenDocuments) {
    await page.route("**/services/lighting/", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: breakDocument(await response.text()), contentType: "text/html" });
    });
    await page.goto("/services/lighting/");
    const root = page.locator("[data-service-studio-root]");
    await expect(root.locator("[data-service-studio-fallback]")).toBeVisible();
    await expect(root.locator("[data-service-studio-stage]")).toBeHidden();
    await expect(root).not.toHaveAttribute("data-service-studio-enhanced");
    await page.unroute("**/services/lighting/");
  }
});

test("an unknown rail action keeps the semantic fallback instead of enabling inert controls", async ({ page }) => {
  await page.route("**/services/lighting/", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      'data-service-studio-action="select-focus" data-service-studio-control-state="focus"',
      'data-service-studio-action="select-invented" data-service-studio-control-state="focus"'
    );
    await route.fulfill({ response, body, contentType: "text/html" });
  });

  await page.goto("/services/lighting/");
  const root = page.locator("[data-service-studio-root]");
  await expect(root.locator("[data-service-studio-fallback]")).toBeVisible();
  await expect(root.locator("[data-service-studio-stage]")).toBeHidden();
  await expect(root).not.toHaveAttribute("data-service-studio-enhanced");
});

test("an action-only button keeps the semantic fallback instead of exposing an inert action", async ({ page }) => {
  await page.route("**/services/lighting/", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      '<p class="service-studio__live"',
      '<button type="button" data-service-studio-action="select-invented">Неактивна дія</button><p class="service-studio__live"'
    );
    await route.fulfill({ response, body, contentType: "text/html" });
  });

  await page.goto("/services/lighting/");
  const root = page.locator("[data-service-studio-root]");
  await expect(root.locator("[data-service-studio-fallback]")).toBeVisible();
  await expect(root.locator("[data-service-studio-stage]")).toBeHidden();
  await expect(root).not.toHaveAttribute("data-service-studio-enhanced");
});
