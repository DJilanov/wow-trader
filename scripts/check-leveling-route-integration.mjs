import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DUNGEON_RELEASE } from "../packages/leveling/dist/index.js";
import { selectGuideChapter, updateGuideProgress } from "./leveling-browser-progress.mjs";

const packagePath = process.argv
  .find((arg) => arg.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath));
const { chromium, expect: defaultExpect } = require("@playwright/test");
const expect = defaultExpect.configure({ timeout: 30000 });
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3006");
if (!["localhost", "127.0.0.1", "helper.kfcguild.online"].includes(base.hostname))
  throw new Error("Unexpected integration test target.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("**/*", (route) =>
  ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
);
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [],
  output = await mkdtemp(join(tmpdir(), "kfc-leveling-integrated-"));
page.on("pageerror", (error) => errors.push(error.message));
const url = (path) => new URL(path, base).href;
const session = () =>
  page.evaluate(() => {
    const saved = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v2"));
    return saved.sessions.find((entry) => entry.id === saved.activeId);
  });
const journey = async () =>
  Object.values((await session()).dungeonPlans[DUNGEON_RELEASE].premade.campaigns)[0];
try {
  await page.goto(url("/forever/leveling/routes/alliance-human"));
  await expect(page.locator('[data-route-plan="premade"]')).toBeVisible();
  await expect(page.getByText("Loading your saved route…", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-route-chapter][data-kind="dungeon"]')).toHaveCount(21);
  await expect(page.getByRole("heading", { name: "Your chapter path", exact: true })).toBeVisible();
  await expect(page.locator('[data-route-chapter="prepare-deadmines"]')).toBeAttached();
  await expect(page.locator('[data-route-chapter="prepare-stockade"]')).toBeAttached();
  await page.screenshot({ path: join(output, "chapter-tree-desktop.png") });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
      `Tree overflow ${width}`,
    );
  }
  await page.screenshot({ path: join(output, "chapter-tree-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "Open guide →", exact: true }).click();
  await expect(page).toHaveURL(/\/routes\/alliance-human\/chapters\/premade-start-115/);
  await expect(page.getByLabel("Campaign chapter", { exact: true })).toHaveValue("start-115");
  await page.getByRole("button", { name: "Start guide", exact: true }).click();
  await expect.poll(async () => (await session()).profile.party.size).toBe(5);
  await updateGuideProgress(page, { level: 1, xp: 0 });
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  const next = (await journey()).selectedActionId;
  assert.deepEqual((await journey()).completion, {});
  await page.reload();
  await expect(page.locator(`#campaign-${next}`)).toHaveAttribute("data-selected", "true");
  const report = page.getByLabel("I completed this in game", { exact: true });
  if (await report.count()) await report.check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(async () => (await journey()).completion[next]).toBe("done");
  const chapter = page.getByLabel("Campaign chapter", { exact: true });
  await selectGuideChapter(page, "prepare-deadmines");
  await expect(page).toHaveURL(/\/chapters\/premade-prepare-deadmines/);
  await expect(chapter).toHaveValue("prepare-deadmines");
  await page.reload();
  await expect(chapter).toHaveValue("prepare-deadmines");
  await selectGuideChapter(page, "dungeon-deadmines");
  await expect(page).toHaveURL(/\/chapters\/premade-dungeon-deadmines/);
  await expect(chapter).toHaveValue("dungeon-deadmines");
  const ids = await page
    .locator("[data-campaign-action]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-campaign-action")));
  const last = ids.at(-1);
  await page.goto(
    url(
      `/forever/leveling/routes/alliance-human/chapters/premade-dungeon-deadmines?plan=premade#campaign-${last}`,
    ),
  );
  await expect(page.locator(`#campaign-${last}`)).toHaveAttribute("data-selected", "true");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(chapter).not.toHaveValue("dungeon-deadmines");
  assert.ok(page.url().includes("/routes/alliance-human/chapters/premade-"));
  const continued = (await journey()).selectedActionId;
  await page.goBack();
  await expect(chapter).toHaveValue("dungeon-deadmines");
  await expect(page.locator(`#campaign-${last}`)).toHaveAttribute("data-selected", "true");
  await page.goForward();
  await expect(chapter).not.toHaveValue("dungeon-deadmines");
  await expect(page.locator(`#campaign-${continued}`)).toHaveAttribute("data-selected", "true");
  await page.goto(url("/forever/leveling/routes/alliance-human"));
  await expect(page.getByRole("link", { name: "Continue guide →", exact: true })).toHaveAttribute(
    "href",
    new RegExp(`#campaign-${continued}$`),
  );
  await page.getByRole("link", { name: "Continue guide →", exact: true }).click();
  await expect(page.locator(`#campaign-${continued}`)).toHaveAttribute("data-selected", "true");
  await page.goto(url("/forever/leveling/routes/alliance-human?plan=questing"));
  await expect(page.locator('[data-route-plan="premade"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your chapter path", exact: true })).toBeVisible();
  assert.equal((await journey()).completion[next], "done");
  await page.goto(url("/forever/leveling/routes/alliance-human?plan=premade"));
  await expect(page.locator('[data-route-plan="premade"]')).toBeVisible();
  assert.equal((await journey()).completion[next], "done");
  await page.getByRole("link", { name: "Continue guide →", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Player 1 class", { exact: true }).selectOption("warrior");
  await expect(page).toHaveURL(/\/routes\/alliance-human\?plan=premade&class=warrior/);
  await expect(page.locator('[data-route-plan="premade"]')).toBeVisible();
  assert.equal((await session()).profile.classSlug, "warrior");
  await page.reload();
  await expect(page.locator("[data-route-release]")).toHaveAttribute(
    "data-route-release",
    /human-warrior$/,
  );
  await page.getByRole("link", { name: "Continue playing →", exact: true }).click();
  await expect(page).toHaveURL(/\/chapters\/premade-start-115.*class=warrior/);
  await expect(page.getByLabel("Campaign chapter", { exact: true })).toHaveValue("start-115");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(async () => page.title())
      .toMatch(/^Northshire — Forever Premade Quest Route/);
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
      `Reader overflow ${width}`,
    );
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const violations = await page.evaluate(async () =>
      (
        await globalThis.axe.run(globalThis.document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        })
      ).violations.map((entry) => ({
        id: entry.id,
        nodes: entry.nodes.map((node) => node.target),
      })),
    );
    assert.deepEqual(violations, []);
  }
  await page.screenshot({ path: join(output, "reader-mobile.png") });
  await page.goto(url("/forever/leveling/routes/horde-orc?plan=premade"));
  await expect(page.locator('[data-route-plan="premade"]')).toHaveCount(0);
  assert.equal(
    (
      await context.request.get(
        url("/forever/leveling/routes/alliance-human/chapters/premade-unknown"),
      )
    ).status(),
    404,
  );
  assert.equal(
    (
      await context.request.get(
        url("/forever/leveling/routes/horde-orc/chapters/premade-start-115"),
      )
    ).status(),
    404,
  );
  assert.deepEqual(errors, []);
  process.stdout.write(
    `Integrated chapter tree/reader/browser checks passed; screenshots: ${output}\n`,
  );
} finally {
  await context.request.dispose();
  await context.close();
  await browser.close();
}
