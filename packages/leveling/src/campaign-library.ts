import {
  chapterEligibility,
  evaluateChapterCondition,
  getChapterLabel,
} from "./chapter-catalog.js";
import { getGuideStepView, type ImportedDirective } from "./guide-archive.js";
import type { CharacterProfile } from "./profile.js";
import type { CampaignAction, CampaignSource } from "./campaign.js";

export type LibraryObjective =
  "shared-kills" | "named-trophy" | "delivery" | "interaction" | "collection" | "unclassified";

export interface CampaignLibraryQuest {
  readonly questId: number;
  readonly title: string;
  readonly objective: LibraryObjective;
  readonly referenceLevel: number;
  readonly zone: string;
  readonly sourceId: number;
  readonly prerequisiteIds: readonly number[];
  readonly held: boolean;
  readonly complete: boolean;
  readonly actions: readonly CampaignAction[];
}

interface LibraryStage {
  readonly action: CampaignAction;
  readonly sourceId: number;
  readonly level: number;
  readonly zone: string;
  readonly ordinal: number;
  readonly objective: LibraryObjective | null;
  readonly held: boolean;
  readonly completionGuard: boolean;
}

const personalCondition =
  /(?:^|[\s/])(?:Warrior|Paladin|Hunter|Rogue|Priest|Mage|Warlock|Druid|Shaman|Human|Dwarf|Gnome|NightElf|Skyborne)(?=[\s/]|$)/i;
const lifecycleChecks = new Set([
  ".isOnQuest",
  ".isNotOnQuest",
  ".isQuestComplete",
  ".isQuestNotComplete",
  ".isQuestTurnedIn",
  ".isQuestAvailable",
  ".maxlevel",
  ".xp",
]);

export function classifyLibraryObjective(
  text: string,
  directives: readonly ImportedDirective[],
): LibraryObjective {
  if (
    directives.some((directive) =>
      [".use", ".cast", ".gossip", ".interact"].includes(directive.tag),
    )
  )
    return "unclassified";
  const normalize = (name: string): string =>
    name.replace(/^\+/, "").replace(/\s+/g, " ").trim().toLowerCase();
  const counter = /^(.*?)\s*\((\d+)\)\s*$/.exec(
    directives.find((directive) => directive.tag === ".complete")?.text ?? "",
  );
  if (
    counter &&
    directives.some(
      (directive) =>
        directive.tag === ".mob" && normalize(directive.arguments) === normalize(counter[1]!),
    )
  )
    return "shared-kills";
  if (/(?:^|\n)(?:use|escort|defend|protect|follow|start the event)\b/i.test(text))
    return "unclassified";
  const kill = /(?:^|\n)(?:kill|slay|defeat|destroy)\b/i.test(text);
  const loot =
    /\b(loot|collect|gather|skin|drop|bring)\b/i.test(text) ||
    directives.some((directive) => directive.tag === ".collect");
  const named = directives.some(
    (directive) =>
      [".mob", ".unitscan"].includes(directive.tag) &&
      directive.arguments.trim() &&
      !directive.arguments.startsWith("+"),
  );
  const trophy =
    /\b(?:his|her|its)\s+(?:head|skull|paw|heart|badge|ear|horn|claw|tooth|eye|medallion)\b/i.test(
      text,
    );
  const multiple =
    /\b(?:[2-9]|\d{2,})\s+(?:heads?|skulls?|paws?|hearts?|badges?|ears?|horns?|claws?|teeth|eyes?|medallions?)\b/i.test(
      text,
    );
  if (
    kill &&
    loot &&
    named &&
    trophy &&
    !multiple &&
    !directives.some(
      (directive) => directive.tag === ".collect" && Number(directive.arguments.split(",")[1]) > 1,
    )
  )
    return "named-trophy";
  return loot
    ? "collection"
    : kill
      ? "shared-kills"
      : /(?:^|\n)(?:click|read|discover|enter|talk to|speak to|travel up to)\b/i.test(text) &&
          !/\b(wait|waves?|escort|respawn)\b/i.test(text)
        ? "interaction"
        : "unclassified";
}

