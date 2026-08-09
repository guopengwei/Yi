import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { deriveReadingFacts } from "../shared/casting";

async function useLocale(page: Page, locale: "zh-HK" | "zh-CN" | "en") {
  await page.addInitScript((value) => localStorage.setItem("yi-locale", value), locale);
}

async function selectLocale(page: Page, locale: "zh-HK" | "zh-CN" | "en") {
  const desktopSelect = page.locator(".locale-compact select");
  if (await desktopSelect.isVisible()) { await desktopSelect.selectOption(locale); return; }
  await page.getByRole("button", { name: /More|更多/ }).click();
  await page.locator(".sheet-locale select").selectOption(locale);
}

async function beginCast(page: Page) {
  await page.getByRole("button", { name: /Begin a reading|開始起卦|开始起卦/ }).click();
}

async function mockSignedIn(page: Page) {
  await page.route("**/api/auth/get-session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: { id: "reader-1", name: "Reader", email: "reader@example.test", emailVerified: true },
      session: { id: "session-1" },
    }),
  }));
  await page.route("**/api/v1/account/claim-guest", (route) => route.fulfill({ status: 204 }));
}

function sampleFacts() {
  return deriveReadingFacts({
    schemaVersion: "reading-create@1",
    clientRequestId: "c40d968d-91e8-4f9b-b50f-6e194f2b1341",
    castingMethod: "three-number@1",
    inputs: { upperTrigram: 1, lowerTrigram: 8, changingPosition: 1 },
    question: { kind: "question", text: "What is one reversible next step?" },
    timezone: "Asia/Hong_Kong",
  });
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

test("changes language immediately from the settings page", async ({ page }) => {
  await useLocale(page, "en");
  await page.goto("/settings");

  await page.getByRole("radio", { name: "简体中文" }).check();

  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("yi-locale"))).toBe("zh-CN");
});

test("serves region-correct Chinese fonts from Yi's own origin", async ({ page }) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") fontRequests.push(request.url());
  });

  await useLocale(page, "zh-HK");
  await page.goto("/");
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 16px "Noto Sans HK Variable"', "設定與閱讀"),
      document.fonts.load('500 32px "Noto Serif HK Variable"', "先把問題放在光裡"),
    ]);
  });
  await expect(page.locator("html")).toHaveCSS("font-family", /Noto Sans HK Variable/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /Noto Serif HK Variable/);

  await selectLocale(page, "zh-CN");
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 16px "Noto Sans SC Variable"', "设置与阅读"),
      document.fonts.load('500 32px "Noto Serif SC Variable"', "先把问题放在光里"),
    ]);
  });
  await expect(page.locator("html")).toHaveCSS("font-family", /Noto Sans SC Variable/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /Noto Serif SC Variable/);

  const appOrigin = new URL(page.url()).origin;
  expect(fontRequests.length).toBeGreaterThan(0);
  expect(fontRequests.every((url) => new URL(url).origin === appOrigin)).toBe(true);
  expect(fontRequests.some((url) => url.includes("/assets/fonts/noto-sans-hk-5.3.0/"))).toBe(true);
  expect(fontRequests.some((url) => url.includes("/assets/fonts/noto-serif-hk-5.3.0/"))).toBe(true);
  expect(fontRequests.some((url) => url.includes("/assets/fonts/noto-sans-sc-5.3.0/"))).toBe(true);
  expect(fontRequests.some((url) => url.includes("/assets/fonts/noto-serif-sc-5.3.0/"))).toBe(true);
});

test("completes a reviewed three-number cast with HK$0", async ({ page }) => {
  await useLocale(page, "en");
  await page.goto("/");
  await beginCast(page);
  await page.getByLabel("Your question").fill("What is one reversible next step?");
  await page.getByRole("button", { name: "Enter casting numbers" }).click();
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
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, document.documentElement.scrollHeight);
    document.documentElement.style.removeProperty("scroll-behavior");
  });
  await page.getByRole("button", { name: "Complete and view result" }).click();
  await expect(page).toHaveURL(/\/reading\/[0-9a-f-]+$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByText(/Reproducible facts/).first()).toBeVisible();
  await expect(page.getByText("Source catalog under review", { exact: true })).toBeVisible();
});

