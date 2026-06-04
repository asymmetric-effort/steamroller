import { test, expect } from "@playwright/test";

test.describe("Steamroller Website - Post-Deployment Verification", () => {
  test("no JavaScript console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("home page loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Steamroller/);
  });

  test("home page has hero section", async ({ page }) => {
    await page.goto("/");
    const heading = page.locator("h1");
    await expect(heading).toHaveText("Steamroller");
  });

  test("navigation links are present", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
    await expect(nav.locator("a", { hasText: "Home" })).toBeVisible();
    await expect(nav.locator("a", { hasText: "Features" })).toBeVisible();
    await expect(nav.locator("a", { hasText: "CLI" })).toBeVisible();
    await expect(nav.locator("a", { hasText: "API" })).toBeVisible();
  });

  test("features page loads via navigation", async ({ page }) => {
    await page.goto("/");
    await page.click('a[href="#/features"]');
    await expect(page.locator("h1")).toHaveText("Features");
  });

  test("CLI page loads via navigation", async ({ page }) => {
    await page.goto("/");
    await page.click('a[href="#/cli"]');
    await expect(page.locator("h1")).toHaveText("CLI Reference");
  });

  test("API page loads via navigation", async ({ page }) => {
    await page.goto("/");
    await page.click('a[href="#/api"]');
    await expect(page.locator("h1")).toHaveText("API Reference");
  });

  test("footer contains version and license", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toContainText("v0.0.0");
    await expect(footer).toContainText("MIT License");
  });

  test("footer has GitHub link", async ({ page }) => {
    await page.goto("/");
    const githubLink = page.locator('footer a[href*="github.com"]');
    await expect(githubLink).toBeVisible();
  });

  test("meta description is set", async ({ page }) => {
    await page.goto("/");
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description).toBeTruthy();
    expect(description).toContain("zero-dependency");
  });

  test("canonical link is set", async ({ page }) => {
    await page.goto("/");
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical).toContain("steamroller.asymmetric-effort.com");
  });

  test("robots.txt is accessible", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("User-agent");
    expect(body).toContain("Sitemap");
  });

  test("sitemap.xml is accessible", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("urlset");
    expect(body).toContain("steamroller.asymmetric-effort.com");
  });

  test("dark mode CSS variables are defined", async ({ page }) => {
    await page.goto("/");
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement)
        .getPropertyValue("--color-bg")
        .trim();
    });
    expect(bgColor).toBeTruthy();
  });

  test("code blocks render correctly", async ({ page }) => {
    await page.goto("/");
    const codeBlock = page.locator("pre code").first();
    await expect(codeBlock).toBeVisible();
  });

  test("hash-based routing works on direct access", async ({ page }) => {
    await page.goto("/#/features");
    await expect(page.locator("h1")).toHaveText("Features");
  });

  test("page updates title on route change", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Steamroller/);
    await page.click('a[href="#/cli"]');
    await expect(page).toHaveTitle(/CLI Reference/);
  });
});
