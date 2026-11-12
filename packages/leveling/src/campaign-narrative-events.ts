import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset, CombatObjective } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { hasUnrestrictedQuestAccess } from "./quest-catalog.js";
import type { CampaignSourceDelivery } from "./campaign-source-deliveries.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { campaignSourceDungeonTags } from "./campaign-source-dungeons.js";
import { getGuideStepView, type ImportedDirective } from "./guide-archive.js";
import { sharedCampaignQuestSources } from "./campaign-shared-source.js";
import { NARRATIVE_EVENT_REFERENCE as reviewed, type NarrativeEventProof } from "./campaign-narrative-reference.js";
import { matchesCombatBossIdentity } from "./combat-boss-reference.js";

const proofs = new Map(reviewed.proofs.map((proof) => [proof.quest.questId, proof]));

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalized(entry)]),
    );
  return value;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

function matchesArchive(plan: Pick<CampaignPlan, "targetBuild" | "sourceArchiveSha256">): boolean {
  return (
    plan.targetBuild === reviewed.targetBuild &&
    plan.sourceArchiveSha256 === reviewed.sourceArchiveSha256
  );
}

function matchesProvider(combat: CombatDataset): boolean {
  return combat.targetBuild === reviewed.targetBuild &&
    combat.provider.revision === reviewed.provider.revision &&
    combat.provider.questSha256 === reviewed.provider.questSha256 &&
    combat.provider.npcSha256 === reviewed.provider.npcSha256 &&
    combat.provider.itemSha256 === reviewed.provider.itemSha256 &&
    combat.provider.objectSha256 === reviewed.provider.objectSha256;
}

/** Fill omitted encounter guards from the identical pinned provider export; never replace facts. */
export function applyNarrativeEncounterReferences(combat: CombatDataset): CombatDataset {
  if (!matchesProvider(combat)) return combat;
  const needed = new Set(reviewed.proofs.filter((proof) => combat.quests.some((quest) =>
    quest.questId === proof.quest.questId && same(quest, proof.reference),
  )).flatMap((proof) => proof.encounterNpcIds));
  const additions = reviewed.encounterReferences.npcs.filter(
    (reference) => needed.has(reference.id) && !combat.npcs.some((npc) => npc.id === reference.id),
  );
  const npcs = [...combat.npcs, ...additions];
  const bosses = (reviewed.encounterReferences.bosses ?? []).filter((reference) => {
    if (!needed.has(reference.npcId) || !matchesCombatBossIdentity(
      npcs.find((npc) => npc.id === reference.npcId), reference, combat.targetBuild,
    )) return false;
    const existing = combat.bossReferences?.find((boss) => boss.npcId === reference.npcId);
    if (existing && !same(existing, reference))
      throw new Error(`Narrative encounter boss identity conflicts with the combat reference: ${reference.npcId}`);
    return !existing;
  });
  return additions.length || bosses.length ? { ...combat, npcs,
    ...(bosses.length ? { bossReferences: [...(combat.bossReferences ?? []), ...bosses] } : {}),
  } : combat;
}

function matchesGeneratedDungeonPhase(
  plan: CampaignPlan,
  action: CampaignAction,
  expected: Pick<CampaignAction, "questChanges">,
  proof: NarrativeEventProof,
): boolean {
  if (!proof.generatedDungeonId || action.source || action.kind !== "quests" ||
    action.leaderOnly || action.raidOnly || !same(action.questChanges, expected.questChanges)) return false;
  const leg = plan.legs.find((entry) => entry.id === action.legId);
  const context = action.location?.insideDungeon ?? leg?.dungeonVisitId ??
    (leg?.kind === "dungeon" ? leg.stopId : null);
  return context === proof.generatedDungeonId &&
    (action.questChanges[0]?.state !== "objectives-complete" ||
      (action.wholeQuestObjectives === true && action.combatObjectiveScope !== "listed"));
}

