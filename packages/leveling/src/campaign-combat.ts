import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { ImportedDirective } from "./guide-archive.js";
import type { PremadeMember } from "./premade-model.js";
import {
  combatObjectiveKey,
  type CampaignCombatPlan,
  type CombatActivity,
  type CombatDataset,
  type CombatNpc,
  type CombatObjective,
} from "./combat-model.js";
import {
  advanceCombatPosition,
  estimateCreatureKills,
  type CombatXpPosition,
} from "./combat-xp.js";
import { getPremadeQuest } from "./premade.js";
import { createCharacterProfile } from "./profile.js";
import { getGuideStepView } from "./guide-archive.js";
import { chapterEligibility } from "./chapter-catalog.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";

export interface CombatReferenceIndex {
  readonly npcs: ReadonlyMap<number, CombatNpc>;
  readonly quests: ReadonlyMap<number, CombatDataset["quests"][number]>;
}
export function indexCombatReferences(
  dataset: Pick<CombatDataset, "npcs" | "quests">,
): CombatReferenceIndex {
  return {
    npcs: new Map(dataset.npcs.map((npc) => [npc.id, npc])),
    quests: new Map(dataset.quests.map((quest) => [quest.questId, quest])),
  };
}

function targetName(value: string): string {
  return value
    .replace(/^\+/, "")
    .replace(/^(?:kill|slay|destroy)\s+/i, "")
    .replace(/\s+(?:slain|killed|defeated|destroyed)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function objectiveTextCount(npc: CombatNpc, texts: readonly string[]): number | null {
  const name = targetName(npc.name),
    forms = new Set([name, `${name}s`]);
  if (/[^aeiou]y$/.test(name)) forms.add(`${name.slice(0, -1)}ies`);
  if (/(?:s|x|z|ch|sh)$/.test(name)) forms.add(`${name}es`);
  if (/man$/.test(name)) forms.add(`${name.slice(0, -3)}men`);
  if (/(?:lf|rf)$/.test(name)) forms.add(`${name.slice(0, -1)}ves`);
  if (/thief$/.test(name)) forms.add(`${name.slice(0, -1)}ves`);
  const pattern = [...forms]
    .sort((a, b) => b.length - a.length)
    .map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const counts = new Set<number>();
  for (const text of texts)
    for (const match of text
      .toLowerCase()
      .matchAll(new RegExp(`\\b(\\d+)\\s+(?:${pattern})(?![a-z])`, "g"))) {
      const count = Number(match[1]);
      if (count > 0 && count <= 10000) counts.add(count);
    }
  return counts.size === 1 ? [...counts][0]! : null;
}

function referenceObjectives(
  questId: number,
  index: CombatReferenceIndex,
): readonly CombatObjective[] {
  const quest = index.quests.get(questId);
  if (!quest) return [];
  if (!quest.onlyCreatureObjectives) {
    const npcIds = quest.creatureIds.length ? quest.creatureIds : quest.itemCreatureIds;
    return [
      {
        questId,
        objectiveIndex: 1,
        npcIds,
        requiredKills: null,
        credit: quest.creatureIds.length
          ? "unknown"
          : npcIds.length
            ? "personal-loot"
            : "non-combat",
        source: `QuestieDB corrected quest ${questId}`,
        reason: npcIds.length
          ? "Mixed objectives or personal drops need a reviewed kill/loot quota."
          : null,
      },
    ];
  }
  return quest.creatureIds.map((npcId, offset) => {
    const npc = index.npcs.get(npcId);
    const count = npc ? objectiveTextCount(npc, quest.objectiveText) : null;
    return {
      questId,
      objectiveIndex: offset + 1,
      npcIds: [npcId],
      requiredKills: count,
      credit: count === null ? ("unknown" as const) : ("shared-kills" as const),
      source: `QuestieDB corrected quest ${questId} objective ${offset + 1}`,
      reason:
        count === null ? "The target is known, but its numeric kill quota is unverified." : null,
    };
  });
}

export function resolveCombatObjectives(
  directives: readonly ImportedDirective[],
  dataset: CombatReferenceIndex,
  source: string,
): readonly CombatObjective[] {
  const { npcs, quests } = dataset;
  return directives
    .filter((directive) => directive.tag === ".complete" && directive.questId !== null)
    .map((directive): CombatObjective => {
      const questId = directive.questId!,
        quest = quests.get(questId);
      const objectiveIndex = Number(directive.arguments.split(",")[1] ?? 1);
      if (!Number.isSafeInteger(objectiveIndex) || objectiveIndex < 1 || objectiveIndex > 100)
        return {
          questId,
          objectiveIndex: 1,
          npcIds: [],
          requiredKills: null,
          credit: "unknown",
          source,
          reason: "The source objective index is invalid; no kill quota is assumed.",
        };
      const counter = /^(.*?)\s*\(x?(\d+)\)\s*$/i.exec(directive.text);
      const label = counter ? targetName(counter[1]!) : "";
      const offset = directives.indexOf(directive);
      const next = directives.findIndex(
        (entry, index) => index > offset && entry.tag === ".complete",
      );
      const segment = directives.slice(offset, next < 0 ? undefined : next);
      const segmentMobs = segment
        .filter((entry) => entry.tag === ".mob")
        .map((entry) => targetName(entry.arguments));
      let matches = (quest?.creatureIds ?? []).filter(
        (id) => targetName(npcs.get(id)?.name ?? "") === label,
      );
      if (!label) {
        matches = (quest?.creatureIds ?? []).filter((id) =>
          segmentMobs.includes(targetName(npcs.get(id)?.name ?? "")),
        );
        if (matches.length !== 1 && quest?.onlyCreatureObjectives) {
          const id = quest.creatureIds[objectiveIndex - 1];
          matches = id === undefined ? [] : [id];
        }
      }
      const interactive = directives.some((entry) =>
        [".use", ".cast", ".gossip", ".interact"].includes(entry.tag),
      );
      const killHint =
        /^(?:kill|slay|destroy)\s/i.test(directive.text) ||
        directives.some((entry) => entry.tag === ".mob" && targetName(entry.arguments) === label) ||
        directives.some(
          (entry) => entry.tag === "text" && /\b(?:kill|slay|destroy)\b/i.test(entry.text),
        );
      const matched = matches.length === 1 ? npcs.get(matches[0]!) : undefined;
      const providerCount = matched
        ? objectiveTextCount(matched, quest?.objectiveText ?? [])
        : null;
      const sourceCount =
        counter && Number(counter[2]) > 0 && Number(counter[2]) <= 10000
          ? Number(counter[2])
          : null;
      const conflict =
        sourceCount !== null && providerCount !== null && sourceCount !== providerCount;
      const count = sourceCount ?? providerCount;
      const providerKillHint = quest?.objectiveText.some((text) =>
        /\b(?:kill|slay|destroy|defeat)\b/i.test(text),
      );
      const knownKill =
        matches.length === 1 &&
        count !== null &&
        (killHint || providerKillHint) &&
        !interactive &&
        !conflict;
      const sourceMobs = directives
        .filter((entry) => entry.tag === ".mob")
        .map((entry) => targetName(entry.arguments));
      const itemMobs = (quest?.itemCreatureIds ?? []).filter((id) =>
        sourceMobs.includes(targetName(npcs.get(id)?.name ?? "")),
      );
      const nonCombat =
        !!quest &&
        quest.creatureIds.length === 0 &&
        quest.itemCreatureIds.length === 0 &&
        sourceMobs.length === 0 &&
        !killHint &&
        !providerKillHint;
      return {
        questId,
        objectiveIndex: Number.isInteger(objectiveIndex) && objectiveIndex > 0 ? objectiveIndex : 1,
        npcIds: knownKill ? matches : [...new Set([...matches, ...itemMobs])],
        requiredKills: knownKill ? count : null,
        credit: knownKill
          ? "shared-kills"
          : itemMobs.length
            ? "personal-loot"
            : nonCombat
              ? "non-combat"
              : "unknown",
        source,
        reason:
          knownKill || nonCombat
            ? null
            : conflict
              ? "Guide and corrected quest text disagree on the required kill quota."
              : interactive
                ? "Interaction/summon objectives are not assumed to award kill XP."
                : itemMobs.length
                  ? "Personal quest drops: required party kills and drop chance are unverified."
                  : !quest
                    ? "Quest objective references have not been imported."
                    : "A unique creature identity and explicit kill quota could not be reconciled.",
      };
    });
}

export function attachCampaignCombat(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  dataset: CombatDataset,
  revision: string,
): CampaignPlan {
  if (dataset.targetBuild !== plan.targetBuild)
    throw new Error("Combat reference build does not match the route.");
  const byStep = new Map<string, readonly CombatObjective[]>();
  const byObjective = new Map<string, CombatObjective[]>();
  const references = indexCombatReferences(dataset);
  const profile = { ...createCharacterProfile("alliance", plan.race), classSlug: plan.leaderClass };
  const dungeons = DUNGEON_VISITS.flatMap((visit) => (visit.sourceTag ? [visit.sourceTag] : []));
  for (const { guide, reference } of sources) {
    if (chapterEligibility(reference, profile) !== "match") continue;
    for (const step of guide.steps) {
      const source = `${guide.chapterId}:${step.id}`;
      const view = getGuideStepView(
        {
          ...step,
          directives: step.directives.filter(
            (directive) => ![".group", ".solo"].includes(directive.tag),
          ),
        },
        profile,
        { dungeons },
      );
      if (view.condition !== "match") continue;
      const objectives = resolveCombatObjectives(view.directives, references, source);
      byStep.set(source, objectives);
      for (const objective of objectives) {
        const key = combatObjectiveKey(objective),
          entries = byObjective.get(key) ?? [];
        entries.push(objective);
        byObjective.set(key, entries);
      }
    }
  }
  const activities: CombatActivity[] = [];
  for (const action of plan.actions) {
    const completions = action.questChanges.filter(
      (change) => change.state === "objectives-complete",
    );
    if (!completions.length) continue;
    const leg = plan.legs.find((entry) => entry.id === action.legId)!;
    const exact = action.source
      ? byStep.get(`${action.source.chapterId}:${action.source.stepId}`)
      : undefined;
    const referencesForAction = completions.flatMap((change): readonly CombatObjective[] => {
      const objectiveIndex = change.objectiveIndex ?? 1;
      if (!action.source) {
        const reference = referenceObjectives(change.questId, references);
        if (reference.length) return reference;
      }
      const candidates = (
        exact ??
        byObjective.get(`${change.questId}:${objectiveIndex}`) ??
        []
      ).filter(
        (entry) => entry.questId === change.questId && entry.objectiveIndex === objectiveIndex,
      );
      const known = candidates.filter((entry) => entry.credit === "shared-kills");
      if (candidates.length && candidates.every((entry) => entry.credit === "non-combat"))
        return [candidates[0]!];
      const signatures = new Set(
        known.map((entry) => `${entry.npcIds.join(",")}:${entry.requiredKills}`),
      );
      if (signatures.size === 1 && known.length === candidates.length) return [known[0]!];
      return [
        {
          questId: change.questId,
          objectiveIndex,
          npcIds: [...new Set(candidates.flatMap((entry) => entry.npcIds))],
          requiredKills: null,
          credit: candidates.some((entry) => entry.credit === "personal-loot")
            ? "personal-loot"
            : "unknown",
          source: action.source
            ? `${action.source.chapterId}:${action.source.stepId}`
            : "source-reference",
          reason:
            signatures.size > 1
              ? "Source variants disagree on the creature or quota."
              : (candidates[0]?.reason ??
                "No reconciled creature kill quota is available for this objective."),
        },
      ];
    });
    const objectives = [
      ...new Map(
        referencesForAction.map((objective) => [combatObjectiveKey(objective), objective]),
      ).values(),
    ];
    for (const environment of ["outdoor", "dungeon"] as const) {
      const group = objectives.filter(
        (objective) =>
          objective.credit !== "non-combat" &&
          (getPremadeQuest(objective.questId)?.objectiveStage === "before"
            ? "outdoor"
            : ["inside", "multiple-visits"].includes(
                  getPremadeQuest(objective.questId)?.objectiveStage ?? "",
                ) || leg.kind === "dungeon"
              ? "dungeon"
              : "outdoor") === environment,
      );
      if (group.length)
        activities.push({
          id: `combat-${action.id}-${environment}`,
          actionId: action.id,
          environment,
          pathId: leg.id,
          questWide: action.source === null,
          objectives: group,
          profile: null,
        });
    }
  }
  const notices: string[] = [];
  for (const leg of plan.legs.filter((entry) => entry.kind === "dungeon")) {
    const profiles = dataset.dungeons.filter(
      (entry) => entry.stopId === leg.stopId && entry.scope === "quest-path",
    );
    const entries = plan.actions.filter((action) => action.legId === leg.id);
    const firstReturn = entries.findIndex((action) =>
      action.questChanges.some((change) => change.state === "rewarded"),
    );
    const candidates = entries
      .slice(0, firstReturn < 0 ? entries.length : firstReturn)
      .filter((action) =>
        action.questChanges.some((change) => change.state === "objectives-complete"),
      );
    const anchor = candidates.at(-1);
    const multiStage =
      firstReturn >= 0 &&
      entries
        .slice(firstReturn + 1)
        .some((action) =>
          action.questChanges.some((change) => change.state === "objectives-complete"),
        );
    if (profiles.length !== 1 || !anchor || multiStage) {
      notices.push(
        `${leg.title}: full path combat is unmeasured${multiStage ? " across its separate visits" : ""}.`,
      );
      continue;
    }
    const index = activities.findIndex(
      (activity) => activity.actionId === anchor.id && activity.environment === "dungeon",
    );
    if (index >= 0) activities[index] = { ...activities[index]!, profile: profiles[0]! };
  }
  const ids = new Set(
    activities.flatMap((activity) => [
      ...activity.objectives.flatMap((objective) => objective.npcIds),
      ...(activity.profile?.packs.map((pack) => pack.npcId) ?? []),
    ]),
  );
  const combat: CampaignCombatPlan = {
    revision,
    sourceRevision: dataset.provider.revision,
    targetBuild: dataset.targetBuild,
    npcs: dataset.npcs.filter((npc) => ids.has(npc.id)),
    activities,
    notice: notices.length ? notices.join(" ") : null,
    killXpEvidence: dataset.killXpEvidence.filter((entry) => ids.has(entry.npcId)),
  };
  return { ...plan, combat };
}

export interface CampaignCombatRow {
  readonly activityId: string;
  readonly environment: "outdoor" | "dungeon";
  readonly npcId: number;
  readonly name: string;
  readonly minimumLevel: number | null;
  readonly maximumLevel: number | null;
  readonly kills: number;
  readonly xp: number | null;
  readonly maximumXp: number | null;
  readonly source: string;
  readonly basis: "reference-estimate" | "observed" | "excluded" | "unknown";
}
export interface CampaignCombatState {
  readonly counters: Map<string, number | null>;
  readonly paid: Set<string>;
  readonly pathKills: Map<string, number>;
}

export function createCampaignCombatState(
  combat: CampaignCombatPlan | undefined,
  member: PremadeMember,
): CampaignCombatState {
  const counters = new Map<string, number | null>();
  for (const objective of combat?.activities.flatMap((activity) => activity.objectives) ?? []) {
    const state = member.questStates[String(objective.questId)];
    const done =
      state === "objectives-complete" ||
      state === "rewarded" ||
      member.confirmations[`campaign-objective-${objective.questId}-${objective.objectiveIndex}`];
    if (done) counters.set(combatObjectiveKey(objective), objective.requiredKills);
    else if (state === "accepted") counters.set(combatObjectiveKey(objective), null);
  }
  return { counters, paid: new Set(), pathKills: new Map() };
}

export function applyCampaignCombat(input: {
  readonly activity: CombatActivity;
  readonly combat: CampaignCombatPlan;
  readonly state: CampaignCombatState;
  readonly questStates: PremadeMember["questStates"];
  readonly position: CombatXpPosition;
  readonly partySize: number;
  readonly partyLevels?: readonly (number | null)[];
}): {
  readonly xp: number;
  readonly rows: readonly CampaignCombatRow[];
  readonly issues: readonly string[];
} {
  const { activity, combat, state, questStates, partySize } = input;
  if (state.paid.has(activity.id)) return { xp: 0, rows: [], issues: [] };
  state.paid.add(activity.id);
  const npcs = new Map(combat.npcs.map((npc) => [npc.id, npc]));
  const rows: CampaignCombatRow[] = [],
    issues: string[] = [];
  let xp = 0,
    position = input.position;
  const active = [
    ...new Map(
      combat.activities
        .flatMap((entry) => entry.objectives)
        .map((objective) => [combatObjectiveKey(objective), objective]),
    ).values(),
  ].filter(
    (objective) =>
      questStates[String(objective.questId)] === "accepted" &&
      objective.credit === "shared-kills" &&
      objective.npcIds.length === 1 &&
      objective.requiredKills !== null,
  );
  function kill(npc: CombatNpc, count: number, source: string): void {
    const estimate = estimateCreatureKills({
      npc,
      kills: count,
      position,
      partySize,
      environment: activity.environment,
      dungeonMultiplier: activity.profile?.dungeonMultiplier ?? null,
      evidence: combat.killXpEvidence ?? [],
      build: combat.targetBuild,
      ...(input.partyLevels ? { partyLevels: input.partyLevels } : {}),
    });
    rows.push({
      activityId: activity.id,
      environment: activity.environment,
      npcId: npc.id,
      name: npc.name,
      minimumLevel: npc.minimumLevel,
      maximumLevel: npc.maximumLevel,
      kills: count,
      xp: estimate.xp,
      maximumXp: estimate.maximumXp,
      source:
        estimate.basis === "observed" ? (estimate.observedSources?.join("; ") ?? source) : source,
      basis: estimate.basis,
    });
    if (estimate.reason) issues.push(estimate.reason);
    xp += estimate.xp ?? 0;
    position = advanceCombatPosition(position, estimate.xp ?? 0);
    if (estimate.xp !== null && activity.pathId) {
      const key = `${activity.pathId}:${npc.id}`;
      state.pathKills.set(key, (state.pathKills.get(key) ?? 0) + count);
    }
    for (const objective of active) {
      if (objective.npcIds[0] !== npc.id) continue;
      const key = combatObjectiveKey(objective),
        previous = state.counters.get(key);
      if (previous !== null)
        state.counters.set(key, Math.min(objective.requiredKills!, (previous ?? 0) + count));
    }
  }
  for (const pack of activity.profile?.packs ?? []) {
    const npc = npcs.get(pack.npcId);
    const remaining = Math.max(
      0,
      pack.kills -
        (activity.pathId ? (state.pathKills.get(`${activity.pathId}:${pack.npcId}`) ?? 0) : 0),
    );
    if (npc && remaining) kill(npc, remaining, activity.profile!.source);
  }
  for (const objective of activity.objectives) {
    if (objective.credit === "non-combat") continue;
    if (questStates[String(objective.questId)] !== "accepted") continue;
    const key = combatObjectiveKey(objective);
    if (
      objective.credit !== "shared-kills" ||
      objective.requiredKills === null ||
      objective.npcIds.length !== 1
    ) {
      issues.push(`${key}: ${objective.reason ?? "Required kills are unresolved."}`);
      continue;
    }
    const counted = state.counters.get(key);
    if (counted === null) {
      issues.push(
        `${key}: quest was already in progress; remaining kills are unknown. Combat already in your actual XP bar is not added again.`,
      );
      continue;
    }
    const remaining = Math.max(0, objective.requiredKills - (counted ?? 0));
    const npc = npcs.get(objective.npcIds[0]!);
    if (!npc) {
      issues.push(`${key}: creature reference is missing.`);
      continue;
    }
    if (remaining) kill(npc, remaining, objective.source);
  }
  return { xp, rows, issues: [...new Set(issues)] };
}
