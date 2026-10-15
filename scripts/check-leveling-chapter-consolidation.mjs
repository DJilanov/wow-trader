import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DUNGEON_RELEASE,
  createCharacterProfile,
  emptyDungeonPlan,
  emptyPremadeProgress,
} from "../packages/leveling/dist/index.js";

const packagePath = process.argv
  .find((arg) => arg.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath));
const { chromium, expect: defaultExpect } = require("@playwright/test");
const expect = defaultExpect.configure({ timeout: 30000 });
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://localhost:3006");
if (!["localhost", "127.0.0.1", "helper.kfcguild.online"].includes(base.hostname))
  throw new Error("Unexpected test target.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("**/*", (route) =>
  ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
);
const progress = emptyPremadeProgress();
progress.members = progress.members.map((member, index) => ({
  ...member,
  level: 16,
  currentXp: 0,
  xpNeedsUpdate: false,
  questStates: {
    9: "rewarded",
    12: "rewarded",
    432: "rewarded",
    433: "rewarded",
    ...(index === 0 ? { 96391: "rewarded" } : index === 2 ? { 96391: "objectives-complete" } : {}),
  },
}));
const workspace = {
  version: 1,
  activeId: "consolidation-test",
  sessions: [
    {
      id: "consolidation-test",
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
await context.addInitScript(
  ({ data, origin }) => {
    if (
      globalThis.location.origin === origin &&
      !globalThis.localStorage.getItem("kfc-leveling:characters:v1")
    )
      globalThis.localStorage.setItem("kfc-leveling:characters:v1", JSON.stringify(data));
  },
  { data: workspace, origin: base.origin },
);
const page = await context.newPage(),
  errors = [],
  output = await mkdtemp(join(tmpdir(), "kfc-leveling-consolidated-"));
page.setDefaultTimeout(30000);
page.on("pageerror", (error) => errors.push(error.message));
const url = (path) => new URL(path, base).href;
const saved = () =>
  page.evaluate(
    () => JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1")).sessions[0],
  );
const chapter = page.getByLabel("Campaign chapter", { exact: true });
try {
  await page.goto(url("/forever/leveling/routes/alliance-human"));
  await expect(page.locator('[data-route-chapter="prepare-thanes"]')).toBeVisible();
  await expect(page.getByText("Loading your saved route…", { exact: true })).toHaveCount(0);
  await expect(
    page.locator(
      '[data-route-chapter="start-125"], [data-route-chapter="early-party-kills"], [data-route-chapter="ironforge-rendezvous"]',
    ),
  ).toHaveCount(0);
  await expect(page.locator('[data-route-chapter][data-kind="dungeon"]')).toHaveCount(21);
  const card = page.locator('[data-route-chapter="prepare-thanes"]');
  await expect(card.getByRole("link", { name: /^Goal 16 Westfall/ })).toBeVisible();
  await expect(card.locator('[data-section-coverage="prepare-thanes"]')).toBeAttached();
  await expect(card).not.toContainText("13–16");
  await expect(card).toHaveAttribute("data-kind", "zone");
  await expect(
    card.getByRole("heading", { name: "Westfall → Dun Morogh", exact: true }),
  ).toBeVisible();
  await expect(card.locator("[data-campaign-area]")).toHaveCount(2);
  const preparation = card.locator('[data-campaign-preparation="prepare-thanes"]');
  await expect(preparation).not.toHaveAttribute("open", "");
  await preparation.locator("summary").click();
  await expect(preparation).toContainText("Before Hall of Thanes");
  await expect(preparation.locator('[data-preparation-quest="96391"]')).toContainText(
    "1/5 players reported",
  );
  await preparation.locator("summary").click();
  await expect(
    card.locator(
      '[data-campaign-activity="early-party-kills"] [data-campaign-catchup="not-needed"]',
    ),
  ).toBeAttached();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "chapter-desktop.png") });
  await card.getByRole("link", { name: /Westfall → Dun Morogh/ }).click();
  await expect(chapter).toHaveValue("prepare-thanes");
  await page.getByRole("button", { name: "All steps", exact: true }).click();
  const mapAccept = "ironforge-rendezvous-116-source-step-0364";
  await page
    .locator(`#campaign-${mapAccept}`)
    .getByRole("button", { name: /^Show campaign step:/ })
    .click();
  await expect(
    page.getByLabel("Player 2, Player 4, Player 5 completed this in game", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(`#campaign-${mapAccept}`)).toContainText("Use the [Dark Iron Map]");
  await page
    .getByLabel("Player 2, Player 4, Player 5 completed this in game", { exact: true })
    .check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await saved()).dungeonPlans[DUNGEON_RELEASE].premade.members[1].questStates[96391],
    )
    .toBe("accepted");
  let members = (await saved()).dungeonPlans[DUNGEON_RELEASE].premade.members;
  assert.equal(members[0].questStates[96391], "rewarded");
  assert.equal(members[2].questStates[96391], "objectives-complete");
  const selected = Object.values((await saved()).dungeonPlans[DUNGEON_RELEASE].premade.campaigns)[0]
    .selectedActionId;
  await page.reload();
  await expect(chapter).toHaveValue("prepare-thanes");
  await expect(page.locator(`#campaign-${selected}`)).toHaveAttribute("data-selected", "true");
  await page.evaluate(
    ({ release }) => {
      const value = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1"));
      const plan = value.sessions[0].dungeonPlans[release].premade;
      plan.members = plan.members.map((member) => ({
        ...member,
        questStates: {
          ...member.questStates,
          96390: "rewarded",
          96391: "rewarded",
          96392: "rewarded",
        },
        xpNeedsUpdate: true,
      }));
      globalThis.localStorage.setItem("kfc-leveling:characters:v1", JSON.stringify(value));
    },
    { release: DUNGEON_RELEASE },
  );
  await page.goto(
    url(
      "/forever/leveling/routes/alliance-human/chapters/premade-ironforge-rendezvous?plan=premade#campaign-ironforge-rendezvous-xp-readiness",
    ),
  );
  await page.reload();
  await expect(chapter).toHaveValue("prepare-thanes");
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Record party XP", exact: true }).click();
  for (let index = 1; index <= 5; index++) {
    const form = page.getByRole("form", { name: `Actual XP for player ${index}`, exact: true });
    await form.getByLabel(`Player ${index} actual level`, { exact: true }).fill("16");
    await form.getByLabel(`Player ${index} actual XP`, { exact: true }).fill("0");
    await form.getByRole("button", { name: "Save actual XP", exact: true }).click();
  }
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(chapter).toHaveValue("dungeon-thanes");
  members = (await saved()).dungeonPlans[DUNGEON_RELEASE].premade.members;
  assert.ok(members.every((member) => member.currentXp === 0 && member.level === 16));
  await page.goto(
    url(
      "/forever/leveling/routes/alliance-human/chapters/premade-early-party-kills?plan=premade#campaign-early-party-kills-125-source-step-0035",
    ),
  );
  await expect(chapter).toHaveValue("prepare-thanes");
  await expect(page.locator("#campaign-ironforge-rendezvous-xp-readiness")).toHaveAttribute(
    "data-selected",
    "true",
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
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
  await page.screenshot({ path: join(output, "reader-mobile.png") });
  await page.goto(
    url("/forever/leveling/routes/alliance-human/chapters/premade-prepare-stockade?plan=premade"),
  );
  await expect(chapter).toHaveValue("prepare-stockade");
  await expect(
    page
      .getByRole("heading", { name: /^Redridge Mountains → Duskwood → Wetlands/, level: 1 })
      .first(),
  ).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
      `Long zone title overflow at ${width}`,
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
  await page.screenshot({ path: join(output, "long-zone-title-mobile.png") });
  assert.deepEqual(errors, []);
  process.stdout.write(
    `Zone chapters, compact preparation, partial-party reports, stale-XP gates, conditional Next, legacy bookmarks and mobile/a11y passed; screenshots: ${output}\n`,
  );
} finally {
  await context.request.dispose();
  await context.close();
  await browser.close();
}