function capturedPhases(
  plan: CampaignPlan,
  preparedSources: readonly CampaignSource[],
  proof: NarrativeEventProof,
): readonly CampaignAction[] | null {
  const profile = campaignPlanSourceProfile(plan);
  const actions: CampaignAction[] = [];
  for (const phase of proof.phases) {
    const expected = phase.action;
    const guide = preparedSources.find(
      ({ guide }) =>
        guide.targetBuild === plan.targetBuild &&
        guide.chapterId === expected.source.chapterId &&
        guide.version === expected.source.version,
    )?.guide;
    const step = guide?.steps.find((step) => step.id === expected.source.stepId);
    if (!step || !same(step, phase.step)) return null;
    const view = getGuideStepView(step, profile, { dungeons: campaignSourceDungeonTags() });
    if (view.condition !== "match" || view.conditionalDirectives.length) return null;
    // The reviewed steps retain their real quest guards, gossip, timers and positions.
    // Native compilation replaces old chapter routing controls with the selected route.
    const objective = expected.questChanges.some((change) => change.state === "objectives-complete");
    const reward = expected.questChanges.some((change) => change.state === "rewarded");
    actions.push({
      ...expected,
      source: {
        chapterId: expected.source.chapterId,
        version: expected.source.version,
        stepId: expected.source.stepId,
        ...(expected.source.conditions ? { conditions: expected.source.conditions } : {}),
      },
      libraryQuestId: proof.quest.questId,
      libraryObjective: "interaction",
      requiredQuestIds: proof.prerequisiteIds,
      instructions: [
        ...expected.instructions,
        ...(proof.kind === "supplies"
          ? ["Each player must obtain every listed item personally. Follow the captured shopping and pickup instructions, using existing stock where available. Purchases and pickups add no kill XP. Continue only when everyone has their full quantities."]
          : proof.kind === "scripted-combat"
          ? ["Everyone must accept before the event starts. If it does not begin automatically, talk to the quest giver. Stay for the conversation, then defeat the named enemies together. Continue only when every player has all kill and conversation credits."]
          : proof.kind === "capture"
          ? [objective
            ? `Each player must capture and return ${proof.capture!.perPlayerCount} ${proof.capture!.targetName}s personally. Bring back one at a time and talk to it at the camp. Wait until everyone has full quest credit.`
            : reward
            ? `Hand in only after every player has completed their own captures. Keep the ${proof.quest.providedItem!.name} for the return.`
            : `Each player receives the ${proof.quest.providedItem!.name} when accepting. Everyone must accept before beginning the captures.`]
          : proof.kind === "escort" && (objective || reward)
          ? ["Keep the party together until every player has received escort credit. If anyone misses credit, wait for the escort to reset and repeat it for them."]
          : objective || reward || proof.kind === "dialogue"
          ? ["Stay together through the dialogue or event. Continue only after every player has received their quest credit; repeat the conversation for anyone who missed it."]
          : ["Make sure everyone has accepted the quest before starting the event or conversation."]),
      ],
    });
  }
  return actions;
}

function narrativeSources(plan: CampaignPlan, sources: readonly CampaignSource[]): readonly CampaignSource[] {
  return plan.sharedQuestsOnly
    ? sharedCampaignQuestSources(sources, plan.race, new Set(plan.sharedSourceQuestIds ?? []))
    : sources;
}

/** Full, reviewed quest programs for shared scenes, nonlethal encounters and their handoffs. */
export function campaignNarrativeEvents(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
): ReadonlyMap<number, CampaignSourceDelivery> {
  const result = new Map<number, CampaignSourceDelivery>();
  combat = applyNarrativeEncounterReferences(combat);
  if (
    !matchesArchive(plan) ||
    catalog.targetBuild !== plan.targetBuild ||
    combat.targetBuild !== plan.targetBuild ||
    catalog.sourceArchiveSha256 !== plan.sourceArchiveSha256 ||
    catalog.providerRevision !== reviewed.provider.revision ||
    !matchesProvider(combat) ||
    catalog.questSha256 !== reviewed.provider.questSha256 ||
    catalog.npcSha256 !== reviewed.provider.npcSha256 ||
    catalog.itemSha256 !== reviewed.provider.itemSha256 ||
    catalog.objectSha256 !== reviewed.provider.objectSha256
  ) return result;
  let preparedSources: readonly CampaignSource[] | undefined;
  for (const proof of reviewed.proofs) {
    const original = catalog.quests.find((quest) => quest.questId === proof.quest.questId);
    const reference = combat.quests.find((quest) => quest.questId === proof.quest.questId);
    if (
      !original || !same(original, proof.quest) || !same(reference, proof.reference) ||
      !hasUnrestrictedQuestAccess({ ...original, unsupportedRequirements: [] })
    ) continue;
    const guards = proof.encounterNpcIds.map((id) => combat.npcs.find((npc) => npc.id === id));
    if (guards.some((npc, index) =>
      !npc || npc.maximumLevel === null || npc.name !== proof.encounterNames[index],
    )) continue;
    const actions = capturedPhases(plan, preparedSources ??= narrativeSources(plan, sources), proof);
    if (!actions) continue;
    result.set(original.questId, {
      quest: { ...original, unsupportedRequirements: [] },
      actions,
      ...(proof.kind === "handoff" && proof.encounterNpcIds.length === 0 && actions.length === 2 &&
        actions[0]!.questChanges[0]?.state === "accepted" &&
        actions[1]!.questChanges[0]?.state === "rewarded" &&
        actions[0]!.source?.stepId !== actions[1]!.source?.stepId
        ? { canLeaveAfterPickup: true as const } : {}),
      maximumEnemyLevel: Math.max(0, ...guards.map((npc) => npc!.maximumLevel!)),
      ...(proof.requiresFreshStart ? { requiresFreshStart: true } : {}),
    });
  }
  return result;
}

