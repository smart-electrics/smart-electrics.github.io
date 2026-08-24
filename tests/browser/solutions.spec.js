import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const STATES = ["assembled", "focus", "reassembled"];
const ACTION_BY_STATE = {
  assembled: "select-assembled",
  focus: "select-focus",
  reassembled: "select-reassembled"
};
const PANEL_LABEL_BY_STATE = {
  assembled: "Склад конфігурації",
  focus: "У фокусі",
  reassembled: "Як системи пов’язані"
};
const solutions = [
  {
    slug: "apartment-comfort-and-control",
    route: "/solutions/apartment-comfort-and-control/",
    title: "Квартира: комфорт і контроль",
    description: "Поєднує освітлення, клімат, доступ і вибрані споживачі в узгоджену конфігурацію електричної системи квартири.",
    directions: ["electrical-design", "lighting", "smart-home-integration", "panels-and-protection", "low-voltage"],
    relation: "smart-home-integration--climate",
    relationLabel: "Клімат",
    relationDescription: "Комфорт у зонах пов’язують із керуванням, живленням і ручним коригуванням.",
    relationLinks: ["smart-home-integration", "panels-and-protection", "low-voltage"],
    relatedSolutions: ["private-house-full-automation", "architectural-lighting", "security-and-access-control"],
    image: "apartment-comfort"
  },
  {
    slug: "private-house-full-automation",
    route: "/solutions/private-house-full-automation/",
    title: "Приватний будинок: повна автоматизація",
    description: "Узгоджує живлення, захист, освітлення, доступ і сценарії автоматизації в одній конфігурації приватного будинку.",
    directions: ["electrical-design", "panels-and-protection", "backup-power", "lighting", "smart-home-integration", "low-voltage"],
    relation: "backup-power--backup",
    relationLabel: "Резерв",
    relationDescription: "Резервні групи визначають разом із щитом, захистом і пріоритетами об’єкта.",
    relationLinks: ["backup-power", "panels-and-protection", "diagnostics-and-service"],
    relatedSolutions: ["apartment-comfort-and-control", "energy-autonomy", "security-and-access-control"],
    image: "private-house"
  },
  {
    slug: "architectural-lighting",
    route: "/solutions/architectural-lighting/",
    title: "Архітектурне освітлення",
    description: "Планує світлові точки й групи керування так, щоб освітлення відповідало плану приміщень і могло працювати у сценаріях автоматизації.",
    directions: ["lighting", "electrical-design", "electrical-installation", "smart-home-integration"],
    relation: "lighting--stair-lighting",
    relationLabel: "Освітлення сходів",
    relationDescription: "Маршрутне світло для сходів розглядають разом із групами освітлення.",
    relationLinks: ["lighting", "electrical-design", "smart-home-integration"],
    relatedSolutions: ["apartment-comfort-and-control", "private-house-full-automation", "commercial-space"],
    image: "architectural-lighting"
  },
  {
    slug: "energy-autonomy",
    route: "/solutions/energy-autonomy/",
    title: "Енергетична автономність",
    description: "Визначає, які групи мають залишатися доступними без основного живлення, і як врахувати це у структурі електричної системи.",
    directions: ["backup-power", "panels-and-protection", "electrical-design", "diagnostics-and-service", "smart-home-integration"],
    relation: "backup-power--backup",
    relationLabel: "Резерв",
    relationDescription: "Резервні групи визначають разом із щитом, захистом і пріоритетами об’єкта.",
    relationLinks: ["backup-power", "panels-and-protection", "diagnostics-and-service"],
    relatedSolutions: ["private-house-full-automation", "apartment-comfort-and-control", "commercial-space"],
    image: "energy-autonomy"
  },
  {
    slug: "security-and-access-control",
    route: "/solutions/security-and-access-control/",
    title: "Безпека та контроль доступу",
    description: "Передбачає підготовку слабкострумової інфраструктури для доступу, мережі та спостереження, а також можливий зв’язок з освітленням і сценаріями автоматизації.",
    directions: ["low-voltage", "electrical-design", "electrical-installation", "lighting", "smart-home-integration"],
    relation: "low-voltage--cctv",
    relationLabel: "Відеоконтроль",
    relationDescription: "Точки відеоконтролю узгоджують із доступом, трасами та потрібними зонами.",
    relationLinks: ["low-voltage", "electrical-installation", "diagnostics-and-service"],
    relatedSolutions: ["private-house-full-automation", "apartment-comfort-and-control", "commercial-space"],
    image: "security-access"
  },
  {
    slug: "commercial-space",
    route: "/solutions/commercial-space/",
    title: "Комерційний простір",
    description: "Узгоджує електричні групи, освітлення, клімат і доступ із призначенням та графіком комерційного простору.",
    directions: ["electrical-design", "panels-and-protection", "lighting", "low-voltage", "smart-home-integration"],
    relation: "smart-home-integration--climate",
    relationLabel: "Клімат",
    relationDescription: "Комфорт у зонах пов’язують із керуванням, живленням і ручним коригуванням.",
    relationLinks: ["smart-home-integration", "panels-and-protection", "low-voltage"],
    relatedSolutions: ["architectural-lighting", "security-and-access-control", "energy-autonomy"],
    image: "commercial-space"
  }
];
const atlasRoute = "/solutions/";
const allRoutes = [atlasRoute, ...solutions.map((solution) => solution.route)];
const serviceHref = (slug) => `/services/${slug}/`;
const noJsBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4000";

