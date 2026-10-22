import {
  buildCampaignPlan,
  type CampaignAction,
  type CampaignLeg,
  type CampaignPlan,
  type CampaignSource,
} from "./campaign.js";
import { LEVELING_RACES } from "./profile.js";
import { isCampaignRace, campaignStarterSourceIds, type CampaignRace } from "./campaign-route.js";
import type { ClassSlug } from "./model.js";
import type { CampaignCombatPlan, CombatActivity, CombatDataset } from "./combat-model.js";
import type { QuestRewardFact } from "./quest-rewards.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { compileCampaignPickupGates } from "./campaign-pickup-gates.js";

export interface CampaignStarterRoute {
  readonly race: CampaignRace;
  readonly classSlug: ClassSlug | null;
  readonly legs: readonly CampaignLeg[];
  readonly actionIndexes: readonly number[];
}

/** Source actions shared between race/class variants are serialized once, not once per player. */
export interface CampaignStarterCatalog {
  readonly entries: readonly {
    readonly action: CampaignAction;
    readonly activities: readonly CombatActivity[];
  }[];
  readonly routes: readonly CampaignStarterRoute[];
  readonly combat?: Omit<CampaignCombatPlan, "activities">;
}

function catalog(plans: readonly CampaignPlan[]): CampaignStarterCatalog {
  const entries: CampaignStarterCatalog["entries"][number][] = [];
  const indexes = new Map<string, number>();
  const routes = plans.map((plan): CampaignStarterRoute => ({
    race: plan.race,
    classSlug: plan.leaderClass,
    legs: plan.legs,
    actionIndexes: plan.actions.map((action) => {
      const entry = {
        action,
        activities:
          plan.combat?.activities.filter((activity) => activity.actionId === action.id) ?? [],
      };
      const key = JSON.stringify(entry);
      let index = indexes.get(key);
      if (index === undefined) {
        index = entries.length;
        indexes.set(key, index);
        entries.push(entry);
      }
      return index;
    }),
  }));
  const references = plans.flatMap((plan) => (plan.combat ? [plan.combat] : []));
  const first = references[0];
  return {
    entries,
    routes,
    ...(first
      ? {
          combat: {
            revision: first.revision,
            sourceRevision: first.sourceRevision,
            targetBuild: first.targetBuild,
            notice: first.notice,
            npcs: [
              ...new Map(
                references.flatMap((reference) =>
                  reference.npcs.map((npc) => [npc.id, npc] as const),
                ),
              ).values(),
            ],
            killXpEvidence: [
              ...new Map(
                references.flatMap((reference) =>
                  (reference.killXpEvidence ?? []).map(
                    (entry) => [JSON.stringify(entry), entry] as const,
                  ),
                ),
              ).values(),
            ],
            lootDrops: [
              ...new Map(
                references.flatMap((reference) =>
                  (reference.lootDrops ?? []).map(
                    (entry) => [JSON.stringify(entry), entry] as const,
                  ),
                ),
              ).values(),
            ],
          },
        }
      : {}),
  };
}

export function buildCampaignStarters(
  archiveHash: string,
  sources: readonly CampaignSource[],
): CampaignStarterCatalog {
  const available = new Set(sources.map((source) => source.reference.sourceId));
  return catalog(
    LEVELING_RACES.filter((race) => race.faction === "alliance").flatMap((race) => {
      if (!isCampaignRace(race.id)) return [];
      const id = race.id;
      return [null, ...race.classes]
        .filter((classSlug) =>
          campaignStarterSourceIds(id, classSlug).every((sourceId) => available.has(sourceId)),
        )
        .map((classSlug) =>
          buildCampaignPlan(id, archiveHash, sources, classSlug, { starterOnly: true }),
        );
    }),
  );
}

export function enrichCampaignStarters(
  starters: CampaignStarterCatalog,
  sources: readonly CampaignSource[],
  facts: readonly QuestRewardFact[],
  combat: { readonly data: CombatDataset; readonly revision: string } | null,
): CampaignStarterCatalog {
  return catalog(
    starters.routes.map((route) => {
      const plan: CampaignPlan = {
        release: "starter-projection",
        race: route.race,
        leaderClass: route.classSlug,
        targetBuild: 70205,
        legs: route.legs,
        actions: route.actionIndexes.map((index) => starters.entries[index]!.action),
        rewardFacts: facts,
      };
      const chapters = new Set(
        plan.actions.flatMap((action) => (action.source ? [action.source.chapterId] : [])),
      );
      return compileCampaignPickupGates(
        combat
          ? attachCampaignCombat(
              plan,
              sources.filter((source) => chapters.has(source.guide.chapterId)),
              combat.data,
              combat.revision,
            )
          : plan,
      );
    }),
  );
}
