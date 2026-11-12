import { describe, expect, it } from "vitest";
import captured from "./fixtures/duskwood-handoff-programs-70205.json" with { type: "json" };
import { questCatalogSchema, type QuestCatalog } from "./quest-catalog.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { importedChapterSchema, parseGuideChapter } from "./guide-archive.js";
import { CHAPTER_REFERENCES } from "./chapter-data.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import {
  campaignSourceDeliveries,
  sourceDeliveryFundingCatalog,
} from "./campaign-source-deliveries.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { compileCampaignAddon } from "./campaign-addon.js";
import { questRewardFactSchema, type QuestRewardFact } from "./quest-rewards.js";

interface Fixture {
  plan: CampaignPlan;
  catalog: QuestCatalog;
  combat: CombatDataset;
  sources: CampaignSource[];
}

const handoffs = [164, 95, 230, 262, 265, 266, 453, 268];
const chain = [...handoffs, 323];

function fixture(): Fixture {
  const catalog = questCatalogSchema.parse(structuredClone(captured.catalog));
  const combat = combatDatasetSchema.parse(structuredClone(captured.combat));
  const guide = importedChapterSchema.parse(structuredClone(captured.guide));
  return {
    catalog,
    combat,
    sources: [
      { reference: CHAPTER_REFERENCES.find((entry) => entry.id === guide.chapterId)!, guide },
    ],
    plan: {
      release: "captured-duskwood-test",
      race: "human",
      leaderClass: "warrior",
      targetBuild: 70205,
      sourceArchiveSha256: catalog.sourceArchiveSha256,
      sharedQuestsOnly: true,
      sharedSourceQuestIds: chain,
      actions: [],
      legs: [],
      rewardFacts: questRewardFactSchema
        .array()
        .parse(captured.rewardFacts)
        .map(
          ({
            rewardBasis,
            evidenceKind,
            referenceBaseXp,
            pageMultiplier,
            clientReference,
            ...required
          }): QuestRewardFact => ({
            ...required,
            ...(rewardBasis === undefined ? {} : { rewardBasis }),
            ...(evidenceKind === undefined ? {} : { evidenceKind }),
            ...(referenceBaseXp === undefined ? {} : { referenceBaseXp }),
            ...(pageMultiplier === undefined ? {} : { pageMultiplier }),
            ...(clientReference === undefined ? {} : { clientReference }),
          }),
        ),
    },
  };
}

function qualify(input: Fixture): ReturnType<typeof campaignSourceDeliveries> {
  return campaignSourceDeliveries(input.plan, input.sources, input.combat, input.catalog);
}

