import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const solutions = [
  {
    slug: "apartment-comfort-and-control",
    route: "/solutions/apartment-comfort-and-control/",
    title: "Квартира: комфорт і контроль"
  },
  {
    slug: "private-house-full-automation",
    route: "/solutions/private-house-full-automation/",
    title: "Приватний будинок: повна автоматизація"
  },
  {
    slug: "architectural-lighting",
    route: "/solutions/architectural-lighting/",
    title: "Архітектурне освітлення"
  },
  {
    slug: "energy-autonomy",
    route: "/solutions/energy-autonomy/",
    title: "Енергетична автономність"
  },
  {
    slug: "security-and-access-control",
    route: "/solutions/security-and-access-control/",
    title: "Безпека та контроль доступу"
  },
  {
    slug: "commercial-space",
    route: "/solutions/commercial-space/",
    title: "Комерційний простір"
  }
];

const solutionRoutes = ["/solutions/", ...solutions.map(({ route }) => route)];
const solutionRouteSet = new Set(solutions.map(({ route }) => route));
const serviceRoutes = new Set([
  "/services/electrical-design/",
  "/services/electrical-installation/",
  "/services/panels-and-protection/",
  "/services/lighting/",
  "/services/low-voltage/",
  "/services/backup-power/",
  "/services/smart-home-integration/",
  "/services/diagnostics-and-service/"
]);

const placeholderCopy = /placeholder|lorem ipsum|page-note|контент готується|сторінка готується|текст готується|coming soon/i;
const forbiddenCopy = [
  /(?:відгук\w*|рейтинг\w*|зірк\w*|оцінк\w*)/i,
  /\b\d+(?:[.,]\d+)?\s*\/\s*5\b/i,
  /24\s*\/\s*7/i,
  /\b(?:гаранті\w*|сертифікат\w*|vendor|протокол\w*|сумісн\w*|телефон\w*|email|e-mail|formspree|ga4)\b/i,
  /\b(?:ціна|ціни|вартіст\w*|коштує|кошторис\w*|строк\w*|бюджет\w*|площ\w*|адрес\w*)\b/i,
  /\b(?:клієнт\w*|замовник\w*|покупець\w*|лід\w*|заявк\w*)\b/i,
  /\b(?:виконан\w*|реалізован\w*)\s+(?:об['’ʼ`]?єкт\w*|про[єе]кт\w*|кейс\w*)/i,
  /\bsmart[\s_-]*home\b/i,
  /\bдомашн\w*\s+автоматизац\w*\b/i,
  /\b(?:магі\w*|режим\w*|пакет\w*)\b/i
];

function assertTruthfulCopy(text, route) {
  expect(text, `${route} should not expose placeholder copy`).not.toMatch(placeholderCopy);
  for (const phrase of forbiddenCopy) {
    expect(text, `${route} should not expose unsupported marketing or fake-case copy`).not.toMatch(phrase);
  }
}

async function assertAtlasCardGeometry(page, route) {
  if (route !== "/solutions/") return;

  const violations = await page.locator(".solutions-atlas__list > li > a.solution-scene").evaluateAll((cards) =>
    cards.flatMap((card, index) => {
      const media = card.querySelector(".solution-scene__media");
      const copy = card.querySelector(".solution-scene__copy");
      const title = card.querySelector(".solution-scene__title");
      if (!media || !copy || !title) {
        return [{ index, issue: "missing-card-geometry-node" }];
      }

      const cardBounds = card.getBoundingClientRect();
      const mediaBounds = media.getBoundingClientRect();
      const copyBounds = copy.getBoundingClientRect();
      const titleBounds = title.getBoundingClientRect();
      const titleStyle = getComputedStyle(title);
      const sharesRow = mediaBounds.top < copyBounds.bottom - 1 && copyBounds.top < mediaBounds.bottom - 1;
      const cardBoundaryViolations = [
        ["copy-left-outside-card", copyBounds.left < cardBounds.left - 1],
        ["copy-right-outside-card", copyBounds.right > cardBounds.right + 1],
        ["copy-top-outside-card", copyBounds.top < cardBounds.top - 1],
        ["copy-bottom-outside-card", copyBounds.bottom > cardBounds.bottom + 1],
        ["title-left-outside-card", titleBounds.left < cardBounds.left - 1],
        ["title-right-outside-card", titleBounds.right > cardBounds.right + 1],
        ["title-top-outside-card", titleBounds.top < cardBounds.top - 1],
        ["title-bottom-outside-card", titleBounds.bottom > cardBounds.bottom + 1],
        [
          "title-horizontal-scroll-clipped",
          titleStyle.overflowX !== "visible" && title.scrollWidth > title.clientWidth + 1
        ],
        [
          "title-vertical-scroll-clipped",
          titleStyle.overflowY !== "visible" && title.scrollHeight > title.clientHeight + 1
        ]
      ]
        .filter(([, violated]) => violated)
        .map(([issue]) => ({
          index,
          issue,
          cardLeft: cardBounds.left,
          cardRight: cardBounds.right,
          titleLeft: titleBounds.left,
          titleRight: titleBounds.right
        }));

      if (sharesRow && mediaBounds.right > copyBounds.left + 1) {
        cardBoundaryViolations.push({
          index,
          issue: "media-overlaps-copy",
          mediaRight: mediaBounds.right,
          copyLeft: copyBounds.left
        });
      }
      return cardBoundaryViolations;
    })
  );

  expect(violations, `${route} cards should keep media, copy, and title within their card geometry`).toEqual([]);
}

async function assertNoHorizontalOverflow(page, route) {
  const measurements = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    clipped: [...document.querySelectorAll("a, button, summary, [role='button']")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.getAttribute("aria-label") || element.textContent.trim(),
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height
        };
      })
      .filter(({ left, right }) => left < -1 || right > window.innerWidth + 1)
  }));
  expect(measurements.overflow, `${route} should not scroll horizontally`).toBe(0);
  expect(measurements.clipped, `${route} should keep interactive controls inside the viewport`).toEqual([]);
  await assertAtlasCardGeometry(page, route);
}

