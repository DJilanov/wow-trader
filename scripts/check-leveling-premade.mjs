import assert from "node:assert/strict";
import process from "node:process";
import { createRequire } from "node:module";
import { URL } from "node:url";
import { resolve, join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DUNGEON_RELEASE } from "../packages/leveling/dist/index.js";

const packagePath = process.argv
  .find((arg) => arg.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath));
const { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3006");
if (!["localhost", "127.0.0.1", "helper.kfcguild.online"].includes(base.hostname))
  throw new Error("Unexpected test target.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("**/*", (route) => {
  const method = route.request().method();
  return ["GET", "HEAD"].includes(method) ? route.continue() : route.abort();
});
const page = await context.newPage();
const errors = [];
const failedMapResponses = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.url().includes("/api/forever-map-media/") && response.status() !== 200)
    failedMapResponses.push(response.status());
});
const output = await mkdtemp(join(tmpdir(), "kfc-premade-browser-"));
const saved = () =>
  page.evaluate(() => JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1")));
const plan = async () => {
  const workspace = await saved();
  return workspace.sessions.find((session) => session.id === workspace.activeId).dungeonPlans[
    DUNGEON_RELEASE
  ]?.premade;
};
try {
  await page.goto(new URL("/forever/leveling/premade/dungeons", base).href);
  await expect(
    page.getByRole("heading", { name: "Five players. One dungeon path." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save a five-player plan", exact: true }).click();
  await page.getByLabel("Current dungeon stop", { exact: true }).selectOption("deadmines");
  await expect.poll(async () => (await plan())?.selectedStopId).toBe("deadmines");
  if ((await page.locator("#leveling-zone-map svg image").count()) > 0) {
    await expect(page.getByText("Loading native zone artwork…", { exact: true })).toHaveCount(0, {
      timeout: 30000,
    });
    await expect(page.locator("#leveling-zone-map [data-map-marker]").first()).toBeVisible();
    await page.screenshot({ path: join(output, "map.png"), fullPage: true });
    assert.deepEqual(failedMapResponses, []);
  }
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect.poll(async () => (await plan()).selectedStage).toBe("clear");
  assert.equal((await plan()).stages["deadmines-prepare"], undefined);
  await page.getByRole("button", { name: "Done → next step", exact: true }).click();
  await expect.poll(async () => (await plan()).selectedStage).toBe("hand-in");
  assert.equal((await plan()).stages["deadmines-clear"], true);
  await page.reload();
  await expect.poll(async () => (await plan()).selectedStage).toBe("hand-in");
  await expect(page.getByLabel("Current dungeon stop", { exact: true })).toHaveValue("deadmines");
  const quest = page.locator('[data-premade-quest="167"]');
  await quest.locator("details > summary").click();
  await quest.getByRole("button", { name: "Record all 5 handed in" }).click();
  assert.ok(
    (await plan()).members.every(
      (member) => member.questStates["167"] === "rewarded" && member.xpNeedsUpdate,
    ),
  );
  await page
    .getByText("Party XP checkpoint · record all five actual bars", { exact: true })
    .click();
  const xpForm = page.getByRole("form", { name: "Actual XP for player 1", exact: true });
  await xpForm.getByLabel("Player 1 actual level", { exact: true }).fill("20");
  await xpForm.getByLabel("Player 1 actual XP", { exact: true }).fill("1000");
  await xpForm.getByRole("button", { name: "Save actual XP", exact: true }).click();
  await expect.poll(async () => (await plan()).members[0].currentXp).toBe(1000);
  assert.equal((await plan()).members[0].xpNeedsUpdate, false);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect.poll(async () => (await plan()).selectedStage).toBe("checkpoint");
  await expect(page.getByRole("button", { name: "Done → next step", exact: true })).toBeDisabled();
  await page.getByLabel("Current dungeon stop", { exact: true }).selectOption("lordaeron");
  await expect(page.getByText("Requested 18 · current policy 19", { exact: true })).toBeVisible();
  await page
    .getByLabel("Dungeon entry policy", { exact: true })
    .selectOption("experienced-premade");
  await expect(page.getByText("Requested 18 · current policy 18", { exact: true })).toBeVisible();
  await page
    .getByText("XP assumptions, faction-parity what-if & your trip time", { exact: true })
    .click();
  await page.getByLabel("Hypothetical faction-balancing quests", { exact: true }).fill("3");
  await page.getByLabel("Hypothetical base quest XP", { exact: true }).fill("2600");
  await page.getByLabel("Current dungeon stop", { exact: true }).selectOption("deadmines");
  await expect(
    page.getByLabel("Hypothetical faction-balancing quests", { exact: true }),
  ).toHaveValue("0");
  assert.equal((await plan()).parityScenarios.lordaeron.extraQuests, 3);
  const extra = page.locator('[data-premade-quest="92753"]');
  const extras = page.getByText("Opportunistic collections & later returns · never forced filler", {
    exact: true,
  });
  await extras.click();
  await extra.getByLabel("Include", { exact: true }).click();
  assert.equal((await plan()).selectedExtras["92753"], true);
  await page.getByText("Your full dungeon path · quests, XP and time", { exact: true }).click();
  await expect(
    page
      .locator("ol")
      .filter({ has: page.getByRole("button", { name: /Hall of Thanes/ }) })
      .locator("li"),
  ).toHaveCount(21);
  await page.screenshot({ path: join(output, "desktop.png"), fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
      `Horizontal overflow at ${width}px`,
    );
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const violations = await page.evaluate(async () =>
      (
        await globalThis.axe.run(globalThis.document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        })
      ).violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target),
      })),
    );
    assert.deepEqual(violations, []);
  }
  await page.screenshot({ path: join(output, "mobile.png"), fullPage: true });
  await page.reload();
  await expect(page.getByLabel("Current dungeon stop", { exact: true })).toHaveValue("deadmines");
  assert.equal((await plan()).selectedExtras["92753"], true);
  await page.getByLabel("Current dungeon stop", { exact: true }).selectOption("drowned-city");
  await expect(page.getByText("Quest data missing", { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  process.stdout.write(`Premade browser regressions passed; screenshots: ${output}\n`);
} finally {
  await context.close();
  await browser.close();
}