async function studioFor(page) {
  const root = page.locator("[data-cinematic-solutions-root]");
  await expect(root).toHaveAttribute("data-cinematic-solutions-enhanced", "true");
  const stage = root.locator("[data-cinematic-solutions-stage]");
  await expect(stage).toBeVisible();
  await expect(root).toHaveAttribute(
    "aria-labelledby",
    (await root.getAttribute("data-cinematic-solutions-mode")) === "atlas"
      ? "cinematic-solutions-stage-title"
      : "cinematic-solution-stage-title"
  );
  return { root, stage };
}

async function hrefs(scope, selector) {
  return scope.locator(`${selector} a`).evaluateAll(
    (links) => links.map((link) => link.getAttribute("href"))
  );
}

async function assertState(page, root, stage, solution, stateId) {
  await stage.locator(`button[data-cinematic-solutions-action="${ACTION_BY_STATE[stateId]}"]`).click();
  await expect(root).toHaveAttribute("data-cinematic-solutions-state", stateId);
  await expect(root).toHaveAttribute("data-cinematic-solutions-solution-id", solution.slug);
  await expect(root).toHaveAttribute("data-cinematic-solutions-relation-id", stateId === "reassembled" ? solution.relation : "");
  await expect(stage.locator("[data-cinematic-solutions-scene]:visible")).toHaveCount(1);
  await expect(stage.locator("[data-cinematic-solutions-panel]:visible")).toHaveCount(1);
  const panel = stage.locator("[data-cinematic-solutions-panel]:visible");
  await expect(panel.locator("[data-cinematic-solutions-summary]")).not.toHaveText("");
  await expect(panel.locator(".cinematic-solutions__panel-kicker")).toHaveText(PANEL_LABEL_BY_STATE[stateId]);
  await expect(stage.locator(`button[data-cinematic-solutions-action="${ACTION_BY_STATE[stateId]}"]`)).toHaveAttribute("aria-pressed", "true");
  if (stateId === "reassembled") {
    await expect(panel.locator("[data-cinematic-solutions-relation-label]")).toHaveText(solution.relationLabel);
    await expect(panel.locator("[data-cinematic-solutions-summary]")).toHaveText(solution.relationDescription);
    await expect(panel.getByRole("heading", { name: "Пов’язані послуги", exact: true })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Пов’язані готові рішення", exact: true })).toBeVisible();
    expect(await hrefs(panel, "[data-cinematic-solutions-service-links]")).toEqual(solution.relationLinks.map(serviceHref));
    expect(await hrefs(panel, "[data-cinematic-solutions-solution-links]")).toEqual(solution.relatedSolutions.map((slug) => `/solutions/${slug}/`));
  } else {
    const expectedLinks = stateId === "assembled"
      ? solution.relatedSolutions.map((slug) => `/solutions/${slug}/`)
      : solution.directions.map(serviceHref);
    expect(await hrefs(panel, "[data-cinematic-solutions-related]")).toEqual(expectedLinks);
  }
  const image = stage.locator("[data-cinematic-solutions-scene]:visible img");
  await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  const currentSrc = await image.evaluate((element) => element.currentSrc);
  const variant = (page.viewportSize()?.width ?? 0) <= 767 ? "768" : "1536";
  expect(currentSrc).toContain(`/assets/images/solutions/${solution.image}-${variant}.webp`);
  expect((await stage.locator("[data-cinematic-solutions-live]").innerText()).trim()).toMatch(/:\s+\S/u);
  expect((await stage.locator("[data-cinematic-solutions-live]").innerText())).not.toContain("..");
  expect((await new AxeBuilder({ page }).include("[data-cinematic-solutions-stage]").analyze()).violations).toEqual([]);
  return stage.locator("[data-cinematic-solutions-scene]:visible").evaluate((scene) => ({
    imageTransform: getComputedStyle(scene.querySelector("img")).transform,
    overlay: getComputedStyle(scene, "::before").backgroundImage,
    overlayOpacity: getComputedStyle(scene, "::before").opacity
  }));
}

test("the atlas uses concrete wording and gives its mobile selector a visible scroll cue", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(atlasRoute);
  const { stage } = await studioFor(page);
  await expect(stage.locator(".cinematic-solutions__heading > div > p:last-child")).toHaveText("Оберіть конфігурацію, щоб побачити її системи та ключовий зв’язок між системами.");
  const selector = stage.locator(".cinematic-solutions__selector");
  expect(await selector.evaluate((element) => ({
    maskImage: getComputedStyle(element).maskImage,
    scrollable: element.scrollWidth > element.clientWidth
  }))).toEqual({
    maskImage: expect.stringContaining("linear-gradient"),
    scrollable: true
  });
});

