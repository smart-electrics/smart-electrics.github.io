import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/services/",
  "/solutions/",
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

async function chromeVisualState(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const after = getComputedStyle(element, "::after");
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      color: style.color,
      filter: style.filter,
      opacity: style.opacity,
      transform: style.transform,
      underlineTransform: after.transform
    };
  });
}

async function pressPointer(locator, page) {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error("Visible chrome control requires pointer bounds");

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
}

async function clickCreatesRouteSnapshot(locator) {
  return locator.evaluate((anchor) => new Promise((resolve) => {
    document.addEventListener("click", (event) => {
      event.preventDefault();
      window.setTimeout(() => {
        const snapshot = document.querySelector("[data-cinematic-route-snapshot]");
        snapshot?.remove();
        resolve(Boolean(snapshot));
      }, 0);
    }, { once: true });
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, cancelable: true, view: window }));
  }));
}

async function releaseWithoutNavigation(page) {
  await page.evaluate(() => {
    document.addEventListener("click", (event) => event.preventDefault(), { capture: true, once: true });
  });
  await page.mouse.up();
}

test("homepage states the verified offer without pretending contacts are active", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Smart Electrics/);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Електрика/i
  );
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Smart Electrics, головна" })
  ).toBeVisible();
  await expect(page.getByText("Львів та область", { exact: true })).toBeVisible();
  await expect(page.getByText("Звернення через сайт поки не приймаються.", { exact: true })).toBeVisible();
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

test("navigation exposes the agreed Ukrainian labels with hover-only chrome feedback", async ({ page }) => {
  await page.goto("/services/");

  await expect(
    page.locator("header [data-cinematic-route], header [data-cinematic-route-source], header [data-cinematic-route-source-ref], footer [data-cinematic-route], footer [data-cinematic-route-source], footer [data-cinematic-route-source-ref]")
  ).toHaveCount(0);

  const desktopNavigation = page.getByRole("navigation", { name: "Основна навігація" });
  const navigation = await desktopNavigation.isVisible() ? desktopNavigation : page.getByRole("navigation", { name: "Мобільна навігація" });
  if (!(await desktopNavigation.isVisible())) await page.locator(".mobile-nav summary").click();

  for (const label of ["Послуги", "Готові рішення", "Розумний будинок", "Процес", "Про нас", "Контакти"]) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  await expect(navigation.getByRole("link", { name: "Проєкти", exact: true })).toHaveCount(0);

  const brand = page.getByRole("banner").getByRole("link", { name: "Smart Electrics, головна" });
  const brandResting = await chromeVisualState(brand);
  await brand.hover();
  await page.waitForTimeout(200);
  const brandHovered = await chromeVisualState(brand);
  expect(Number(brandHovered.opacity)).toBeGreaterThanOrEqual(Number(brandResting.opacity));
  expect(brandHovered.filter).not.toBe(brandResting.filter);
  await pressPointer(brand, page);
  expect(await chromeVisualState(brand)).toEqual(brandHovered);
  await releaseWithoutNavigation(page);
  expect(await clickCreatesRouteSnapshot(brand)).toBe(false);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/"),
    brand.click()
  ]);

  if (await desktopNavigation.isVisible()) {
    const servicesLink = desktopNavigation.getByRole("link", { name: "Послуги", exact: true });
    const resting = await chromeVisualState(servicesLink);
    await servicesLink.hover();
    await page.waitForTimeout(200);
    const hovered = await chromeVisualState(servicesLink);
    expect(hovered.color).not.toBe(resting.color);
    expect(hovered.underlineTransform).not.toBe(resting.underlineTransform);
    await pressPointer(servicesLink, page);
    expect(await chromeVisualState(servicesLink)).toEqual(hovered);
    await releaseWithoutNavigation(page);
    expect(await clickCreatesRouteSnapshot(servicesLink)).toBe(false);
    await Promise.all([page.waitForURL("**/services/"), servicesLink.click()]);
  } else {
    const mobileMenu = page.locator(".mobile-nav");
    const summary = mobileMenu.locator("summary");
    const summaryResting = await chromeVisualState(summary);
    await summary.hover();
    const summaryHovered = await chromeVisualState(summary);
    expect(summaryHovered.backgroundColor).not.toBe(summaryResting.backgroundColor);
    expect(summaryHovered.borderColor).not.toBe(summaryResting.borderColor);
    await pressPointer(summary, page);
    expect(await chromeVisualState(summary)).toEqual(summaryHovered);
    await page.mouse.up();
    await expect(mobileMenu).toHaveAttribute("open", "");

    const servicesLink = mobileMenu.getByRole("link", { name: "Послуги", exact: true });
    const resting = await chromeVisualState(servicesLink);
    await servicesLink.hover();
    const hovered = await chromeVisualState(servicesLink);
    expect(hovered.backgroundColor).not.toBe(resting.backgroundColor);
    expect(hovered.color).not.toBe(resting.color);
    await pressPointer(servicesLink, page);
    expect(await chromeVisualState(servicesLink)).toEqual(hovered);
    await releaseWithoutNavigation(page);
    expect(await clickCreatesRouteSnapshot(servicesLink)).toBe(false);
    await Promise.all([page.waitForURL("**/services/"), servicesLink.click()]);
  }

  const viewport = page.viewportSize();
  if (viewport) await page.mouse.move(1, viewport.height - 1);
  await page.waitForTimeout(200);
  const currentNavigation = page.getByRole("navigation", { name: "Основна навігація" });
  const currentScope = await currentNavigation.isVisible()
    ? currentNavigation
    : page.getByRole("navigation", { name: "Мобільна навігація" });
  if (!(await currentNavigation.isVisible())) await page.locator(".mobile-nav summary").click();
  const currentLink = currentScope.getByRole("link", { name: "Послуги", exact: true });
  const peerLink = currentScope.getByRole("link", { name: "Процес", exact: true });
  await expect(currentLink).toHaveAttribute("aria-current", "page");
  expect(await chromeVisualState(currentLink)).toEqual(await chromeVisualState(peerLink));

  const destinationBrand = page.getByRole("banner").getByRole("link", { name: "Smart Electrics, головна" });
  await page.goto("/services/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(destinationBrand).toBeFocused();
  const focus = await destinationBrand.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.outlineColor, style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(focus.style).not.toBe("none");
  expect(focus.width).not.toBe("0px");
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

test("residence-spine direction controls communicate a pressed state", async ({ page }) => {
  await page.goto("/services/");

  const control = page.locator("[data-cinematic-stage]").getByRole("button", { name: "Освітлення", exact: true });
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-cinematic-root]")).toHaveAttribute("data-cinematic-direction", "lighting");
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
  await expect(page.locator("main")).toContainText("Контактна форма не активна");
  await expect(page.locator("main")).toContainText("не збирає контактні дані");
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
