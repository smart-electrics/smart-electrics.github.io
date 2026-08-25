import { expect, test } from "@playwright/test";

const acceptanceWidths = [375, 414, 540, 768, 900, 1024, 1280, 1440, 1536, 1720, 1980];

test("the private-house solution remains fluid without JavaScript at every acceptance width", async ({ browser }) => {
  const overflow = [];

  for (const width of acceptanceWidths) {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width, height: 1000 }
    });
    const page = await context.newPage();
    await page.goto("/solutions/private-house-full-automation/", { waitUntil: "networkidle" });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    if (dimensions.scrollWidth > dimensions.clientWidth) overflow.push({ width, ...dimensions });
    await context.close();
  }

  expect(overflow, JSON.stringify(overflow)).toEqual([]);
});