function progress(): PremadeProgress {
  const initial = emptyPremadeProgress();
  return {
    ...initial,
    members: initial.members.map((member) => ({
      ...member,
      raceId: "human",
      level: 25,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
}

function batch(
  input: Fixture,
  state = progress(),
  rootQuestId = 323,
): ReturnType<typeof campaignFundingBatch> {
  const deliveries = qualify(input),
    catalog = sourceDeliveryFundingCatalog(input.catalog, deliveries);
  return campaignFundingBatch(
    catalog.quests.find((quest) => quest.questId === rootQuestId)!,
    catalog,
    input.combat,
    state,
    {
      legId: "duskwood",
      checkpointId: "excavation",
      targetLevel: 26,
      previous: { zone: "1431", x: 73, y: 46 },
      forbiddenQuestIds: new Set(),
      maximumQuestLevel: 29,
      leaderOnly: false,
      sourceDeliveries: deliveries,
    },
  );
}

function prepared(input: Fixture): CampaignPlan {
  const selected = batch(input)!;
  return attachCampaignCombat(
    {
      ...input.plan,
      actions: selected.actions,
      legs: [
        {
          id: "duskwood",
          title: "Sven's investigation",
          kind: "preparation",
          from: 25,
          to: 26,
          stopId: null,
          actionIds: selected.actions.map((action) => action.id),
          questIds: selected.questIds,
          unresolvedQuestIds: [],
        },
      ],
    },
    input.sources,
    input.combat,
    "captured-fixture",
  );
}

describe("captured Duskwood investigation handoffs", () => {
  it("qualifies all eight physical handoffs without changing raw source data", () => {
    const input = fixture(),
      before = structuredClone(input),
      deliveries = qualify(input);
    expect([...deliveries.keys()].sort((a, b) => a - b)).toEqual(
      [...handoffs].sort((a, b) => a - b),
    );
    const search = deliveries.get(95)!;
    expect(deliveries.get(164)!.requiresFreshQuestIds).toEqual([95]);
    expect(deliveries.get(164)!.actions[0]!.instructions.join(" ")).not.toContain(
      "need to abandon",
    );
    expect(search.requiresFreshStart).toBe(true);
    expect(search.quest.prerequisites.allOf).toContain(164);
    expect(search.actions[0]!.requiredQuestIds).toContain(164);
    expect(search.quest.ends).toEqual([]);
    expect(search.quest.objectEnds?.[0]!.objectId).toBe(59);
    for (const delivery of deliveries.values()) {
      expect(delivery.actions.map((action) => action.questChanges[0]!.state)).toEqual([
        "accepted",
        "rewarded",
      ]);
      expect(
        delivery.actions.every(
          (action) =>
            action.questChanges[0]!.objectiveIndex === null &&
            action.source &&
            action.positions.length,
        ),
      ).toBe(true);
    }
    expect(input).toEqual(before);
  });

  it("keeps the whole prerequisite closure and exactly21 shared kills", () => {
    const selected = batch(fixture())!;
    expect(selected.questIds).toEqual(chain);
    expect(selected.requiredKills).toBe(21);
    const plan = prepared(fixture());
    for (const member of forecastCampaignXp(plan, progress())[0]!.members) {
      expect(member.blockedAtActionId, member.blockedReason ?? undefined).toBeNull();
      expect(member.rewards.map((reward) => reward.questId)).toEqual(chain);
      expect(member.rewards.every((reward) => reward.xp !== null && reward.xp > 0)).toBe(true);
      expect(member.combatRows.reduce((sum, row) => sum + row.kills, 0)).toBe(21);
    }
  });

  it.each(["warrior", "priest", "mage", "rogue", "warlock"] as const)(
    "exports one complete ordinary program for %s and never abandons the player's quest",
    (classSlug) => {
      const input = fixture();
      const plan = { ...prepared(input), leaderClass: classSlug };
      const result = compileCampaignAddon(plan, plan.actions, {
        version: "0.1.0-test",
        runtimeBuild: 70450,
        interfaceVersion: 16001,
        restedXpVersion: "v4.11.27",
        nativeSources: input.sources,
      });
      const text = result.documents
        .filter((document) => document.role === "party")
        .map((document) => document.content)
        .join("\n");
      expect(text).not.toContain(".abandon 95");
      expect(text).not.toContain("need to abandon");
      expect(text).toContain("Mound of loose dirt");
      for (const id of chain)
        for (const tag of ["accept", "turnin"])
          expect([...text.matchAll(new RegExp(`\\.${tag} ${id}\\b`, "g"))]).toHaveLength(1);
    },
  );

  it.each(["accepted", "objectives-complete", "rewarded"] as const)(
    "does not offer even the supplies alone after95 is %s",
    (state) => {
      const initial = progress();
      expect(
        batch(
          fixture(),
          {
            ...initial,
            members: initial.members.map((member) => ({
              ...member,
              questStates: { "95": state },
            })),
          },
          164,
        ),
      ).toBeNull();
    },
  );

  it.each(["accepted", "objectives-complete"] as const)(
    "does not reset a player's already %s investigation",
    (state) => {
      const initial = progress();
      expect(
        batch(fixture(), {
          ...initial,
          members: initial.members.map((member) => ({
            ...member,
            questStates: { "95": state },
          })),
        }),
      ).toBeNull();
    },
  );

  it.each(["giver", "object", "parent", "runtime-guard", "late-reset"])(
    "retains the real %s source requirement",
    (kind) => {
      const input = fixture(),
        guide = input.sources[0]!.guide;
      if (kind === "giver") {
        const step = guide.steps.find((row) => row.id === "source-step-0106")!;
        step.directives = step.directives.map((row) =>
          row.tag === ".target" ? { ...row, arguments: "Sven" } : row,
        );
      } else if (kind === "object") {
        const step = guide.steps.find((row) => row.id === "source-step-0202")!;
        step.directives = step.directives.filter((row) => row.tag !== "text");
      } else if (kind === "parent") {
        const step = guide.steps.find((row) => row.id === "source-step-0106")!;
        step.directives = step.directives.filter((row) => row.tag !== ".turnin");
      } else if (kind === "runtime-guard") {
        const step = guide.steps.find((row) => row.id === "source-step-0106")!;
        step.directives.push(
          parseGuideChapter("step\n.zoneskip Ironforge", "test", "a".repeat(64), 70205).steps[0]!
            .directives[0]!,
        );
      } else {
        const index = guide.steps.findIndex((row) => row.id === "source-step-0085");
        const [reset] = guide.steps.splice(index, 1);
        guide.steps.splice(
          guide.steps.findIndex((row) => row.id === "source-step-0106") + 1,
          0,
          reset!,
        );
      }
      expect(qualify(input).has(95)).toBe(false);
      expect(batch(input)).toBeNull();
    },
  );

  it.each(["archive", "build", "provider", "quest-text", "supplied-item", "position", "version"])(
    "fails closed when the reviewed %s differs",
    (kind) => {
      const input = fixture();
      if (kind === "archive") input.plan = { ...input.plan, sourceArchiveSha256: "a".repeat(64) };
      else if (kind === "build") input.plan = { ...input.plan, targetBuild: 70450 };
      else if (kind === "provider") {
        input.combat = {
          ...input.combat,
          provider: { ...input.combat.provider, revision: "a".repeat(40) },
        };
        input.catalog = { ...input.catalog, providerRevision: "a".repeat(40) };
      } else if (kind === "quest-text")
        input.combat = {
          ...input.combat,
          quests: input.combat.quests.map((quest) =>
            quest.questId === 265
              ? { ...quest, objectiveText: ["Kill a hidden enemy and speak with Clerk Daltry."] }
              : quest,
          ),
        };
      else if (kind === "supplied-item")
        input.catalog = {
          ...input.catalog,
          quests: input.catalog.quests.map((quest) =>
            quest.questId === 265
              ? { ...quest, providedItem: { itemId: 1, name: "Different item" } }
              : quest,
          ),
        };
      else if (kind === "position") {
        const row = input.sources[0]!.guide.steps.find(
          (step) => step.id === "source-step-0282",
        )!.directives.find((row) => row.position)!;
        row.position = { ...row.position!, x: row.position!.x + 100 };
      } else input.sources[0]!.guide.version = "different-version";
      expect(qualify(input).has(265)).toBe(false);
      expect(batch(input)).toBeNull();
    },
  );
});
