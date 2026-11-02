import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { PREMADE_STOPS } from "./premade.js";
import { getGuideStepView, type ImportedDirective } from "./guide-archive.js";
import { CAMPAIGN_QUEST_GUARDS } from "./campaign-native-guards.js";
import { parseCampaignItemTarget } from "./campaign-items.js";
import {
  CAMPAIGN_SOURCE_CHECKS,
  campaignSourceCheckMap,
  createCampaignSourceConditions,
  matchesCampaignSourcePhase as matchesQuest,
} from "./campaign-source-conditions.js";
import { displayOnlyQuestPhases } from "./campaign-source-display.js";

export const CAMPAIGN_NATIVE_POLICY = "canonical-sequential-v1" as const;

// These source controls describe the old route graph or optional grinding, not the
// selected campaign graph. The canonical action order and real XP gates replace them.
const replacedControls = new Set([
  "text",
  "marker",
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
  "#som",
  "#softcore",
  "#softcoreserver",
  "#hardcore",
  "#hardcoreserver",
  "#ssf",
  "#ah",
  "#phase",
  ".dungeon",
  ".group",
  ".solo",
  ".xp",
  ".maxlevel",
  ".zoneskip",
  ".subzoneskip",
]);
const questStates = new Map<string, CampaignAction["questChanges"][number]["state"]>([
  [".accept", "accepted"],
  [".complete", "objectives-complete"],
  [".turnin", "rewarded"],
]);
const positionTags = new Set([".goto", ".waypoint", ".line"]);
const displayTags = new Set([".target", ".mob", ".unitscan"]);
const questChecks = CAMPAIGN_QUEST_GUARDS;
const commands = new Set([
  ".disablecheckbox",
  "#level",
  ...positionTags,
  ...displayTags,
  ...questChecks,
  ...questStates.keys(),
  ".fp",
  ".fly",
  ".hs",
  ".home",
  ".zone",
  ".trainer",
  ".vendor",
  ".use",
  ".collect",
  ".train",
  ".timer",
  ".itemcount",
  ".itemStat",
  ".money",
  ".skill",
  ".istrained",
  ".aura",
  ".cooldown",
  ".zoneskip",
  ".subzoneskip",
  ".bindlocation",
  ".reputation",
  ".skipgossip",
  ".skipgossipid",
  ".addquestitem",
  ".link",
  ".cast",
  ".usespell",
  ".equip",
  ".destroy",
  ".bronzetube",
  ".macro",
  ".gossipoption",
  ".subzone",
  ".abandon",
  ".deathskip",
  "#arrowtext",
]);

function matchesPosition(action: CampaignAction, directive: ImportedDirective): boolean {
  const position = directive.position;
  return (
    position !== null &&
    action.positions.some(
      (entry) =>
        entry.sourceLine === directive.sourceLine &&
        entry.position.zone === position.zone &&
        entry.position.floor === position.floor &&
        entry.position.x === position.x &&
        entry.position.y === position.y &&
        entry.position.space === position.space,
    )
  );
}

function validateDirective(directive: ImportedDirective): void {
  const args = directive.arguments;
  if (
    [...args].some((character) => character.charCodeAt(0) < 32) ||
    args.includes("<<") ||
    args.includes(">>") ||
    args.includes("--")
  )
    throw new Error(
      `Unsafe native ${directive.tag} arguments at source line ${directive.sourceLine}.`,
    );
  if (directive.tag === ".link" && !/^https:\/\/[^\s]+$/.test(args))
    throw new Error(`Native link must use HTTPS at source line ${directive.sourceLine}.`);
  if (positionTags.has(directive.tag) && !directive.position)
    throw new Error(`Invalid native position at source line ${directive.sourceLine}.`);
  if (directive.tag === "#level" && !/^(?:[1-9]|[1-5][0-9]|60)$/.test(args))
    throw new Error(`Invalid native display level at source line ${directive.sourceLine}.`);
}

export interface CampaignNativeStep {
  readonly condition: string;
  readonly directives: readonly ImportedDirective[];
  readonly canonicalQuestConditions?: Readonly<Record<number, string>>;
}

