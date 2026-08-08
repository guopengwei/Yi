import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

async function useLocale(page: Page, locale: "zh-HK" | "zh-CN" | "en") {
  await page.addInitScript((value) => localStorage.setItem("yi-locale", value), locale);
}

async function selectLocale(page: Page, locale: "zh-HK" | "zh-CN" | "en") {
  const select = page.locator(".locale-compact select");
  if (!await select.isVisible()) await page.getByRole("button", { name: /Menu|選單|菜单/ }).click();
  await select.selectOption(locale);
}

test("defaults to Hong Kong Traditional Chinese without browser-language inference", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-HK");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("先把問題");
});

test("persists an explicit locale selection", async ({ page }) => {
  await page.goto("/");
  await selectLocale(page, "en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Place the question");
});

test("completes a reviewed three-number cast with HK$0", async ({ page }) => {
  await useLocale(page, "en");
  await page.goto("/");
  await page.getByLabel("Your question").fill("What is one reversible next step?");
  await page.getByRole("button", { name: "Choose a casting method" }).click();
  await page.getByLabel("Upper trigram (1–8)").fill("1");
  await page.getByLabel("Lower trigram (1–8)").fill("8");
  await page.getByLabel("Changing line (1–6)").fill("1");
  await page.getByRole("button", { name: "Review the lines" }).click();
  await expect(page.getByText("Lines are shown bottom to top.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm and choose contribution" }).click();
  await expect(page.getByRole("heading", { name: "Voluntary contribution" }).last()).toBeVisible();
  await page.getByRole("button", { name: "Complete and view result" }).click();
  await expect(page).toHaveURL(/\/reading\/[0-9a-f-]+$/);
  await expect(page.getByText(/Reproducible facts/).first()).toBeVisible();
  await expect(page.getByText("Source catalog under review", { exact: true })).toBeVisible();
});

test("has no serious accessibility violations on the primary landing view", async ({ page }) => {
  await useLocale(page, "en");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (root: Document) => Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe;
    return (await axe.run(document)).violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  });
  expect(violations).toEqual([]);
});

test("keeps public utility routes free of serious accessibility violations", async ({ page }) => {
  await useLocale(page, "en");
  for (const route of ["/help", "/settings", "/auth", "/privacy", "/terms"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(axe.source);
    const ids = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (root: Document) => Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe;
      return (await axe.run(document)).violations.filter((item) => item.impact === "critical" || item.impact === "serious").map((item) => item.id);
    });
    expect(ids, route).toEqual([]);
  }
});

test("matches the responsive landing visual", async ({ page }) => {
  await useLocale(page, "en");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Place the question");
  await page.locator(".hero-visual img").evaluate((image: HTMLImageElement) => image.complete || new Promise((resolve) => image.addEventListener("load", resolve, { once: true })));
  await expect(page).toHaveScreenshot("landing.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
});

test("marks public share documents as non-indexable", async ({ page }) => {
  await page.goto("/share/opaque-token-that-does-not-exist-1234567890");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow,noarchive");
});

test("supports keyboard entry and reduced motion", async ({ page }) => {
  await useLocale(page, "en");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  const motion = await page.locator(".waiting-orbit").count() === 0
    ? await page.locator(".button").first().evaluate((element) => ({
      transition: getComputedStyle(element).transitionDuration,
      scroll: getComputedStyle(document.documentElement).scrollBehavior,
    }))
    : null;
  expect(Number.parseFloat(motion?.transition ?? "1")).toBeLessThanOrEqual(0.00001);
  expect(motion?.scroll).toBe("auto");
});

test("fits all locales without horizontal overflow", async ({ page }, testInfo) => {
  for (const locale of ["zh-HK", "zh-CN", "en"] as const) {
    await page.goto("/");
    await selectLocale(page, locale);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${locale} overflows in ${testInfo.project.name}`).toBeLessThanOrEqual(1);
  }
});
