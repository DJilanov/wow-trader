import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { URL } from "node:url";
import process from "node:process";
import { DUNGEON_RELEASE } from "../packages/leveling/dist/index.js";

const packagePath = process.argv
  .find((argument) => argument.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath));
const { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3311");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password
)
  throw new Error("Use a local preview, never production.");

const output = await mkdtemp(join(tmpdir(), "wow-trader-guaranteed-bundles-"));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", (route) =>
    ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(30000);
  const response = await page.goto(
    new URL("/tools/forever/leveling/premade?race=human&class=warrior", base).href,
    { waitUntil: "networkidle", timeout: 90000 },
  );
  assert.equal(response?.status(), 200);
  await page.getByRole("button", { name: "Start guide", exact: true }).click();
  const savedMembers = () =>
    page.evaluate((release) => {
      const workspace = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1"));
      return workspace.sessions.find((session) => session.id === workspace.activeId).dungeonPlans[
        release
      ].premade.members;
    }, DUNGEON_RELEASE);
  const before = await savedMembers();
  const panel = page.getByText("Optional new dungeons · include, skip or adjust quest slots", {
    exact: true,
  });
  await panel.click();
  const bundle = page.locator('section[aria-label="The Drowned City guaranteed quest bundle"]');
  await expect(bundle).toBeVisible();
  await expect(bundle.getByRole("checkbox")).toHaveCount(5);
  await expect(
    bundle.getByText("40,400 planning quest XP / player", { exact: false }),
  ).toBeVisible();
  await bundle.getByLabel("The Drowned City planning quest level").fill("33");
  await bundle.getByRole("button", { name: "Update planning level" }).click();
  await expect(
    bundle.getByText("37,600 planning quest XP / player", { exact: false }),
  ).toBeVisible();
  await bundle.getByRole("checkbox").nth(2).uncheck();
  await expect(
    bundle.getByText("28,200 planning quest XP / player", { exact: false }),
  ).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await panel.click();
  await expect(bundle.getByLabel("The Drowned City planning quest level")).toHaveValue("33");
  await expect(bundle.getByRole("checkbox").nth(2)).not.toBeChecked();
  await bundle.getByRole("checkbox").first().uncheck();
  await expect(bundle.getByText("0 planning quest XP / player", { exact: false })).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await panel.click();
  await expect(bundle.getByRole("checkbox").first()).not.toBeChecked();
  await bundle.getByRole("checkbox").first().check();
  await expect(
    bundle.getByText("28,200 planning quest XP / player", { exact: false }),
  ).toBeVisible();
  assert.deepEqual(await savedMembers(), before, "Planning controls changed actual member state.");
  await bundle.getByRole("heading").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const pane = await page.locator("#leveling-quest-pane").boundingBox();
  const navigation = await page.getByRole("group", { name: "Step navigation" }).boundingBox();
  assert.ok(pane && navigation && pane.height > 100);
  assert.ok(pane.y + pane.height <= navigation.y + 1, "Quest controls overlap mobile navigation.");
  await bundle.getByLabel("The Drowned City planning quest level").fill("34");
  await bundle.getByRole("button", { name: "Update planning level" }).click();
  await expect(
    bundle.getByText("28,800 planning quest XP / player", { exact: false }),
  ).toBeVisible();
  await bundle.getByLabel("The Drowned City planning quest level").fill("33");
  await bundle.getByRole("button", { name: "Update planning level" }).click();
  await expect(
    bundle.getByText("28,200 planning quest XP / player", { exact: false }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth,
    ),
    false,
    "Guaranteed bundle controls overflow on mobile.",
  );
  assert.deepEqual(
    await savedMembers(),
    before,
    "Mobile planning controls changed actual member state.",
  );
  await bundle.getByRole("heading").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog");
  await settings.getByLabel("Player 2 race", { exact: true }).selectOption("gnome");
  await settings.getByLabel("Player 2 class", { exact: true }).selectOption("mage");
  await settings.getByLabel("Player 2 race", { exact: true }).selectOption("dwarf");
  await expect(settings.getByLabel("Player 2 class", { exact: true })).toHaveValue("");
  await settings.getByLabel("Player 2 race", { exact: true }).selectOption("gnome");
  await settings.getByLabel("Player 2 class", { exact: true }).selectOption("priest");
  await settings.getByRole("button", { name: "Close settings", exact: true }).click();
  const identities = await savedMembers();
  assert.equal(identities[1].raceId, "gnome");
  assert.equal(identities[1].classSlug, "priest");
  const actualState = (members) =>
    members.map((member) => {
      const state = { ...member };
      delete state.raceId;
      delete state.classSlug;
      return state;
    });
  assert.deepEqual(
    actualState(identities),
    actualState(before),
    "Identity settings changed XP or quest state.",
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(settings.getByLabel("Player 2 race", { exact: true })).toHaveValue("gnome");
  await expect(settings.getByLabel("Player 2 class", { exact: true })).toHaveValue("priest");
  await settings.getByLabel("Player 2 race", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "party-identity-mobile.png"), fullPage: true });
  assert.equal(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth,
    ),
    false,
  );
  await settings.getByRole("button", { name: "Close settings", exact: true }).click();
  assert.deepEqual(errors, []);
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mobileContext.route("**/*", (route) =>
    ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
  );
  const mobilePage = await mobileContext.newPage();
  mobilePage.on("pageerror", (error) => errors.push(error.message));
  await mobilePage.goto(
    new URL("/tools/forever/leveling/premade?race=human&class=warrior", base).href,
    { waitUntil: "networkidle", timeout: 90000 },
  );
  await mobilePage.getByRole("button", { name: "Start guide", exact: true }).click();
  assert.ok(
    await mobilePage.evaluate(() => globalThis.localStorage.getItem("kfc-leveling:characters:v1")),
  );
  assert.deepEqual(errors, []);
  await mobileContext.close();
  process.stdout.write(
    `${JSON.stringify({ status: "passed", checks: ["four defaults", "level override", "slot skip", "reload persistence", "dungeon exclusion", "restore", "no earned XP mutation", "mobile controls and first-run save"], widths: [1440, 390], output })}\n`,
  );
} finally {
  await browser.close();
}
