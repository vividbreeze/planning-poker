import { test, expect, Page, BrowserContext } from "@playwright/test";

// Helper: create a fresh browser context (simulates a new user/browser)
async function newUser(browser: any): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

// Helper: create a room from the homepage and return the admin page + room ID
async function createRoom(
  page: Page,
  name: string
): Promise<{ roomId: string; adminUrl: string }> {
  await page.goto("/");
  await page.fill('input[placeholder="Your name"]', name);
  await page.click('button:has-text("Create Room")');

  // Wait for the admin room page to load
  await page.waitForURL(/\/room\/[A-Z2-9]+\/admin/);
  const url = page.url();
  const match = url.match(/\/room\/([A-Z2-9]+)\/admin/);
  const roomId = match![1];

  // Wait for room to be ready (Planning Poker header visible)
  await page.waitForSelector("text=Planning Poker");

  return { roomId, adminUrl: url };
}

// Helper: join a room as participant
async function joinRoom(page: Page, roomId: string, name: string) {
  await page.goto(`/room/${roomId}`);
  // Should show join form
  await page.waitForSelector('input[placeholder="Your name"]');
  await page.fill('input[placeholder="Your name"]', name);
  await page.click('button:has-text("Join")');
  // Wait for room to load
  await page.waitForSelector("text=Planning Poker");
}

test.describe("Room Creation & Navigation", () => {
  test("admin can create a room from homepage", async ({ browser }) => {
    const { context, page } = await newUser(browser);

    const { roomId } = await createRoom(page, "TestAdmin");

    expect(roomId).toHaveLength(12);
    expect(page.url()).toContain("/admin");

    // Admin should see settings gear
    await expect(page.locator('button[title="Settings"]')).toBeVisible();

    await context.close();
  });

  test("participant can join via room link", async ({ browser }) => {
    const { context: adminCtx, page: adminPage } = await newUser(browser);
    const { roomId } = await createRoom(adminPage, "Admin");

    const { context: playerCtx, page: playerPage } = await newUser(browser);
    await joinRoom(playerPage, roomId, "Player1");

    // Player should NOT see settings gear (not admin)
    await expect(playerPage.locator('button[title="Settings"]')).not.toBeVisible();

    // Admin should see the new participant
    await expect(adminPage.locator("text=Player1")).toBeVisible();

    await adminCtx.close();
    await playerCtx.close();
  });

  test("participant link auto-creates room if it doesn't exist", async ({ browser }) => {
    const { context, page } = await newUser(browser);

    // Go to a room that doesn't exist yet
    await page.goto("/room/AAABBBCCCDDD");
    await page.waitForSelector('input[placeholder="Your name"]');
    await page.fill('input[placeholder="Your name"]', "EarlyBird");
    await page.click('button:has-text("Join")');

    // Should load the room
    await page.waitForSelector("text=Planning Poker");

    await context.close();
  });
});

test.describe("Voting Flow", () => {
  test("vote → reveal → new round cycle", async ({ browser }) => {
    const { context: adminCtx, page: adminPage } = await newUser(browser);
    const { roomId } = await createRoom(adminPage, "Admin");

    const { context: p1Ctx, page: p1Page } = await newUser(browser);
    await joinRoom(p1Page, roomId, "Player1");

    // Admin votes 5
    await adminPage.click('button:has-text("5")');
    await expect(adminPage.locator("text=Your vote: 5")).toBeVisible();

    // Player votes 8
    await p1Page.click('button:has-text("8")');
    await expect(p1Page.locator("text=Your vote: 8")).toBeVisible();

    // Both should show green vote indicators
    // Admin reveals
    await adminPage.click('button:has-text("Reveal Cards")');

    // Both should see the revealed vote values in participant avatars
    // Use more specific selectors to avoid matching timer "00:15" etc.
    await expect(adminPage.locator("text=Average:")).toBeVisible();
    await expect(p1Page.locator("text=Average:")).toBeVisible();

    // New round
    await adminPage.click('button:has-text("New Round")');

    // Votes should be cleared - "Your vote:" text should disappear
    await expect(adminPage.locator("text=Your vote:")).not.toBeVisible();
    await expect(p1Page.locator("text=Your vote:")).not.toBeVisible();

    await adminCtx.close();
    await p1Ctx.close();
  });

  test("vote toggle - click selected card to deselect", async ({ browser }) => {
    const { context, page } = await newUser(browser);
    const { roomId } = await createRoom(page, "Admin");

    // Vote 3
    await page.click('button:has-text("3")');
    await expect(page.locator("text=Your vote: 3")).toBeVisible();

    // Click 3 again to deselect
    await page.click('button:has-text("3")');
    await expect(page.locator("text=Your vote:")).not.toBeVisible();

    await context.close();
  });
});

