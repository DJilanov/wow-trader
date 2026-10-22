import assert from "node:assert/strict";
import console from "node:console";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { URL } from "node:url";
import { createCharacterProfile } from "../packages/leveling/dist/index.js";

const { values } = parseArgs({
  options: { "playwright-package": { type: "string" } },
  strict: true,
});
assert(
  values["playwright-package"],
  "Pass --playwright-package=<installed playwright/package.json>.",
);
const require = createRequire(resolve(values["playwright-package"]));
const { chromium, expect: defaultExpect } = require("playwright/test");
const expect = defaultExpect.configure({ timeout: 30000 });
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3332");
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
    ["http:", "https:"].includes(base.protocol) &&
    !base.username &&
    !base.password,
  "Use an isolated local preview, never production.",
);
const output = await mkdtemp(join(tmpdir(), "wow-trader-reader-browsing-"));
const browser = await chromium.launch();
const checked = [];
const chapterId = "chapter-117-11-13-loch-modan";
const pathname = `/tools/forever/leveling/routes/alliance-human/chapters/${chapterId}?edition=source#guide-source-step-0020`;

async function gameplay(page) {
  return page.evaluate(() => {
    const workspace = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v2"));
    const session = workspace.sessions.find((entry) => entry.id === workspace.activeId);
    return {
      profile: session.profile,
      progress: session.progress,
      dungeonPlans: session.dungeonPlans,
    };
  });
}
async function visibleIds(cards) {
  return cards.evaluateAll((nodes) =>
    nodes.filter((node) => node.getClientRects().length > 0).map((node) => node.id),
  );
}
async function afterLayout(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
      ),
  );
}

