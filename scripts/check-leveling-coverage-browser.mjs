import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { URL } from "node:url";
import process from "node:process";
import {
  CHAPTER_REFERENCES,
  buildCampaignPlan,
  createCharacterProfile,
  emptyPremadeProgress,
  emptyDungeonPlan,
  DUNGEON_RELEASE,
  campaignSectionFor,
} from "../packages/leveling/dist/index.js";

const packagePath = process.argv
  .find((argument) => argument.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath));
const { chromium, expect: defaultExpect } = require("@playwright/test");
const expect = defaultExpect.configure({ timeout: 60000 });
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3008");
if (!["localhost", "127.0.0.1"].includes(base.hostname))
  throw new Error("This synthetic scenario is restricted to a local preview.");
const root = resolve(process.env.LEVELING_ARCHIVE_ROOT ?? "artifacts/leveling/archive");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const sources = [];
for (const entry of manifest.chapters) {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.id === entry.chapterId);
  if (reference?.family === "questing" && reference.factions.includes("alliance"))
    sources.push({ reference, guide: JSON.parse(await readFile(join(root, entry.file), "utf8")) });
}
const plan = buildCampaignPlan("human", manifest.sourceSha256, sources, "warrior");
const libraryAction = plan.actions.find(
  (action) =>
    action.libraryQuestId &&
    !action.libraryRequired &&
    action.libraryObjective === "shared-kills" &&
    (plan.legs.find((leg) => leg.id === action.legId)?.from ?? 0) >= 20 &&
    action.questChanges[0]?.state === "accepted",
);
assert.ok(libraryAction, "No source-library quest was inserted into the actual route");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const output = await mkdtemp(join(tmpdir(), "kfc-leveling-coverage-"));
const errors = [];
try {
  for (const scenario of [
    {
      level: 20,
      currentXp: 0,
      actionId: "stockade-letter-unlock-brief",
      sectionId: "prepare-stockade",
    },
    {
      level: 25,
      currentXp: 20000,
      actionId: "dungeon-stockade-entry",
      sectionId: "dungeon-stockade",
    },
    {
      level: 20,
      currentXp: 0,
      actionId: libraryAction.id,
      sectionId: campaignSectionFor(plan, libraryAction.legId).id,
      library: true,
    },
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route("**/*", (route) =>
      ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
    );
    const progress = emptyPremadeProgress();
    const before = plan.actions.findIndex((action) => action.id === scenario.actionId);
    assert.ok(before >= 0);
    progress.members = progress.members.map((member, player) => {
      const questStates = {};
      for (const action of plan.actions.slice(0, before))
        if (!action.leaderOnly || player === 0)
          for (const change of action.questChanges)
            questStates[String(change.questId)] = change.state;
      return {
        ...member,
        level: scenario.level,
        currentXp: scenario.currentXp,
        classSlug: player === 0 ? "warrior" : null,
        xpNeedsUpdate: false,
        questStates,
      };
    });
    progress.campaigns[plan.release] = { selectedActionId: scenario.actionId, completion: {} };
    const workspace = {
      version: 1,
      activeId: "coverage-test",
      sessions: [
        {
          id: "coverage-test",
          profile: {
            ...createCharacterProfile(),
            classSlug: "warrior",
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
    await context.addInitScript(
      ({ workspace, origin }) => {
        if (
          globalThis.location.origin === origin &&
          !globalThis.localStorage.getItem("kfc-leveling:characters:v2")
        )
          globalThis.localStorage.setItem("kfc-leveling:characters:v2", JSON.stringify(workspace));
      },
      { workspace, origin: base.origin },
    );
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/forever/leveling/routes/alliance-human?class=warrior", base).href);
    const budget = page.locator(`[data-section-coverage="${scenario.sectionId}"]`);
    await expect(budget).toHaveAttribute("data-coverage-status", /blocked|incomplete/);
    await expect(page.locator("[data-library-quests]")).toHaveAttribute(
      "data-library-quests",
      /[1-9]\d*/,
    );
    assert.ok(
      Number(await page.locator("[data-xp-evidence]").first().getAttribute("data-xp-evidence")) > 0,
    );
    if (scenario.level === 25)
      await expect(budget).toContainText("Future rewards cannot fund this departure");
    const saved = async () =>
      page.evaluate(
        () =>
          JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v2")).sessions[0]
            .dungeonPlans,
      );
    const snapshot = await saved();
    await page.getByRole("button", { name: "Refresh reward data", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Refresh reward data", exact: true }),
    ).toBeEnabled();
    assert.deepEqual(await saved(), snapshot, "Refreshing forecasts changed actual progress");
    await page.getByRole("link", { name: "Continue playing →", exact: true }).click();
    await expect(page.locator(`#campaign-${scenario.actionId}`)).toHaveAttribute(
      "data-selected",
      "true",
    );
    if (!scenario.library)
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        scenario.level === 25 ? "Entry 26" : "Target 26",
      );
    else
      await expect(page.locator(`#campaign-${scenario.actionId}`)).toContainText(
        "Source-library kill loop",
      );
    await expect(page.locator(`[data-section-coverage="${scenario.sectionId}"]`)).toHaveAttribute(
      "data-coverage-status",
      /blocked|incomplete/,
    );
    const readerBudget = page.locator(`[data-section-coverage="${scenario.sectionId}"]`);
    await expect(readerBudget.locator("details")).not.toHaveAttribute("open", "");
    await readerBudget.locator("summary").click();
    await expect(readerBudget.locator("details")).toHaveAttribute("open", "");
    await expect(readerBudget).toContainText("Unresolved");
    await page.reload();
    await expect(page.locator(`#campaign-${scenario.actionId}`)).toHaveAttribute(
      "data-selected",
      "true",
    );
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
        ),
        `Reader overflow at ${width}`,
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
    await page.screenshot({ path: join(output, `${scenario.sectionId}-mobile.png`) });
    await context.close();
  }
  assert.deepEqual(errors, []);
  process.stdout.write(
    `Whole-route budget UI, underlevel entry stop, read-only refresh, reload/selection, mobile and WCAG checks passed. Screenshots: ${output}\n`,
  );
} finally {
  await browser.close();
}
