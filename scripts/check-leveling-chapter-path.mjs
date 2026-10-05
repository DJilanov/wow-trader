import assert from "node:assert/strict";
import process from "node:process";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { URL } from "node:url";
import { createCharacterProfile, getGuideStepView } from "../packages/leveling/dist/index.js";

const packagePath = process.argv
  .find((argument) => argument.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath));
const { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("Use a local preview, never production.");
const output = await mkdtemp(join(tmpdir(), "wow-trader-chapter-path-"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const profile = { ...createCharacterProfile(), classSlug: "warrior", xpRate: 1, level: 1 };
const startId = "chapter-115-1-6-northshire";
const endId = "chapter-47-59-60-winterspring-silithus-part-2";
const workspace = {
  version: 1,
  activeId: "chapter-tree-test",
  sessions: [
    {
      id: "chapter-tree-test",
      profile,
      progress: {},
      readerPositions: {},
      lastReader: null,
      lastChapterId: startId,
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

try {
  await page.goto(new URL("/forever/leveling/routes/alliance-human", base).href);
  const tree = page.getByRole("list", { name: "Full chapter route tree", exact: true });
  const start = tree.locator(`[data-chapter-node="${startId}"]`);
  const end = tree.locator(`[data-chapter-node="${endId}"]`);
  await expect(start).toContainText("Current chapter");
  await expect(end).toContainText("209,800");
  assert.ok((await tree.locator("[data-chapter-node]").count()) > 30);
  assert.equal(await page.getByRole("combobox", { name: "Level bracket", exact: true }).count(), 0);
  await expect(start).toContainText("Not estimated");
  await expect(start).toContainText("7,600");
  const manifest = JSON.parse(
    await readFile(resolve("artifacts/leveling/archive/manifest.json"), "utf8"),
  );
  const entry = manifest.chapters.find((chapter) => chapter.chapterId === startId);
  const guide = JSON.parse(
    await readFile(resolve("artifacts/leveling/archive", entry.file), "utf8"),
  );
  const views = guide.steps
    .map((step) => getGuideStepView(step, profile, { dungeons: [] }))
    .filter((view) => view.condition === "match");
  const directives = views.flatMap((view) => view.directives);
  const expectedQuests = new Set(
    directives
      .filter((directive) =>
        [".accept", ".complete", ".turnin", ".daily", ".dailyturnin"].includes(directive.tag),
      )
      .map((directive) => directive.questId),
  );
  const expectedHandIns = new Set(
    directives
      .filter((directive) => [".turnin", ".dailyturnin"].includes(directive.tag))
      .map((directive) => directive.questId),
  );
  await expect(start.locator("dl > div").nth(0).locator("dd > span")).toHaveText(
    String(expectedQuests.size),
  );
  await expect(start.locator("dl > div").nth(1).locator("dd > span")).toHaveText(
    String(expectedHandIns.size),
  );
  const before = await page.evaluate(() =>
    JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1")),
  );
  await page.getByLabel("Your effective XP/hour", { exact: true }).fill("7600");
  await expect(start).toContainText("≈1h");
  await expect(end.locator("dl > div").nth(3).locator("dd > span")).not.toHaveText("Not estimated");
  await page.reload();
  await expect(page.getByLabel("Your effective XP/hour", { exact: true })).toHaveValue("7600");
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1")),
    ),
    before,
  );
  process.stdout.write(
    "PASS: full 1–60 tree, actual source quest counts, personal timing persistence and unchanged character progress\n",
  );

  const loch = tree.locator('[data-chapter-node="chapter-117-11-13-loch-modan"]');
  const branches = loch.getByLabel("Continuations from 11-13 Loch Modan");
  assert.equal(await branches.locator("a").count(), 2);
  await branches.getByRole("link", { name: "13-15 Westfall", exact: true }).click();
  await expect(page).toHaveURL(/#path-chapter-125-13-15-westfall$/);
  await expect(tree.locator('[data-chapter-node="chapter-125-13-15-westfall"]')).toBeInViewport();
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1")),
    ),
    before,
  );
  await page.getByRole("link", { name: "Jump to current chapter ↓", exact: true }).click();
  await expect(start).toBeInViewport();
  process.stdout.write("PASS: branch and current-chapter jumps never select or complete a route\n");

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await start.scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
    );
    await page.screenshot({ path: join(output, `chapter-tree-${width}.png`), fullPage: false });
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
  process.stdout.write("PASS: desktop, 390 px and 320 px layouts and WCAG A/AA automated audits\n");

  await page.getByRole("combobox", { name: "Guide family", exact: true }).selectOption("mage-aoe");
  await expect(tree.locator("[data-chapter-node]")).toHaveCount(0);
  await expect(
    page.getByText("No applicable chapters for this guide family", { exact: false }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Guide family", exact: true }).selectOption("questing");
  await expect(start).toBeVisible();
  await page.getByLabel("Your effective XP/hour", { exact: true }).fill("0");
  await expect(page.getByRole("alert").filter({ hasText: "positive XP/hour" })).toBeVisible();
  await expect(start).toContainText("Not estimated");
  await page.getByLabel("Your effective XP/hour", { exact: true }).fill("");
  await page.reload();
  await expect(page.getByLabel("Your effective XP/hour", { exact: true })).toHaveValue("");
  process.stdout.write("PASS: unsupported family, invalid pace and cleared saved pace states\n");

  const denied = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await denied.addInitScript(() => {
    globalThis.Storage.prototype.setItem = () => {
      throw new globalThis.DOMException("Blocked", "SecurityError");
    };
  });
  const deniedPage = await denied.newPage();
  await deniedPage.goto(new URL("/forever/leveling/routes/alliance-human", base).href);
  await deniedPage.getByLabel("Your effective XP/hour", { exact: true }).fill("10000");
  await expect(
    deniedPage.getByText("This pace is not saved; browser storage is unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  await denied.close();
  process.stdout.write(
    "PASS: denied browser storage keeps calculations usable without claiming a saved pace\n",
  );
  assert.deepEqual(errors, []);
  process.stdout.write(`Screenshots: ${output}\n`);
} finally {
  await browser.close();
}
