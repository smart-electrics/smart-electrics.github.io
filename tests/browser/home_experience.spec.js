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

test("hero explains the full electrical journey and exposes live engineering controls", async ({ page }) => {
  await page.goto("/");

  const main = page.getByRole("main");
  const heading = main.getByRole("heading", { level: 1 });
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveText(/Електрика/i);

  const visibleCopy = await main.innerText();
  expect(visibleCopy).toMatch(/чорнового монтажу/i);
  expect(visibleCopy).toMatch(/розумного будинку/i);

  const primaryCta = main.locator(".button--primary");
  await expect(primaryCta).toHaveText("Обговорити об’єкт");
  await expect(primaryCta).toBeDisabled();
  expect(await primaryCta.getAttribute("href")).toBeNull();

  for (const label of ["Електромонтажне проєктування", "Освітлення", "Резервне живлення", "Розумний будинок"]) {
    const control = main.getByRole("button", { name: label, exact: true });
    await expect(control).toHaveCount(1);
    await expect(control).toBeVisible();
  }

  const liveRegions = main.locator('[aria-live]:visible');
  await expect(liveRegions).toHaveCount(1);
  await expect(liveRegions.first()).toBeEmpty();

  const lighting = main.getByRole("button", { name: "Освітлення", exact: true });
  await lighting.click();
  await expect(lighting).toHaveAttribute("aria-pressed", "true");
  await expect(main.getByRole("button", { name: "Резервне живлення", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(liveRegions.first()).toContainText("Групи світла");
});

test("hero secondary CTA reaches smart home and its visual has meaningful Ukrainian alt", async ({ page }) => {
  await page.goto("/");

  const main = page.getByRole("main");
  const smartHomeCta = main.getByRole("link", { name: "Переглянути приклади сценаріїв", exact: true });
  await expect(smartHomeCta).toHaveCount(1);
  await expect(smartHomeCta).toBeVisible();
  await expect(smartHomeCta).toHaveAttribute("href", /\/smart-home\/$/);

  const heroVisual = main.getByRole("img").first();
  await expect(heroVisual).toBeVisible();
  await expect(heroVisual).toHaveAccessibleName(/(електр|систем|будинок|освіт|клімат|безпек|живлен)/i);
});

test("audience paths lead to useful private and partner destinations", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: /Для квартири або будинку/ })).toHaveAttribute(
    "href",
    /\/services\/$/
  );
  const partnerPath = page.getByRole("link", { name: /Для архітекторів і дизайнерів/ });
  await expect(partnerPath).toHaveAttribute("href", /\/about\/#partners$/);
  await partnerPath.click();
  await expect(page).toHaveURL(/\/about\/#partners$/);
  await expect(page.getByRole("heading", { name: "Для архітекторів і дизайнерів" })).toBeVisible();
});

test("homepage remains noindex and contains no fake review or rating metrics", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);

  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toMatch(/(?:відгук\w*|рейтинг\w*|зірк\w*|оцінк\w*)/i);
  expect(visibleText).not.toMatch(/\b\d+(?:[.,]\d+)?\s*\/\s*5\b/);
});

test("home stage keeps its editorial scene and explanation without a legacy WebGL layer", async ({ page }) => {
  await page.goto("/");

  const main = page.getByRole("main");
  await expect(main.getByRole("img").first()).toBeVisible();
  await main.getByRole("button", { name: "Резервне живлення", exact: true }).click();
  await expect(main.locator('[aria-live]:visible').first()).toContainText("Пріоритети живлення");
  await expect(page.locator("[data-home-scene], [data-home-canvas]")).toHaveCount(0);
});
