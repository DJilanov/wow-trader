import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import { createRequire } from "node:module";
import { readFile, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createCharacterProfile, DUNGEON_RELEASE } from "../packages/leveling/dist/index.js";

const packagePath = process.argv
  .find((a) => a.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath)),
  { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("Use a local preview, never production.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(),
  errors = [];
page.setDefaultTimeout(30000);
page.on("pageerror", (e) => errors.push(e.message));
const output = await mkdtemp(join(tmpdir(), "wow-trader-dungeon-options-"));
const storage = "kfc-leveling:characters:v1",
  chapter = "chapter-128-19-20-redridge";
const dashboard = "/forever/leveling/routes/alliance-human";
const route = (id) => `${dashboard}/dungeons/${id}?chapter=${chapter}`;
const manifest = JSON.parse(
  await readFile(resolve("artifacts/leveling/archive/manifest.json"), "utf8"),
);
const entry = manifest.chapters.find((e) => e.chapterId === chapter);
const releaseKey = `${chapter}-v${entry.version.replaceAll(".", "-")}-build-70205`;
const profile = {
  ...createCharacterProfile(),
  classSlug: "warrior",
  xpRate: 1,
  level: 18,
  party: { size: 5, readiness: "together", tank: "yes", healer: "yes" },
};
const workspace = {
  version: 1,
  activeId: "dungeon-options-test",
  sessions: [
    {
      id: "dungeon-options-test",
      profile,
      lastChapterId: chapter,
      lastReader: {
        chapterId: chapter,
        version: entry.version,
        clientBuild: 70205,
        stepId: "source-step-0023",
      },
      readerPositions: { [releaseKey]: "source-step-0023" },
      progress: { [releaseKey]: { "source-step-0001": "done" } },
      dungeonPlans: {},
    },
  ],
};
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
const saved = () =>
  page.evaluate((key) => JSON.parse(globalThis.localStorage.getItem(key)).sessions[0], storage);
const plan = async () => (await saved()).dungeonPlans[DUNGEON_RELEASE];
const tripKey = (id) => `${chapter}--${id}`;
const navigation = () => page.getByRole("group", { name: "Step navigation", exact: true });
try {
  await page.goto(new URL(route("deadmines"), base).href);
  const useTrip = () => page.getByRole("button", { name: /Use dungeon trip/ });
  await expect(useTrip()).toBeDisabled();
  await expect(page.locator("[data-dungeon-trip-review]")).toContainText("level 19");
  await page.getByLabel("Actual current level", { exact: true }).fill("19");
  await expect(useTrip()).toBeEnabled();
  process.stdout.write(
    "PASS: premade entry is blocked at 18 and available at the strict level-19 floor\n",
  );

  await page.goto(new URL(dashboard, base).href);
  const node = page.locator(`[data-chapter-node="${chapter}"]`);
  const beforeDiscovery = await saved();
  const shortcut = page.getByRole("link", { name: "Find dungeon alternatives ↓", exact: true });
  await expect(shortcut).toHaveAttribute("href", `#path-${chapter}`);
  await shortcut.click();
  const dmCard = node.locator('[data-dungeon-option="deadmines"]');
  await expect(dmCard).toBeVisible();
  await expect(dmCard).toContainText("level 19+");
  await expect(dmCard).toContainText("21,867");
  await expect(
    dmCard.getByRole("link", { name: "Plan this alternative →", exact: true }),
  ).toBeVisible();
  assert.equal(await node.locator('[data-dungeon-option="wailing-caverns"]').count(), 0);
  const otherPlans = node.locator("[data-other-dungeon-plans]");
  const ruins = node.locator('[data-dungeon-option="lordaeron"]');
  await expect(ruins).toBeHidden();
  await otherPlans.locator(":scope > summary").focus();
  await otherPlans.locator(":scope > summary").press("Space");
  await expect(ruins).toBeVisible();
  await expect(ruins).toContainText("long northern journey");
  await otherPlans.locator(":scope > summary").press("Space");
  const preview = dmCard.locator("[data-itinerary-preview]");
  await preview.locator(":scope > summary").click();
  await expect(
    preview.getByRole("list", { name: "The Deadmines quest itinerary", exact: true }),
  ).toBeVisible();
  await preview.locator(":scope > summary").click();
  assert.deepEqual((await saved()).progress, beforeDiscovery.progress);
  assert.deepEqual((await saved()).dungeonPlans, beforeDiscovery.dungeonPlans);
  await node.screenshot({ path: join(output, "chapter-cards-desktop.png") });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await preview.locator(":scope > summary").click();
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
      violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      [],
    );
    await node.screenshot({ path: join(output, `chapter-cards-${width}.png`) });
    await preview.locator(":scope > summary").click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(new URL(`${dashboard}/chapters/${chapter}#guide-source-step-0023`, base).href);
  await expect(page.locator("#guide-source-step-0023")).toHaveAttribute("data-selected", "true");
  const beforeReaderDiscovery = await saved();
  const readerOptions = page.locator("[data-chapter-dungeon-options]");
  await expect(readerOptions.locator('[data-dungeon-option="deadmines"]')).toBeAttached();
  const readerShortcut = page.getByRole("link", {
    name: "Dungeon alternatives (2) ↓",
    exact: true,
  });
  await expect(readerShortcut).toBeVisible();
  await readerShortcut.click();
  await expect(readerOptions.locator('[data-dungeon-option="deadmines"] h4')).toBeVisible();
  await expect(readerOptions.locator('[data-dungeon-option="deadmines"] h4')).toBeInViewport();
  assert.equal(
    await readerOptions
      .locator('[data-dungeon-option="deadmines"] [data-itinerary-preview]')
      .getAttribute("open"),
    null,
  );
  assert.deepEqual((await saved()).readerPositions, beforeReaderDiscovery.readerPositions);
  assert.deepEqual((await saved()).progress, beforeReaderDiscovery.progress);
  await page.screenshot({ path: join(output, "reader-dungeon-discovery.png"), fullPage: false });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(readerShortcut).toBeInViewport();
    await readerShortcut.click();
    await expect(readerOptions.locator('[data-dungeon-option="deadmines"] h4')).toBeInViewport();
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
      violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      [],
    );
    await page.screenshot({ path: join(output, `reader-dungeon-discovery-${width}.png`) });
    assert.deepEqual((await saved()).readerPositions, beforeReaderDiscovery.readerPositions);
    assert.deepEqual((await saved()).progress, beforeReaderDiscovery.progress);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  process.stdout.write(
    "PASS: checkpoint alternative, collapsed other journeys, ordered quest plan, mobile accessibility and reader discovery\n",
  );
  await page.goto(new URL(dashboard, base).href);
  const westfall = page.locator('[data-chapter-node="chapter-125-13-15-westfall"]');
  assert.equal(await westfall.locator('[data-dungeon-option="deadmines"]').count(), 0);
  await page.goto(new URL(`${dashboard}/dungeons/upper-blackrock`, base).href);
  for (const panel of ["comparison", "quests"]) {
    assert.equal(
      await page.locator(`[data-trip-review-panel="${panel}"]`).getAttribute("open"),
      null,
    );
  }
  await expect(page.getByLabel("Show future and reference-only visits through 60")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Upper Blackrock Spire", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-dungeon-trip-review]")).toContainText("60");
  await expect(page.locator("#dungeon-visit-upper-blackrock")).toContainText("Doomrigger's Clasp");
  await expect(useTrip()).toBeDisabled();
  process.stdout.write(
    "PASS: competing chapter alternatives, no early attachment and complete UBRS future reference\n",
  );

  await page.goto(new URL(route("deadmines"), base).href);
  const comparePanel = page.locator('[data-trip-review-panel="comparison"]');
  await comparePanel.locator(":scope > summary").click();
  await page.getByLabel("Total trip minutes — optimistic", { exact: true }).fill("30");
  await page.getByLabel("Total trip minutes — conservative", { exact: true }).fill("40");
  await comparePanel.locator(":scope > summary").click();
  await comparePanel.locator(":scope > summary").click();
  await expect(page.getByLabel("Total trip minutes — optimistic", { exact: true })).toHaveValue(
    "30",
  );
  await comparePanel.locator(":scope > summary").click();
  const before = await saved();
  await useTrip().click();
  await expect(page.locator("#trip-prepare")).toHaveAttribute("data-selected", "true");
  await expect.poll(async () => (await plan()).activeTripId).toBe(tripKey("deadmines"));
  assert.equal((await plan()).trips[tripKey("deadmines")].returnStepId, "source-step-0023");
  assert.deepEqual((await plan()).visits, before.dungeonPlans[DUNGEON_RELEASE]?.visits ?? {});
  await navigation().getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator("#trip-travel")).toHaveAttribute("data-selected", "true");
  assert.deepEqual((await plan()).trips[tripKey("deadmines")].progress, {});
  await navigation().getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(async () => (await plan()).trips[tripKey("deadmines")].progress.travel)
    .toBe("done");
  await navigation().getByRole("button", { name: "Undo Done", exact: true }).click();
  await expect
    .poll(async () => (await plan()).trips[tripKey("deadmines")].progress.travel)
    .toBeUndefined();
  await page.reload();
  await expect(page.locator("#trip-travel")).toHaveAttribute("data-selected", "true");
  assert.deepEqual((await saved()).progress, before.progress);
  assert.deepEqual((await saved()).readerPositions, before.readerPositions);
  await page.goto(new URL(dashboard, base).href);
  await expect(
    page.getByRole("heading", { name: "Continue The Deadmines.", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue playing →", exact: true })).toHaveAttribute(
    "href",
    /dungeons\/deadmines\?chapter=.*#trip-travel/,
  );
  const selectedCard = page.locator(
    `[data-chapter-node="${chapter}"] [data-dungeon-option="deadmines"]`,
  );
  await expect(
    selectedCard.getByRole("link", { name: "Resume selected optional trip →", exact: true }),
  ).toHaveAttribute("href", /#trip-travel$/);
  process.stdout.write(
    "PASS: generic fixed-map reader, Next/Done/Undo, reload resume and source isolation\n",
  );

  await page.goto(new URL(`${route("deadmines")}#trip-hand-ins`, base).href);
  await expect(page.locator("#trip-hand-ins")).toHaveAttribute("data-selected", "true");
  await page
    .getByRole("button", { name: "Confirm hand-in: Underground Assault", exact: true })
    .click();
  await expect
    .poll(async () => (await plan()).trips[tripKey("deadmines")].xpNeedsUpdate)
    .toBe(true);
  const xpForm = page.getByRole("form", { name: "Record actual dungeon XP", exact: true });
  await xpForm.getByLabel("Actual level after hand-ins", { exact: true }).fill("20");
  await xpForm.getByLabel("Actual XP after hand-ins", { exact: true }).fill("1234");
  await xpForm.getByRole("button", { name: "Save actual XP", exact: true }).click();
  await expect
    .poll(async () => (await plan()).trips[tripKey("deadmines")].xpNeedsUpdate)
    .toBe(false);
  assert.equal((await plan()).trips[tripKey("deadmines")].currentXp, 1234);
  await page.goto(new URL(`${route("deadmines")}#trip-bridge`, base).href);
  await page.getByRole("checkbox", { name: /Keep my full outdoor source route/ }).check();
  await navigation().getByRole("button", { name: "Next step", exact: true }).click();
  await page.getByRole("button", { name: "Return to saved outdoor step →", exact: true }).click();
  await expect(page).toHaveURL(
    /chapters\/chapter-128-19-20-redridge\?outdoor=1#guide-source-step-0023$/,
  );
  await expect(page.locator("#guide-source-step-0023")).toHaveAttribute("data-selected", "true");
  assert.deepEqual((await saved()).progress, before.progress);
  process.stdout.write(
    "PASS: explicit hand-ins, actual XP refresh and exact outdoor rejoin without auto-skips\n",
  );

  await page.goto(new URL(route("wailing-caverns"), base).href);
  await useTrip().click();
  await expect(page.locator("#trip-prepare")).toHaveAttribute("data-selected", "true");
  assert.equal((await plan()).activeTripId, tripKey("wailing-caverns"));
  assert.ok((await plan()).trips[tripKey("deadmines")]);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Keep questing · preserve this trip", exact: true })
    .click();
  await page.goto(new URL(route("deadmines"), base).href);
  await page.getByRole("button", { name: "Resume dungeon instructions", exact: true }).click();
  await expect.poll(async () => (await plan()).activeTripId).toBe(tripKey("deadmines"));
  assert.ok((await plan()).trips[tripKey("wailing-caverns")]);
  process.stdout.write(
    "PASS: two competing trip plans and reversible choice preserve independent bookmarks\n",
  );

  await page.goto(new URL(`${dashboard}/dungeons/gnomeregan?chapter=${chapter}`, base).href);
  await expect(useTrip()).toBeDisabled();
  await expect(page.locator("[data-dungeon-trip-review]")).toContainText("33");
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
      violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      [],
    );
    await page.screenshot({ path: join(output, `future-${width}.png`), fullPage: false });
  }
  await page.goto(new URL(`${route("deadmines")}#trip-hand-ins`, base).href);
  await expect(page.locator("[data-leveling-workspace]")).toBeVisible();
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
      violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      [],
    );
    await page.screenshot({ path: join(output, `trip-${width}.png`), fullPage: false });
  }
  assert.deepEqual(errors, []);
  process.stdout.write(
    `PASS: above-cap floor, desktop/mobile layout and WCAG A/AA audits\nScreenshots: ${output}\n`,
  );
} finally {
  await browser.close();
}