/** Selected source scenes need the same party wait instructions as newly funded scenes. */
export function attachNarrativeEventGuidance(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
): CampaignPlan {
  if (!matchesArchive(plan) || !matchesProvider(combat)) return plan;
  const selected = new Set(plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)));
  let preparedSources: readonly CampaignSource[] | undefined;
  const programs = reviewed.proofs.flatMap((proof) =>
    selected.has(proof.quest.questId) &&
    same(combat.quests.find((quest) => quest.questId === proof.quest.questId), proof.reference)
      ? [{ proof, actions: capturedPhases(plan, preparedSources ??= narrativeSources(plan, sources), proof) ?? [] }] : [],
  );
  const phases = programs.flatMap((program) => program.actions);
  const bySource = new Map<string, CampaignAction[]>();
  const key = (source: NonNullable<CampaignAction["source"]>): string =>
    `${source.chapterId}:${source.version}:${source.stepId}`;
  for (const phase of phases) {
    if (!phase.source) continue;
    const id = key(phase.source);
    bySource.set(id, [...(bySource.get(id) ?? []), phase]);
  }
  let changed = false;
  const actions = plan.actions.map((action): CampaignAction => {
    const phase = action.source
      ? bySource.get(key(action.source))?.find((phase) => same(phase.source, action.source) &&
          same(phase.questChanges, action.questChanges) && same(phase.positions, action.positions))
      : programs.flatMap(({ proof, actions }) => actions.filter((expected) =>
          matchesGeneratedDungeonPhase(plan, action, expected, proof)))[0];
    if (!phase) return action;
    const instructions = [...new Set([...action.instructions, ...phase.instructions])];
    const requiredQuestIds = [...new Set([...(action.requiredQuestIds ?? []), ...(phase.requiredQuestIds ?? [])])];
    if (same(instructions, action.instructions) && same(requiredQuestIds, action.requiredQuestIds ?? [])) return action;
    changed = true;
    return { ...action, instructions, requiredQuestIds };
  });
  return changed ? { ...plan, actions } : plan;
}