async function assertMobileTargets(page, route) {
  if ((page.viewportSize()?.width ?? 0) > 414) return;

  const undersized = await page.locator("a, button, summary, [role='button']").evaluateAll((elements) =>
    elements
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
      .filter(({ width, height }) => width < 44 || height < 44)
  );
  expect(undersized, `${route} should expose 44px mobile interactive targets`).toEqual([]);
}

async function assertLocalImages(page, route) {
  const images = page.locator("main img");
  expect(await images.count(), `${route} should expose local solution imagery`).toBeGreaterThan(0);
  const expectedLoading = route === "/solutions/" ? "lazy" : "eager";
  const expectedSelectedIntrinsic = (page.viewportSize()?.width ?? 0) <= 767
    ? { width: 768, height: 512 }
    : { width: 1536, height: 1024 };

  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(
      async () => image.evaluate((element) => element.complete && element.naturalWidth > 0),
      { message: `${route} image should load successfully` }
    ).toBe(true);
    await expect(image).toHaveAttribute("alt", /\S{8,}/);
    await expect(image).toHaveAttribute("loading", expectedLoading);
    await expect(image).toHaveAttribute("decoding", "async");
    const alt = await image.getAttribute("alt");
    expect(alt, `${route} image alt should not be generic`).not.toMatch(/^(?:image|photo|зображення|фото)$/i);

    const intrinsic = await image.evaluate((element) => ({
      width: element.naturalWidth,
      height: element.naturalHeight,
      currentSrc: element.currentSrc,
      declaredWidth: element.getAttribute("width"),
      declaredHeight: element.getAttribute("height")
    }));
    expect(
      { width: intrinsic.width, height: intrinsic.height },
      `${route} selected image should use the final responsive asset dimensions`
    ).toEqual(expectedSelectedIntrinsic);
    expect(intrinsic.declaredWidth, `${route} image should declare 1536px fallback width`).toBe("1536");
    expect(intrinsic.declaredHeight, `${route} image should declare 1024px fallback height`).toBe("1024");

    const fallbackIntrinsic = await page.evaluate((src) => new Promise((resolve, reject) => {
      const fallback = new Image();
      fallback.onload = () => resolve({ width: fallback.naturalWidth, height: fallback.naturalHeight });
      fallback.onerror = () => reject(new Error(`Could not load ${src}`));
      fallback.src = src;
    }), intrinsic.currentSrc.replace(/(?:-768)(\.webp)$/, "-1536$1"));
    expect(fallbackIntrinsic, `${route} 1536px source should be a 1536x1024 asset`).toEqual({
      width: 1536,
      height: 1024
    });

    const picture = image.locator("xpath=ancestor::picture");
    await expect(picture).toHaveCount(1);
    const sources = picture.locator("source[srcset]");
    await expect(sources).toHaveCount(2);
    for (const [index, dimensions] of [[768, 512], [1536, 1024]].entries()) {
      const source = sources.nth(index);
      await expect(source).toHaveAttribute("width", String(dimensions[0]));
      await expect(source).toHaveAttribute("height", String(dimensions[1]));
      const srcset = await source.getAttribute("srcset");
      expect(srcset, `${route} source ${index + 1} should declare a local asset`).toMatch(
        /^\/assets\/images\/solutions\/[\w-]+\.webp$/
      );
      const sourceIntrinsic = await page.evaluate((src) => new Promise((resolve, reject) => {
        const sourceImage = new Image();
        sourceImage.onload = () => resolve({ width: sourceImage.naturalWidth, height: sourceImage.naturalHeight });
        sourceImage.onerror = () => reject(new Error(`Could not load ${src}`));
        sourceImage.src = src;
      }), srcset);
      expect(sourceIntrinsic, `${route} source ${index + 1} should match its declared dimensions`).toEqual({
        width: dimensions[0],
        height: dimensions[1]
      });
    }
  }
}

