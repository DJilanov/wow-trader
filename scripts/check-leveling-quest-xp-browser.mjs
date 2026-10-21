import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import { createRequire } from "node:module";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  CHAPTER_REFERENCES,
  buildCampaignPlan,
  createCharacterProfile,
  emptyPremadeProgress,
  emptyDungeonPlan,
  DUNGEON_RELEASE,
} from "../packages/leveling/dist/index.js";

const path = process.argv
  .find((arg) => arg.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!path) throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(path)),
  { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://localhost:3004");
if (!["localhost", "127.0.0.1", "helper.kfcguild.online"].includes(base.hostname))
  throw new Error("Unexpected browser target.");
const root = resolve(process.env.LEVELING_ARCHIVE_ROOT ?? "artifacts/leveling/archive");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")),
  sources = [];
for (const entry of manifest.chapters) {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.id === entry.chapterId);
  if (reference?.family === "questing" && reference.factions.includes("alliance"))
    sources.push({ reference, guide: JSON.parse(await readFile(join(root, entry.file), "utf8")) });
}
const plan = buildCampaignPlan("human", manifest.sourceSha256, sources);
const handIn = plan.actions.find(
  (action) =>
    action.legId === "start-125" &&
    action.questChanges.some((change) => change.questId === 9 && change.state === "rewarded"),
);
assert.ok(handIn);
const progress = emptyPremadeProgress();
progress.members = progress.members.map((member) => ({
  ...member,
  level: 13,
  currentXp: 0,
  xpNeedsUpdate: false,
  questStates: { 9: "objectives-complete" },
}));
progress.campaigns[plan.release] = { selectedActionId: handIn.id, completion: {} };
const data = {
  version: 1,
  activeId: "xp-browser",
  sessions: [
    {
      id: "xp-browser",
      profile: {
        ...createCharacterProfile(),
        party: { size: 5, readiness: "together", tank: "yes", healer: "yes" },
      },
      progress: {},
      readerPositions: {},
      lastReader: null,
      lastChapterId: null,
      dungeonPlans: { [DUNGEON_RELEASE]: { ...emptyDungeonPlan(), premade: progress } },
    },
  ],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("**/*", (route) =>
  ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
);
await context.addInitScript(
  ({ data, origin }) => {
    if (
      globalThis.location.origin === origin &&
      !globalThis.localStorage.getItem("kfc-leveling:characters:v2")
    )
      globalThis.localStorage.setItem("kfc-leveling:characters:v2", JSON.stringify(data));
  },
  { data, origin: base.origin },
);
const page = await context.newPage(),
  errors = [],
  output = await mkdtemp(join(tmpdir(), "kfc-leveling-xp-"));
page.setDefaultTimeout(30000);
page.on("pageerror", (error) => errors.push(error.message));
const saved = () =>
  page.evaluate(
    () =>
      JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v2")).sessions[0]
        .dungeonPlans,
  );
try {
  await page.goto(new URL("/forever/leveling/routes/alliance-human", base).href);
  await expect(page.getByText("Loading your saved route…", { exact: true })).toHaveCount(0);
  assert.ok(
    Number(await page.locator("[data-xp-evidence]").getAttribute("data-xp-evidence")) > 0,
    "Real published XP evidence is required for this test",
  );
  const before = await saved();
  const budget = page.locator('[data-xp-budget="prepare-thanes"]');
  await budget.locator("summary").click();
  await expect(budget.getByRole("table")).toBeVisible();
  await budget.getByRole("button", { name: "Player 1 breakdown", exact: true }).click();
  const reward = budget
    .getByRole("link", { name: "The Killing Fields", exact: true })
    .locator("..");
  await expect(reward).toContainText("1,050 XP");
  await expect(reward).toContainText("Hand-in level 13");
  await expect(reward).toContainText("wowhead reference");
  await budget.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "xp-desktop.png") });
  await page.getByRole("button", { name: "Refresh reward data", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Refresh reward data", exact: true }),
  ).toBeEnabled();
  assert.deepEqual(
    await saved(),
    before,
    "Forecast browsing/refresh changed actual party progress",
  );
  await page.getByRole("link", { name: "Continue playing →", exact: true }).click();
  await expect(page.locator(`#campaign-${handIn.id}`)).toHaveAttribute("data-selected", "true");
  const readerBudget = page.locator('[data-xp-budget="prepare-thanes"]');
  await readerBudget.locator("summary").click();
  await expect(readerBudget.getByRole("table")).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
      `XP reader overflow at ${width}`,
    );
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const violations = await page.evaluate(async () =>
      (
        await globalThis.axe.run(globalThis.document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        })
      ).violations.map((entry) => entry.id),
    );
    assert.deepEqual(violations, []);
  }
  await page.screenshot({ path: join(output, "xp-reader-mobile.png") });
  assert.deepEqual(
    (await saved())[DUNGEON_RELEASE].premade.members,
    before[DUNGEON_RELEASE].premade.members,
  );
  assert.deepEqual(errors, []);
  process.stdout.write(
    `Real quest XP, correct hand-in level, per-player forecast, read-only refresh and mobile/a11y passed; screenshots: ${output}\n`,
  );
} finally {
  await context.request.dispose();
  await context.close();
  await browser.close();
}
