import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const journeys = [
  {
    route: "/process/",
    id: "process",
    title: "Процес",
    nodes: [
      "enquiry",
      "clarification",
      "site-assessment",
      "design-and-agreement",
      "estimation",
      "installation-and-commissioning",
      "handover-and-service"
    ],
    firstLabel: "Звернення"
  },
  {
    route: "/about/",
    id: "about",
    title: "Про нас",
    nodes: ["object-context", "system-logic", "coordination", "handover"],
    firstLabel: "Контекст об’єкта"
  }
];

const utilityRoutes = [
  { route: "/projects/", title: "Проєкти" },
  { route: "/contact/", title: "Контакти" },
  { route: "/privacy/", title: "Конфіденційність" },
  { route: "/404.html", title: "Сторінку не знайдено" }
];

const changedRoutes = [...journeys, ...utilityRoutes];

async function assertNoHorizontalOverflow(page, name) {
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  );
  expect(overflow, `${name} should not scroll horizontally`).toBe(0);
}

test("process and engineering-principles journeys keep their exact ordered data contract without visible ordinals", async ({ page }) => {
  for (const journey of journeys) {
    await page.goto(journey.route);
    const root = page.locator(`[data-route-journey-root][data-route-journey-id="${journey.id}"]`);
    await expect(root).toHaveAttribute("data-route-journey-enhanced", "true");
    expect(await root.locator("[data-route-journey-node]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-route-journey-node"))
    )).toEqual(journey.nodes);
    await expect(root).not.toContainText(/\b0[1-9]\b/u);

    const first = root.getByRole("button", { name: journey.firstLabel, exact: true });
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(root).toHaveAttribute("data-route-journey-state", "focus");
    await expect(root).toHaveAttribute("data-route-journey-selected-node", journey.nodes[0]);
    await root.getByRole("button", { name: "Показати зв’язок", exact: true }).click();
    await expect(root).toHaveAttribute("data-route-journey-state", "reassembled");
    await root.getByRole("button", { name: "Повернутися до маршруту", exact: true }).click();
    await expect(root).toHaveAttribute("data-route-journey-state", "assembled");
  }
});

test("journeys fail closed to source-order fallback when their detached fingerprint does not match", async ({ page }) => {
  await page.route("**/process/", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/data-route-journey-fingerprint="[a-f0-9]{8}"/u, "data-route-journey-fingerprint=\"corrupt\"");
    await route.fulfill({ response, body });
  });
  await page.goto("/process/");

  const root = page.locator("[data-route-journey-root]");
  await expect(root).not.toHaveAttribute("data-route-journey-enhanced", "true");
  await expect(root.locator("[data-route-journey-fallback]")).toBeVisible();
  await expect(root.locator("[data-route-journey-stage]")).toBeHidden();
});

test("journey motion recovers from cancellation and image abort, and does not run for reduced motion", async ({ page }) => {
  await page.goto("/process/");
  const root = page.locator("[data-route-journey-root]");
  const outgoing = root.locator("[data-route-journey-outgoing]");
  await root.getByRole("button", { name: "Звернення", exact: true }).click();
  await expect(outgoing).toBeVisible();
  await outgoing.dispatchEvent("animationcancel");
  await expect(outgoing).toBeHidden();
  await root.getByRole("button", { name: "Показати зв’язок", exact: true }).click();
  await expect(outgoing).toBeVisible();
  await outgoing.dispatchEvent("error");
  await expect(outgoing).toBeHidden();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/about/");
  const reducedRoot = page.locator("[data-route-journey-root]");
  await reducedRoot.getByRole("button", { name: "Контекст об’єкта", exact: true }).click();
  await expect(reducedRoot).not.toHaveAttribute("data-route-journey-transition", "true");
  const movingElements = await reducedRoot.locator("*").evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return (style.animationName !== "none" && style.animationDuration !== "0s") || style.transitionDuration
      .split(",")
      .some((duration) => Number.parseFloat(duration) > 0);
  }).length);
  expect(movingElements).toBe(0);
});

test("changed routes are readable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();

  for (const entry of changedRoutes) {
    await page.goto(entry.route);
    await expect(page.getByRole("heading", { level: 1, name: entry.title, exact: true })).toBeVisible();
    await assertNoHorizontalOverflow(page, `${entry.route} without JavaScript`);
  }
  for (const journey of journeys) {
    await page.goto(journey.route);
    await expect(page.locator("[data-route-journey-fallback]")).toBeVisible();
    await expect(page.locator("[data-route-journey-stage]")).toBeHidden();
  }
  await context.close();
});

test("journey controls support touch and every changed route passes Axe", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/process/");
  const control = page.getByRole("button", { name: "Уточнення", exact: true });
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.touchscreen.tap((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
  await expect(page.locator("[data-route-journey-root]")).toHaveAttribute("data-route-journey-selected-node", "clarification");

  for (const entry of changedRoutes) {
    await page.goto(entry.route);
    await expect(page.locator("main")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${entry.route} should pass Axe`).toEqual([]);
  }
});

test("changed routes remain fluid at the complete responsive matrix", async ({ page }) => {
  for (const width of [375, 414, 768, 900, 1280, 1440, 1720, 1980]) {
    await page.setViewportSize({ width, height: width < 768 ? 850 : 1000 });
    for (const entry of changedRoutes) {
      await page.goto(entry.route);
      await assertNoHorizontalOverflow(page, `${entry.route} at ${width}px`);
      if ("id" in entry) {
        const root = page.locator("[data-route-journey-root]");
        await expect(root).toHaveAttribute("data-route-journey-enhanced", "true");
        const media = await root.locator("[data-route-journey-media]").boundingBox();
        expect(media?.width ?? 0, `${entry.route} at ${width}px has a visible dominant composition`).toBeGreaterThan(0);
      }
    }
  }
});

test("truthful utility routes keep integrations disabled, archive claims absent, and navigation links valid", async ({ page }) => {
  await page.goto("/projects/");
  await expect(page.getByRole("navigation", { name: "Основна навігація" }).getByRole("link", { name: "Проєкти", exact: true })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/відгук|кейс|завершен(?:ий|ого)|реалізован(?:ий|ого)|м²/iu);
  await expect(page.getByRole("link", { name: "Готові рішення", exact: true })).toHaveAttribute("href", "/solutions/");
  await expect(page.getByRole("link", { name: "Послуги", exact: true })).toHaveAttribute("href", "/services/");

  await page.goto("/contact/");
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  await expect(page.locator("input, textarea, select")).toHaveCount(0);

  await page.goto("/privacy/");
  await expect(page.getByText(/GA4 не завантажується/u)).toBeVisible();
  await expect(page.getByText(/Formspree не активна/u)).toBeVisible();

  await page.goto("/404.html");
  await expect(page.getByRole("link", { name: "На головну", exact: true })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Послуги", exact: true })).toHaveAttribute("href", "/services/");
});