async function assertActiveSolutionsNavigation(page, route) {
  const desktopLink = page.locator('.desktop-nav a[href="/solutions/"]', { hasText: "Готові рішення" });
  await expect(desktopLink).toHaveAttribute("aria-current", "page");

  const mobileMenu = page.locator(".mobile-nav");
  const mobileNavigation = mobileMenu.locator('nav[aria-label="Мобільна навігація"]');
  const mobileLink = mobileNavigation.locator('a[href="/solutions/"]', { hasText: "Готові рішення" });
  await expect(mobileLink).toHaveAttribute("aria-current", "page");
  if (await mobileMenu.locator("summary").isVisible()) {
    await mobileMenu.locator("summary").click();
    await expect(mobileLink).toBeVisible();
    await expect(mobileMenu).toHaveAttribute("open", "");
  }
  expect(route).toMatch(/^\/solutions(?:\/[^/]+)?\/$/);
}

test("solutions atlas exposes exactly six ordered semantic destinations", async ({ page }) => {
  const response = await page.goto("/solutions/");
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);

  const main = page.getByRole("main");
  const cards = main.locator(".solutions-atlas__list > li");
  await expect(cards).toHaveCount(6);
  await expect(main.locator(".solutions-atlas__list > li > a")).toHaveCount(6);

  for (const [index, solution] of solutions.entries()) {
    const card = cards.nth(index);
    const link = card.locator(":scope > a");
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("href", solution.route);
    await expect(link).toHaveAccessibleName(`${solution.title}, переглянути готове рішення`);
    await expect(card.getByText(solution.title, { exact: true })).toBeVisible();
    await expect(card.getByText(/Переглянути конфігурацію/)).toBeVisible();
  }

  const compassLinks = main.locator(".solutions-compass__list > li > a");
  await expect(compassLinks).toHaveCount(6);
  for (const [index, solution] of solutions.entries()) {
    await expect(compassLinks.nth(index)).toHaveAttribute("href", `#solution-${solution.slug}`);
  }
  assertTruthfulCopy(await main.innerText(), "/solutions/");
  await assertActiveSolutionsNavigation(page, "/solutions/");
});