async function assertNoOverflow(page, route) {
  expect(
    await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)),
    `${route} should not scroll horizontally`
  ).toBe(0);
}

async function prependAdapterMutation(page, source) {
  await page.route("**/assets/js/cinematic-solutions.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${source}\n${await response.text()}` });
  });
}

test("an aborted cinematic-solutions adapter keeps the complete semantic fallback", async ({ page }) => {
  await page.route("**/assets/js/cinematic-solutions.js", (route) => route.abort());

  for (const route of allRoutes) {
    await page.goto(route);
    const root = page.locator("[data-cinematic-solutions-root]");
    const fallback = root.locator("[data-cinematic-solutions-fallback]");
    await expect(fallback).toBeVisible();
    await expect(root.locator("[data-cinematic-solutions-stage]")).toBeHidden();
    if (route === atlasRoute) {
      for (const solution of solutions) {
        await expect(fallback.locator(`#solution-${solution.slug}`).getByRole("link", { name: solution.title, exact: true })).toHaveAttribute("href", solution.route);
      }
    } else {
      const solution = solutions.find((candidate) => candidate.route === route);
      await expect(fallback.getByRole("heading", { name: solution.title, exact: true })).toBeVisible();
      for (const title of ["Для кого та що у фокусі", "Що поєднується в системі", "Приклади сценаріїв", "Що уточнити щодо об’єкта", "Пов’язані послуги", "Пов’язані готові рішення"]) {
        await expect(fallback.getByRole("heading", { name: title, exact: true })).toBeVisible();
      }
      const terms = await fallback.locator("dt").count();
      expect(terms, `${route} keeps scenario terms in the no-JS reading order`).toBeGreaterThan(0);
      await expect(fallback.locator("dd")).toHaveCount(terms);
      await expect(fallback.getByRole("link", { name: "До всіх готових рішень", exact: true })).toHaveAttribute("href", atlasRoute);
    }
  }
});

test("all seven solution routes keep complete semantic content in a browser with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    locale: "uk-UA",
    baseURL: noJsBaseURL
  });
  const page = await context.newPage();

  try {
    for (const route of allRoutes) {
      await page.goto(new URL(route, noJsBaseURL).href);
      const root = page.locator("[data-cinematic-solutions-root]");
      const fallback = root.locator("[data-cinematic-solutions-fallback]");
      await expect(fallback).toBeVisible();
      await expect(root.locator("[data-cinematic-solutions-stage]")).toBeHidden();
      await expect(root).not.toHaveAttribute("data-cinematic-solutions-enhanced");
      if (route === atlasRoute) {
        await expect(fallback.locator(".cinematic-solutions__fallback-item")).toHaveCount(solutions.length);
        for (const solution of solutions) {
          await expect(fallback.locator(`#solution-${solution.slug}`).getByRole("link", { name: solution.title, exact: true })).toHaveAttribute("href", solution.route);
        }
      } else {
        const solution = solutions.find((candidate) => candidate.route === route);
        await expect(fallback.getByRole("heading", { name: solution.title, exact: true })).toBeVisible();
        await expect(fallback.locator("h1 + p")).toHaveText(solution.description);
        for (const title of ["Для кого та що у фокусі", "Що поєднується в системі", "Приклади сценаріїв", "Що уточнити щодо об’єкта", "Пов’язані послуги", "Пов’язані готові рішення"]) {
          await expect(fallback.getByRole("heading", { name: title, exact: true })).toBeVisible();
        }
        const terms = await fallback.locator("dt").count();
        expect(terms, `${route} keeps scenario terms in the no-JS reading order`).toBeGreaterThan(0);
        await expect(fallback.locator("dd")).toHaveCount(terms);
        expect(await hrefs(fallback.getByRole("heading", { name: "Пов’язані послуги", exact: true }).locator(".."), "ul")).toEqual(solution.directions.map(serviceHref));
        expect(await hrefs(fallback.getByRole("heading", { name: "Пов’язані готові рішення", exact: true }).locator(".."), "ul")).toEqual(solution.relatedSolutions.map((slug) => `/solutions/${slug}/`));
        await expect(fallback.getByRole("link", { name: "До всіх готових рішень", exact: true })).toHaveAttribute("href", atlasRoute);
      }
    }
  } finally {
    await context.close();
  }
});

