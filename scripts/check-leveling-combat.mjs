import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { URL } from "node:url";
import process from "node:process";
import {
  CHAPTER_REFERENCES,
  chapterEligibility,
  getGuideStepView,
  createCharacterProfile,
  combatDatasetSchema,
  indexCombatReferences,
  resolveCombatObjectives,
  estimateCreatureKills,
} from "../packages/leveling/dist/index.js";

const packagePath = process.argv
  .find((argument) => argument.startsWith("--playwright-package="))
  ?.slice("--playwright-package=".length);
if (!packagePath)
  throw new Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath)),
  { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 60000 }),
  base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3008");
if (!["localhost", "127.0.0.1"].includes(base.hostname))
  throw new Error("Synthetic combat checks are restricted to a local preview.");
const archive = resolve(process.env.LEVELING_ARCHIVE_ROOT ?? "artifacts/leveling/archive"),
  manifest = JSON.parse(await readFile(join(archive, "manifest.json"), "utf8"));
const combatRoot = resolve(process.env.LEVELING_COMBAT_ROOT ?? "artifacts/leveling/combat"),
  combatManifest = JSON.parse(await readFile(join(combatRoot, "manifest.json"), "utf8"));
const data = combatDatasetSchema.parse(
    JSON.parse(await readFile(join(combatRoot, combatManifest.file), "utf8")),
  ),
  index = indexCombatReferences(data);
const sources = await Promise.all(
  manifest.chapters.map(async (entry) => ({
    reference: CHAPTER_REFERENCES.find((reference) => reference.id === entry.chapterId),
    guide: JSON.parse(await readFile(join(archive, entry.file), "utf8")),
  })),
);
const output = await mkdtemp(join(tmpdir(), "kfc-combat-browser-"));
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  errors = [];
try {
  for (const [faction, race] of [
    ["alliance", "human"],
    ["horde", "undead"],
  ]) {
    const profile = { ...createCharacterProfile(faction, race), classSlug: "warrior" };
    let candidate;
    for (const source of sources) {
      if (
        source.reference.family !== "questing" ||
        chapterEligibility(source.reference, profile) !== "match"
      )
        continue;
      for (const step of source.guide.steps) {
        const view = getGuideStepView(step, profile, { dungeons: [] });
        if (view.condition !== "match") continue;
        for (const objective of resolveCombatObjectives(view.directives, index, "test")) {
          if (
            objective.credit !== "shared-kills" ||
            objective.requiredKills === null ||
            objective.npcIds.length !== 1
          )
            continue;
          const npc = data.npcs.find((npc) => npc.id === objective.npcIds[0]);
          if (!npc || npc.minimumLevel === null || npc.minimumLevel > 55) continue;
          const level = npc.minimumLevel;
          const input = {
            npc,
            kills: objective.requiredKills,
            position: { level, currentXp: 0 },
            environment: "outdoor",
          };
          if ((estimateCreatureKills({ ...input, partySize: 5 }).xp ?? 0) <= 0) continue;
          candidate = { ...source, step, objective, npc, level };
          break;
        }
        if (candidate) break;
      }
      if (candidate) break;
    }
    assert.ok(candidate, `No reconciled combat preview for ${faction}`);
    for (const size of [1, 5]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.route("**/*", (route) =>
        ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
      );
      const workspace = {
        version: 1,
        activeId: "combat-test",
        sessions: [
          {
            id: "combat-test",
            profile: {
              ...profile,
              level: candidate.level,
              party: { size, readiness: "together", tank: "yes", healer: "yes" },
            },
            progress: {},
            readerPositions: {},
            lastReader: null,
            lastChapterId: null,
            dungeonPlans: {},
          },
        ],
      };
      await context.addInitScript(
        ({ workspace, origin }) => {
          if (
            globalThis.location.origin === origin &&
            !globalThis.localStorage.getItem("kfc-leveling:characters:v2")
          )
            globalThis.localStorage.setItem(
              "kfc-leveling:characters:v2",
              JSON.stringify(workspace),
            );
        },
        { workspace, origin: base.origin },
      );
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.goto(
        new URL(
          `/forever/leveling/routes/${faction}-${race}/chapters/${candidate.guide.chapterId}?edition=source#guide-${candidate.step.id}`,
          base,
        ).href,
      );
      assert.equal(response.status(), 200);
      await expect(page.locator("[data-leveling-workspace] > header")).toContainText("Warrior");
      await page.getByRole("button", { name: "All steps", exact: true }).click();
      await expect(page.locator("[data-leveling-workspace]")).toHaveAttribute(
        "data-reader-display",
        "all",
      );
      const panel = page.locator(`#guide-${candidate.step.id} [data-combat-targets]`);
      await expect(panel).toHaveCount(1);
      const saved = await page.evaluate(() => {
        const session = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v2"))
          .sessions[0];
        return JSON.stringify({ progress: session.progress, dungeonPlans: session.dungeonPlans });
      });
      await panel.locator("summary").click();
      await expect(panel).toContainText(size === 1 ? "Solo" : "5 players · 1/5 solo kill XP each");
      await expect(panel).toContainText(candidate.npc.name);
      await expect(panel).toContainText(`${candidate.objective.requiredKills} shared kills`);
      const estimate = estimateCreatureKills({
        npc: candidate.npc,
        kills: candidate.objective.requiredKills,
        position: { level: candidate.level, currentXp: 0 },
        partySize: size,
        environment: "outdoor",
      });
      const payout =
        estimate.xp.toLocaleString("en-US") +
        (estimate.maximumXp !== estimate.xp
          ? `–${estimate.maximumXp.toLocaleString("en-US")}`
          : "");
      await expect(panel).toContainText(`${payout} XP per player`);
      const link = panel.getByRole("link", { name: candidate.npc.name, exact: true }).first();
      await expect(link).toHaveAttribute(
        "href",
        `https://www.wowhead.com/forever/npc=${candidate.npc.id}`,
      );
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await panel.scrollIntoViewIfNeeded();
        assert.ok(
          await page.evaluate(
            () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
          ),
          `Overflow at ${width}`,
        );
      }
      await page.screenshot({ path: join(output, `${faction}-${size}.png`), fullPage: false });
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () =>
        (
          await globalThis.axe.run(globalThis.document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
          })
        ).violations.map((violation) => violation.id),
      );
      assert.deepEqual(violations, []);
      assert.equal(
        await page.evaluate(() => {
          const session = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v2"))
            .sessions[0];
          return JSON.stringify({ progress: session.progress, dungeonPlans: session.dungeonPlans });
        }),
        saved,
        "Inspecting combat modified actual progress",
      );
      await context.close();
    }
  }
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    new URL("/forever/leveling/routes/alliance-human?plan=premade&class=warrior", base).href,
  );
  await expect(page.getByText("Combat reference coverage", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Required outdoor combat / player", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Dungeon combat / player", { exact: true }).first()).toBeVisible();
  assert.deepEqual(errors, []);
  process.stdout.write(
    `Combat browser checks passed: solo/group, both factions, NPC links, 320–1440px, accessibility and unchanged saves. Screenshots: ${output}\n`,
  );
} finally {
  await browser.close();
}
