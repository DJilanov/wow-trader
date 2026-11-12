import type { CampaignSource } from "./campaign.js";
import type { CampaignRace } from "./campaign-route.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { sharedCampaignRewardSources, sharedTurnInFlags } from "./campaign-shared-rewards.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { PREMADE_STOPS } from "./premade.js";
import { LEVELING_RACES } from "./profile.js";
import { evaluateChapterCondition } from "./chapter-catalog.js";
import { getGuideStepView, type ImportedDirective, type ImportedStep } from "./guide-archive.js";
import { CAMPAIGN_QUEST_GUARDS } from "./campaign-native-guards.js";
import { combatTargetNameForms } from "./combat-quest-counter.js";

const phases = new Set([".accept", ".complete", ".turnin"]);
const classAdvice = /\b(?:warrior|paladin|hunter|rogue|priest|mage|warlock|shaman|druid)\b/i;
const spellMethod = /(?:^|[.!?]\s+|\bthen\s+)(?:cast|channel)\b/i;

// Solo spell advice is optional only when a separate instruction names the same kill target.
function hasCommonKillMethod(step: ImportedStep, ordinaryQuestIds: ReadonlySet<number>): boolean {
  const objectives = step.directives.filter((row) => row.tag === ".complete");
  if (objectives.length !== 1 || !ordinaryQuestIds.has(objectives[0]!.questId ?? 0)) return false;
  const targets = [
    ...new Set(
      step.directives
        .filter((row) => [".mob", ".unitscan"].includes(row.tag))
        .map((row) => row.arguments.trim()),
    ),
  ];
  if (targets.length !== 1 || !/^[A-Za-z][A-Za-z '’-]*$/.test(targets[0]!)) return false;
  const target = targets[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return step.directives.some(
    (row) =>
      row.tag === "text" &&
      !row.condition.trim() &&
      new RegExp(`^(?:Kill|Slay|Defeat|Destroy) ${target}(?:[.!?,]|\\s|$)`, "i").test(row.text) &&
      !spellMethod.test(row.text),
  );
}
const supported = new Set([
  ...phases,
  ...CAMPAIGN_QUEST_GUARDS,
  "text",
  "marker",
  ".goto",
  ".waypoint",
  ".line",
  ".mob",
  ".target",
  ".unitscan",
  "#label",
  "#requires",
  "#completewith",
  "#sticky",
  "#loop",
  "#optional",
  "#hidewindow",
  "#xprate",
  "#season",
  "#era",
  "#era/som",
  "#softcore",
  "#softcoreserver",
  ".dungeon",
]);

function phaseKey(directive: ImportedDirective): string {
  return `${directive.tag}:${directive.questId}:${directive.tag === ".complete" ? (directive.arguments.split(",")[1] ?? "1") : "0"}`;
}

function isLiteralNpcDialogue(
  text: string,
  directives: readonly ImportedDirective[],
): boolean {
  const targets = directives.filter((row) => row.tag === ".target");
  if (targets.length !== 1) return false;
  const target = targets[0]!.arguments.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z][A-Za-z '’-]+$/.test(target) || !target.includes(" ")) return false;
  const normalized = text.trim().replace(/\s+/g, " ");
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const greeting = new RegExp(`^(?:Talk to|Speak to|Speak with) ${escaped}(?=[.!?,]|\\s|$)`, "i").exec(normalized);
  if (!greeting) return false;
  const location = normalized.slice(greeting[0].length).trim();
  // A class title in the captured NPC name is not advice to use that class's abilities.
  return (
    /^(?:(?:at|in|on|atop|inside|outside|near|by)\s+[A-Za-z0-9 '’,.-]+)?[.!]?$/i.test(location) &&
    !classAdvice.test(location) &&
    !/\b(?:cast|channel|use|train|teleport|summon|pickpocket|resurrect|die|dying|jump|only|if|unless|before|after|then|and)\b/i.test(location)
  );
}

function isLiteralCreatureInstruction(
  text: string,
  directives: readonly ImportedDirective[],
): boolean {
  if (
    !/^(?:Kill|Slay|Defeat|Destroy)\s/i.test(text.trim()) ||
    !directives.some((row) => row.tag === ".complete") ||
    /\b(?:cast|channel|use|train|pickpocket|resurrect|teleport|summon)\b/i.test(text)
  )
    return false;
  const targets = directives
    .filter((row) => [".mob", ".unitscan"].includes(row.tag))
    .flatMap((row) => {
      const name = row.arguments.replace(/^\+/, "").trim();
      return /^[A-Za-z][A-Za-z '’-]+$/.test(name) && name.includes(" ")
        ? [...combatTargetNameForms(name)]
        : [];
    });
  const names = [...new Set(targets)].sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!names.length) return false;
  const remaining = text.replace(new RegExp(`\\b(?:${names.join("|")})\\b`, "gi"), "[creature]");
  return !classAdvice.test(remaining);
}

export function isCommonCampaignQuestMethod(
  directives: readonly ImportedDirective[],
  ordinaryQuestIds: ReadonlySet<number>,
): boolean {
  return directives.every(
    (row) =>
      supported.has(row.tag) &&
      (!phases.has(row.tag) || (row.questId !== null && ordinaryQuestIds.has(row.questId))) &&
      !(
        row.tag === "text" &&
        (/\b(?:warrior|paladin|hunter|rogue|priest|mage|warlock|shaman|druid|train|pickpocket|resurrect)\b/i.test(
          row.text,
        ) ||
          spellMethod.test(row.text)) &&
        !isLiteralNpcDialogue(row.text, directives) &&
        !isLiteralCreatureInstruction(row.text, directives)
      ),
  );
}

function projectOrdinaryStep(
  step: ImportedStep,
  source: CampaignSource,
  ordinaryQuestIds: ReadonlySet<number>,
  dungeons: readonly string[],
): ImportedStep {
  if (
    !step.directives.some(
      (directive) =>
        phases.has(directive.tag) &&
        directive.questId !== null &&
        ordinaryQuestIds.has(directive.questId),
    )
  )
    return step;
  const commonKill = hasCommonKillMethod(step, ordinaryQuestIds);
  const filtered = {
    ...step,
    directives: step.directives.filter(
      (directive) =>
        ![".group", ".solo"].includes(directive.tag) &&
        !(
          directive.tag === "text" &&
          ((classAdvice.test(directive.condition) &&
            !(
              /^(?:click|open|loot|collect|gather|take|talk to|speak to)\b/i.test(directive.text) &&
              !/\b(?:cast|use|train|pickpocket|resurrect|pull|kite)\b/i.test(directive.text)
            )) ||
            (commonKill && spellMethod.test(directive.text)))
        ),
    ),
  };
  const common = getGuideStepView(filtered, createCampaignSourceProfile("human", null), {
    dungeons,
  });
  const known = new Set(
    common.condition === "match"
      ? common.directives.filter((row) => phases.has(row.tag)).map(phaseKey)
      : [],
  );
  const ordinaryPhase = (directive: ImportedDirective): boolean =>
    phases.has(directive.tag) &&
    directive.questId !== null &&
    ordinaryQuestIds.has(directive.questId);
  const matchingHumanRoute =
    common.condition === "match" &&
    [step.condition, ...step.directives.filter(ordinaryPhase).map((row) => row.condition)].some(
      (condition) => /^Human$/i.test(condition.trim()),
    );
  if (
    !matchingHumanRoute &&
    step.directives.filter(ordinaryPhase).every((directive) => known.has(phaseKey(directive)))
  )
    return step;
  const profiles = LEVELING_RACES.find((race) => race.id === "human")!.classes.map((classSlug) =>
    createCampaignSourceProfile("human", classSlug),
  );
  const views = profiles.flatMap((profile) => {
    if (evaluateChapterCondition(source.reference.condition, profile) !== "match") return [];
    const view = getGuideStepView(filtered, profile, { dungeons });
    return view.condition === "match" ? [view] : [];
  });
  const missing = new Set(
    views
      .flatMap((view) => view.directives.filter(ordinaryPhase).map(phaseKey))
      .filter((key) => !known.has(key)),
  );
  if (!missing.size && !matchingHumanRoute) return step;
  // Choose a captured ordinary-quest route, not a union of incompatible class strategies.
  const chosen = views.find(
    (view) =>
      !view.conditionalDirectives.length &&
      [...missing].every((key) => view.directives.some((row) => phaseKey(row) === key)) &&
      isCommonCampaignQuestMethod(view.directives, ordinaryQuestIds),
  );
  if (!chosen) return step;
  if (
    common.condition === "match" &&
    common.directives.some(
      (directive) =>
        !phases.has(directive.tag) &&
        directive.tag !== "text" &&
        !chosen.directives.includes(directive),
    )
  )
    return step;
  const selected = chosen.directives.filter(
    (directive) => !phases.has(directive.tag) || ordinaryPhase(directive),
  );
  const selectedKeys = selected.filter((row) => phases.has(row.tag)).map(phaseKey);
  if (new Set(selectedKeys).size !== selectedKeys.length) return step;
  const directives: ImportedDirective[] = [];
  for (const directive of selected) {
    if (directive.tag !== ".turnin") {
      directives.push({ ...directive, condition: "" });
      continue;
    }
    const flags = sharedTurnInFlags(directive, directive.questId!);
    if (flags === null) return step;
    directives.push({
      ...directive,
      arguments: flags === 0 ? String(directive.questId) : `${directive.questId},0,${flags}`,
      condition: "",
    });
  }
  return { ...step, condition: "", directives };
}

/** A class's solo route recommendation does not restrict a catalog-confirmed ordinary quest. */
export function sharedCampaignQuestSources(
  sources: readonly CampaignSource[],
  race: CampaignRace,
  ordinaryQuestIds: ReadonlySet<number>,
): readonly CampaignSource[] {
  const rewards = sharedCampaignRewardSources(sources, race, ordinaryQuestIds);
  if (race !== "human" || !ordinaryQuestIds.size) return rewards;
  const visits = new Set(PREMADE_STOPS.flatMap((stop) => stop.visitIds));
  const dungeons = DUNGEON_VISITS.flatMap((visit) =>
    visits.has(visit.id) && visit.sourceTag ? [visit.sourceTag] : [],
  );
  return rewards.map((source) => {
    const steps = source.guide.steps.map((step) =>
      projectOrdinaryStep(step, source, ordinaryQuestIds, dungeons),
    );
    return steps.every((step, index) => step === source.guide.steps[index])
      ? source
      : { ...source, guide: { ...source.guide, steps } };
  });
}
