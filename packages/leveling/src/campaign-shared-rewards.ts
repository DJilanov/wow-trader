import type { CampaignSource } from "./campaign.js";
import type { CampaignRace } from "./campaign-route.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { PREMADE_STOPS } from "./premade.js";
import { LEVELING_RACES } from "./profile.js";
import { getGuideStepView, type ImportedDirective, type ImportedStep } from "./guide-archive.js";

export function sharedTurnInFlags(directive: ImportedDirective, questId: number): number | null {
  const args = directive.arguments.split(",").map((value) => value.trim());
  if (
    args.length > 3 ||
    args.some((value) => !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) ||
    Number(args[0]) !== questId
  )
    return null;
  return Number(args[2] ?? 0);
}

function sharedRewardStep(
  step: ImportedStep,
  race: CampaignRace,
  ordinaryQuestIds: ReadonlySet<number>,
  dungeons: readonly string[],
): ImportedStep {
  const candidates = new Set(
    step.directives.flatMap((directive) =>
      directive.tag === ".turnin" &&
      directive.questId !== null &&
      directive.condition &&
      ordinaryQuestIds.has(directive.questId)
        ? [directive.questId]
        : [],
    ),
  );
  if (!candidates.size) return step;
  const filtered = {
    ...step,
    directives: step.directives.filter((directive) => ![".group", ".solo"].includes(directive.tag)),
  };
  const common = getGuideStepView(filtered, createCampaignSourceProfile(race, null), { dungeons });
  if (common.condition !== "match") return step;
  const classes = LEVELING_RACES.find((entry) => entry.id === race)?.classes ?? [];
  if (!classes.length) return step;
  const views = classes.map((classSlug) =>
    getGuideStepView(filtered, createCampaignSourceProfile(race, classSlug), { dungeons }),
  );
  if (views.some((view) => view.condition !== "match")) return step;
  const replacements = new Map<ImportedDirective, ImportedDirective | null>();
  for (const questId of candidates) {
    const isReward = (directive: ImportedDirective): boolean =>
      directive.tag === ".turnin" && directive.questId === questId;
    if (common.directives.some(isReward)) continue;
    const variants = step.directives.filter(isReward);
    const first = variants[0];
    if (!first) continue;
    const flags = sharedTurnInFlags(first, questId);
    if (
      flags === null ||
      variants.some(
        (directive) =>
          sharedTurnInFlags(directive, questId) !== flags || directive.text !== first.text,
      )
    )
      continue;
    const context = JSON.stringify(common.directives.filter((directive) => !isReward(directive)));
    const seen = new Set<ImportedDirective>();
    let compatible = true;
    for (const view of [common, ...views]) {
      const rewards = view.directives.filter(isReward);
      if (
        (view !== common && rewards.length !== 1) ||
        view.conditionalDirectives.some((directive) => !isReward(directive)) ||
        (view !== common && view.conditionalDirectives.length > 0) ||
        JSON.stringify(view.directives.filter((directive) => !isReward(directive))) !== context
      ) {
        compatible = false;
        break;
      }
      for (const directive of rewards) seen.add(directive);
    }
    if (!compatible || variants.some((directive) => !seen.has(directive))) continue;
    for (const directive of variants) replacements.set(directive, null);
    // RXP's reward index 0 delegates to the player's reward selection/settings.
    // Preserve flags such as disabled automatic turn-in; never force the leader's item.
    replacements.set(first, {
      ...first,
      arguments: flags === 0 ? String(questId) : `${questId},0,${flags}`,
      condition: "",
    });
  }
  if (!replacements.size) return step;
  return {
    ...step,
    directives: step.directives.flatMap((directive) => {
      const replacement = replacements.get(directive);
      return replacement === null ? [] : [replacement ?? directive];
    }),
  };
}

/** Derive common hand-ins only when every valid class has the same ordinary quest and context. */
export function sharedCampaignRewardSources(
  sources: readonly CampaignSource[],
  race: CampaignRace,
  ordinaryQuestIds: ReadonlySet<number>,
): readonly CampaignSource[] {
  if (race !== "human" || !ordinaryQuestIds.size) return sources;
  const selected = new Set(PREMADE_STOPS.flatMap((stop) => stop.visitIds));
  const dungeons = DUNGEON_VISITS.flatMap((visit) =>
    selected.has(visit.id) && visit.sourceTag ? [visit.sourceTag] : [],
  );
  return sources.map((source) => {
    const steps = source.guide.steps.map((step) =>
      sharedRewardStep(step, race, ordinaryQuestIds, dungeons),
    );
    return steps.every((step, index) => step === source.guide.steps[index])
      ? source
      : { ...source, guide: { ...source.guide, steps } };
  });
}
