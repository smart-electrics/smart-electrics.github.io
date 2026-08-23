import { expect, test } from "@playwright/test";

async function assertNoHorizontalOverflow(page, route) {
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  );
  expect(overflow, `${route} should not scroll horizontally`).toBe(0);
}

test("service index and longest detail remain usable at intermediate widths", async ({ page }) => {
  for (const width of [414, 900, 1280, 1720]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/services/", "/services/diagnostics-and-service/"]) {
      await page.goto(route);
      await assertNoHorizontalOverflow(page, `${route} at ${width}px`);
    }
  }
});

test("mobile services chrome links provide 44px touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/services/");

  const chromeLinks = [
    ...(await page.getByRole("banner").getByRole("link").all()),
    ...(await page.getByRole("contentinfo").getByRole("link").all())
  ];
  const undersized = [];

  for (const link of chromeLinks) {
    if (!(await link.isVisible())) continue;

    const box = await link.boundingBox();
    const name = await link.getAttribute("aria-label") || (await link.innerText()).trim();
    if (!box || box.width < 44 || box.height < 44) {
      undersized.push({ name, width: box?.width ?? null, height: box?.height ?? null });
    }
  }

  expect(undersized, "every visible header/footer link should have a 44px touch target").toEqual([]);
});

test("composition scales fluidly at intermediate widths", async ({ page }) => {
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
