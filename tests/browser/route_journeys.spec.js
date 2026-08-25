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
    firstLabel: "Звернення",
    returnLabel: "Повернутися до маршруту"
  },
  {
    route: "/about/",
    id: "about",
    title: "Про нас",
    nodes: ["object-context", "system-logic", "coordination", "handover"],
    firstLabel: "Контекст об’єкта",
    returnLabel: "Повернутися до принципів"
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

async function settledVisual(page, root) {
  await page.waitForTimeout(460);
  return root.evaluate((element) => {
    const scene = element.querySelector("[data-route-journey-scene] img");
    const connector = element.querySelector("svg[data-route-journey-connector]");
    const line = connector?.querySelector("line[data-route-journey-connector-line]");
    if (!scene || !connector || !line) return null;
    const style = getComputedStyle(scene);
    return {
      scene: {
        transform: style.transform,
        clipPath: style.clipPath,
        objectPosition: style.objectPosition,
        transitionDuration: style.transitionDuration
      },
      connector: {
        hidden: connector.hidden,
        display: getComputedStyle(connector).display,
        state: connector.dataset.routeJourneyConnectorState,
        x1: line.getAttribute("x1"),
        y1: line.getAttribute("y1"),
        x2: line.getAttribute("x2"),
        y2: line.getAttribute("y2")
      }
    };
  });
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
    await expect(root.locator('[data-route-journey-node][aria-pressed="true"]')).toHaveCount(1);
    await expect(root.locator("[data-route-journey-panel-title]")).not.toHaveText(
      await root.locator(".route-journey__stage-heading h2").innerText()
    );

    const first = root.getByRole("button", { name: journey.firstLabel, exact: true });
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(root).toHaveAttribute("data-route-journey-state", "focus");
    await expect(root).toHaveAttribute("data-route-journey-selected-node", journey.nodes[0]);
    await expect(root.locator("[data-route-journey-scene]:visible")).toHaveCount(1);
    await expect(root.locator("[data-route-journey-panel]:visible")).toHaveCount(1);
    await expect(root.locator('[data-route-journey-node][aria-pressed="true"]')).toHaveCount(1);
    await root.getByRole("button", { name: "Показати зв’язок", exact: true }).click();
    await expect(root).toHaveAttribute("data-route-journey-state", "reassembled");
    await expect(root.locator("[data-route-journey-scene]:visible")).toHaveCount(1);
    await expect(root.locator("[data-route-journey-panel]:visible")).toHaveCount(1);
    await expect(root.locator('[data-route-journey-node][aria-pressed="true"]')).toHaveCount(1);
    await expect(root.getByRole("button", { name: journey.returnLabel, exact: true })).toBeFocused();
    await root.getByRole("button", { name: journey.returnLabel, exact: true }).click();
    await expect(root).toHaveAttribute("data-route-journey-state", "assembled");
    await expect(first).toBeFocused();
  }
});