try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.route("**/api/v1/**", (route) =>
      ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
    );
    await context.addInitScript(
      ({ origin, profile, chapterId }) => {
        if (
          globalThis.location.origin !== origin ||
          globalThis.localStorage.getItem("kfc-leveling:characters:v2")
        )
          return;
        globalThis.localStorage.setItem(
          "kfc-leveling:characters:v2",
          JSON.stringify({
            version: 1,
            activeId: "reader-browsing-test",
            sessions: [
              {
                id: "reader-browsing-test",
                profile,
                progress: {},
                readerPositions: {},
                lastReader: null,
                lastChapterId: chapterId,
                dungeonPlans: {},
              },
            ],
          }),
        );
      },
      {
        origin: base.origin,
        profile: { ...createCharacterProfile(), classSlug: "warrior", xpRate: 1, level: 11 },
        chapterId,
      },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      const response = await page.goto(new URL(pathname, base).href, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });
      assert.equal(response.status(), 200);
      const workspace = page.locator("[data-leveling-workspace]");
      const pane = page.locator("#leveling-quest-pane");
      const cards = pane.locator(":scope > ol > [data-reader-step]");
      const card = (id) => pane.locator(`[id="${id}"]`);
      await expect(workspace).toHaveAttribute("data-reader-display", "all");
      await expect(card("guide-source-step-0020")).toHaveAttribute("data-selected", "true");
      await expect(page.getByRole("button", { name: "Done", exact: true })).toBeEnabled();
      await expect(page.getByRole("button", { name: "All steps", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const allIds = await visibleIds(cards);
      assert(allIds.length > 20, "The chapter must not be limited to current + next");
      const before = await gameplay(page);
      const scrollBefore = await pane.evaluate((element) => element.scrollTop);
      await pane.hover();
      await page.mouse.wheel(0, 900);
      await expect
        .poll(() => pane.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(scrollBefore + 100);
      await expect(card("guide-source-step-0020")).toHaveAttribute("data-selected", "true");
      await pane.focus();
      const beforeKey = await pane.evaluate((element) => element.scrollTop);
      await page.keyboard.press("PageDown");
      await expect
        .poll(() => pane.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(beforeKey);
      await expect(page).toHaveURL(/#guide-source-step-0020$/);

      const clickedId = "guide-source-step-0021";
      const title = card(clickedId).locator("h3 button");
      await title.scrollIntoViewIfNeeded();
      const topBefore = (await card(clickedId).boundingBox()).y;
      await title.click();
      await expect(card(clickedId)).toHaveAttribute("data-selected", "true");
      await expect(page).toHaveURL(/#guide-source-step-0021$/);
      await afterLayout(page);
      assert(
        Math.abs((await card(clickedId).boundingBox()).y - topBefore) < 3,
        "Selecting a quest moved the list",
      );
      assert.deepEqual(await visibleIds(cards), allIds, "Selecting a quest hid other instructions");
      assert.deepEqual(
        await gameplay(page),
        before,
        "Browsing completed a quest or changed gameplay data",
      );

      await pane.evaluate((element) =>
        element.scrollTo(0, element.scrollHeight - element.clientHeight),
      );
      await page.setViewportSize({ width, height: 900 });
      await afterLayout(page);
      assert(
        (await pane.evaluate((element) => element.scrollTop)) > 2000,
        "Resize snapped the list back to the selected quest",
      );
      await expect(card(clickedId)).not.toBeInViewport();
      await expect(page).toHaveURL(/#guide-source-step-0021$/);

      await page.getByRole("button", { name: "Current + next", exact: true }).click();
      await expect(workspace).toHaveAttribute("data-reader-display", "focus");
      const focusIds = await visibleIds(cards);
      assert.equal(focusIds.length, 2);
      assert.equal(focusIds[0], clickedId);
      const nextId = focusIds[1];
      await card(nextId).locator("h3 button").click();
      await expect(card(nextId)).toHaveAttribute("data-selected", "true");
      await expect(card(nextId).locator("h3 button")).toBeInViewport();
      await expect
        .poll(async () => {
          const target = await card(nextId).boundingBox();
          const bounds = await pane.boundingBox();
          return target.y - bounds.y;
        })
        .toBeLessThan(30);
      assert.deepEqual(await gameplay(page), before);
      await page.reload();
      await expect(workspace).toHaveAttribute("data-reader-display", "focus");
      await expect(card(nextId)).toHaveAttribute("data-selected", "true");

      await page.getByRole("button", { name: "All steps", exact: true }).click();
      await expect(workspace).toHaveAttribute("data-reader-display", "all");
      const afterNextId = await cards.evaluateAll(
        (nodes) => nodes.find((node) => node.dataset.readerNext === "true")?.id,
      );
      assert(afterNextId);
      await page.getByRole("button", { name: "Next step", exact: true }).click();
      await expect(card(afterNextId)).toHaveAttribute("data-selected", "true");
      assert.deepEqual(
        await gameplay(page),
        before,
        "Next should browse without completing a quest",
      );
      const afterDoneId = await cards.evaluateAll(
        (nodes) => nodes.find((node) => node.dataset.readerNext === "true")?.id,
      );
      assert(afterDoneId);
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await expect(card(afterDoneId)).toHaveAttribute("data-selected", "true");
      const stepId = afterNextId.slice("guide-".length);
      await expect
        .poll(async () =>
          Object.values((await gameplay(page)).progress).some(
            (progress) => progress[stepId] === "done",
          ),
        )
        .toBe(true);
      await page.getByRole("button", { name: "Undo Done", exact: true }).click();
      await expect(card(afterNextId)).toHaveAttribute("data-selected", "true");
      await expect
        .poll(async () =>
          Object.values((await gameplay(page)).progress).some(
            (progress) => progress[stepId] === "done",
          ),
        )
        .toBe(false);
      await page.reload();
      await expect(workspace).toHaveAttribute("data-reader-display", "all");
      await expect(card(afterNextId)).toHaveAttribute("data-selected", "true");
      assert.deepEqual(await visibleIds(cards), allIds);
      const after = await gameplay(page);
      assert.deepEqual(after.profile, before.profile);
      assert.deepEqual(after.dungeonPlans, before.dungeonPlans);
      assert.equal(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      await page.screenshot({ path: join(output, `reader-${width}.png`) });
      checked.push({
        width,
        fullChapterByDefault: true,
        mouseAndKeyboardScrolling: true,
        selectionDoesNotAdvance: true,
        stableList: true,
        noResizeSnap: true,
        explicitFocusRetainsSelectedCard: true,
        preferencePersistence: true,
        completionAndUndo: true,
        noOverflow: true,
      });
      console.log(`PASS reader browsing ${width}px`);
    } finally {
      await context.close();
    }
  }
  const report = { status: "passed", base: base.href, checked, output };
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
