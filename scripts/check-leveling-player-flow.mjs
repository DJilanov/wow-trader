import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { DUNGEON_RELEASE } from "../packages/leveling/dist/index.js";
import { updateGuideProgress } from "./leveling-browser-progress.mjs";

const { values } = parseArgs({
  options: {
    "playwright-package": { type: "string" },
    mode: { type: "string", default: "full" },
  },
  strict: true,
});
assert(
  values["playwright-package"],
  "Pass --playwright-package=<installed playwright/package.json>.",
);
assert(["full", "quest-only"].includes(values.mode));
const require = createRequire(resolve(values["playwright-package"]));
const { chromium } = require("playwright");
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3329");
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
    ["http:", "https:"].includes(base.protocol) &&
    !base.username &&
    !base.password,
  "Use an isolated local preview, never production.",
);
const output = await mkdtemp(join(tmpdir(), `wow-trader-player-flow-${values.mode}-`));
const browser = await chromium.launch();
const checked = [];
const overview = "/tools/forever/leveling/routes/alliance-human?plan=premade&class=warrior";
const chapter = (id, hash = "") =>
  `/tools/forever/leveling/routes/alliance-human/chapters/premade-${id}?plan=premade&class=warrior${hash}`;

async function progress(page) {
  return page.evaluate((release) => {
    const workspace = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1"));
    return workspace.sessions.find((session) => session.id === workspace.activeId).dungeonPlans[
      release
    ].premade;
  }, DUNGEON_RELEASE);
}
async function visit(page, pathname) {
  const response = await page.goto(new URL(pathname, base).href, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  assert.equal(response.status(), 200);
  await page.locator("[data-chapter-plan]").first().waitFor({ timeout: 60000 });
  await page.getByText("Loading your saved route…", { exact: true }).waitFor({ state: "hidden" });
}
async function noOverflow(page) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    "Horizontal overflow",
  );
}