export function buildCampaignQuestLibrary(
  sources: readonly CampaignSource[],
  profile: CharacterProfile,
  dungeonTags: readonly string[],
): readonly CampaignLibraryQuest[] {
  const stages = new Map<number, Map<string, LibraryStage>>();
  const titles = new Map<number, string>();
  const parents = new Map<number, Set<number>>();
  const collectionIds = new Set<number>();
  const sorted = [...sources]
    .filter((source) => chapterEligibility(source.reference, profile) === "match")
    .sort(
      (left, right) =>
        getChapterLabel(left.reference, profile).minimumLevel -
          getChapterLabel(right.reference, profile).minimumLevel ||
        left.reference.sourceId - right.reference.sourceId,
    );
  for (const { reference, guide } of sorted) {
    const label = getChapterLabel(reference, profile);
    for (const step of guide.steps) {
      const view = getGuideStepView(
        {
          ...step,
          directives: step.directives.filter(
            (directive) => ![".group", ".solo"].includes(directive.tag),
          ),
        },
        profile,
        { dungeons: dungeonTags },
      );
      if (view.condition !== "match") continue;
      for (const directive of view.directives) {
        if (directive.tag !== ".collect") continue;
        const id = Number(directive.arguments.split(",")[2]);
        if (Number.isSafeInteger(id) && id > 0) collectionIds.add(id);
      }
      let previousReturn: number | null = null;
      for (const [offset, directive] of view.directives.entries()) {
        const state =
          directive.tag === ".accept"
            ? "accepted"
            : directive.tag === ".complete"
              ? "objectives-complete"
              : directive.tag === ".turnin"
                ? "rewarded"
                : null;
        if (!state || directive.questId === null) continue;
        const questId = directive.questId;
        if (state === "accepted" && directive.text)
          titles.set(questId, directive.text.replace(/^Accept\s+/i, ""));
        if (state === "rewarded") previousReturn = questId;
        const required = parents.get(questId) ?? new Set<number>();
        if (state === "accepted") {
          if (previousReturn !== null && previousReturn !== questId) required.add(previousReturn);
          for (const check of view.runtimeChecks) {
            const parent = Number(check.arguments.split(",")[0]);
            if (
              check.tag === ".isQuestTurnedIn" &&
              Number.isSafeInteger(parent) &&
              parent > 0 &&
              parent !== questId
            )
              required.add(parent);
          }
          parents.set(questId, required);
        }
        const objectiveIndex =
          state === "objectives-complete" ? Number(directive.arguments.split(",")[1] ?? 1) : null;
        if (objectiveIndex !== null && (!Number.isInteger(objectiveIndex) || objectiveIndex < 1))
          continue;
        const phaseKey = `${state}-${objectiveIndex ?? 0}`;
        const byPhase = stages.get(questId) ?? new Map<string, LibraryStage>();
        const next = view.directives.findIndex(
          (entry, index) => index > offset && entry.tag === ".complete",
        );
        const segment = view.directives.slice(offset, next < 0 ? undefined : next);
        const mixed = view.directives.some(
          (entry) =>
            entry.questId !== null && entry.questId !== questId && entry.tag === ".complete",
        );
        const context = [
          directive.text,
          ...(!mixed
            ? view.directives.filter((entry) => entry.tag === "text").map((entry) => entry.text)
            : []),
        ].filter(Boolean);
        const objective =
          state === "objectives-complete"
            ? classifyLibraryObjective(context.join("\n"), [
                ...segment,
                ...view.directives.filter((entry) =>
                  [".collect", ".use", ".cast", ".gossip", ".interact"].includes(entry.tag),
                ),
              ])
            : null;
        const held =
          personalCondition.test(reference.condition) ||
          personalCondition.test(step.condition) ||
          personalCondition.test(directive.condition) ||
          view.runtimeChecks.some((check) => !lifecycleChecks.has(check.tag)) ||
          evaluateChapterCondition(step.condition, profile) !== "match";
        const old = byPhase.get(phaseKey);
        if (
          old &&
          (!old.held || held) &&
          !(
            old.objective === "unclassified" &&
            objective !== null &&
            objective !== "unclassified" &&
            !held
          )
        )
          continue;
        const action: CampaignAction = {
          id: `library-quest-${questId}-${phaseKey}`,
          legId: "unassigned",
          title:
            directive.text ||
            `${state === "accepted" ? "Accept" : state === "rewarded" ? "Hand in" : `Complete objective ${objectiveIndex} of`} ${titles.get(questId) ?? `Quest ${questId}`}`,
          instructions: [
            ...context,
            ...segment
              .filter((entry) => [".mob", ".unitscan", ".target"].includes(entry.tag))
              .map((entry) => `Target: ${entry.arguments.replace(/^\+/, "")}`),
          ],
          questChanges: [
            { questId, state, title: titles.get(questId) ?? `Quest ${questId}`, objectiveIndex },
          ],
          positions: view.directives.flatMap((entry) =>
            entry.position ? [{ sourceLine: entry.sourceLine, position: entry.position }] : [],
          ),
          source: { chapterId: guide.chapterId, version: guide.version, stepId: step.id },
          kind: "quests",
          leaderOnly: false,
          targetLevel: null,
          targetStopId: null,
          raidOnly: false,
        };
        byPhase.set(phaseKey, {
          action,
          sourceId: reference.sourceId,
          level: label.minimumLevel,
          zone: label.zone,
          ordinal: step.ordinal,
          objective,
          held,
          completionGuard:
            state === "rewarded" &&
            view.runtimeChecks.some(
              (check) =>
                check.tag === ".isQuestComplete" &&
                Number(check.arguments.split(",")[0]) === questId,
            ),
        });
        stages.set(questId, byPhase);
      }
    }
  }
  return [...stages]
    .map(([questId, byPhase]): CampaignLibraryQuest => {
      const entries = [...byPhase.values()];
      const objectives = entries.filter((entry) => entry.objective !== null);
      const anchor = objectives[0] ?? byPhase.get("accepted-0") ?? entries[0]!;
      const objective: LibraryObjective = objectives.some(
        (entry) => entry.objective === "collection",
      )
        ? "collection"
        : objectives.some((entry) => entry.objective === "unclassified")
          ? "unclassified"
          : objectives.some((entry) => entry.objective === "named-trophy")
            ? "named-trophy"
            : objectives.some((entry) => entry.objective === "interaction")
              ? "interaction"
              : objectives.length
                ? "shared-kills"
                : collectionIds.has(questId)
                  ? "collection"
                  : "delivery";
      const title = titles.get(questId) ?? `Quest ${questId}`;
      const prerequisiteIds = [...(parents.get(questId) ?? [])];
      return {
        questId,
        title,
        objective,
        sourceId: anchor.sourceId,
        zone: anchor.zone,
        referenceLevel: Math.max(
          ...objectives.map((entry) => entry.level),
          byPhase.get("accepted-0")?.level ?? anchor.level,
        ),
        prerequisiteIds,
        complete: byPhase.has("accepted-0") && byPhase.has("rewarded-0"),
        held:
          entries.some((entry) => entry.held) ||
          (!objectives.length && entries.some((entry) => entry.completionGuard)),
        actions: entries
          .sort(
            (left, right) =>
              left.level - right.level ||
              left.sourceId - right.sourceId ||
              left.ordinal - right.ordinal,
          )
          .map((entry) => ({
            ...entry.action,
            title: entry.action.title.replace(/Quest \d+/, title),
            questChanges: entry.action.questChanges.map((change) => ({ ...change, title })),
            ...(entry.action.questChanges[0]?.state === "accepted" && prerequisiteIds.length
              ? { requiredQuestIds: prerequisiteIds }
              : {}),
          })),
      };
    })
    .sort(
      (left, right) =>
        left.referenceLevel - right.referenceLevel ||
        left.sourceId - right.sourceId ||
        left.questId - right.questId,
    );
}