test("every solution detail exposes the complete content and relationship contract", async ({ page }) => {
  for (const solution of solutions) {
    const response = await page.goto(solution.route);
    expect(response?.status(), `${solution.route} should return 200`).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(solution.title);

    const systems = main.getByRole("region", { name: "Що поєднується в системі" });
    const systemItems = systems.getByRole("listitem");
    expect(await systemItems.count(), `${solution.route} systems cardinality`).toBeGreaterThanOrEqual(3);
    expect(await systemItems.count(), `${solution.route} systems cardinality`).toBeLessThanOrEqual(5);

    const inputs = main.getByRole("region", { name: "Що уточнити щодо об’єкта" });
    const inputItems = inputs.getByRole("listitem");
    expect(await inputItems.count(), `${solution.route} inputs cardinality`).toBeGreaterThanOrEqual(3);
    expect(await inputItems.count(), `${solution.route} inputs cardinality`).toBeLessThanOrEqual(5);

    const scenarios = main.getByRole("region", { name: "Приклади сценаріїв" }).getByRole("listitem");
    expect(await scenarios.count(), `${solution.route} scenarios cardinality`).toBeGreaterThanOrEqual(2);
    expect(await scenarios.count(), `${solution.route} scenarios cardinality`).toBeLessThanOrEqual(4);
    for (const scenario of await scenarios.all()) {
      await expect(scenario.getByRole("heading", { level: 3 })).not.toHaveText("");
      for (const label of ["Подія", "Реакція системи", "Користь"]) {
        const value = scenario.locator("dt", { hasText: label }).locator("+ dd");
        await expect(value).not.toHaveText("");
      }
    }

    const relatedServices = main.getByRole("region", { name: "Пов’язані послуги" }).getByRole("link");
    expect(await relatedServices.count(), `${solution.route} related services cardinality`).toBeGreaterThanOrEqual(3);
    expect(await relatedServices.count(), `${solution.route} related services cardinality`).toBeLessThanOrEqual(6);
    for (const link of await relatedServices.all()) {
      const href = await link.getAttribute("href");
      expect(serviceRoutes.has(href), `${solution.route} related service should be canonical`).toBeTruthy();
      await expect(link).not.toHaveAccessibleName("");
    }

    const relatedSolutions = main.getByRole("region", { name: "Пов’язані готові рішення" }).getByRole("link");
    expect(await relatedSolutions.count(), `${solution.route} related solutions cardinality`).toBeGreaterThanOrEqual(2);
    expect(await relatedSolutions.count(), `${solution.route} related solutions cardinality`).toBeLessThanOrEqual(3);
    const relatedHrefs = [];
    for (const link of await relatedSolutions.all()) {
      const href = await link.getAttribute("href");
      relatedHrefs.push(href);
      expect(solutionRouteSet.has(href), `${solution.route} related solution should be canonical`).toBeTruthy();
      expect(href, `${solution.route} should not self-link`).not.toBe(solution.route);
      await expect(link).not.toHaveAccessibleName("");
    }
    expect(new Set(relatedHrefs).size).toBe(relatedHrefs.length);

    await expect(main.getByRole("link", { name: /До всіх готових рішень/ })).toHaveAttribute("href", "/solutions/");
    const contact = main.getByRole("button", { name: "Обговорити об’єкт", exact: true });
    await expect(contact).toBeDisabled();
    await expect(main.getByText(/готується/i)).toBeVisible();
    assertTruthfulCopy(await main.innerText(), solution.route);
    await assertActiveSolutionsNavigation(page, solution.route);
  }
});