function combinedConditions(...conditions: readonly string[]): string {
  let branches = [""];
  for (const condition of conditions.filter((value) => value.trim())) {
    const alternatives = condition.split("/").map((value) => value.trim());
    if (branches.length * alternatives.length > 64)
      throw new Error("Native eligibility exceeds its branch budget.");
    branches = branches.flatMap((prefix) =>
      alternatives.map((alternative) => `${prefix} ${alternative}`.trim()),
    );
  }
  return [...new Set(branches)].join("/");
}

function sharedQuestCondition(conditions: readonly string[]): string {
  const unique = new Set(conditions);
  return unique.size === 1 ? ([...unique][0] ?? "") : "";
}

export type CampaignNativeInstructions = (action: CampaignAction) => CampaignNativeStep | null;

export function campaignNativeInstructions(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
): CampaignNativeInstructions {
  const profile = createCampaignSourceProfile(plan.race, plan.leaderClass);
  const selected = new Set(PREMADE_STOPS.flatMap((stop) => stop.visitIds));
  const dungeons = DUNGEON_VISITS.flatMap((visit) =>
    selected.has(visit.id) && visit.sourceTag ? [visit.sourceTag] : [],
  );
  const steps = new Map<string, CampaignNativeStep>();
  const plannedQuests = new Set(
    plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  for (const source of sources) {
    if (source.guide.targetBuild !== plan.targetBuild)
      throw new Error(`Native source build mismatch: ${source.guide.chapterId}.`);
    for (const step of source.guide.steps) {
      const key = `${source.guide.chapterId}:${source.guide.version}:${step.id}`;
      if (steps.has(key)) throw new Error(`Duplicate native source step: ${key}.`);
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
      if (view.condition === "match")
        steps.set(key, { condition: step.condition, directives: view.directives });
    }
  }
  return (action: CampaignAction): CampaignNativeStep | null => {
    if (!action.source || action.kind === "xp-check" || action.kind === "checkpoint") return null;
    const key = `${action.source.chapterId}:${action.source.version}:${action.source.stepId}`;
    const source = steps.get(key);
    if (!source) throw new Error(`Native source step is unavailable or ineligible: ${action.id}.`);
    const { directives } = source;
    if (action.movement) {
      const utility = directives.filter(
        (directive) =>
          [".fp", ".train", ".trainer", ".vendor"].includes(directive.tag) ||
          (directive.tag === ".home" && !action.movement?.terminal),
      );
      for (const directive of utility) validateDirective(directive);
      return utility.length ? { condition: source.condition, directives: utility } : null;
    }
    for (const directive of directives) {
      if (replacedControls.has(directive.tag)) continue;
      if (!commands.has(directive.tag))
        throw new Error(`Unsupported native instruction ${directive.tag} in ${action.id}.`);
      validateDirective(directive);
      if (
        directive.tag === ".abandon" &&
        plannedQuests.has(Number(directive.arguments.split(",")[0]))
      )
        throw new Error(`Abandoning a retained campaign quest is not modeled: ${action.id}.`);
    }
    const displayOnly = displayOnlyQuestPhases(directives);
    const sourceQuests = directives.filter(
      (directive) => questStates.has(directive.tag) && !displayOnly.has(directive),
    );
    const completeStep = sourceQuests.every((directive) => matchesQuest(action, directive));
    const missingNativePhase = action.questChanges.some(
      (change) =>
        !sourceQuests.some(
          (directive) =>
            directive.questId === change.questId &&
            matchesQuest({ ...action, questChanges: [change] }, directive),
        ),
    );
    if (missingNativePhase) {
      const canonicalQuestConditions: Record<number, string> = {};
      for (const change of action.questChanges) {
        const candidates = sourceQuests.filter((directive) => directive.questId === change.questId);
        if (!candidates.length)
          throw new Error(`Native source does not cover quest ${change.questId} in ${action.id}.`);
        canonicalQuestConditions[change.questId] = sharedQuestCondition(
          candidates.map((directive) => directive.condition),
        );
      }
      return {
        condition: combinedConditions(
          source.condition,
          sharedQuestCondition(Object.values(canonicalQuestConditions)),
        ),
        directives: directives.filter(
          (directive) => positionTags.has(directive.tag) && matchesPosition(action, directive),
        ),
        canonicalQuestConditions,
      };
    }
    const relevantQuests = new Set([
      ...action.questChanges.map((change) => change.questId),
      ...(action.itemCollections?.map((target) => target.questId) ?? []),
      ...(action.requiredQuestIds ?? []),
    ]);
    const relevantItems = new Set(
      directives.flatMap((directive) => {
        const args = directive.arguments.split(",").map(Number);
        const index =
          directive.tag === ".collect" ? 2 : directive.tag === ".addquestitem" ? 1 : null;
        return index !== null && relevantQuests.has(args[index] ?? 0) ? [args[0]!] : [];
      }),
    );
    const boundItems = new Set(
      directives.flatMap((directive) => {
        const args = directive.arguments.split(",").map(Number);
        const index =
          directive.tag === ".collect" ? 2 : directive.tag === ".addquestitem" ? 1 : null;
        return index !== null && (args[index] ?? 0) > 0 ? [args[0]!] : [];
      }),
    );
    let previousQuest: ImportedDirective | undefined;
    const selectedChecks = campaignSourceCheckMap(
      action,
      createCampaignSourceConditions(directives),
    );
    const retained = directives.filter((directive) => {
      if (replacedControls.has(directive.tag)) return false;
      if (displayOnly.has(directive)) return completeStep;
      if (directive.tag === ".disablecheckbox")
        return completeStep && displayOnly.has(directives[directives.indexOf(directive) - 1]!);
      if (CAMPAIGN_SOURCE_CHECKS.has(directive.tag)) return selectedChecks.has(directive);
      if (
        directive.tag === ".mob" &&
        (action.creatureTarget || action.referenceCreatureTargets) &&
        !(action.creatureTarget ? [action.creatureTarget] : action.referenceCreatureTargets!).some(
          (target) =>
            directive.arguments.replace(/^\+/, "").trim().normalize("NFKC").toLowerCase() ===
            target.name.normalize("NFKC").toLowerCase(),
        )
      )
        return false;
      if (
        [".fp", ".fly", ".hs", ".home", ".zone", ".trainer", ".vendor"].includes(directive.tag) &&
        action.nativeUtilityTags &&
        !action.nativeUtilityTags.some((tag) => tag === directive.tag)
      )
        return false;
      if (questStates.has(directive.tag)) {
        previousQuest = directive;
        return matchesQuest(action, directive);
      }
      if (positionTags.has(directive.tag)) return matchesPosition(action, directive);
      if ([".collect", ".addquestitem"].includes(directive.tag)) {
        if (action.itemCollections?.length && directive.tag === ".collect") {
          const source = parseCampaignItemTarget(directive);
          return (
            source !== null &&
            action.itemCollections.some(
              (target) =>
                target.questId === source.questId &&
                target.itemId === source.itemId &&
                target.quantity === source.quantity &&
                target.objectiveBitmask === source.objectiveBitmask,
            )
          );
        }
        const index = directive.tag === ".collect" ? 2 : 1;
        const questId = Number(directive.arguments.split(",")[index]);
        return Number.isSafeInteger(questId) && questId > 0
          ? relevantQuests.has(questId)
          : completeStep;
      }
      if (directive.tag === ".use" && boundItems.has(Number(directive.arguments.split(",")[0])))
        return relevantItems.has(Number(directive.arguments.split(",")[0]));
      if (completeStep) return true;
      if (displayTags.has(directive.tag))
        return previousQuest !== undefined && matchesQuest(action, previousQuest);
      if (directive.tag === ".use")
        return relevantItems.has(Number(directive.arguments.split(",")[0]));
      // Unbound utility/item commands from a partially retained source step could
      // train another class, use a discarded quest item, or change the hearth route.
      return false;
    });
    const conditions = retained
      .filter((directive) => questStates.has(directive.tag) && !displayOnly.has(directive))
      .map((directive) => directive.condition);
    const questCondition = sharedQuestCondition(conditions);
    return {
      condition: combinedConditions(source.condition, questCondition),
      directives: retained.map((directive) =>
        // A sticky training reminder must not hide/block the sequential route below
        // its display level. Stock reverse-XP skips only this reminder, not the route.
        directive.tag === "#level"
          ? { ...directive, tag: ".xp", arguments: `<${directive.arguments},1`, text: "" }
          : (selectedChecks.get(directive) ?? directive),
      ),
    };
  };
}
