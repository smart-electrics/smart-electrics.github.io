import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const services = [
  {
    route: "/services/electrical-design/",
    title: "Проєктування електрики"
  },
  {
    route: "/services/electrical-installation/",
    title: "Електромонтаж"
  },
  {
    route: "/services/panels-and-protection/",
    title: "Щити та захист"
  },
  {
    route: "/services/lighting/",
    title: "Освітлення"
  },
  {
    route: "/services/low-voltage/",
    title: "Слабкострумові системи"
  },
  {
    route: "/services/backup-power/",
    title: "Резервне живлення"
  },
  {
    route: "/services/smart-home-integration/",
    title: "Інтеграція розумного будинку"
  },
  {
    route: "/services/diagnostics-and-service/",
    title: "Діагностика та сервіс"
  }
];

const serviceRoutes = ["/services/", ...services.map(({ route }) => route)];
const serviceRouteSet = new Set(serviceRoutes.slice(1));
const placeholderCopy = /placeholder|lorem ipsum|page-note|контент готується|сторінка готується|текст готується|coming soon/i;
const unsupportedMarketingCopy = [
  /24\s*\/\s*7/i,
  /\bгаранті\w*\b/i,
  /\bсертифікат\w*\b/i,
  /\b(?:виконан\w*|реалізован\w*)\s+(?:об['’ʼ`]?єкт\w*|про[єе]кт\w*)/i,
  /(?:\d[\d\s.,]*)\s*(?:грн|₴|uah|usd|долар\w*|євро\w*)\b/i,
  /\b(?:ціна|ціни|вартіст\w*|коштує|кошторис\w*)\b/i,
  /\bsmart[\s_-]*home\b/i,
  /\bдомашн\w*\s+автоматизац\w*\b/i,
  /\bмагі\w*\b/i,
  /\bрежим\w*\b/i,
  /\bпакет\w*\b/i,
  /\bлід\w*\b/i,
  /\bзаявк\w*\b/i,
  /\bзамовник\w*\b/i,
  /\bпокупець\w*\b/i
];

function assertNoPlaceholderCopy(text, route) {
  expect(text, `${route} should not expose placeholder copy`).not.toMatch(placeholderCopy);
}

function assertNoUnsupportedMarketingCopy(text, route) {
  for (const phrase of unsupportedMarketingCopy) {
    expect(text, `${route} should not expose unsupported marketing or domain copy`).not.toMatch(phrase);
  }
}

async function assertNoHorizontalOverflow(page, route) {
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  );
  expect(overflow, `${route} should not scroll horizontally`).toBe(0);
}

test("services index retains eight ordered destination links in its progressive document baseline", async ({ page }) => {
  await page.route("**/assets/js/cinematic-stage.js", (route) => route.abort());
  const response = await page.goto("/services/");
  expect(response?.status()).toBe(200);

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Послуги");

  const links = main.locator("[data-cinematic-fallback] [data-cinematic-direction-link]");
  await expect(links).toHaveCount(8);

  for (const [index, service] of services.entries()) {
    const link = links.nth(index);
    await expect(link).toHaveAttribute("href", service.route);
    await expect(link).toBeVisible();
    await expect(link).not.toHaveText("");
  }

  const visibleCopy = await main.innerText();
  assertNoPlaceholderCopy(visibleCopy, "/services/");
  assertNoUnsupportedMarketingCopy(visibleCopy, "/services/");
});

test("every service detail exposes the complete content contract", async ({ page }) => {
  for (const service of services) {
    const response = await page.goto(service.route);
    expect(response?.status(), `${service.route} should return 200`).toBe(200);

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(service.title);

    const heroCopy = main.getByRole("heading", { level: 1 }).locator("..");
    await expect(heroCopy.getByRole("paragraph").last()).not.toHaveText("");

    for (const heading of ["Роль у системі", "Коли залучати"]) {
      const section = main.getByRole("region", { name: heading });
      await expect(section).toBeVisible();
      await expect(section.getByRole("paragraph").last()).not.toHaveText("");
    }

    for (const [heading, minimum, maximum] of [
      ["Що охоплює", 3, 5],
      ["Що варто уточнити щодо об’єкта", 2, 4]
    ]) {
      const section = main.getByRole("region", { name: heading });
      await expect(section).toBeVisible();
      const items = section.getByRole("listitem");
      const count = await items.count();
      expect(count, `${service.route} should have ${heading} items`).toBeGreaterThanOrEqual(minimum);
      expect(count, `${service.route} should have ${heading} items`).toBeLessThanOrEqual(maximum);
      for (const item of await items.all()) {
        await expect(item).not.toHaveText("");
      }
    }

    const related = main.getByRole("region", { name: "Пов’язані напрями" });
    await expect(related).toBeVisible();
    const relatedLinks = related.getByRole("link");
    const relatedCount = await relatedLinks.count();
    expect(relatedCount, `${service.route} should expose related services`).toBeGreaterThanOrEqual(2);
    expect(relatedCount, `${service.route} should expose related services`).toBeLessThanOrEqual(5);

    for (const link of await relatedLinks.all()) {
      const href = await link.getAttribute("href");
      expect(href, `${service.route} related links need a route`).toBeTruthy();
      expect(serviceRouteSet.has(href), `${service.route} related link should target a service`).toBeTruthy();
      expect(href, `${service.route} should not link to itself`).not.toBe(service.route);
      await expect(link).not.toHaveAccessibleName("");
    }

    await expect(main.getByRole("link", { name: /До всіх послуг/ })).toHaveAttribute("href", "/services/");
    await expect(main.getByText("Звернення через сайт поки не приймаються.", { exact: true })).toHaveCount(1);
    const visibleCopy = await main.innerText();
    assertNoPlaceholderCopy(visibleCopy, service.route);
    assertNoUnsupportedMarketingCopy(visibleCopy, service.route);
  }
});

test("services navigation marks the section active in the visible desktop or mobile variant", async ({ page }) => {
  await page.goto(services[0].route);

  const desktopNavigation = page.getByRole("navigation", { name: "Основна навігація" });
  if (await desktopNavigation.isVisible()) {
    await expect(desktopNavigation.getByRole("link", { name: "Послуги", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
  }

  const mobileSummary = page.locator('summary[aria-label="Відкрити меню"]');
  if (await mobileSummary.isVisible()) {
    await mobileSummary.click();
    await expect(
      page
        .getByRole("navigation", { name: "Мобільна навігація" })
        .getByRole("link", { name: "Послуги", exact: true })
    ).toHaveAttribute("aria-current", "page");
  } else {
    await expect(desktopNavigation).toBeVisible();
  }
});

test("service routes have no horizontal overflow", async ({ page }) => {
  for (const route of serviceRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} should return 200`).toBe(200);
    await assertNoHorizontalOverflow(page, route);
  }
});

test("keyboard users can reach every service link with visible focus", async ({ page }) => {
  for (const route of serviceRoutes) {
    await page.goto(route);
    const expectedLinks = new Set(
      await page.getByRole("main").getByRole("link").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")).filter(Boolean)
      )
    );
    const seenLinks = new Set();

    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();

    for (let step = 0; step < 80 && seenLinks.size < expectedLinks.size; step += 1) {
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

    expect(seenLinks, `${route} keyboard traversal should reach every service link`).toEqual(expectedLinks);
  }
});

test("service index and every detail pass axe", async ({ page }) => {
  for (const route of serviceRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} should return 200 before axe`).toBe(200);
    await expect(page.getByRole("main")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${route} should pass axe`).toEqual([]);
  }
});

test("service surfaces keep prelaunch copy plain and remove disabled contact actions", async ({ page }) => {
  for (const route of ["/services/", services[0].route]) {
    await page.goto(route);
    await expect(page.locator("button[disabled], [aria-disabled=\"true\"]")).toHaveCount(0);
    await expect(page.getByText("Звернення через сайт поки не приймаються.", { exact: true })).toHaveCount(1);
  }
});