test("explains why three-number casting is used", async ({ page }) => {
  await useLocale(page, "en");
  await page.goto("/");
  await beginCast(page);
  await page.getByLabel("Your question").fill("How should I understand the methods?");
  await page.getByRole("button", { name: "Enter casting numbers" }).click();

  await page.getByText("How does this method work?").click();
  await expect(page.getByText("This method always has exactly one changing line.")).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByText("Three coins", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Secure random", { exact: true })).toHaveCount(0);
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

test("shows the mapped Takashima interpretation without requesting AI", async ({ page }) => {
  await useLocale(page, "en");
  const readingId = "f34ed3f8-90d9-4e0f-996b-d649db367f2e";
  const facts = { ...sampleFacts(), sourceStatus: "reviewed", systemStatus: "source-grounded-enabled" };
  let reflectionRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith(`/api/v1/readings/${readingId}/reflection`)) reflectionRequests += 1;
  });
  await page.route(`**/api/v1/readings/${readingId}`, (route) => {
    const locale = (route.request().headers()["x-yi-locale"] ?? "zh-HK") as "zh-HK" | "zh-CN" | "en";
    const localized = {
      "zh-HK": {
        text: "初九：拔茅茹，以其彙，貞吉亨。\n#### 爻辭的多重解讀\n* 經營：共同志向可以聚合人才與資源。",
        title: "《高島易斷》經審核目錄",
        locator: "否卦／初九",
      },
      "zh-CN": {
        text: "初九：拔茅茹，以其汇，贞吉亨。\n#### 爻辞的多重解读\n* 经营：共同志向可以聚合人才与资源。",
        title: "《高岛易断》经审核目录",
        locator: "否卦／初九",
      },
      en: {
        text: "Initial Nine: pull up the joined grass roots; advancing is auspicious.\n#### Multiple interpretations of the line\n* Business: Shared purpose can draw people and resources together.",
        title: "Takashima Ekidan — reviewed catalog",
        locator: "Pi / Initial Nine",
      },
    }[locale];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
      id: readingId,
      status: "ready",
      contributionAmountHkd: 0,
      createdAt: "2026-08-08T00:00:00.000Z",
      facts,
      takashimaInterpretations: [{
        id: `takashima-test:${locale}:line:kw-12:1`,
        entryKey: `line:${facts.primary.id}:1`,
        text: localized.text,
        provenance: { title: localized.title, locator: localized.locator },
      }],
      reflection: null,
      reflectionShareEligible: false,
      safety: { routed: false, limitations: [] },
    }),
    });
  });

  await page.goto(`/reading/${readingId}`);
  await expect(page.getByRole("heading", { name: "Takashima’s interpretation" })).toBeVisible();
  await expect(page.getByText("Displaying it does not call an AI model.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Multiple interpretations of the line" })).toBeVisible();
  await expect(page.getByRole("listitem")).toContainText("Shared purpose can draw people and resources together.");
  await expect(page.getByText(/Takashima Ekidan — reviewed catalog · Pi \/ Initial Nine/)).toBeVisible();
  await selectLocale(page, "zh-CN");
  await expect(page.getByRole("heading", { name: "《高岛易断》解读" })).toBeVisible();
  await expect(page.getByText("初九：拔茅茹，以其汇，贞吉亨。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "爻辞的多重解读" })).toBeVisible();
  expect(reflectionRequests).toBe(0);
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
  await mockSignedIn(page);
  let chatSockets = 0;
  await page.routeWebSocket("**/api/v1/chats/**", (socket) => {
    chatSockets += 1;
    socket.send(JSON.stringify({ type: "resume", messages: [] }));
  });

  await page.goto("/chat/8933228a-76d5-49dc-824e-595d2c92bef3");

  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  expect(chatSockets).toBeGreaterThan(0);
});

test("starts follow-up chat with the AI consent already stored for the reading", async ({ page }) => {
  await useLocale(page, "en");
  await mockSignedIn(page);
  const readingId = "8933228a-76d5-49dc-824e-595d2c92bef3";
  const facts = sampleFacts();
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
      aiConsentScope: {
        includeReadingFacts: true,
        includeQuestion: true,
        includeSourceMaterial: true,
      },
      reflectionShareEligible: false,
      safety: { routed: false, limitations: [] },
    }),
  }));
  let chatRequest: Record<string, unknown> | null = null;
  await page.route("**/api/v1/chats", async (route) => {
    chatRequest = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: "7d3be0dd-3a28-447a-9a41-171b1ba1f514", archiveId: "5f52ba30-d4c2-4e43-8d18-4bad534ee394" }),
    });
  });

  await page.goto(`/reading/${readingId}`);
  await page.getByRole("button", { name: "Discuss this reading" }).click();

  await expect.poll(() => chatRequest).toEqual({
    readingId,
    consent: true,
    includeReadingFacts: true,
    includeQuestion: true,
    includeSourceMaterial: true,
  });
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("asks for AI consent with one checkbox", async ({ page }) => {
  await useLocale(page, "en");
  await mockSignedIn(page);
  const readingId = "1b72c194-cb72-4a45-863f-544a9a862e8f";
  await page.route(`**/api/v1/readings/${readingId}`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: readingId,
      status: "ready",
      contributionAmountHkd: 0,
      createdAt: "2026-08-08T00:00:00.000Z",
      facts: sampleFacts(),
      reflection: null,
      aiConsentScope: null,
      reflectionShareEligible: false,
      safety: { routed: false, limitations: [] },
    }),
  }));

  await page.goto(`/reading/${readingId}`);
  await page.getByRole("button", { name: "Choose whether to add AI interpretation" }).click();

  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "I agree to use this data with DeepSeek for this reading and its follow-up chat" })).toBeVisible();
  await expect(page.getByText("Data sent to DeepSeek:")).toBeVisible();
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