test.describe("Admin Permissions", () => {
  test("only admin sees settings gear and admin controls", async ({ browser }) => {
    const { context: adminCtx, page: adminPage } = await newUser(browser);
    const { roomId } = await createRoom(adminPage, "Admin");

    const { context: playerCtx, page: playerPage } = await newUser(browser);
    await joinRoom(playerPage, roomId, "Player");

    // Admin sees settings gear
    await expect(adminPage.locator('button[title="Settings"]')).toBeVisible();

    // Player does NOT see settings gear
    await expect(playerPage.locator('button[title="Settings"]')).not.toBeVisible();

    await adminCtx.close();
    await playerCtx.close();
  });

  test("admin link for occupied room creates new room with notice", async ({ browser }) => {
    const { context: admin1Ctx, page: admin1Page } = await newUser(browser);
    const { roomId } = await createRoom(admin1Page, "Admin1");

    // Second admin tries to claim the same room
    const { context: admin2Ctx, page: admin2Page } = await newUser(browser);
    await admin2Page.goto(`/room/${roomId}/admin`);

    // Should ask for name
    await admin2Page.waitForSelector('input[placeholder="Your name"]');
    await admin2Page.fill('input[placeholder="Your name"]', "Admin2");
    await admin2Page.click('button:has-text("Join")');

    // Should get redirected to a new room
    await admin2Page.waitForSelector("text=Planning Poker");

    // URL should have a DIFFERENT room ID
    const newUrl = admin2Page.url();
    const newMatch = newUrl.match(/\/room\/([A-Z2-9]+)\/admin/);
    expect(newMatch).toBeTruthy();
    expect(newMatch![1]).not.toBe(roomId);

    // Should see the redirect notice
    await expect(admin2Page.locator("text=Room was already taken")).toBeVisible();

    await admin1Ctx.close();
    await admin2Ctx.close();
  });
});

test.describe("Timer", () => {
  test("admin can start and reset timer", async ({ browser }) => {
    const { context, page } = await newUser(browser);
    await createRoom(page, "Admin");

    // Timer should be visible with default 15s (00:15)
    // Use a specific locator for the timer display (inside the timer component)
    const timerDisplay = page.locator("span.font-mono");
    await expect(timerDisplay.first()).toHaveText("00:15");

    // Start timer
    await page.click('button:has-text("Start")');

    // Timer should start counting down
    await page.waitForTimeout(1500);
    // Should show less than 15 now
    const timerText = await timerDisplay.first().textContent();
    expect(timerText).not.toBe("00:15");

    // Reset timer
    await page.click('button:has-text("Reset")');
    await expect(timerDisplay.first()).toHaveText("00:15");

    await context.close();
  });
});

test.describe("Multi-User Scenarios", () => {
  test("3 participants vote simultaneously", async ({ browser }) => {
    const { context: adminCtx, page: adminPage } = await newUser(browser);
    const { roomId } = await createRoom(adminPage, "Admin");

    const { context: p1Ctx, page: p1Page } = await newUser(browser);
    const { context: p2Ctx, page: p2Page } = await newUser(browser);

    await joinRoom(p1Page, roomId, "Alice");
    await joinRoom(p2Page, roomId, "Bob");

    // All three vote simultaneously
    await Promise.all([
      adminPage.click('button:has-text("5")'),
      p1Page.click('button:has-text("8")'),
      p2Page.click('button:has-text("3")'),
    ]);

    // Wait for votes to propagate
    await adminPage.waitForTimeout(500);

    // Reveal
    await adminPage.click('button:has-text("Reveal Cards")');

    // All should see all votes
    for (const page of [adminPage, p1Page, p2Page]) {
      await expect(page.locator("text=Average:")).toBeVisible();
    }

    await adminCtx.close();
    await p1Ctx.close();
    await p2Ctx.close();
  });

  test("clear all participants removes everyone except admin", async ({ browser }) => {
    const { context: adminCtx, page: adminPage } = await newUser(browser);
    const { roomId } = await createRoom(adminPage, "Admin");

    const { context: p1Ctx, page: p1Page } = await newUser(browser);
    await joinRoom(p1Page, roomId, "Player1");

    // Admin should see player
    await expect(adminPage.locator("text=Player1")).toBeVisible();

    // Click clear all participants button
    await adminPage.click('button[title="Remove all participants"]');

    // Player should disappear from admin view
    await expect(adminPage.locator("text=Player1")).not.toBeVisible();

    await adminCtx.close();
    await p1Ctx.close();
  });
});

test.describe("Feedback", () => {
  test("feedback link is visible", async ({ browser }) => {
    const { context, page } = await newUser(browser);
    await createRoom(page, "Admin");

    // Feedback link should be visible at the bottom
    await expect(page.locator('a:has-text("Feedback")')).toBeVisible();

    // Check it has the correct mailto href
    const href = await page.locator('a:has-text("Feedback")').getAttribute("href");
    expect(href).toContain("mailto:feedback-planningpoker@vividbreeze.com");

    await context.close();
  });
});
