import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { URL } from "node:url";
import process from "node:process";
import { DUNGEON_RELEASE } from "../packages/leveling/dist/index.js";
import { updateGuideProgress } from "./leveling-browser-progress.mjs";

const packagePath = process.argv
  .find((argument) => argument.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath));
const { chromium, expect: browserExpect } = require("@playwright/test");
const expect = browserExpect.configure({ timeout: 30000 });
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3317");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password
)
  throw new Error("Use a local preview, never production.");

const output = await mkdtemp(join(tmpdir(), "wow-trader-adaptive-handoffs-"));
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
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
    await updateGuideProgress(page, { level: 5, xp: 123 });
    const savedMembers = () =>
      page.evaluate((release) => {
        const workspace = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v2"));
        return workspace.sessions.find((session) => session.id === workspace.activeId).dungeonPlans[
          release
        ].premade.members;
      }, DUNGEON_RELEASE);
    const before = await savedMembers();
    const handoffSaved = () =>
      page.evaluate((release) => {
        const workspace = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v2"));
        const progress = workspace.sessions.find((session) => session.id === workspace.activeId)
          .dungeonPlans[release].premade;
        return Object.values(progress.campaigns).some(
          (journey) => journey.completion["start-116-entry-xp"] === "done",
        );
      }, DUNGEON_RELEASE);
    assert.equal(before[0].level, 5);
    assert.equal(before[0].currentXp, 123);
    await page.goto(
      new URL(
        "/tools/forever/leveling/routes/alliance-human/chapters/premade-start-116?plan=premade&class=warrior",
        base,
      ).href,
      { waitUntil: "networkidle", timeout: 90000 },
    );
    await expect(page.locator('[data-campaign-action="start-116-entry-xp"]')).toBeVisible();
    await expect(page.locator('[data-chapter-plan="start-116"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Done", exact: true })).toBeEnabled();
    await expect(page.getByText("Reach level 6 before Elwynn Forest", { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect.poll(handoffSaved).toBe(true);
    assert.deepEqual(await savedMembers(), before, "A zone handoff changed actual party XP.");
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(handoffSaved).toBe(true);
    await expect(page.getByText(/^1\/\d+ chapter steps done/)).toBeVisible();
    assert.deepEqual(await savedMembers(), before, "A reload changed actual party XP.");
    await page.screenshot({ path: join(output, `${width}.png`), fullPage: true });

    // Report earlier hand-ins in this isolated test session, leaving its observed bar stale.
    await page.evaluate((release) => {
      const key = "kfc-leveling:characters:v2";
      const workspace = JSON.parse(globalThis.localStorage.getItem(key));
      const progress = workspace.sessions.find((session) => session.id === workspace.activeId)
        .dungeonPlans[release].premade;
      progress.members[0] = {
        ...progress.members[0],
        level: 1,
        currentXp: 0,
        xpNeedsUpdate: true,
        questStates: Object.fromEntries(
          [783, 5261, 91741, 92124, 33, 7, 15, 91743, 3100].map((id) => [id, "rewarded"]),
        ),
      };
      for (const journey of Object.values(progress.campaigns)) {
        journey.selectedActionId = "start-115-level-2-18";
        journey.completion = {};
      }
      globalThis.localStorage.setItem(key, JSON.stringify(workspace));
    }, DUNGEON_RELEASE);
    const reported = await savedMembers();
    await page.goto(
      new URL(
        "/tools/forever/leveling/routes/alliance-human/chapters/premade-start-115?plan=premade&class=warrior#campaign-start-115-level-2-18",
        base,
      ).href,
      { waitUntil: "networkidle", timeout: 90000 },
    );
    await expect(
      page.locator('[data-campaign-action="start-115-115-source-step-0046"]'),
    ).toBeVisible();
    await expect(page.locator('[data-campaign-action="start-115-level-2-18"]')).toHaveCount(0);
    await expect(
      page.getByText("Every participating player must reach level 2", { exact: false }),
    ).toHaveCount(0);
    await page.getByRole("checkbox", { name: "I completed this in game", exact: true }).check();
    await expect(page.getByRole("button", { name: "Done", exact: true })).toBeEnabled();
    await page.screenshot({ path: join(output, `funded-pickup-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect.poll(async () => (await savedMembers())[0].questStates["18"]).toBe("accepted");
    await page.reload({ waitUntil: "networkidle" });
    const afterPickup = await savedMembers();
    assert.deepEqual(
      afterPickup[0],
      {
        ...reported[0],
        questStates: { ...reported[0].questStates, 18: "accepted" },
      },
      "Reporting a funded pickup changed the observed XP bar or other quest reports.",
    );
    assert.deepEqual(afterPickup.slice(1), reported.slice(1), "Leader XP leaked to the party.");
    assert.equal(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth,
      ),
      false,
      "Adaptive handoff controls overflow the viewport.",
    );
    assert.deepEqual(errors, [], "The reader raised a browser error.");
    await context.close();
  }
  process.stdout.write(`${JSON.stringify({ status: "passed", widths: [1440, 390], output })}\n`);
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
      const text = await page.locator("body").innerText();
      const warnings = text.match(
        /.{0,60}(?:Record fresh|before quest|not eligible|minimum level).{0,180}/g,
      );
      process.stderr.write(`${JSON.stringify({ url: page.url(), warnings, output })}\n`);
    }
  throw error;
} finally {
  await browser.close();
}