test("fits 320px through 760px, landscape, large text, and dark system mode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile responsive matrix");
  await useLocale(page, "en");
  await page.addInitScript(() => {
    localStorage.setItem("yi-font-size", "large");
    localStorage.setItem("yi-theme", "system");
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 760, height: 430 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, colorScheme: getComputedStyle(document.documentElement).colorScheme }));
    expect(layout.overflow, `${viewport.width}×${viewport.height}`).toBeLessThanOrEqual(1);
    expect(layout.colorScheme).toBe("dark");
  }
});

test("routes through the mobile bottom bar and traps focus in the More sheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile shell behavior");
  await useLocale(page, "en");
  await page.goto("/");
  const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: "Cast" })).toHaveAttribute("aria-current", "page");
  await mobileNav.getByRole("link", { name: "Help" }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(mobileNav.getByRole("link", { name: "Help" })).toHaveAttribute("aria-current", "page");

  const more = page.getByRole("button", { name: "More" });
  await more.click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(sheet.getByRole("link", { name: /Terms/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(more).toBeFocused();
});

test("enters, exits, and resumes the four-step mobile casting flow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile casting behavior");
  await useLocale(page, "en");
  await page.goto("/");
  await beginCast(page);
  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeHidden();
  await page.getByLabel("Your question").fill("What deserves a smaller next step?");
  await page.getByRole("button", { name: "Enter casting numbers" }).click();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
  await page.getByRole("button", { name: "Exit casting" }).click();
  await expect(page.getByRole("heading", { name: /Place the question/ })).toBeVisible();
  await page.getByRole("button", { name: "Resume current cast" }).click();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
  await page.getByRole("button", { name: "Review the lines" }).click();
  await expect(page.getByLabel("Upper trigram (1-8)")).toBeFocused();
  await page.getByLabel("Upper trigram (1-8)").fill("1");
  await page.getByLabel("Lower trigram (1-8)").fill("8");
  await page.getByLabel("Changing line (1-6)").fill("1");
  await page.getByRole("button", { name: "Review the lines" }).click();
  await expect(page.getByText("Step 3 of 4")).toBeVisible();
  await page.getByRole("button", { name: "Confirm and choose contribution" }).click();
  await expect(page.getByText("Step 4 of 4")).toBeVisible();
});

