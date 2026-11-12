import { describe, expect, it } from "vitest";
import type { CampaignAction } from "./campaign.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import { parseGuideChapter, type ImportedDirective } from "./guide-archive.js";
import { campaignActionSource, campaignSourceChecks } from "./campaign-source-conditions.js";
import { isUnselectedNpcQuestGuard } from "./campaign-source-npc-guards.js";

interface Fixture {
  action: CampaignAction;
  directives: ImportedDirective[];
  guard: ImportedDirective;
  catalog: Map<number, QuestCatalogEntry>;
}

function fixture(mode: "pickup" | "return" = "pickup"): Fixture {
  const reference = CHAPTER_REFERENCES.find((row) => row.sourceId === 116)!;
  const guide = parseGuideChapter([
    "step", ".goto Elwynn Forest,50,50",
    mode === "pickup" ? ".accept 350001\n.accept 350002\n.isQuestTurnedIn 350003"
      : ".turnin 350001\n.turnin 350002\n.isOnQuest 350002",
    ".target Archivist",
  ].join("\n"), reference.id, "f".repeat(64), 70205);
  const step = guide.steps[0]!, directives = [...step.directives];
  const npc = { npcId: 235, name: "Archivist", friendlyToAlliance: true,
    positions: [{ zone: "1429", x: 50, y: 50 }] };
  const own: QuestCatalogEntry = {
    questId: 350001, title: "First report", minimumLevel: 1, questLevel: 3,
    requiredRaces: 0, requiredClasses: 0, starts: [npc], ends: [npc],
    prerequisites: { allOf: [], anyOf: [] }, exclusiveWith: [], category: "delivery",
    objectives: [], unsupportedRequirements: [],
  };
  const sibling: QuestCatalogEntry = { ...own, questId: 350002,
    prerequisites: { allOf: [350003], anyOf: [] } };
  return {
    action: {
      id: "report", legId: "prepare", title: own.title, instructions: [],
      source: campaignActionSource(guide, step, directives),
      positions: directives.flatMap((row) => row.position
        ? [{ sourceLine: row.sourceLine, position: row.position }] : []),
      kind: "quests", leaderOnly: false, targetLevel: null, targetStopId: null, raidOnly: false,
      questChanges: [{ questId: own.questId, title: own.title,
        state: mode === "pickup" ? "accepted" : "rewarded", objectiveIndex: null }],
    },
    directives, guard: directives.find((row) => row.tag.startsWith(".is"))!,
    catalog: new Map([[own.questId, own], [sibling.questId, sibling],
      [350003, { ...own, questId: 350003 }]]),
  };
}

function qualifies(input: Fixture): boolean {
  return isUnselectedNpcQuestGuard(input.action, input.guard, input.directives, input.catalog);
}

describe("independent quest controls at a shared NPC", () => {
  it("does not make a sibling's item method a prerequisite of the selected NPC hand-in", () => {
    const input = fixture("return"), sibling = input.catalog.get(350002)!;
    input.catalog.set(sibling.questId, { ...sibling,
      unsupportedRequirements: ["provided-item-interaction", "unresolved-objective-text"] });
    const before = structuredClone(input);
    expect(qualifies(input)).toBe(true);
    expect(input).toEqual(before);
    input.catalog.set(sibling.questId, { ...sibling,
      unsupportedRequirements: ["unresolved-source-prerequisite"] });
    expect(qualifies(input)).toBe(false);
  });

  it.each(["pickup", "return"] as const)("scopes the %s without changing captured controls", (mode) => {
    const input = fixture(mode), before = structuredClone(input);
    expect(qualifies(input)).toBe(true);
    expect(campaignSourceChecks(input.action)).not.toContainEqual(input.guard);
    expect(input).toEqual(before);
  });

  it.each([
    "own-guard", "required-parent", "own-catalog-parent", "unknown-guard", "unknown-sibling",
    "no-sibling-phase", "different-npc", "unfriendly-npc", "unknown-own-access",
    "unknown-sibling-access", "side-effect", "conditional-source", "no-source",
    "complete-step", "no-selected-phase", "no-position", "wrong-phase-guard", "copied-guard",
  ])("keeps %s enforced", (reason) => {
    const input = fixture(), own = input.catalog.get(350001)!, sibling = input.catalog.get(350002)!;
    if (["own-guard", "unknown-guard", "wrong-phase-guard"].includes(reason)) {
      input.guard = { ...input.guard,
        ...(reason === "own-guard" ? { arguments: "350001" } : {}),
        ...(reason === "unknown-guard" ? { arguments: "999999" } : {}),
        ...(reason === "wrong-phase-guard" ? { tag: ".isOnQuest" } : {}),
      };
      input.directives = input.directives.map((row) => row.tag === ".isQuestTurnedIn" ? input.guard : row);
    }
    if (reason === "required-parent") input.action = { ...input.action, requiredQuestIds: [350003] };
    if (reason === "own-catalog-parent") input.catalog.set(own.questId,
      { ...own, prerequisites: { allOf: [350003], anyOf: [] } });
    if (reason === "unknown-sibling") input.catalog.delete(sibling.questId);
    if (reason === "no-sibling-phase") input.directives = input.directives.filter((row) => row.questId !== sibling.questId);
    if (reason === "different-npc" || reason === "unfriendly-npc") input.catalog.set(sibling.questId,
      { ...sibling, starts: sibling.starts.map((npc) => ({ ...npc,
        ...(reason === "different-npc" ? { npcId: 999 } : { friendlyToAlliance: false }) })) });
    if (reason === "unknown-own-access") input.catalog.set(own.questId,
      { ...own, unsupportedRequirements: ["unresolved-source-prerequisite"] });
    if (reason === "unknown-sibling-access") input.catalog.set(sibling.questId,
      { ...sibling, requiredClasses: 1 });
    if (reason === "side-effect") input.directives.push({ ...input.guard, tag: ".use", arguments: "42" });
    if (reason === "conditional-source") input.directives = input.directives.map((row) =>
      row.tag === ".target" ? { ...row, condition: "Warrior" } : row);
    if (reason === "no-source") input.action = { ...input.action, source: null };
    if (reason === "complete-step") input.action = { ...input.action, questChanges: [
      ...input.action.questChanges, { ...input.action.questChanges[0]!, questId: sibling.questId }] };
    if (reason === "no-selected-phase") input.directives = input.directives.filter((row) => row.questId !== own.questId);
    if (reason === "no-position") input.action = { ...input.action, positions: [] };
    if (reason === "copied-guard") input.guard = { ...input.guard };
    expect(qualifies(input)).toBe(false);
  });
});
