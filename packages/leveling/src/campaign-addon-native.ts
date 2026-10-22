import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { PREMADE_STOPS } from "./premade.js";
import { getGuideStepView, type ImportedDirective } from "./guide-archive.js";

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
  ".disablecheckbox",
]);
const questStates = new Map<string, CampaignAction["questChanges"][number]["state"]>([
  [".accept", "accepted"],
  [".complete", "objectives-complete"],
  [".turnin", "rewarded"],
]);
const positionTags = new Set([".goto", ".waypoint", ".line"]);
const displayTags = new Set([".target", ".mob", ".unitscan"]);
const questChecks = new Set([
  ".isOnQuest",
  ".isNotOnQuest",
  ".isQuestTurnedIn",
  ".isQuestComplete",
  ".isQuestNotComplete",
  ".isQuestAvailable",
]);
const commands = new Set([
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

function matchesQuest(action: CampaignAction, directive: ImportedDirective): boolean {
  const state = questStates.get(directive.tag);
  const objective =
    directive.tag === ".complete" ? Number(directive.arguments.split(",")[1] ?? 1) : null;
  return action.questChanges.some(
    (change) =>
      change.questId === directive.questId &&
      change.state === state &&
      (change.state === "objectives-complete"
        ? (change.objectiveIndex ?? 1)
        : change.objectiveIndex) === objective,
  );
}

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
    const sourceQuests = directives.filter((directive) => questStates.has(directive.tag));
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
    let previousQuest: ImportedDirective | undefined;
    const retained = directives.filter((directive) => {
      if (replacedControls.has(directive.tag)) return false;
      if (questStates.has(directive.tag)) {
        previousQuest = directive;
        return matchesQuest(action, directive);
      }
      if (positionTags.has(directive.tag)) return matchesPosition(action, directive);
      if (completeStep) return true;
      if (displayTags.has(directive.tag))
        return previousQuest !== undefined && matchesQuest(action, previousQuest);
      if (questChecks.has(directive.tag)) {
        const ids = directive.arguments.split(",").map(Number);
        return ids.length > 0 && ids.every((id) => relevantQuests.has(id));
      }
      if ([".collect", ".addquestitem"].includes(directive.tag)) {
        const index = directive.tag === ".collect" ? 2 : 1;
        const questId = Number(directive.arguments.split(",")[index]);
        return relevantQuests.has(questId);
      }
      if (directive.tag === ".use")
        return relevantItems.has(Number(directive.arguments.split(",")[0]));
      // Unbound utility/item commands from a partially retained source step could
      // train another class, use a discarded quest item, or change the hearth route.
      return false;
    });
    const conditions = retained
      .filter((directive) => questStates.has(directive.tag))
      .map((directive) => directive.condition);
    const questCondition = sharedQuestCondition(conditions);
    return {
      condition: combinedConditions(source.condition, questCondition),
      directives: retained.map((directive) =>
        // A sticky training reminder must not hide/block the sequential route below
        // its display level. Stock reverse-XP skips only this reminder, not the route.
        directive.tag === "#level"
          ? { ...directive, tag: ".xp", arguments: `<${directive.arguments},1`, text: "" }
          : directive,
      ),
    };
  };
}