test("all six details render one scene and panel for every canonical state with exact links", async ({ page }) => {
  for (const solution of solutions) {
    const linkSignatures = [
      solution.relatedSolutions.map((slug) => `/solutions/${slug}/`).join("|"),
      solution.directions.map(serviceHref).join("|"),
      solution.relationLinks.map(serviceHref).join("|")
    ];
    expect(new Set(linkSignatures).size, `${solution.slug} has a distinct real link set per state`).toBe(3);
    await page.goto(solution.route);
    const { root, stage } = await studioFor(page);
    await expect(stage.locator("button[data-cinematic-solutions-solution-control]")).toHaveCount(0);
    const sceneSignatures = [];
    for (const stateId of STATES) sceneSignatures.push(await assertState(page, root, stage, solution, stateId));
    expect(new Set(sceneSignatures.map((signature) => JSON.stringify(signature))).size, `${solution.slug} keeps three distinct scene compositions`).toBe(3);
    await expect(root.locator("button[disabled]")).toHaveCount(0);
    expect(await root.innerText()).not.toMatch(/(?:^|\s)0[1-6](?:\s|$)/u);
  }
});

test("the atlas selects every solution and traverses its three data-owned states", async ({ page }) => {
  await page.goto(atlasRoute);
  const { root, stage } = await studioFor(page);
  await expect(stage.locator("button[data-cinematic-solutions-solution-control]")).toHaveCount(6);
  await expect(stage.locator(".solutions-compass, .solution-scene")).toHaveCount(0);

  for (const solution of solutions) {
    await stage.getByRole("button", { name: solution.title, exact: true }).click();
    await expect(root).toHaveAttribute("data-cinematic-solutions-state", "focus");
    await expect(root).toHaveAttribute("data-cinematic-solutions-solution-id", solution.slug);
    await expect(stage.getByRole("button", { name: solution.title, exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const stateId of STATES) await assertState(page, root, stage, solution, stateId);
  }
});

test("keyboard and touch controls reach the same canonical states with 44px targets", async ({ page, browser }) => {
  await page.goto(solutions[0].route);
  const { root, stage } = await studioFor(page);
  const focus = stage.getByRole("button", { name: "У фокусі", exact: true });
  await focus.focus();
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-cinematic-solutions-state", "focus");
  await expect(focus).toBeFocused();
  const undersized = await stage.locator("button").evaluateAll((buttons) => buttons.map((button) => {
    const bounds = button.getBoundingClientRect();
    return { text: button.textContent.trim(), width: bounds.width, height: bounds.height };
  }).filter(({ width, height }) => width < 44 || height < 44));
  expect(undersized).toEqual([]);

  const context = await browser.newContext({ hasTouch: true, viewport: { width: 375, height: 812 } });
  const touchPage = await context.newPage();
  await touchPage.goto(new URL(solutions[1].route, page.url()).href);
  const touchRoot = touchPage.locator("[data-cinematic-solutions-root]");
  await touchRoot.getByRole("button", { name: "Зв’язок", exact: true }).tap();
  await expect(touchRoot).toHaveAttribute("data-cinematic-solutions-state", "reassembled");
  await context.close();
});

test("outgoing snapshots animate, rapid actions settle, and cancellation clears the artifact", async ({ page }) => {
  await page.goto(solutions[2].route);
  const { root, stage } = await studioFor(page);
  await expect.poll(() => stage.locator("[data-cinematic-solutions-scene]:visible img").evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.addStyleTag({ content: "[data-cinematic-solutions-outgoing-snapshot][data-cinematic-solutions-snapshot-active] { animation-duration: 10s !important; }" });
  const snapshot = stage.locator("[data-cinematic-solutions-outgoing-snapshot]");
  await stage.getByRole("button", { name: "У фокусі", exact: true }).click();
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveAttribute("data-cinematic-solutions-snapshot-active", "true");
  await expect(snapshot).toHaveCSS("animation-name", "cinematic-solutions-outgoing");
  await stage.getByRole("button", { name: "Склад", exact: true }).click();
  await stage.getByRole("button", { name: "Зв’язок", exact: true }).click();
  await expect(root).toHaveAttribute("data-cinematic-solutions-state", "reassembled");
  await expect(stage.locator("[data-cinematic-solutions-scene]:visible")).toHaveCount(1);
  await expect(stage.locator("[data-cinematic-solutions-panel]:visible")).toHaveCount(1);
  await snapshot.dispatchEvent("animationcancel");
  await expect(snapshot).toBeHidden();
  await expect(root).not.toHaveAttribute("data-cinematic-solutions-transition");
});

test("reduced motion leaves no active snapshot or nonzero stage motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(solutions[3].route);
  const { stage } = await studioFor(page);
  await stage.getByRole("button", { name: "Зв’язок", exact: true }).click();
  await expect(stage.locator("[data-cinematic-solutions-outgoing-snapshot]")).toBeHidden();
  expect(await stage.locator("*").evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return [style.animationDuration, style.transitionDuration].some((value) => value.split(",").some((duration) => Number.parseFloat(duration) > 0));
  }).length)).toBe(0);
});