test("searches history and saves an archive note on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile archive behavior");
  await useLocale(page, "en");
  await mockSignedIn(page);
  const archiveId = "archive-1";
  const facts = sampleFacts();
  let notes: Array<{ id: string; body: string; createdAt: string; updatedAt: string }> = [];
  const archive = { id: archiveId, title: null, question: "What is one reversible next step?", facts, reflection: null, reflectionShareEligible: false, notes };
  await page.route("**/api/v1/history/search**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) }));
  await page.route("**/api/v1/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ ...archive, createdAt: "2026-08-08T00:00:00.000Z" }] }) }));
  await page.route(`**/api/v1/history/${archiveId}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...archive, notes }) }));
  await page.route(`**/api/v1/history/${archiveId}/notes`, async (route) => {
    const body = route.request().postDataJSON() as { body: string };
    notes = [{ id: "note-1", body: body.body, createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z" }];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "note-1" }) });
  });
  await page.goto("/history");
  await expect(page.getByRole("link", { name: /What is one reversible next step/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Search reading history" }).fill("missing");
  await page.getByRole("textbox", { name: "Search reading history" }).press("Enter");
  await expect(page.getByRole("heading", { name: "No readings match that search." })).toBeVisible();
  await page.goto(`/history/${archiveId}`);
  await page.getByPlaceholder("Add a note").fill("Notice what can be reversed within one week.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Notice what can be reversed within one week.")).toBeVisible();
});

test("keeps multiline chat composition keyboard-friendly", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile chat behavior");
  await useLocale(page, "en");
  await mockSignedIn(page);
  const sent: string[] = [];
  await page.routeWebSocket("**/api/v1/chats/**", (socket) => {
    socket.send(JSON.stringify({ type: "resume", messages: [] }));
    socket.onMessage((message) => sent.push(String(message)));
  });
  await page.goto("/chat/chat-1");
  const input = page.getByLabel("Write what you want to untangle…");
  await input.fill("First line");
  await input.press("Shift+Enter");
  await input.type("Second line");
  await expect(input).toHaveValue("First line\nSecond line");
  await input.press("Enter");
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(JSON.parse(sent[0] ?? "{}").content).toBe("First line\nSecond line");
});

test("shows delivery and response status after sending a chat message", async ({ page }) => {
  await useLocale(page, "en");
  await mockSignedIn(page);
  let replyFromServer: ((payload: Record<string, unknown>) => void) | undefined;
  let sentMessage: { id: string; content: string } | undefined;
  await page.routeWebSocket("**/api/v1/chats/**", (socket) => {
    replyFromServer = (payload) => socket.send(JSON.stringify(payload));
    socket.send(JSON.stringify({ type: "resume", messages: [] }));
    socket.onMessage((message) => {
      sentMessage = JSON.parse(String(message)) as { id: string; content: string };
    });
  });

  await page.goto("/chat/chat-status");
  const input = page.getByLabel("Write what you want to untangle…");
  await input.fill("What should I notice before deciding?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("What should I notice before deciding?")).toBeVisible();
  await expect(page.getByText("Sending…")).toBeVisible();
  await expect(input).toBeDisabled();
  await expect.poll(() => sentMessage?.content).toBe("What should I notice before deciding?");

  replyFromServer?.({
    type: "ack",
    message: { seq: 1, id: sentMessage?.id, role: "user", content: sentMessage?.content, createdAt: "2026-08-10T00:00:00.000Z" },
  });
  await expect(page.locator(".chat-delivery-status")).toContainText("Sent");
  await expect(page.getByText("Yi is considering your question…")).toBeVisible();

  replyFromServer?.({ type: "stream-start", seq: 2 });
  replyFromServer?.({ type: "stream-delta", seq: 2, delta: "Begin with what remains reversible." });
  replyFromServer?.({
    type: "stream-end",
    message: { seq: 2, id: "assistant-1", role: "assistant", content: "Begin with what remains reversible.", createdAt: "2026-08-10T00:00:01.000Z" },
  });
  await expect(page.getByText("Begin with what remains reversible.")).toBeVisible();
  await expect(input).toBeEnabled();
});

test("captures mobile casting method and review visuals", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile visual coverage");
  await useLocale(page, "en");
  await page.goto("/");
  await beginCast(page);
  await page.getByLabel("Your question").fill("What is one reversible next step?");
  await page.getByRole("button", { name: "Enter casting numbers" }).click();
  await expect(page.locator(".method-lede")).toBeVisible();
  await expect(page.locator(".method-lede")).toContainText("Enter upper and lower trigrams");
  await expect(page).toHaveScreenshot("mobile-casting-method.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
  await page.getByLabel("Upper trigram (1-8)").fill("1");
  await page.getByLabel("Lower trigram (1-8)").fill("8");
  await page.getByLabel("Changing line (1-6)").fill("1");
  await page.getByRole("button", { name: "Review the lines" }).click();
  await expect(page).toHaveScreenshot("mobile-casting-review.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
});

test("captures the mobile ready-result visual", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile visual coverage");
  await useLocale(page, "en");
  await mockSignedIn(page);
  const facts = sampleFacts();
  const readingId = "8933228a-76d5-49dc-824e-595d2c92bef3";
  await page.route(`**/api/v1/readings/${readingId}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: readingId, status: "ready", contributionAmountHkd: 0, createdAt: "2026-08-08T00:00:00.000Z", facts, reflection: null, reflectionShareEligible: false, safety: { routed: false, limitations: [] } }) }));
  await page.goto(`/reading/${readingId}`);
  await expect(page.getByText("Reproducible facts").first()).toBeVisible();
  await expect(page).toHaveScreenshot("mobile-ready-result.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
});

test("captures the mobile history visual", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile visual coverage");
  await useLocale(page, "en");
  await mockSignedIn(page);
  const facts = sampleFacts();
  await page.route("**/api/v1/history", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: "archive-1", title: null, question: "What is one reversible next step?", facts, createdAt: "2026-08-08T00:00:00.000Z" }] }) }));
  await page.goto("/history");
  await expect(page.locator(".history-card")).toBeVisible();
  await expect(page.locator(".history-page")).toHaveScreenshot("mobile-history.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
});

test("captures the mobile chat visual", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile visual coverage");
  await useLocale(page, "en");
  await mockSignedIn(page);
  await page.routeWebSocket("**/api/v1/chats/**", (socket) => socket.send(JSON.stringify({ type: "resume", messages: [{ seq: 1, id: "m1", role: "assistant", content: "Begin with the part that can be changed without closing off other options.", createdAt: "2026-08-09T00:00:00.000Z" }] })));
  await page.goto("/chat/chat-visual");
  await expect(page.locator(".chat-message")).toBeVisible();
  await expect(page.locator(".chat-page")).toHaveScreenshot("mobile-chat.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
});