test("solution imagery uses loaded local responsive pictures with meaningful alternatives", async ({ page }) => {
  for (const route of solutionRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} should return 200 before image checks`).toBe(200);
    await assertLocalImages(page, route);
  }
});

test("solution image failure keeps the detail copy and fallback readable", async ({ page }) => {
  await page.route("**/assets/images/solutions/**", (route) => route.abort());
  const response = await page.goto(solutions[1].route);
  expect(response?.status()).toBe(200);

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(solutions[1].title);
  await expect(main.locator(".solution-detail__hero-copy")).toBeVisible();
  await expect(main.locator(".solution-detail__hero-index")).toHaveText(/\d{2}/);
  await expect(main.locator(".solution-detail__hero-copy p").last()).not.toHaveText("");
});

test("solutions remain static and usable without canvas or JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4000",
    javaScriptEnabled: false,
    colorScheme: "dark",
    locale: "uk-UA"
  });
  const page = await context.newPage();
  try {
    for (const [index, route] of ["/solutions/", solutions[0].route].entries()) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} should return 200 without JavaScript`).toBe(200);
      await expect(page.locator("canvas")).toHaveCount(0);
      if (index === 0) {
        await expect(page.locator(".solutions-atlas__list > li")).toHaveCount(6);
      } else {
        await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(solutions[0].title);
      }
    }
  } finally {
    await context.close();
  }
});

test("all solution routes pass axe accessibility checks", async ({ page }) => {
  for (const route of solutionRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} should return 200 before axe`).toBe(200);
    await expect(page.getByRole("main")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${route} should pass axe`).toEqual([]);
  }
});

test("solution routes remain horizontal-overflow free and controls stay in bounds", async ({ page }) => {
  for (const route of solutionRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} should return 200`).toBe(200);
    await assertNoHorizontalOverflow(page, route);
    await assertMobileTargets(page, route);
  }

  for (const width of [414, 900, 1280, 1720]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/solutions/", solutions[1].route]) {
      await page.goto(route);
      await assertNoHorizontalOverflow(page, `${route} at ${width}px`);
      await assertMobileTargets(page, `${route} at ${width}px`);
    }
  }
});

test("keyboard users can reach every solution link with visible focus", async ({ page }) => {
  for (const route of ["/solutions/", solutions[1].route]) {
    await page.goto(route);
    const expectedLinks = new Set(
      await page.getByRole("main").getByRole("link").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")).filter(Boolean)
      )
    );
    const seenLinks = new Set();

    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    for (let step = 0; step < 120 && seenLinks.size < expectedLinks.size; step += 1) {
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        return {
          href: element?.tagName === "A" ? element.getAttribute("href") : null,
          focusVisible: Boolean(element?.matches(":focus-visible"))
        };
      });
      if (focused.href && expectedLinks.has(focused.href)) {
        seenLinks.add(focused.href);
        expect(focused.focusVisible, `${route} ${focused.href} should show keyboard focus`).toBeTruthy();
      }
      await page.keyboard.press("Tab");
    }
    expect(seenLinks, `${route} keyboard traversal should reach every solution link`).toEqual(expectedLinks);
  }
});

test("reduced-motion solution surfaces have no running animations or transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/solutions/", solutions[1].route]) {
    await page.goto(route);
    if (route === "/solutions/") {
      const firstCard = page.locator(".solution-scene").first();
      const firstImage = firstCard.locator(".solution-scene__media img");
      await firstCard.hover();
      await expect.poll(() => firstImage.evaluate((image) => getComputedStyle(image).transform), {
        message: "reduced-motion hover should not scale atlas imagery"
      }).toBe("none");

      await page.mouse.move(0, 0);
      await page.keyboard.press("Tab");
      await firstCard.focus();
      await expect(firstCard).toBeFocused();
      await expect.poll(() => firstImage.evaluate((image) => getComputedStyle(image).transform), {
        message: "reduced-motion focus should not scale atlas imagery"
      }).toBe("none");
    }
    const animatedElements = await page.locator("*").evaluateAll((elements) => {
      let runningCount = 0;
      for (const element of elements) {
        const style = getComputedStyle(element);
        const animationRuns = style.animationName !== "none" && style.animationDuration !== "0s";
        const transitionRuns = style.transitionDuration
          .split(",")
          .some((duration) => Number.parseFloat(duration) > 0);
        if (animationRuns || transitionRuns) runningCount += 1;
      }
      return runningCount;
    });
    expect(animatedElements, `${route} should disable motion for reduced-motion users`).toBe(0);
  }
});