/** Keep encounter difficulty without interpreting surrender or dialogue credit as a death. */
export function narrativeEventObjectives(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
): ReadonlyMap<string, CombatObjective> {
  const result = new Map<string, CombatObjective>();
  if (!matchesArchive(plan) || !matchesProvider(combat)) return result;
  const selected = new Set(plan.actions.flatMap((action) => action.questChanges
    .filter((change) => change.state === "objectives-complete").map((change) => change.questId)));
  let preparedSources: readonly CampaignSource[] | undefined;
  for (const proof of reviewed.proofs) {
    if (!selected.has(proof.quest.questId)) continue;
    const reference = combat.quests.find((quest) => quest.questId === proof.quest.questId);
    if (!same(reference, proof.reference) ||
      !capturedPhases(plan, preparedSources ??= narrativeSources(plan, sources), proof)) continue;
    for (const action of plan.actions) {
      const completion = action.questChanges.find(
        (change) => change.questId === proof.quest.questId && change.state === "objectives-complete",
      );
      if (!completion || !proof.phases.some(
        ({ action: expected }) =>
          expected.questChanges[0]?.state === "objectives-complete" &&
          (expected.questChanges[0]?.objectiveIndex ?? 1) === (completion.objectiveIndex ?? 1) &&
          ((same(action.source, expected.source) && same(action.positions, expected.positions)) ||
            matchesGeneratedDungeonPhase(plan, action, expected, proof)),
      )) continue;
      result.set(action.id, {
        questId: completion.questId,
        objectiveIndex: completion.objectiveIndex ?? 1,
        npcIds: proof.kind === "scripted-combat"
          ? (proof.reference.killQuotas ?? []).filter((quota) =>
              quota.objectiveIndex === completion.objectiveIndex).map((quota) => quota.npcId)
          : [],
        credit: proof.kind === "scripted-combat" && proof.reference.killQuotas?.some((quota) =>
          quota.objectiveIndex === completion.objectiveIndex) ? "shared-kills" : "non-combat",
        requiredKills: proof.kind === "scripted-combat"
          ? proof.reference.killQuotas?.find((quota) => quota.objectiveIndex === completion.objectiveIndex)?.kills ?? null
          : null,
        source: proof.kind === "escort"
          ? "Reviewed captured escort program and provider encounter, 2026-11-05"
          : "Reviewed source program and party event policy, 2026-11-04",
        reason: proof.kind === "scripted-combat"
          ? "Captured death counters pay once each. Separate conversation counters add no deaths or combat XP."
          : proof.kind === "supplies"
          ? "Each player acquires the full supplied shopping/pickup quota; no acquisition kills or kill XP are assumed."
          : proof.kind === "capture"
          ? "Completion requires personal capture-and-return credits, not creature deaths. No kill XP is awarded for captures."
          : proof.kind === "escort"
          ? "Completion is an escort event, not a kill counter. Unmeasured event kill XP is excluded."
          : "Completion is dialogue, a scene or nonlethal submission. No deaths or kill XP are assumed.",
        ...(proof.encounterNpcIds.length
          ? { combatAccess: { kind: "encounter" as const, npcIds: proof.encounterNpcIds } }
          : {}),
      });
    }
  }
  return result;
}

/** Method-0 source hand-ins have no separate pickup; require their real predecessor first. */
export function reviewedInstantHandIn(
  action: CampaignAction,
  questId: number,
  context: Pick<CampaignPlan, "targetBuild" | "sourceArchiveSha256">,
): readonly number[] | null {
  if (!matchesArchive(context)) return null;
  const proof = proofs.get(questId);
  if (!proof || proof.kind !== "instant-handoff") return null;
  return proof.phases.some(({ action: expected }) =>
    same(action.source, expected.source) && same(action.questChanges, expected.questChanges) &&
    same(action.positions, expected.positions),
  ) ? proof.prerequisiteIds : null;
}

/** Keep a scene timer only on the exact selected phase that starts it. */
export function reviewedNarrativeTimer(
  action: CampaignAction,
  timer: ImportedDirective,
  context: Pick<CampaignPlan, "targetBuild" | "sourceArchiveSha256">,
): boolean {
  if (timer.tag !== ".timer" || !matchesArchive(context)) return false;
  const change = action.questChanges[0];
  const proof = change && proofs.get(change.questId);
  if (!proof || action.questChanges.length !== 1) return false;
  return proof.phases.some(({ action: expected, step }) => {
    if (!same(action.source, expected.source) || !same(action.questChanges, expected.questChanges))
      return false;
    const at = step.directives.findIndex((directive) => same(directive, timer));
    if (at < 0) return false;
    const preceding = step.directives.slice(0, at).reverse().find(
      (directive) => [".accept", ".complete", ".turnin"].includes(directive.tag),
    );
    if (!preceding || preceding.questId !== change!.questId) return false;
    const state = preceding.tag === ".accept" ? "accepted"
      : preceding.tag === ".complete" ? "objectives-complete" : "rewarded";
    const index = state === "objectives-complete" ? Number(preceding.arguments.split(",")[1] ?? 1) : null;
    return change!.state === state && change!.objectiveIndex === index;
  });
}
