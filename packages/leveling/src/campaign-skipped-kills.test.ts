import { describe, expect, it } from "vitest";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { combatDatasetSchema } from "./combat-model.js";
import { importedChapterSchema } from "./guide-archive.js";
import { questCatalogSchema, isSharedFundingQuest } from "./quest-catalog.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { skippedSharedKillFundingCatalog } from "./campaign-skipped-kills.js";
import data from "./fixtures/skipped-crushridge-warmongers-70205.json" with { type: "json" };

function fixture(): {
  plan: CampaignPlan;
  sources: CampaignSource[];
  catalog: ReturnType<typeof questCatalogSchema.parse>;
  combat: ReturnType<typeof combatDatasetSchema.parse>;
} {
  const guide = importedChapterSchema.parse(structuredClone(data.guide));
  const reference = CHAPTER_REFERENCES.find((row) => row.id === guide.chapterId)!;
  const catalog = questCatalogSchema.parse(structuredClone(data.catalog));
  return {
    plan: { release: "editorial-skip-fixture", race: "human", leaderClass: "warrior",
      targetBuild: catalog.targetBuild, sourceArchiveSha256: catalog.sourceArchiveSha256,
      sharedQuestsOnly: true, actions: [], legs: [] },
    sources: [{ reference, guide }], catalog,
    combat: combatDatasetSchema.parse(structuredClone(data.combat)),
  };
}

function progress(level = 36): ReturnType<typeof emptyPremadeProgress> {
  const initial = emptyPremadeProgress(), classes = ["warrior", "priest", "mage", "rogue", "warlock"] as const;
  return { ...initial, members: initial.members.map((member, index) => ({
    ...member, raceId: "human", classSlug: classes[index]!, level, currentXp: 0,
    xpNeedsUpdate: false, questStates: { "500": "rewarded" },
  })) };
}

function batch(input: ReturnType<typeof fixture>, current = progress()): ReturnType<typeof campaignFundingBatch> {
  const catalog = skippedSharedKillFundingCatalog(input.plan, input.sources, input.combat, input.catalog);
  return campaignFundingBatch(catalog.quests.find((row) => row.questId === 504)!, catalog,
    input.combat, current, {
      legId: "prepare", checkpointId: "departure", targetLevel: 37,
      previous: { zone: "1424", x: 49.47, y: 58.73 }, forbiddenQuestIds: new Set(),
      maximumQuestLevel: Math.min(...current.members.map((member) => member.level!)) + 4,
      leaderOnly: false, includePartyElites: true,
    });
}

describe("editorially skipped plain shared kills", () => {
  it("qualifies the captured15-kill elite quest without changing source conditions or raw eligibility", () => {
    const input = fixture(), before = structuredClone(input);
    const qualified = skippedSharedKillFundingCatalog(input.plan, input.sources, input.combat, input.catalog);
    expect(isSharedFundingQuest(input.catalog.quests.find((row) => row.questId === 504)!)).toBe(false);
    expect(isSharedFundingQuest(qualified.quests.find((row) => row.questId === 504)!)).toBe(true);
    expect(qualified.quests.find((row) => row.questId === 500)).toBe(input.catalog.quests[0]);
    const selected = batch(input)!;
    expect(selected.questIds).toEqual([504]);
    expect(selected.requiredKills).toBe(15);
    expect(selected.actions.every((action) => action.source === null)).toBe(true);
    expect(selected.actions.flatMap((action) => action.questChanges.map((change) => change.state)))
      .toEqual(["accepted", "objectives-complete", "rewarded"]);
    expect(input).toEqual(before);
  });

  it("still requires the five-player party, prior hand-in and ordinary +4 ceiling", () => {
    const input = fixture();
    expect(batch(input, progress(35))).toBeNull();
    const small = progress();
    small.members = small.members.slice(0, 4);
    expect(batch(input, small)).toBeNull();
    const missingParent = progress();
    missingParent.members[4]!.questStates = {};
    expect(batch(input, missingParent)).toBeNull();
  });

  it.each([
    "not-shared", "foreign-build", "foreign-provider", "wrong-archive", "class-only", "other-requirement",
    "missing-counter", "wrong-counter", "unknown-level", "boss-rank", "missing-pickup", "missing-hand-in",
    "runtime-condition", "conditional-directive", "extra-interaction", "wrong-giver", "wrong-target",
    "unrelated-prerequisite", "interrupted-lifecycle", "supplied-tool", "personal-loot",
    "interaction-objectives", "non-kill-category",
  ] as const)("keeps %s held", (reason) => {
    const input = fixture(), guide = input.sources[0]!.guide;
    const quest = input.catalog.quests.find((row) => row.questId === 504)!;
    const pickup = guide.steps.find((step) => step.directives.some((row) => row.tag === ".accept"))!;
    if (reason === "not-shared") {
      const unshared = { ...input.plan };
      delete unshared.sharedQuestsOnly;
      input.plan = unshared;
    }
    if (reason === "foreign-build") input.combat.targetBuild++;
    if (reason === "foreign-provider") input.combat.provider.questSha256 = "0".repeat(64);
    if (reason === "wrong-archive") input.plan = { ...input.plan, sourceArchiveSha256: "0".repeat(64) };
    if (reason === "class-only") quest.requiredClasses = 1;
    if (reason === "other-requirement") quest.unsupportedRequirements.push("provided-item-interaction");
    if (reason === "missing-counter") delete input.combat.quests[0]!.killQuotas;
    if (reason === "wrong-counter") input.combat.quests[0]!.killQuotas![0]!.kills = 14;
    if (reason === "unknown-level") input.combat.npcs[0]!.maximumLevel = null;
    if (reason === "boss-rank") input.combat.npcs[0]!.rank = 3;
    if (reason === "missing-pickup") guide.steps = guide.steps.filter((step) => step !== pickup);
    if (reason === "missing-hand-in") guide.steps = guide.steps.filter((step) =>
      !step.directives.some((row) => row.tag === ".turnin"));
    if (reason === "runtime-condition") pickup.condition = "Warrior";
    if (reason === "conditional-directive") pickup.directives[0]!.condition = "Mage";
    if (reason === "extra-interaction") pickup.directives.push({ ...pickup.directives[0]!, tag: ".gossip" });
    if (reason === "supplied-tool") quest.providedItem = { itemId: 7297, name: "Morbent's Bane" };
    if (reason === "personal-loot") input.combat.quests[0]!.itemCreatureIds = [2287];
    if (reason === "interaction-objectives") {
      input.combat.quests[0]!.onlyCreatureObjectives = false;
      input.combat.quests[0]!.onlyInteractionObjectives = true;
    }
    if (reason === "non-kill-category") quest.category = "unsupported";
    if (reason === "wrong-giver") pickup.directives.find((row) => row.tag === ".target")!.arguments = "Other Marshal";
    if (reason === "wrong-target") for (const step of guide.steps) for (const row of step.directives)
      if (row.tag === ".mob") row.arguments = "Other Ogre";
    if (reason === "unrelated-prerequisite")
      pickup.directives.find((row) => row.tag === ".isQuestTurnedIn")!.arguments = "999";
    if (reason === "interrupted-lifecycle") guide.steps.find((step) =>
      step.directives.some((row) => row.tag === ".abandon"))!.ordinal = 70;
    expect(skippedSharedKillFundingCatalog(input.plan, input.sources, input.combat, input.catalog)).toBe(input.catalog);
  });
});
