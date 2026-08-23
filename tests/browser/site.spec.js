import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/services/",
  "/smart-home/",
  "/projects/",
  "/process/",
  "/about/",
  "/contact/",
  "/services/electrical-design/",
  "/services/electrical-installation/",
  "/services/panels-and-protection/",
  "/services/lighting/",
  "/services/low-voltage/",
  "/services/backup-power/",
  "/services/smart-home-integration/",
  "/services/diagnostics-and-service/",
  "/privacy/",
  "/404.html"
];

test("coming-soon page states the verified offer without pretending to be launched", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Smart Electrics/);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Від електромережі до розумного будинку"
  );
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Smart Electrics — головна" })
  ).toBeVisible();
  await expect(page.getByText("Львів та область", { exact: true })).toBeVisible();
  await expect(page.getByText("Розрахунок вартості — незабаром", { exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("every planned route renders, remains noindex, and fits the viewport", async ({ page }) => {
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} should return a successful response`).toBeTruthy();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const overflow = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
    );
    expect(overflow, `${route} should not scroll horizontally`).toBe(0);
  }
});

test("outer composition remains fluid instead of freezing at a desktop max-width", async ({ page }) => {
  await page.goto("/");

  const viewport = page.viewportSize();
  const shell = await page.locator(".site-header__inner").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, width: bounds.width };
  });

  expect(viewport).not.toBeNull();
  expect(shell.width).toBeGreaterThan(viewport.width * 0.9);
  expect(Math.abs(shell.left - (viewport.width - shell.right))).toBeLessThanOrEqual(1);
});

test("composition also scales at intermediate widths between the viewport matrix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1980", "One Chromium project samples the in-between widths.");

  let previousShellWidth = 0;

  for (const width of [414, 900, 1280, 1720]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    const measurements = await page.locator(".site-header__inner").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        overflow: Math.max(
          0,
          document.documentElement.scrollWidth - document.documentElement.clientWidth
        ),
        shellWidth: bounds.width
      };
    });

    expect(measurements.overflow, `${width}px should not scroll horizontally`).toBe(0);
    expect(measurements.shellWidth, `${width}px should retain a fluid outer composition`).toBeGreaterThan(
      width * 0.9
    );
    expect(measurements.shellWidth).toBeGreaterThan(previousShellWidth);
    previousShellWidth = measurements.shellWidth;
  }
});

test("navigation exposes the agreed Ukrainian labels", async ({ page }) => {
  await page.goto("/");

  const desktopNavigation = page.getByRole("navigation", { name: "Основна навігація" });
  const navigation = await desktopNavigation.isVisible()
    ? desktopNavigation
    : page.getByRole("navigation", { name: "Мобільна навігація" });

  if (!(await desktopNavigation.isVisible())) {
    await page.locator(".mobile-nav summary").click();
  }

  for (const label of ["Послуги", "Розумний будинок", "Процес", "Про нас", "Контакти"]) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  await expect(navigation.getByRole("link", { name: "Проєкти", exact: true })).toHaveCount(0);
});

test("service details keep the Services section active in both navigation variants", async ({ page }) => {
  await page.goto("/services/smart-home-integration/");

  const desktopNavigation = page.getByRole("navigation", { name: "Основна навігація" });
  if (await desktopNavigation.isVisible()) {
    await expect(desktopNavigation.getByRole("link", { name: "Послуги", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    return;
  }

  await page.locator(".mobile-nav summary").click();
  await expect(
    page
      .getByRole("navigation", { name: "Мобільна навігація" })
      .getByRole("link", { name: "Послуги", exact: true })
  ).toHaveAttribute("aria-current", "page");
});

test("service cards communicate a pressed state", async ({ page }) => {
  await page.goto("/services/");

  const card = page.locator(".service-card").first();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(card).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, 1\)/);
  await page.mouse.up();
});

test("keyboard users can reach content and operate the responsive navigation", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();

  const mobileMenu = page.locator(".mobile-nav");
  if (await mobileMenu.isVisible()) {
    const summary = mobileMenu.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(mobileMenu).toHaveAttribute("open", "");
    await expect(
      page.getByRole("navigation", { name: "Мобільна навігація" }).getByRole("link", { name: "Послуги" })
    ).toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: "Основна навігація" })).toBeVisible();
  }
});

test("analytics and lead submission remain disabled until their activation gate is complete", async ({ page }) => {
  await page.goto("/contact/");

  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  await expect(page.locator('form[action*="formspree"]')).toHaveCount(0);
  await expect(page.locator("main").getByText("Форма запиту готується", { exact: true })).toBeVisible();
});

test("key surfaces have no automatically detectable accessibility violations", async ({ page }) => {
  for (const route of ["/", "/services/electrical-installation/", "/privacy/"]) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} should return a successful response before axe`).toBeTruthy();
    await expect(page.locator("main"), `${route} should render its main landmark before axe`).toBeVisible();
    await expect(page, `${route} should render the Smart Electrics document before axe`).toHaveTitle(
      /Smart Electrics/
    );
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${route} should pass axe`).toEqual([]);
  }
});

test("reduced-motion users receive a still experience", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const animatedElements = await page.locator("*").evaluateAll((elements) =>
    elements.filter((element) => {
      const style = getComputedStyle(element);
      const animationRuns = style.animationName !== "none" && style.animationDuration !== "0s";
      const transitionRuns = style.transitionDuration
        .split(",")
        .some((duration) => Number.parseFloat(duration) > 0);
      return animationRuns || transitionRuns;
    }).length
  );

  expect(animatedElements).toBe(0);
});
