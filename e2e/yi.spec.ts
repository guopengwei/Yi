import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { deriveReadingFacts } from "../shared/casting";

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
  await page.getByLabel("Upper trigram (1-8)").fill("1");
  await page.getByLabel("Lower trigram (1-8)").fill("8");
  await expect(page.getByText("Qian · Heaven")).toBeVisible();
  await expect(page.getByText("Kun · Earth")).toBeVisible();
  await page.getByLabel("Upper trigram (1-8)").fill("3");
  await expect(page.getByText("Li · Fire")).toBeVisible();
  await expect(page.getByText("Qian · Heaven")).toHaveCount(0);
  await page.getByLabel("Upper trigram (1-8)").fill("1");
  await page.getByLabel("Changing line (1-6)").fill("1");
  await page.getByRole("button", { name: "Review the lines" }).click();
  await expect(page.getByText("Lines are shown bottom to top.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm and choose contribution" }).click();
  await expect(page.getByRole("heading", { name: "Voluntary contribution" }).last()).toBeVisible();
  await page.getByRole("button", { name: "Complete and view result" }).click();
  await expect(page).toHaveURL(/\/reading\/[0-9a-f-]+$/);
  await expect(page.getByText(/Reproducible facts/).first()).toBeVisible();
  await expect(page.getByText("Source catalog under review", { exact: true })).toBeVisible();
});

test("expands explanations for all three casting methods", async ({ page }) => {
  await useLocale(page, "en");
  await page.goto("/");
  await page.getByLabel("Your question").fill("How should I understand the methods?");
  await page.getByRole("button", { name: "Choose a casting method" }).click();

  await page.getByText("How does this method work?").click();
  await expect(page.getByText("This method always has exactly one changing line.")).toBeVisible();

  await page.getByRole("tab", { name: "Three coins" }).click();
  await expect(page.getByText("A total of 6 is changing yin")).toBeVisible();

  await page.getByRole("tab", { name: "Secure random" }).click();
  await expect(page.getByText("White lines are stable; orange lines are changing.")).toBeVisible();
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

test("introduces Kaemon Takashima on the About and help page", async ({ page }) => {
  await useLocale(page, "en");
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Kaemon Takashima" })).toBeVisible();
  await expect(page.getByText("Kaemon Takashima (1832–1914)")).toBeVisible();
  await expect(page.getByRole("link", { name: /Read the Japanese Wikipedia article/ })).toHaveAttribute("href", "https://ja.wikipedia.org/wiki/%E9%AB%98%E5%B3%B6%E5%98%89%E5%8F%B3%E8%A1%9B%E9%96%80");
});

test("completes the password-reset landing flow and hides unavailable social providers", async ({ page }) => {
  await useLocale(page, "en");
  let resetBody: { newPassword?: string; token?: string } | undefined;
  await page.route("**/api/auth/reset-password", async (route) => {
    resetBody = route.request().postDataJSON() as { newPassword?: string; token?: string };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: true }) });
  });
  await page.goto("/auth?token=reset-token-for-browser-acceptance");
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
  await page.getByLabel("Password (10+ characters)").fill("replacement-passphrase");
  await page.getByLabel("Confirm new password").fill("replacement-passphrase");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  expect(resetBody).toEqual({ newPassword: "replacement-passphrase", token: "reset-token-for-browser-acceptance" });
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue with Microsoft" })).toHaveCount(0);
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

test("redirects signed-out chat visitors before opening a socket", async ({ page }) => {
  await useLocale(page, "en");
  await page.route("**/api/auth/get-session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "null",
  }));
  const socketUrls: string[] = [];
  page.on("websocket", (socket) => {
    if (socket.url().includes("/api/v1/chats/")) socketUrls.push(socket.url());
  });

  await page.goto("/chat/8933228a-76d5-49dc-824e-595d2c92bef3");

  await expect(page).toHaveURL(/\/auth$/);
  expect(socketUrls).toEqual([]);
});

test("opens the chat socket after an authenticated session loads", async ({ page }) => {
  await useLocale(page, "en");
  await page.route("**/api/auth/get-session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: { id: "reader-1", name: "Reader", email: "reader@example.test", emailVerified: true },
      session: { id: "session-1" },
    }),
  }));
  await page.route("**/api/v1/account/claim-guest", (route) => route.fulfill({ status: 204 }));
  let chatSockets = 0;
  await page.routeWebSocket("**/api/v1/chats/**", (socket) => {
    chatSockets += 1;
    socket.send(JSON.stringify({ type: "resume", messages: [] }));
  });

  await page.goto("/chat/8933228a-76d5-49dc-824e-595d2c92bef3");

  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  expect(chatSockets).toBeGreaterThan(0);
});

test("reuses reading-facts consent when discussing a reflected reading", async ({ page }) => {
  await useLocale(page, "en");
  await page.route("**/api/auth/get-session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: { id: "reader-1", name: "Reader", email: "reader@example.test", emailVerified: true },
      session: { id: "session-1" },
    }),
  }));
  await page.route("**/api/v1/account/claim-guest", (route) => route.fulfill({ status: 204 }));
  const readingId = "8933228a-76d5-49dc-824e-595d2c92bef3";
  const facts = deriveReadingFacts({
    schemaVersion: "reading-create@1",
    clientRequestId: "c40d968d-91e8-4f9b-b50f-6e194f2b1341",
    castingMethod: "three-number@1",
    inputs: { upperTrigram: 1, lowerTrigram: 8, changingPosition: 1 },
    question: { kind: "question", text: "What is one reversible next step?" },
    timezone: "Asia/Hong_Kong",
  });
  await page.route(`**/api/v1/readings/${readingId}`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: readingId,
      status: "ready",
      contributionAmountHkd: 0,
      createdAt: "2026-08-08T00:00:00.000Z",
      facts,
      reflection: {
        summary: "A reflected summary",
        perspective: "A reflected perspective",
        questionsToConsider: [],
        cautions: [],
      },
      reflectionShareEligible: true,
      safety: { routed: false, limitations: [] },
    }),
  }));

  await page.goto(`/reading/${readingId}`);
  await page.getByRole("button", { name: "Discuss this reading" }).click();

  await expect(page.getByRole("checkbox", { name: "I consent to sending this reading’s facts to DeepSeek" })).toBeChecked();
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
