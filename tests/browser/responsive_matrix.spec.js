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

test("tablet residence controls keep every word intact", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto("/services/");

  const splitWords = await page
    .locator("[data-cinematic-physical-controls]:visible button")
    .evaluateAll((buttons) => buttons.flatMap((button) => {
      const node = button.firstChild;
      if (!(node instanceof Text)) return [button.textContent.trim()];

      return [...node.data.matchAll(/\S+/gu)].flatMap((match) => {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        return range.getClientRects().length > 1 ? [match[0]] : [];
      });
    }));

  expect(splitWords, "physical-control labels should wrap only between words").toEqual([]);
});

test("smart-home disassembly never expands the document", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/smart-home/");

  const maximumOverflow = page.evaluate(() => new Promise((resolve) => {
    let maximum = 0;
    const startedAt = performance.now();
    const measure = (now) => {
      maximum = Math.max(
        maximum,
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      if (now - startedAt < 1100) requestAnimationFrame(measure);
      else resolve(maximum);
    };
    requestAnimationFrame(measure);
  }));

  await page.getByRole("radio", { name: "Повернення" }).click();
  expect(await maximumOverflow, "outgoing motion must stay inside the simulator chassis").toBe(0);
});