try {
  for (const width of [1440, 390]) {
    console.log(`CHECK ${values.mode} ${width}px`);
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.route("**/api/v1/**", (route) =>
      ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(45000);
    try {
      await visit(page, overview);
      const first = page.locator('[data-route-chapter="start-115"]');
      const firstText = await first.innerText();
      assert(firstText.includes("Target level 5"), "The fresh starter needs a useful numeric goal");
      assert(firstText.includes("Level 1 · 0%"));
      assert(!/Unknown|no fixed level|Independent|Unfunded/.test(firstText));
      const finish = await first.locator("dl > div").nth(1).locator("dd").innerText();
      const nextStart = await page
        .locator('[data-route-chapter="start-116"] dl > div')
        .first()
        .locator("dd")
        .innerText();
      assert.equal(nextStart, finish, "Chapter entry reset instead of carrying XP");
      await first.screenshot({ path: join(output, `chapter-${width}.png`) });
      await noOverflow(page);

      await visit(page, chapter("start-115"));
      const start = page.getByRole("button", { name: "Start guide", exact: true });
      await start.waitFor();
      assert(await start.isVisible(), "A new reader must have a visible start action");
      await start.click();
      await page.getByRole("button", { name: "Update my level / XP", exact: true }).waitFor();
      const initial = await progress(page);
      assert(
        initial.members.every((member) => member.level === null && member.currentXp === null),
        "Planning defaults were written as observations",
      );
      await page.getByRole("button", { name: "Next step", exact: true }).click();
      const done = page.getByRole("button", { name: "Done", exact: true });
      await done.waitFor({ state: "visible" });
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Done",
          )?.disabled,
      );
      await done.click();
      await page.waitForFunction((release) => {
        const workspace = JSON.parse(localStorage.getItem("kfc-leveling:characters:v1"));
        return (
          workspace.sessions.find((session) => session.id === workspace.activeId).dungeonPlans[
            release
          ].premade.members[0].questStates["783"] === "accepted"
        );
      }, DUNGEON_RELEASE);
      assert.equal((await progress(page)).members[0].level, null);
      assert.equal((await progress(page)).members[0].currentXp, null);
      await page.screenshot({ path: join(output, `reader-${width}.png`) });
      await noOverflow(page);
    } finally {
      await context.close();
    }

    const resumeContext = await browser.newContext({ viewport: { width, height: 1000 } });
    await resumeContext.route("**/api/v1/**", (route) =>
      ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
    );
    const resumed = await resumeContext.newPage();
    resumed.on("pageerror", (error) => errors.push(error.message));
    resumed.setDefaultTimeout(45000);
    try {
      const id = "start-115-115-source-step-0073";
      await visit(resumed, chapter("start-115", `#campaign-${id}`));
      await resumed.getByRole("button", { name: "Start guide", exact: true }).click();
      const projection = resumed.locator('[data-step-projection="true"]');
      await projection.waitFor();
      if (values.mode === "full") assert((await projection.innerText()).includes("Level 4 · 80%"));
      assert(!(await projection.innerText()).includes("Player 2"));
      const before = await progress(resumed);
      await updateGuideProgress(resumed, { level: 5, xp: 321 });
      const saved = await progress(resumed);
      assert.equal(saved.members[0].guideXpAnchor.actionId, id);
      assert.deepEqual(saved.members.slice(1), before.members.slice(1));
      await resumed.getByRole("button", { name: "Next step", exact: true }).click();
      await resumed.reload({ waitUntil: "domcontentloaded" });
      await resumed.getByRole("button", { name: "Update my level / XP", exact: true }).waitFor();
      assert.deepEqual(
        (await progress(resumed)).members,
        saved.members,
        "Browsing/reload moved the saved XP bar or anchor",
      );

      await visit(resumed, overview);
      const northshire = resumed
        .locator('[data-route-chapter="start-115"] dl > div')
        .nth(1)
        .locator("dd");
      const elwynn = resumed
        .locator('[data-route-chapter="start-116"] dl > div')
        .first()
        .locator("dd");
      assert.equal(await northshire.innerText(), await elwynn.innerText());
      await resumed
        .getByText("Optional new dungeons · include, skip or adjust quest slots", { exact: true })
        .click();
      const bundle = resumed.locator(
        'section[aria-label="The Drowned City guaranteed quest bundle"]',
      );
      assert.equal(await bundle.getByRole("checkbox").count(), 5);
      const membership = await progress(resumed);
      await bundle.getByRole("checkbox").first().uncheck();
      await resumed
        .locator('[data-route-chapter="dungeon-drowned-city"]')
        .waitFor({ state: "detached" });
      assert.deepEqual((await progress(resumed)).members, membership.members);
      await resumed.reload({ waitUntil: "domcontentloaded" });
      await resumed
        .getByText("Optional new dungeons · include, skip or adjust quest slots", { exact: true })
        .click();
      assert.equal(await bundle.getByRole("checkbox").first().isChecked(), false);
      await bundle.getByRole("checkbox").first().check();
      await resumed.locator('[data-route-chapter="dungeon-drowned-city"]').waitFor();
      assert.deepEqual((await progress(resumed)).members, membership.members);

      await visit(resumed, chapter("dungeon-thanes"));
      await resumed
        .getByRole("button", { name: /^Show campaign step: Actual entry check:/ })
        .click();
      await updateGuideProgress(resumed, { player: 1, level: 16, xp: 10 });
      const party = await progress(resumed);
      assert.equal(party.members[1].level, 16);
      assert.equal(party.members[1].currentXp, 10);
      assert.equal(party.members[0].level, 5);
      assert.equal(
        await resumed.getByRole("button", { name: "Done", exact: true }).isDisabled(),
        true,
        "One player's bar must not satisfy a whole-party entry gate",
      );
      await resumed.getByRole("button", { name: "Update party level / XP", exact: true }).click();
      const dialog = resumed.getByRole("dialog", { name: /^Where are/ });
      await dialog.waitFor();
      await resumed.screenshot({ path: join(output, `progress-dialog-${width}.png`) });
      await resumed.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await noOverflow(resumed);
      if (width === 390) {
        await resumed.setViewportSize({ width: 320, height: 844 });
        await noOverflow(resumed);
      }
      checked.push({
        width,
        defaultLevelOne: true,
        numericTarget: true,
        continuousChapterBars: true,
        personalDoneWithoutXpForm: true,
        noInventedActualXp: true,
        stableXpAnchor: true,
        reloadPersistence: true,
        optionalDungeonChoices: true,
        partyCorrection: true,
        realEntryGatePreserved: true,
        escapeClosesDialog: true,
      });
      assert.deepEqual(errors, []);
    } catch (error) {
      await writeFile(
        join(output, `failure-${width}-${Date.now()}.json`),
        JSON.stringify(
          {
            message: error.message,
            url: resumed.url(),
            errors,
            body: await resumed.locator("body").innerText(),
          },
          null,
          2,
        ),
      );
      await resumed.screenshot({ path: join(output, `failure-${width}.png`) });
      throw error;
    } finally {
      await resumeContext.close();
    }
    console.log(`PASS ${values.mode} ${width}px`);
  }
  const report = { status: "passed", mode: values.mode, base: base.href, checked, output };
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
