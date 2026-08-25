import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4000";
const responsiveMatrixFile = /responsive_matrix\.spec\.js/u;
const finalAcceptanceFile = /final_acceptance\.spec\.js/u;
const motionChoreographyFile = /motion_choreography\.spec\.js/u;

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "artifacts/playwright-results",
  fullyParallel: false,
  forbidOnly: true,
  // A failed attempt is a failed quality gate; flakes must remain visible.
  retries: 0,
  actionTimeout: 10_000,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "artifacts/playwright-report" }]
  ],
  use: {
    baseURL,
    browserName: "chromium",
    colorScheme: "dark",
    locale: "uk-UA",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "mobile-375",
      testIgnore: [responsiveMatrixFile, finalAcceptanceFile, motionChoreographyFile],
      use: { viewport: { width: 375, height: 812 } }
    },
    {
      name: "tablet-768",
      testIgnore: [responsiveMatrixFile, finalAcceptanceFile, motionChoreographyFile],
      use: { viewport: { width: 768, height: 1024 } }
    },
    {
      name: "desktop-1024",
      testIgnore: [responsiveMatrixFile, finalAcceptanceFile, motionChoreographyFile],
      use: { viewport: { width: 1024, height: 768 } }
    },
    {
      name: "desktop-1440",
      testIgnore: [responsiveMatrixFile, finalAcceptanceFile, motionChoreographyFile],
      use: { viewport: { width: 1440, height: 1000 } }
    },
    {
      name: "desktop-1980",
      testIgnore: [responsiveMatrixFile, finalAcceptanceFile, motionChoreographyFile],
      use: { viewport: { width: 1980, height: 1200 } }
    },
    {
      name: "responsive-matrix",
      testMatch: responsiveMatrixFile,
      testIgnore: finalAcceptanceFile,
      use: { viewport: { width: 1980, height: 1200 } }
    },
    {
      name: "final-acceptance",
      testMatch: finalAcceptanceFile,
      use: { viewport: { width: 1980, height: 1200 } }
    },
    {
      name: "motion-choreography",
      testMatch: motionChoreographyFile,
      use: { viewport: { width: 1440, height: 1000 } }
    }
  ],
  webServer: {
    command: "bundle exec jekyll serve --no-watch --host 127.0.0.1 --port 4000 --trace",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
