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
  throw new Error(
    "Pass --playwright-package=<installed @playwright/test/package.json>. No production dependency is needed.",
  );
const { chromium, expect } = createRequire(resolve(packagePath))("@playwright/test");
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("Browser checks must use a local preview, never production.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const output = await mkdtemp(join(tmpdir(), "wow-trader-dungeons-browser-"));
const errors = [];
const storage = "kfc-leveling:characters:v1";
const release = "dungeons-v2-build-70205-at-level";
const chapter = "/forever/leveling/routes/alliance-human/chapters/chapter-125-13-15-westfall";
const cards = "#leveling-quest-pane > ol > [data-reader-step]";
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
async function savedPlan() {
  const workspace = await page.evaluate(
    (key) => JSON.parse(globalThis.localStorage.getItem(key)),
    storage,
  );
  return workspace.sessions.find((entry) => entry.id === workspace.activeId)?.dungeonPlans[release];
}
async function openDungeon(id) {
  const panel = page.locator("#reader-dungeon-plans");
  if (!(await panel.evaluate((element) => element.open)))
    await panel.locator(":scope > summary").click();
  const visit = page.locator(`#dungeon-visit-${id}`);
  if (!(await visit.evaluate((element) => element.open)))
    await visit.locator(":scope > summary").click();
  return visit;
}
try {
  await page.goto(new URL(chapter, base).href);
  await page.getByRole("button", { name: "Save character & enable progress", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Class", exact: true }).selectOption("warrior");
  await page.getByLabel("Current level", { exact: true }).fill("19");
  await page.getByLabel("Known outdoor XP rate").selectOption("1");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  const first = page.locator(cards).first();
  await first.getByRole("button", { name: /^Show source step/ }).click();
  const selected = await first.getAttribute("id");
  const progressBefore = await page.evaluate(
    (key) => JSON.parse(globalThis.localStorage.getItem(key)).sessions[0].progress,
    storage,
  );
  const dm = await openDungeon("deadmines");
  await dm.getByRole("button", { name: "Plan trip", exact: true }).click();
  await expect.poll(async () => (await savedPlan()).visits.deadmines).toBe("planned");
  await dm
    .getByRole("combobox", { name: "The Defias Brotherhood (166) game state", exact: true })
    .selectOption("objectives-complete");
  await expect.poll(async () => (await savedPlan()).questStates[166]).toBe("objectives-complete");
  assert.deepEqual(
    await page.evaluate(
      (key) => JSON.parse(globalThis.localStorage.getItem(key)).sessions[0].progress,
      storage,
    ),
    progressBefore,
  );
  await page.getByRole("button", { name: "Undo last dungeon change", exact: true }).click();
  await expect(
    dm.getByRole("combobox", { name: "The Defias Brotherhood (166) game state", exact: true }),
  ).toHaveValue("unknown");
  await dm
    .getByRole("combobox", { name: "The Defias Brotherhood (166) game state", exact: true })
    .selectOption("rewarded");
  await page.reload();
  const restored = await openDungeon("deadmines");
  await expect(
    restored.getByRole("combobox", {
      name: "The Defias Brotherhood (166) game state",
      exact: true,
    }),
  ).toHaveValue("rewarded");
  await expect(page.locator(`#${selected}`)).toHaveAttribute("data-selected", "true");
  process.stdout.write(
    "PASS: durable explicit quest states, Undo, unchanged source progress and bookmark\n",
  );

  const calculator = restored.locator("details").filter({
    has: page.locator("summary", { hasText: "Is the trip or extra chain worth my time?" }),
  });
  await calculator.locator(":scope > summary").click();
  await calculator.getByLabel("My outdoor XP/hour", { exact: true }).fill("20000");
  await calculator.getByLabel("Extra minutes — optimistic", { exact: true }).fill("5");
  await calculator.getByLabel("Extra minutes — conservative", { exact: true }).fill("40");
  await calculator.getByRole("checkbox", { name: /Use outdated offline XP/ }).check();
  await expect(
    calculator.getByText("No recommendation — evidence or gates missing", { exact: true }),
  ).toBeVisible();
  await page.reload();
  const persisted = await openDungeon("deadmines");
  const persistedCalculator = persisted.locator("details").filter({
    has: page.locator("summary", { hasText: "Is the trip or extra chain worth my time?" }),
  });
  await persistedCalculator.locator(":scope > summary").click();
  await expect(persistedCalculator.getByLabel("My outdoor XP/hour", { exact: true })).toHaveValue(
    "20000",
  );
  await persistedCalculator.getByLabel("Decision", { exact: true }).selectOption("whole-trip");
  await persistedCalculator.getByLabel("Per-player dungeon kill XP", { exact: true }).fill("1.5");
  await expect(
    persistedCalculator.getByText("No recommendation — evidence or gates missing", { exact: true }),
  ).toBeVisible();
  await persistedCalculator.getByLabel("Extra minutes — conservative", { exact: true }).fill("2");
  await expect(persistedCalculator.getByRole("alert")).toHaveText(
    "Conservative time must be at least the optimistic time.",
  );
  process.stdout.write(
    "PASS: durable scenario inputs, unknown XP, fractional XP and invalid time bounds\n",
  );

  const thanes = await openDungeon("thanes");
  await thanes.getByRole("checkbox", { name: /Old Ironforge Incursion/ }).check();
  await thanes.getByRole("radio", { name: /Deepblaze/ }).check();
  await thanes.getByRole("radio", { name: /Calibrated Blunderbuss/ }).check();
  await expect(thanes.locator('input[type="radio"]:checked')).toHaveCount(1);
  await thanes.getByRole("button", { name: "Show pickup on map", exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: "Return map to current step", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return map to current step", exact: true }).click();
  await expect(page.locator(`#${selected}`)).toHaveAttribute("data-selected", "true");
  const idsBeforeFinish = await page
    .locator(cards)
    .evaluateAll((elements) => elements.map((element) => element.id));
  await persisted.getByRole("button", { name: "Mark visit finished", exact: true }).click();
  assert.deepEqual(
    await page.locator(cards).evaluateAll((elements) => elements.map((element) => element.id)),
    idsBeforeFinish,
  );
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  assert.deepEqual(
    await page.evaluate(
      (key) => JSON.parse(globalThis.localStorage.getItem(key)).sessions[0].progress,
      storage,
    ),
    progressBefore,
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Undo Done", exact: true }).click();
  const undone = await page.evaluate(
    (key) => JSON.parse(globalThis.localStorage.getItem(key)).sessions[0].progress,
    storage,
  );
  assert.deepEqual(
    Object.values(undone).flatMap((steps) => Object.entries(steps)),
    Object.values(progressBefore).flatMap((steps) => Object.entries(steps)),
  );
  process.stdout.write(
    "PASS: one reward choice, independent pickup map, finished source branches, Next/Done/Undo\n",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const future = page.locator("#reader-dungeon-plans").getByRole("checkbox", {
    name: "Show future and reference-only visits through 60",
    exact: true,
  });
  await future.check();
  const dalaran = await openDungeon("dalaran");
  await expect(dalaran.getByRole("button", { name: "Plan trip", exact: true })).toBeDisabled();
  const upper = await openDungeon("upper-blackrock");
  await expect(upper.getByRole("button", { name: "Plan trip", exact: true })).toBeDisabled();
  const overflow = await page.evaluate(
    () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1,
  );
  assert.equal(overflow, false, "Mobile layout overflows horizontally");
  await page.screenshot({ path: join(output, "mobile-dungeons.png"), fullPage: false });
  assert.deepEqual(errors, [], "Browser runtime errors");
  process.stdout.write(
    `PASS: mobile layout and unavailable/future visits remain reference-only\nScreenshots: ${output}\n`,
  );
} catch (error) {
  await page.screenshot({ path: join(output, "failure.png"), fullPage: false });
  process.stderr.write(`Browser failure screenshot: ${output}\n`);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