test("every journey node resolves a distinct settled scene frame and causal connector from canonical visual data", async ({ page }) => {
  for (const journey of journeys) {
    await page.goto(journey.route);
    const root = page.locator(`[data-route-journey-root][data-route-journey-id="${journey.id}"]`);
    const config = await root.locator("script[data-route-journey-config]").evaluate((source) => JSON.parse(source.textContent));
    await expect(root.locator("svg[data-route-journey-connector]")).toHaveCount(1);
    await expect(root.locator("svg[data-route-journey-connector] line[data-route-journey-connector-line]")).toHaveCount(1);
    await expect(root.locator("svg[data-route-journey-connector] circle")).toHaveCount(2);

    const assembled = await settledVisual(page, root);
    const assembledSource = await root.locator("[data-route-journey-scene] img").evaluate((image) => image.currentSrc);
    expect(assembled).not.toBeNull();
    expect(assembled?.connector).toMatchObject({ hidden: true, state: "assembled" });
    const focusFrames = new Set();
    const relationshipPaths = new Set();

    for (const node of config.nodes) {
      expect(node.visual).toMatchObject({
        focus: { x: expect.any(Number), y: expect.any(Number), scale: expect.any(Number) },
        next: { x: expect.any(Number), y: expect.any(Number) }
      });
      await root.getByRole("button", { name: node.title, exact: true }).click();
      await expect(root).toHaveAttribute("data-route-journey-state", "focus");
      const focus = await settledVisual(page, root);
      await expect(root.locator("[data-route-journey-scene] img")).toHaveJSProperty("currentSrc", assembledSource);
      expect(focus).not.toBeNull();
      expect(focus?.scene.transform).not.toBe(assembled?.scene.transform);
      expect(focus?.scene.clipPath).not.toBe(assembled?.scene.clipPath);
      expect(focus?.scene.objectPosition).not.toBe(assembled?.scene.objectPosition);
      expect(focus?.connector).toEqual({
        hidden: false,
        display: "block",
        state: "focus",
        x1: String(node.visual.focus.x),
        y1: String(node.visual.focus.y),
        x2: String(node.visual.focus.x),
        y2: String(node.visual.focus.y)
      });
      focusFrames.add(`${focus?.scene.transform}|${focus?.scene.clipPath}|${focus?.scene.objectPosition}`);

      await root.getByRole("button", { name: "Показати зв’язок", exact: true }).click();
      await expect(root).toHaveAttribute("data-route-journey-state", "reassembled");
      const reassembled = await settledVisual(page, root);
      await expect(root.locator("[data-route-journey-scene] img")).toHaveJSProperty("currentSrc", assembledSource);
      expect(reassembled).not.toBeNull();
      expect(reassembled?.scene.transform).not.toBe(focus?.scene.transform);
      expect(reassembled?.scene.clipPath).not.toBe(focus?.scene.clipPath);
      expect(reassembled?.scene.objectPosition).not.toBe(focus?.scene.objectPosition);
      expect(reassembled?.connector).toEqual({
        hidden: false,
        display: "block",
        state: "reassembled",
        x1: String(node.visual.focus.x),
        y1: String(node.visual.focus.y),
        x2: String(node.visual.next.x),
        y2: String(node.visual.next.y)
      });
      relationshipPaths.add(`${reassembled?.connector.x1},${reassembled?.connector.y1}->${reassembled?.connector.x2},${reassembled?.connector.y2}`);

      await root.getByRole("button", { name: journey.returnLabel, exact: true }).click();
      await expect(root).toHaveAttribute("data-route-journey-state", "assembled");
    }

    expect(focusFrames.size).toBe(config.nodes.length);
    expect(relationshipPaths.size).toBe(config.nodes.length);
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

test("journeys fail closed for malformed JSON and an invalid node adapter surface", async ({ page }) => {
  const mutations = [
    {
      name: "malformed JSON",
      apply: (body) => body.replace(/(<script type="application\/json" data-route-journey-config>).*?(<\/script>)/u, "$1{$2")
    },
    {
      name: "duplicate node ID",
      apply: (body) => body.replace('"id":"clarification"', '"id":"enquiry"')
    },
    {
      name: "unknown DOM node",
      apply: (body) => body.replace('data-route-journey-node="clarification"', 'data-route-journey-node="unknown"')
    },
    {
      name: "missing DOM node",
      apply: (body) => body.replace(/\s*<li>\s*<button type="button" data-route-journey-action="select-node" data-route-journey-node="site-assessment"[^<]*<\/button>\s*<\/li>/u, "")
    },
    {
      name: "visual mapping drift",
      apply: (body) => body.replace('"x":17', '"x":18')
    },
    {
      name: "connector DOM drift",
      apply: (body) => body.replace("data-route-journey-connector", "data-route-journey-connector-corrupt")
    }
  ];

  for (const mutation of mutations) {
    await page.route("**/process/", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: mutation.apply(await response.text()) });
    });
    await page.goto("/process/");
    const root = page.locator("[data-route-journey-root]");
    await expect(root, mutation.name).not.toHaveAttribute("data-route-journey-enhanced", "true");
    await expect(root.locator("[data-route-journey-fallback]"), mutation.name).toBeVisible();
    await expect(root.locator("[data-route-journey-stage]"), mutation.name).toBeHidden();
    await page.unroute("**/process/");
  }
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

  await root.getByRole("button", { name: "Повернутися до маршруту", exact: true }).click();
  await expect(root).toHaveAttribute("data-route-journey-transition", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(root).not.toHaveAttribute("data-route-journey-transition", "true");

  await page.goto("/about/");
  const reducedRoot = page.locator("[data-route-journey-root]");
  const reducedAssembled = await settledVisual(page, reducedRoot);
  await reducedRoot.getByRole("button", { name: "Контекст об’єкта", exact: true }).click();
  await expect(reducedRoot).not.toHaveAttribute("data-route-journey-transition", "true");
  const reducedFocus = await settledVisual(page, reducedRoot);
  expect(reducedFocus?.scene.transform).not.toBe(reducedAssembled?.scene.transform);
  expect(reducedFocus?.scene.clipPath).not.toBe(reducedAssembled?.scene.clipPath);
  expect(reducedFocus?.connector).toMatchObject({ hidden: false, state: "focus" });
  expect(reducedFocus?.scene.transitionDuration).toMatch(/^0s(?:, 0s)*$/u);
  await reducedRoot.getByRole("button", { name: "Показати зв’язок", exact: true }).click();
  const reducedReassembled = await settledVisual(page, reducedRoot);
  expect(reducedReassembled?.scene.transform).not.toBe(reducedFocus?.scene.transform);
  expect(reducedReassembled?.connector).toMatchObject({ state: "reassembled" });
  expect(`${reducedReassembled?.connector.x1},${reducedReassembled?.connector.y1}`).not.toBe(
    `${reducedReassembled?.connector.x2},${reducedReassembled?.connector.y2}`
  );
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

test("journey controls support touch and every changed route passes Axe in every journey state", async ({ browser, page }) => {
  const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });
  const touchPage = await touchContext.newPage();
  await touchPage.goto("/process/");
  const control = touchPage.getByRole("button", { name: "Уточнення", exact: true });
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await control.tap();
  await expect(touchPage.locator("[data-route-journey-root]")).toHaveAttribute("data-route-journey-selected-node", "clarification");
  await touchContext.close();

  for (const entry of changedRoutes) {
    await page.goto(entry.route);
    await expect(page.locator("main")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${entry.route} should pass Axe`).toEqual([]);
  }
  for (const journey of journeys) {
    await page.goto(journey.route);
    const root = page.locator("[data-route-journey-root]");
    await root.getByRole("button", { name: journey.firstLabel, exact: true }).click();
    let results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${journey.route} focus should pass Axe`).toEqual([]);
    await root.getByRole("button", { name: "Показати зв’язок", exact: true }).click();
    results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${journey.route} reassembled should pass Axe`).toEqual([]);
  }
});

test("changed routes remain fluid at the complete responsive matrix", async ({ page }) => {
  for (const width of [375, 414, 768, 900, 1024, 1280, 1440, 1720, 1980]) {
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
  const projectsCopy = await page.locator("main").innerText();
  expect(projectsCopy).toContain("Наразі ми не публікуємо тут підтверджених кейсів");
  expect(projectsCopy).not.toMatch(/відгук|статист|завершен(?:ий|ого)|реалізован(?:ий|ого)|м²/iu);
  const archiveLinks = page.locator("[data-route-utility]");
  await expect(archiveLinks.getByRole("link", { name: "Готові рішення", exact: true })).toHaveAttribute("href", "/solutions/");
  await expect(archiveLinks.getByRole("link", { name: "Послуги", exact: true })).toHaveAttribute("href", "/services/");

  await page.goto("/contact/");
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  await expect(page.locator("input, textarea, select")).toHaveCount(0);
  await expect(page.locator('a[href^="mailto:"], a[href^="tel:"]')).toHaveCount(0);

  await page.goto("/privacy/");
  await expect(page.getByText(/GA4 не завантажується/u)).toBeVisible();
  await expect(page.getByText(/Formspree не активна/u)).toBeVisible();

  await page.goto("/404.html");
  const notFoundLinks = page.locator("[data-route-utility]");
  await expect(notFoundLinks.getByRole("link", { name: "На головну", exact: true })).toHaveAttribute("href", "/");
  await expect(notFoundLinks.getByRole("link", { name: "Послуги", exact: true })).toHaveAttribute("href", "/services/");

  for (const entry of changedRoutes) {
    await page.goto(entry.route);
    await expect(page.locator("main")).not.toContainText(/\b0[1-9]\b/u);
    await expect(page.locator('form, a[href^="mailto:"], a[href^="tel:"]')).toHaveCount(0);
    await expect(page.locator('script[src*="googletagmanager"], script[src*="google-analytics"], script[src*="formspree"]')).toHaveCount(0);
    if (!("id" in entry)) {
      await expect(page.locator("[data-route-utility] button")).toHaveCount(0);
      await expect(page.locator(".estimate-status")).toHaveCount(0);
    }
  }
});
