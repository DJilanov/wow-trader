import assert from "node:assert/strict";
import process from "node:process";
import { createRequire } from "node:module";
import { URL } from "node:url";
import { resolve, join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DUNGEON_RELEASE } from "../packages/leveling/dist/index.js";
import { selectGuideChapter } from "./leveling-browser-progress.mjs";

const packagePath = process.argv
  .find((arg) => arg.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath)),
  { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3006");
if (!["localhost", "127.0.0.1", "helper.kfcguild.online"].includes(base.hostname))
  throw new Error("Unexpected campaign test target.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("**/*", (route) =>
  ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
);
const page = await context.newPage(),
  errors = [],
  output = await mkdtemp(join(tmpdir(), "kfc-leveling-campaign-"));
page.setDefaultTimeout(30000);
page.on("pageerror", (error) => errors.push(error.message));
const data = () =>
  page.evaluate(() => {
    const workspace = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v2"));
    return workspace.sessions.find((session) => session.id === workspace.activeId);
  });
const journey = async () =>
  Object.values((await data()).dungeonPlans[DUNGEON_RELEASE].premade.campaigns)[0];
try {
  await page.goto(new URL("/forever/leveling/premade", base).href);
  await expect(
    page.getByRole("heading", { name: /Premade 5 · full leveling campaign/ }),
  ).toBeVisible();
  const chapter = page.getByLabel("Campaign chapter", { exact: true });
  await selectGuideChapter(page, "prepare-stockade");
  await expect(chapter).toHaveValue("prepare-stockade");
  await expect(
    page.getByRole("button", { name: /^Show campaign step:.*Night Watch/ }).first(),
  ).toBeVisible();
  await selectGuideChapter(page, "start-115");
  await page.getByRole("button", { name: "Start guide", exact: true }).click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect.poll(async () => (await journey())?.selectedActionId).toBeTruthy();
  const nextId = (await journey()).selectedActionId;
  assert.deepEqual((await journey()).completion, {});
  await page.reload();
  await expect(page.locator(`#campaign-${nextId}`)).toHaveAttribute("data-selected", "true");
  await page.getByRole("button", { name: "Done", exact: true }).isEnabled();
  const report = page.getByLabel("I completed this in game", { exact: true });
  if (await report.count()) await report.check();
  const previousId = (await journey()).selectedActionId;
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(async () => (await journey()).completion[previousId]).toBe("done");
  await page.reload();
  assert.notEqual((await journey()).selectedActionId, previousId);
  await selectGuideChapter(page, "prepare-stockade");
  await expect(
    page.getByRole("button", { name: /^Show campaign step:.*Tramping Paws/ }).first(),
  ).toBeVisible();
  await selectGuideChapter(page, "dungeon-stockade");
  await page.getByRole("button", { name: /^Show campaign step: Actual entry check:/ }).click();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
  await selectGuideChapter(page, "dungeon-blackrock-depths");
  await expect(
    page.getByRole("button", { name: /^Show campaign step:.*Abandoned Hope/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Show campaign step:.*Jail Break/ }).first(),
  ).toBeVisible();
  await selectGuideChapter(page, "finish-leveling");
  await page
    .getByRole("button", { name: /^Show campaign step: All five have reached level 60/ })
    .click();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
  await selectGuideChapter(page, "dungeon-drowned-city");
  await page
    .getByRole("button", { name: /^Show campaign step:.*quest\/access evidence missing/ })
    .click();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(chapter).toHaveValue("prepare-scarlet-monastery");
  await page.getByRole("button", { name: /^Your complete 1–60 path/ }).click();
  await expect(page.locator('[data-campaign-leg][data-kind="dungeon"]')).toHaveCount(21);
  await expect(page.locator('[data-campaign-leg="start-115"]')).toBeVisible();
  await expect(page.locator('[data-campaign-leg="finish-leveling"]')).toBeVisible();
  await page.screenshot({ path: join(output, "desktop.png"), fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
      `Horizontal overflow at ${width}`,
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
  await page.goto(new URL("/forever/leveling/premade?race=night-elf&class=druid", base).href);
  await expect(page.getByLabel("Campaign chapter", { exact: true })).toHaveValue("start-113");
  await page.goto(new URL("/forever/leveling/premade?race=dwarf&class=hunter", base).href);
  await expect(
    page.getByLabel("Campaign chapter", { exact: true }).locator('option[value="start-123"]'),
  ).toHaveCount(1);
  assert.deepEqual(errors, []);
  process.stdout.write(`Continuous campaign browser checks passed; screenshots: ${output}\n`);
} finally {
  await context.close();
  await browser.close();
}
