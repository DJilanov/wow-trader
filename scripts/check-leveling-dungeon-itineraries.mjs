import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import { createRequire } from "node:module";
import { readFile, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import {
  createCharacterProfile,
  createDungeonTrip,
  emptyDungeonPlan,
  CHAPTER_REFERENCES,
  DUNGEON_VISITS,
  DUNGEON_RELEASE,
} from "../packages/leveling/dist/index.js";

const packagePath = process.argv
  .find((argument) => argument.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath)),
  { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("Use a local preview, never production.");
const chapter = "chapter-128-19-20-redridge",
  next = "chapter-130-20-21-darkshore-ashenvale";
const manifest = JSON.parse(
  await readFile(resolve("artifacts/leveling/archive/manifest.json"), "utf8"),
);
const entry = manifest.chapters.find((row) => row.chapterId === chapter);
const guide = JSON.parse(await readFile(resolve("artifacts/leveling/archive", entry.file), "utf8"));
const releaseKey = `${chapter}-v${entry.version.replaceAll(".", "-")}-build-70205`;
const profile = {
  ...createCharacterProfile(),
  classSlug: "warrior",
  xpRate: 1,
  level: 19,
  party: { size: 5, readiness: "together", tank: "yes", healer: "yes" },
};
const oldKey = `${chapter}--deadmines`,
  key = `${oldKey}--alternative`;
const original = createDungeonTrip(
  DUNGEON_VISITS.find((visit) => visit.id === "deadmines"),
  CHAPTER_REFERENCES.find((row) => row.id === chapter),
  guide,
  profile,
  emptyDungeonPlan(),
  "source-step-0023",
);
const workspace = {
  version: 1,
  activeId: "itinerary-test",
  sessions: [
    {
      id: "itinerary-test",
      profile: { ...profile, level: 18 },
      lastChapterId: chapter,
      lastReader: {
        chapterId: chapter,
        version: entry.version,
        clientBuild: 70205,
        stepId: "source-step-0023",
      },
      readerPositions: { [releaseKey]: "source-step-0023" },
      progress: { [releaseKey]: { "source-step-0001": "done" } },
      dungeonPlans: {
        [DUNGEON_RELEASE]: {
          ...emptyDungeonPlan(),
          trips: { [oldKey]: { ...original, stepId: "travel", progress: { prepare: "done" } } },
        },
      },
    },
  ],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(
  ({ workspace, origin }) => {
    if (
      globalThis.location.origin === origin &&
      !globalThis.localStorage.getItem("kfc-leveling:characters:v1")
    )
      globalThis.localStorage.setItem("kfc-leveling:characters:v1", JSON.stringify(workspace));
  },
  { workspace, origin: base.origin },
);
const page = await context.newPage(),
  errors = [],
  output = await mkdtemp(join(tmpdir(), "wow-trader-dungeon-itineraries-"));
page.setDefaultTimeout(30000);
page.on("pageerror", (error) => errors.push(error.message));
const dashboard = "/forever/leveling/routes/alliance-human";
const route = `${dashboard}/dungeons/deadmines?chapter=${chapter}&plan=alternative`;
const saved = () =>
  page.evaluate(
    () => JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1")).sessions[0],
  );
const plan = async () => (await saved()).dungeonPlans[DUNGEON_RELEASE];
const stage = async (id) => {
  await page.goto(new URL(`${route}#trip-${id}`, base).href);
  await expect(page.locator(`#trip-${id}`)).toHaveAttribute("data-selected", "true");
};
const reportXp = async (level, xp) => {
  const form = page.getByRole("form", { name: "Record actual dungeon XP", exact: true });
  await form.getByLabel("Actual level after hand-ins", { exact: true }).fill(String(level));
  await form.getByLabel("Actual XP after hand-ins", { exact: true }).fill(String(xp));
  await form.getByRole("button", { name: "Save actual XP", exact: true }).click();
  await expect.poll(async () => (await plan()).trips[key].returnLevel).toBe(level);
};
try {
  await page.goto(new URL(route, base).href);
  const choose = page.getByRole("button", { name: "Use level-20 alternative", exact: true });
  await expect(choose).toBeDisabled();
  await page.getByLabel("Actual current level", { exact: true }).fill("19");
  await expect(choose).toBeEnabled();
  await expect(page.locator("[data-dungeon-trip-review]")).toContainText("6 selected quests");
  await expect(page.locator("[data-dungeon-itinerary]")).toContainText("19 → 20 + 2%");
  await page.screenshot({ path: join(output, "alternative-review-desktop.png"), fullPage: false });
  await choose.click();
  await expect(page.locator("#trip-prepare")).toHaveAttribute("data-selected", "true");
  assert.equal((await plan()).activeTripId, key);
  assert.equal((await plan()).trips[key].returnStepId, "source-step-0023");
  assert.ok(!(await plan()).trips[key].questIds.includes(92753));
  assert.deepEqual(
    (await plan()).trips[oldKey],
    workspace.sessions[0].dungeonPlans[DUNGEON_RELEASE].trips[oldKey],
  );
  await page
    .getByRole("group", { name: "Step navigation", exact: true })
    .getByRole("button", { name: "Next step", exact: true })
    .click();
  await expect(page.locator("#trip-travel")).toHaveAttribute("data-selected", "true");
  await page.reload();
  await expect(page.locator("#trip-travel")).toHaveAttribute("data-selected", "true");
  assert.deepEqual((await saved()).progress, workspace.sessions[0].progress);
  process.stdout.write(
    "PASS: strict entry, core bundle and XP endpoint, separate legacy record and reload bookmark\n",
  );

  await stage("rejoin");
  await expect(
    page.getByRole("combobox", { name: "Zone map", exact: true }).locator("option:checked"),
  ).toHaveText("Darkshore");
  await expect(page.locator("#trip-rejoin")).toContainText(
    "Check level 20 and continue to Darkshore",
  );
  const rejoin = () => page.getByRole("button", { name: "Continue at level 20 →", exact: true });
  await expect(rejoin()).toBeDisabled();
  await reportXp(19, 5000);
  await stage("bridge");
  await page.getByRole("checkbox", { name: /A Baying of Gnolls was turned in/ }).check();
  await page.getByRole("checkbox", { name: /The Corruption Abroad is in my quest log/ }).check();
  await page.getByRole("checkbox", { name: /I trained Cooking to 50/ }).check();
  await page.getByRole("checkbox", { name: /I reviewed the retained source work/ }).check();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: /A Baying of Gnolls was turned in/ }),
  ).toBeChecked();
  await stage("rejoin");
  await expect(rejoin()).toBeDisabled();
  await reportXp(20, 1234);
  await expect(rejoin()).toBeEnabled();
  await stage("hand-ins");
  await page
    .getByRole("button", { name: "Confirm hand-in: Underground Assault", exact: true })
    .click();
  await expect.poll(async () => (await plan()).trips[key].xpNeedsUpdate).toBe(true);
  await stage("rejoin");
  await expect(rejoin()).toBeDisabled();
  await reportXp(20, 2345);
  await expect(rejoin()).toBeEnabled();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
    );
    await page.addScriptTag({ path: require.resolve("axe-core") });
    const violations = await page.evaluate(
      async () =>
        (
          await globalThis.axe.run({
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
          })
        ).violations,
    );
    assert.deepEqual(
      violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target),
      })),
      [],
    );
    await page.screenshot({ path: join(output, `alternative-rejoin-${width}.png`) });
  }
  await rejoin().click();
  await expect(page).toHaveURL(new RegExp(`/chapters/${next}#guide-source-step-0003$`));
  await expect(page.locator("#guide-source-step-0003")).toHaveAttribute("data-selected", "true");
  assert.equal((await saved()).readerPositions[releaseKey], "source-step-0023");
  assert.deepEqual((await saved()).progress, workspace.sessions[0].progress);
  assert.equal((await plan()).activeTripId, null);
  process.stdout.write(
    "PASS: actual-XP and retained-chain gates, stale rewards, mobile accessibility and exact level-20 continuation\n",
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    new URL(`${dashboard}/dungeons/lordaeron?chapter=${chapter}&plan=alternative`, base).href,
  );
  await page.getByRole("button", { name: "Use level-20 alternative", exact: true }).click();
  await expect(page.locator("#trip-prepare")).toHaveAttribute("data-selected", "true");
  assert.ok((await plan()).trips[key]);
  assert.equal((await plan()).activeTripId, `${chapter}--lordaeron--alternative`);
  await page.goto(new URL(dashboard, base).href);
  await expect(page.getByRole("link", { name: "Continue playing →", exact: true })).toHaveAttribute(
    "href",
    /plan=alternative#trip-prepare$/,
  );
  process.stdout.write(
    "PASS: competing Ruins continuation plan and Continue link preserve all previous choices\n",
  );

  await page.evaluate(
    ({ release, key }) => {
      const workspace = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1"));
      const plan = workspace.sessions[0].dungeonPlans[release];
      plan.activeTripId = null;
      plan.trips[key].alternative.sourceVersion = "changed-source-version";
      globalThis.localStorage.setItem("kfc-leveling:characters:v1", JSON.stringify(workspace));
    },
    { release: DUNGEON_RELEASE, key },
  );
  await page.goto(new URL(route, base).href);
  await expect(
    page.getByRole("button", { name: "Resume dungeon instructions", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("[data-dungeon-trip-review]")).toContainText("no longer matches");
  assert.ok((await plan()).trips[key]);
  assert.equal((await saved()).readerPositions[releaseKey], "source-step-0023");
  process.stdout.write(
    "PASS: changed continuation evidence blocks reuse without erasing saved plans\n",
  );
  const wcChapter = "chapter-8-21-23-stonetalon-ashenvale";
  await page.goto(
    new URL(`${dashboard}/dungeons/wailing-caverns?chapter=${wcChapter}&plan=alternative`, base)
      .href,
  );
  const optional = page.getByRole("button", {
    name: "Use dungeon trip · keep outdoor route",
    exact: true,
  });
  await expect(optional).toBeDisabled();
  await expect(page.locator("[data-dungeon-trip-review]")).toContainText("4 selected quests");
  await page.getByLabel("Actual current level", { exact: true }).fill("21");
  await expect(optional).toBeEnabled();
  await optional.click();
  await expect(page.locator("#trip-prepare")).toHaveAttribute("data-selected", "true");
  const wcKey = `${wcChapter}--wailing-caverns`;
  assert.equal((await plan()).trips[wcKey].itinerary, true);
  assert.ok(!(await plan()).trips[wcKey].questIds.includes(1491));
  await page.evaluate(() => {
    const workspace = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1"));
    workspace.sessions[0].profile.level = 19;
    globalThis.localStorage.setItem("kfc-leveling:characters:v1", JSON.stringify(workspace));
  });
  await page.goto(
    new URL(`${dashboard}/dungeons/wailing-caverns?chapter=${wcChapter}#trip-travel`, base).href,
  );
  await expect(page.locator("#trip-travel")).toHaveAttribute("data-selected", "true");
  await expect(page.locator("#trip-travel")).toContainText("actual level 21");
  assert.equal((await plan()).trips[wcKey].itinerary, true);
  process.stdout.write(
    "PASS: Alliance WC itinerary selection, 21+ gate and optional chain policy persist without the query parameter\n",
  );
  assert.deepEqual(errors, []);
  process.stdout.write(`Screenshots: ${output}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  await page.screenshot({ path: join(output, "failure.png") }).catch(() => undefined);
  process.stderr.write(`Failure screenshot: ${output}\n`);
  throw error;
} finally {
  await browser.close();
}
