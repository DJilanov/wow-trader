import type { CampaignAction, CampaignLeg, CampaignPlan } from "./campaign.js";
import type { CampaignXpForecastOptions } from "./campaign-xp.js";
import type { CampaignXpAnchor, PremadeProgress } from "./premade-model.js";
import type { CombatActivity, CampaignMaterialWork } from "./combat-model.js";
import { LEVELING_RACES } from "./profile.js";
import { mergeQuestObjectiveIndexes } from "./campaign-quest-objectives.js";
import { mergeCampaignItemRequirements } from "./campaign-items.js";

export type GuideStarterPartyMode = "separate" | "together";

export interface GuidePartyScenario {
  readonly plan: CampaignPlan;
  readonly progress: PremadeProgress;
  readonly personalActionPlayers: Readonly<Record<string, number>>;
  readonly assumedPlayers: readonly number[];
  readonly unavailablePlayers: readonly number[];
  readonly anchorActions: Readonly<Record<string, string>>;
}

/** Forecasts separate personal paths or an explicit shared starter without reporting them as done. */
export function guidePartyScenario(
  plan: CampaignPlan,
  progress: PremadeProgress,
  starterMode: GuideStarterPartyMode = "separate",
): GuidePartyScenario {
  const starterLegs = new Set(
    plan.legs.filter((leg) => leg.kind === "starter").map((leg) => leg.id),
  );
  const personal = plan.actions.filter(
    (action) => starterLegs.has(action.legId) && action.leaderOnly,
  );
  const join = plan.actions.find((action) => !starterLegs.has(action.legId));
  const personalActionPlayers: Record<string, number> = {};
  const assumedPlayers: number[] = [],
    unavailablePlayers: number[] = [];
  const anchorActions: Record<string, string> = {};
  const parallel = new Map<string, CampaignAction[]>();
  const otherActions: CampaignAction[] = [],
    otherLegs: CampaignLeg[] = [];
  const activities: CombatActivity[] = [...(plan.combat?.activities ?? [])];
  const materialWork: CampaignMaterialWork[] = [...(plan.combat?.materialWork ?? [])];
  const members = progress.members.map((member) => ({ ...member }));
  if (!personal.length)
    return {
      plan,
      progress,
      personalActionPlayers,
      assumedPlayers,
      unavailablePlayers,
      anchorActions,
    };

  if (starterMode === "together") {
    if (
      members.some(
        (member) =>
          (member.raceId !== null && member.raceId !== undefined && member.raceId !== plan.race) ||
          (member.classSlug !== null && member.classSlug !== plan.leaderClass),
      )
    )
      throw new Error(
        "A together-starter forecast requires the same race/class path for all five players.",
      );
    return {
      plan: {
        ...plan,
        actions: plan.actions.map((action) =>
          starterLegs.has(action.legId) ? { ...action, leaderOnly: false } : action,
        ),
      },
      progress: {
        ...progress,
        members: members.map((member) => ({
          ...member,
          raceId: plan.race,
          classSlug: plan.leaderClass,
        })),
      },
      personalActionPlayers,
      assumedPlayers: members.flatMap((member, index) =>
        index > 0 && (!member.raceId || !member.classSlug) ? [index + 1] : [],
      ),
      unavailablePlayers,
      anchorActions,
    };
  }

  for (let player = 2; player <= members.length; player++) {
    const member = members[player - 1]!;
    const race = member.raceId ?? plan.race;
    const classSlug = member.classSlug ?? (race === plan.race ? plan.leaderClass : null);
    const compatible = LEVELING_RACES.some(
      (entry) =>
        entry.id === race &&
        entry.faction === "alliance" &&
        (!classSlug || entry.classes.includes(classSlug)),
    );
    const same = race === plan.race && classSlug === plan.leaderClass;
    const branch = plan.starters?.routes.find(
      (route) => route.race === race && route.classSlug === classSlug,
    );
    if (!compatible || (!same && !branch)) {
      unavailablePlayers.push(player);
      members[player - 1] = { ...member, level: null, currentXp: null, xpNeedsUpdate: true };
      for (const action of personal) if (join) anchorActions[`${player}:${action.id}`] = join.id;
      continue;
    }
    if (!member.raceId || !member.classSlug) assumedPlayers.push(player);
    members[player - 1] = { ...member, raceId: race, classSlug };
    const prefix = `guide-player-${player}-`;
    const entries = same
      ? personal.map((action) => ({
          action,
          activities:
            plan.combat?.activities.filter((activity) => activity.actionId === action.id) ?? [],
          materialWork:
            plan.combat?.materialWork?.filter((work) => work.actionId === action.id) ?? [],
        }))
      : branch!.actionIndexes.map((index) => plan.starters!.entries[index]!);
    const cloned = entries.map(
      ({ action, activities: sourceActivities, materialWork: sourceMaterialWork }) => {
        const copy: CampaignAction = {
          ...action,
          id: `${prefix}${action.id}`,
          legId: same ? action.legId : `${prefix}${action.legId}`,
          leaderOnly: true,
          ...(action.fundingCheckpointId
            ? { fundingCheckpointId: `${prefix}${action.fundingCheckpointId}` }
            : {}),
        };
        personalActionPlayers[copy.id] = player;
        for (const activity of sourceActivities)
          activities.push({
            ...activity,
            id: `${prefix}${activity.id}`,
            actionId: copy.id,
            pathId: `${prefix}${activity.pathId ?? action.legId}`,
          });
        for (const work of sourceMaterialWork ?? [])
          materialWork.push({ ...work, id: `${prefix}${work.id}`, actionId: copy.id });
        if (same) parallel.set(action.id, [...(parallel.get(action.id) ?? []), copy]);
        return copy;
      },
    );
    if (!same) {
      otherActions.push(...cloned);
      otherLegs.push(
        ...branch!.legs.map((leg) => ({
          ...leg,
          id: `${prefix}${leg.id}`,
          actionIds: cloned
            .filter((action) => action.legId === `${prefix}${leg.id}`)
            .map((action) => action.id),
        })),
      );
    }
    for (const action of personal) {
      const equivalent = same
        ? cloned.find((copy) => copy.id === `${prefix}${action.id}`)
        : undefined;
      if (equivalent || join) anchorActions[`${player}:${action.id}`] = equivalent?.id ?? join!.id;
    }
  }
  const firstSharedLeg = plan.legs.findIndex((leg) => !starterLegs.has(leg.id));
  const legs =
    firstSharedLeg < 0
      ? [...plan.legs, ...otherLegs]
      : [...plan.legs.slice(0, firstSharedLeg), ...otherLegs, ...plan.legs.slice(firstSharedLeg)];
  const actions: CampaignAction[] = [];
  for (const action of plan.actions) {
    if (action.id === join?.id) actions.push(...otherActions);
    actions.push(action, ...(parallel.get(action.id) ?? []));
  }
  if (!join) actions.push(...otherActions);
  const starterCombat = plan.starters?.combat;
  const mainCombat = plan.combat;
  const references = mainCombat ?? starterCombat;
  return {
    plan: {
      ...plan,
      itemRequirements: mergeCampaignItemRequirements([
        plan.itemRequirements,
        plan.starters?.itemRequirements,
      ]),
      actions,
      legs,
      ...(references
        ? {
            combat: {
              ...references,
              questObjectiveIndexes: mergeQuestObjectiveIndexes([
                mainCombat?.questObjectiveIndexes,
                starterCombat?.questObjectiveIndexes,
              ]),
              activities,
              ...(materialWork.length ? { materialWork } : {}),
              npcs: [
                ...new Map(
                  [...(mainCombat?.npcs ?? []), ...(starterCombat?.npcs ?? [])].map((npc) => [
                    npc.id,
                    npc,
                  ]),
                ).values(),
              ],
              killXpEvidence: [
                ...new Map(
                  [
                    ...(mainCombat?.killXpEvidence ?? []),
                    ...(starterCombat?.killXpEvidence ?? []),
                  ].map((entry) => [JSON.stringify(entry), entry]),
                ).values(),
              ],
              lootDrops: [
                ...new Map(
                  [...(mainCombat?.lootDrops ?? []), ...(starterCombat?.lootDrops ?? [])].map(
                    (entry) => [JSON.stringify(entry), entry],
                  ),
                ).values(),
              ],
            },
          }
        : {}),
    },
    progress: { ...progress, members },
    personalActionPlayers,
    assumedPlayers,
    unavailablePlayers,
    anchorActions,
  };
}

export function guidePartyAnchors(
  scenario: GuidePartyScenario,
  anchors: readonly (CampaignXpAnchor & { readonly player: number })[],
): CampaignXpForecastOptions {
  return {
    personalActionPlayers: scenario.personalActionPlayers,
    anchors: anchors.map((anchor) => ({
      ...anchor,
      actionId: scenario.anchorActions[`${anchor.player}:${anchor.actionId}`] ?? anchor.actionId,
    })),
  };
}
