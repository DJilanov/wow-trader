import assert from "node:assert/strict";
import process from "node:process";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { URL } from "node:url";

const packagePath = process.argv
  .find((argument) => argument.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const { chromium, expect } = createRequire(resolve(packagePath))("@playwright/test");
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("Use a local preview, never production.");
const output = await mkdtemp(join(tmpdir(), "wow-trader-replacements-browser-"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const chapterId = "chapter-126-14-16-darkshore";
const path = `/forever/leveling/routes/alliance-human/chapters/${chapterId}`;
const storage = "kfc-leveling:characters:v1";
const release = "dungeons-v2-build-70205-at-level";
const card = page.locator('[data-dungeon-alternative="thanes"]');
const navigation = page.getByRole("group", { name: "Step navigation", exact: true });
async function saved() {
  return page.evaluate((key) => {
    const workspace = JSON.parse(globalThis.localStorage.getItem(key));
    return workspace.sessions.find((entry) => entry.id === workspace.activeId);
  }, storage);
}
async function branch() {
  return (await saved()).dungeonPlans[release].replacements[chapterId];
}

try {
  await page.goto(new URL(path, base).href);
  await page.getByRole("button", { name: "Save character & enable progress", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog");
  await settings.getByRole("combobox", { name: "Class", exact: true }).selectOption("warrior");
  await settings.getByLabel("Current level", { exact: true }).fill("15");
  await settings.getByLabel("Known outdoor XP rate").selectOption("1");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await navigation.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(
      async () =>
        Object.values((await saved()).progress)
          .flatMap((steps) => Object.values(steps))
          .filter((state) => state === "done").length,
    )
    .toBe(1);
  const outdoorBefore = await saved();
  const bookmark = outdoorBefore.lastReader.stepId;
  const readerShortcut = page.getByRole("link", {
    name: "Dungeon alternatives (1) ↓",
    exact: true,
  });
  await expect(readerShortcut).toHaveAttribute("href", "#reader-dungeon-alternative");
  await readerShortcut.click();
  await expect(page.locator("#reader-dungeon-alternative")).toHaveAttribute("open", "");
  assert.equal((await saved()).lastReader.stepId, bookmark);
  assert.deepEqual((await saved()).progress, outdoorBefore.progress);

  await expect(card).toContainText("11,685");
  await expect(card).toContainText("2,715");
  await expect(page.locator("[data-leveling-workspace]")).toHaveAttribute(
    "data-reader-display",
    "focus",
  );
  await card.getByText(/outdoor quest preparations · review before entry/).click();
  assert.ok((await card.locator("[data-carryover-quest]").count()) >= 8);
  await expect(card).toContainText("Rejoin Darkshore 16–19");
  await card.getByRole("button", { name: "View plan", exact: true }).click();
  await card.getByLabel("Current XP into this level", { exact: true }).fill("14400");
  await expect(card.getByRole("button", { name: "Use dungeon route", exact: true })).toBeDisabled();
  await card.getByLabel("Current XP into this level", { exact: true }).fill("1000");
  await card.getByLabel("Estimated dungeon kill XP · per player", { exact: true }).fill("1715");
  await expect(card).toContainText("Estimated XP covers");
  await card.getByRole("button", { name: "Use dungeon route", exact: true }).click();
  await expect(page.locator("#dungeon-prepare")).toHaveAttribute("data-selected", "true");
  assert.deepEqual((await branch()).xpForecast, { level: 15, questXp: 11685, neededXp: 13400 });
  assert.equal(
    await page
      .locator("button")
      .filter({ hasText: /^Keep questing$/ })
      .count(),
    1,
  );
  assert.deepEqual((await saved()).progress, outdoorBefore.progress);
  assert.deepEqual((await saved()).readerPositions, outdoorBefore.readerPositions);
  await navigation.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator("#dungeon-travel")).toHaveAttribute("data-selected", "true");
  await expect(
    page.getByRole("combobox", { name: "Zone map" }).locator("option:checked"),
  ).toHaveText("Ironforge");
  assert.deepEqual((await branch()).progress, {});
  await page.getByRole("link", { name: "← Chapters", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Continue Hall of Thanes.", exact: true }),
  ).toBeVisible();
  const resume = page.getByRole("link", { name: "Continue playing →", exact: true });
  await expect(resume).toHaveAttribute("href", /#dungeon-travel$/);
  await page.locator('[data-dungeon-alternative="thanes"]').first().scrollIntoViewIfNeeded();
  assert.ok(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
    ),
  );
  await page.screenshot({ path: join(output, "dashboard-alternative.png"), fullPage: false });
  await resume.click();
  await expect(page.locator("#dungeon-travel")).toHaveAttribute("data-selected", "true");
  await navigation.getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(async () => (await branch()).progress.travel).toBe("done");
  await navigation.getByRole("button", { name: "Undo Done", exact: true }).click();
  await expect.poll(async () => (await branch()).progress.travel).toBeUndefined();
  await expect(page.locator("#dungeon-travel")).toHaveAttribute("data-selected", "true");
  await page.reload();
  await expect(page.locator("#dungeon-travel")).toHaveAttribute("data-selected", "true");
  await page.screenshot({ path: join(output, "desktop-dungeon.png"), fullPage: true });
  process.stdout.write(
    "PASS: calibrated XP, dashboard continuation, invalid progress, isolated Next/Done/Undo and reload resume\n",
  );

  const mapWidth = page.getByRole("slider", { name: "Map width", exact: true });
  await mapWidth.focus();
  await mapWidth.press("Home");
  await mapWidth.press("ArrowRight");
  await expect(mapWidth).toHaveValue("40");
  await page.reload();
  await expect(page.getByRole("slider", { name: "Map width", exact: true })).toHaveValue("40");
  await page
    .getByRole("group", { name: "Reading mode", exact: true })
    .getByRole("button", { name: "All steps", exact: true })
    .click();
  await expect(page.locator("#dungeon-travel")).toBeInViewport();
  await page
    .locator("#dungeon-hand-ins")
    .getByRole("button", { name: /^Select dungeon step 5:/ })
    .click();
  await page
    .locator("#dungeon-hand-ins")
    .getByRole("button", { name: "Confirm hand-in: An Ancient Grudge", exact: true })
    .click();
  await expect.poll(async () => (await branch()).xpNeedsUpdate).toBe(true);
  assert.equal((await branch()).currentXp, 1000);
  assert.equal((await branch()).returnLevel, null);
  assert.equal((await saved()).profile.level, 15);
  assert.equal((await branch()).xpForecast.questXp, 11685);
  await page.getByRole("button", { name: "Undo reported hand-in change", exact: true }).click();
  await expect
    .poll(async () => (await saved()).dungeonPlans[release].questStates["96395"])
    .toBe("unknown");
  const xpForm = page.getByRole("form", { name: "Update actual XP", exact: true });
  await xpForm.getByLabel("Actual current XP", { exact: true }).fill("14400");
  await xpForm.getByRole("button", { name: "Save actual XP", exact: true }).click();
  await expect(xpForm.getByRole("alert")).toContainText("below the next-level requirement");
  assert.equal((await branch()).xpNeedsUpdate, true);
  await xpForm.getByLabel("Actual current XP", { exact: true }).fill("5000");
  await xpForm.getByRole("button", { name: "Save actual XP", exact: true }).click();
  await expect.poll(async () => (await branch()).xpNeedsUpdate).toBe(false);
  assert.equal((await branch()).currentXp, 5000);
  assert.equal((await branch()).killXp, null);
  assert.equal((await branch()).returnLevel, null);
  await page.reload();
  assert.equal((await branch()).xpForecast.questXp, 11685);
  process.stdout.write(
    "PASS: visible focus, persisted map width, preflight, explicit reward Undo and actual XP refresh without invented credit\n",
  );

  await page
    .locator("#dungeon-bridge")
    .getByRole("button", { name: /^Select dungeon step 6:/ })
    .click();
  const carry = page
    .locator("#dungeon-bridge")
    .getByRole("region", { name: "Outdoor quest preparation", exact: true })
    .first();
  assert.ok((await carry.locator("[data-carryover-quest]").count()) >= 8);
  await page
    .locator("#dungeon-rejoin")
    .getByRole("button", { name: /^Select dungeon step 7:/ })
    .click();
  const rejoin = page.getByRole("button", { name: "Continue to Darkshore 16–19 →", exact: true });
  await expect(rejoin).toBeDisabled();
  await page.getByLabel("Actual level after the run and hand-ins", { exact: true }).fill("16");
  await expect(rejoin).toBeDisabled();
  while (await carry.getByRole("button", { name: /^Confirm .* carryover ready$/ }).count())
    await carry
      .getByRole("button", { name: /^Confirm .* carryover ready$/ })
      .first()
      .click();
  await expect(rejoin).toBeEnabled();
  await page.getByLabel("Actual level after the run and hand-ins", { exact: true }).fill("15");
  await expect(rejoin).toBeDisabled();
  await page.getByLabel("Actual level after the run and hand-ins", { exact: true }).fill("16");
  process.stdout.write(
    "PASS: source-derived carryovers and actual-level gate cannot be bypassed by estimated XP\n",
  );

  await page.locator("[data-dungeon-route-options] > summary").click();
  await page.getByRole("button", { name: "Keep questing", exact: true }).first().click();
  await expect(page.locator(`#guide-${bookmark}`)).toHaveAttribute("data-selected", "true");
  assert.deepEqual((await saved()).progress, outdoorBefore.progress);
  assert.deepEqual((await saved()).readerPositions, outdoorBefore.readerPositions);
  await page.locator("#reader-dungeon-alternative > summary").click();
  await card.getByRole("button", { name: "Use dungeon route", exact: true }).click();
  await expect(page.locator("#dungeon-rejoin")).toHaveAttribute("data-selected", "true");
  await rejoin.click();
  await expect(page).toHaveURL(/chapter-127-16-19-darkshore/);
  await expect.poll(async () => (await saved()).profile.level).toBe(16);
  assert.equal((await branch()).active, false);
  assert.deepEqual((await saved()).progress, outdoorBefore.progress);
  process.stdout.write(
    "PASS: reversible route choice restores the outdoor bookmark and validated continuation\n",
  );

  await page.goto(new URL(path, base).href);
  await page.locator("#reader-dungeon-alternative > summary").click();
  await card.getByRole("button", { name: "Use dungeon route", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("[data-leveling-workspace]")).toBeVisible();
  await expect(page.locator("[data-leveling-workspace]")).toHaveAttribute(
    "data-reader-view",
    "quests",
  );
  await expect(page.locator("#dungeon-rejoin")).toBeVisible();
  await page.getByRole("button", { name: "Review chapter", exact: true }).click();
  await expect(page.locator("#chapter-handoff")).toBeInViewport();
  assert.ok(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
    ),
  );
  await page.screenshot({ path: join(output, "mobile-dungeon.png"), fullPage: true });
  const paneHeight = await page
    .locator("#leveling-quest-pane")
    .evaluate((element) => element.getBoundingClientRect().height);
  assert.ok(paneHeight >= 844 * 0.65, `Instruction pane is too small: ${paneHeight}`);
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  await page.reload();
  await expect(page.locator("[data-leveling-workspace]")).toHaveAttribute(
    "data-reader-view",
    "map",
  );
  await page.getByRole("button", { name: "Show quests", exact: true }).click();
  await expect(page.locator("#dungeon-rejoin")).toBeInViewport();
  await page.reload();
  await expect(page.locator("#dungeon-rejoin")).toHaveAttribute("data-selected", "true");
  await expect(page.locator("[data-leveling-workspace]")).toHaveAttribute(
    "data-reader-view",
    "quests",
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.locator("#dungeon-rejoin")).toBeInViewport();
  assert.ok(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
    ),
  );
  await page.screenshot({ path: join(output, "mobile-320.png"), fullPage: false });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(navigation.getByRole("button", { name: "Done", exact: true })).toBeInViewport();
  assert.ok(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
    ),
  );
  await page.evaluate((key) => {
    const original = globalThis.Storage.prototype.setItem;
    globalThis.__levelingDenyWrites = true;
    globalThis.Storage.prototype.setItem = function (name, value) {
      if (name === key && globalThis.__levelingDenyWrites)
        throw new Error("Storage unavailable in regression fixture");
      return original.call(this, name, value);
    };
  }, storage);
  await navigation.getByRole("button", { name: "Previous step", exact: true }).click();
  await expect(page.locator("[data-leveling-workspace]")).toContainText(
    "Browser storage is unavailable",
  );
  await expect(page.locator("[data-leveling-workspace]")).toContainText("Not saved");
  await page.evaluate(() => {
    globalThis.__levelingDenyWrites = false;
  });
  await navigation.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator("[data-leveling-workspace]")).not.toContainText(
    "Browser storage is unavailable",
  );
  await expect(page.locator("[data-leveling-workspace]")).not.toContainText("Not saved");
  process.stdout.write(
    "PASS: denied writes never claim saved progress; storage recovery clears its stale warning\n",
  );
  assert.deepEqual(errors, []);
  process.stdout.write(
    `PASS: mobile layout and reload, no browser errors; screenshots ${output}\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  await page.screenshot({ path: join(output, "failure.png"), fullPage: false });
  process.stderr.write(`Browser failure screenshot: ${output}\n`);
  throw error;
} finally {
  await browser.close();
}
