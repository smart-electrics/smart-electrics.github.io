import { expect, test } from "@playwright/test";

const expectedNavigation = [
  "Послуги",
  "Готові рішення",
  "Розумний будинок",
  "Процес",
  "Про нас",
  "Контакти"
];

async function openPublicNavigation(page) {
  const desktopNavigation = page.getByRole("navigation", { name: "Основна навігація" });

  if (await desktopNavigation.isVisible()) {
    return desktopNavigation;
  }

  await page.locator(".mobile-nav summary").click();
  return page.getByRole("navigation", { name: "Мобільна навігація" });
}

test("homepage exposes the six-link public navigation", async ({ page }) => {
  await page.goto("/");

  const navigation = await openPublicNavigation(page);
  const publicLinks = navigation.locator(":scope > a:not(.mobile-nav__cta)");
  const labels = (await publicLinks.allTextContents()).map((label) => label.trim());

  expect(labels).toEqual(expectedNavigation);
  await expect(navigation.getByRole("link", { name: "Проєкти", exact: true })).toHaveCount(0);
});

test("hero explains the full electrical journey and exposes live scene controls", async ({ page }) => {
  await page.goto("/");

  const main = page.getByRole("main");
  const heading = main.getByRole("heading", { level: 1 });
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveText(/Електрика/i);

  const visibleCopy = await main.innerText();
  expect(visibleCopy).toMatch(/чорнового монтажу/i);
  expect(visibleCopy).toMatch(/розумного будинку/i);

  for (const label of ["Освітлення", "Клімат", "Безпека", "Живлення"]) {
    const control = main.getByRole("button", { name: new RegExp(label, "i") });
    await expect(control).toHaveCount(1);
    await expect(control).toBeVisible();
  }

  const liveRegions = main.locator('[aria-live]:visible');
  await expect(liveRegions).not.toHaveCount(0);
  await expect(liveRegions.first()).not.toHaveText("");

  const security = main.getByRole("button", { name: "Безпека", exact: true });
  await security.click();
  await expect(security).toHaveAttribute("aria-pressed", "true");
  await expect(main.getByRole("button", { name: "Освітлення", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(liveRegions.first()).toContainText("датчиків і контролю доступу");
});

test("hero secondary CTA reaches smart home and its visual has meaningful Ukrainian alt", async ({ page }) => {
  await page.goto("/");

  const main = page.getByRole("main");
  const smartHomeCta = main.getByRole("link", { name: "Переглянути сценарії", exact: true });
  await expect(smartHomeCta).toHaveCount(1);
  await expect(smartHomeCta).toBeVisible();
  await expect(smartHomeCta).toHaveAttribute("href", /\/smart-home\/$/);

  const heroVisual = main.getByRole("img").first();
  await expect(heroVisual).toBeVisible();
  await expect(heroVisual).toHaveAccessibleName(/(електр|систем|будинок|освіт|клімат|безпек|живлен)/i);
});

test("homepage remains noindex and contains no fake review or rating metrics", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);

  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toMatch(/(?:відгук\w*|рейтинг\w*|зірк\w*|оцінк\w*)/i);
  expect(visibleText).not.toMatch(/\b\d+(?:[.,]\d+)?\s*\/\s*5\b/);
});

test("static poster and scene explanation remain usable without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContextWithoutWebGL(type, ...args) {
      if (type === "webgl" || type === "webgl2") return null;
      return getContext.call(this, type, ...args);
    };
  });
  await page.goto("/");

  const main = page.getByRole("main");
  await expect(main.getByRole("img").first()).toBeVisible();
  await main.getByRole("button", { name: "Живлення", exact: true }).click();
  await expect(main.locator('[aria-live]:visible').first()).toContainText("резервного контуру");
});