test("invalid JSON, action/DOM drift, and valid-but-swapped mapping data fail closed", async ({ page }) => {
  const cases = [
    "document.querySelector('[data-cinematic-solutions-config]').textContent = '{invalid';",
    "document.querySelector('[data-cinematic-solutions-control-state=focus]').dataset.cinematicSolutionsAction = 'select-invented';",
    "document.querySelector('[data-cinematic-solutions-stage]').insertAdjacentHTML('beforeend', '<button type=button>Зайва кнопка</button>');",
    "document.querySelector('[data-cinematic-solutions-relation-label]').remove();",
    "document.querySelector('[data-cinematic-solutions-solution-links] a').setAttribute('href', '/solutions/energy-autonomy/');",
    "{ const testMapping = JSON.parse(document.querySelector('[data-cinematic-solutions-mapping]').textContent); testMapping['energy-autonomy'].relation_id = 'smart-home-integration--climate'; document.querySelector('[data-cinematic-solutions-mapping]').textContent = JSON.stringify(testMapping); document.querySelectorAll('[data-cinematic-solutions-stage] [data-cinematic-solutions-relation-id]').forEach((element) => { element.dataset.cinematicSolutionsRelationId = 'smart-home-integration--climate'; }); }",
    "{ const testMapping = JSON.parse(document.querySelector('[data-cinematic-solutions-mapping]').textContent); testMapping['energy-autonomy'].direction_ids.reverse(); document.querySelector('[data-cinematic-solutions-mapping]').textContent = JSON.stringify(testMapping); document.querySelectorAll('[data-cinematic-solutions-stage] [data-cinematic-solutions-direction-ids]').forEach((element) => { element.dataset.cinematicSolutionsDirectionIds = testMapping['energy-autonomy'].direction_ids.join('|'); }); }"
  ];
  for (const source of cases) {
    await prependAdapterMutation(page, source);
    await page.goto(solutions[3].route);
    const root = page.locator("[data-cinematic-solutions-root]");
    await expect(root.locator("[data-cinematic-solutions-fallback]")).toBeVisible();
    await expect(root.locator("[data-cinematic-solutions-stage]")).toBeHidden();
    await expect(root).not.toHaveAttribute("data-cinematic-solutions-enhanced");
    await page.unroute("**/assets/js/cinematic-solutions.js");
  }
});

test("an image failure leaves the enhanced panel readable", async ({ page }) => {
  await page.route("**/assets/images/solutions/*.webp", (route) => route.abort());
  await page.goto(solutions[4].route);
  const { stage } = await studioFor(page);
  await expect(stage.locator("[data-cinematic-solutions-panel]:visible [data-cinematic-solutions-summary]")).not.toHaveText("");
  await expect(stage.locator("[data-cinematic-solutions-panel]:visible [data-cinematic-solutions-related] a")).not.toHaveCount(0);
});

test("the five required project widths bound the 1536px scene and remain fluid", async ({ page }) => {
  await page.goto(atlasRoute);
  const { stage } = await studioFor(page);
  await assertNoOverflow(page, atlasRoute);
  const scene = stage.locator("[data-cinematic-solutions-scene]:visible");
  const box = await scene.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(1536.5);
  for (const solution of solutions) {
    await page.goto(solution.route);
    await studioFor(page);
    await assertNoOverflow(page, solution.route);
  }
});
