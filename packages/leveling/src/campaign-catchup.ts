import { getGuideStepView } from "./guide-archive.js";
import { getChapterLabel, evaluateChapterCondition } from "./chapter-catalog.js";
import type { CharacterProfile } from "./profile.js";
import type { CampaignAction, CampaignSource } from "./campaign.js";

export interface CampaignQuestBatch {
  readonly id: string;
  readonly questId: number;
  readonly title: string;
  readonly zone: string;
  readonly referenceLevel: number;
  readonly sourceIds: readonly number[];
  readonly objectiveType: "shared-kills" | "collection" | "unclassified";
  readonly conditional: boolean;
  readonly actions: readonly CampaignAction[];
}

export function extractCampaignQuestBatches(
  sources: readonly CampaignSource[],
  profile: CharacterProfile,
  owned: ReadonlySet<number>,
  dungeonTags: readonly string[],
): readonly CampaignQuestBatch[] {
  const batches = new Map<
    number,
    {
      title: string;
      referenceLevel: number;
      zone: string;
      sourceIds: Set<number>;
      actions: CampaignAction[];
      phases: Set<string>;
      collection: boolean;
      kill: boolean;
      nonKillObjective: boolean;
      conditional: boolean;
    }
  >();
  for (const { reference, guide } of sources) {
    if (evaluateChapterCondition(reference.condition, profile) !== "match") continue;
    for (const step of guide.steps) {
      const view = getGuideStepView(step, profile, { dungeons: dungeonTags });
      if (view.condition !== "match") continue;
      for (const directive of view.directives) {
        const state =
          directive.tag === ".accept"
            ? "accepted"
            : directive.tag === ".complete"
              ? "objectives-complete"
              : directive.tag === ".turnin"
                ? "rewarded"
                : null;
        if (!state || directive.questId === null || owned.has(directive.questId)) continue;
        const id = directive.questId;
        let batch = batches.get(id);
        if (!batch) {
          batch = {
            title: `Quest ${id}`,
            referenceLevel: getChapterLabel(reference, profile).minimumLevel,
            zone: getChapterLabel(reference, profile).zone,
            sourceIds: new Set(),
            actions: [],
            phases: new Set(),
            collection: false,
            kill: false,
            nonKillObjective: false,
            conditional:
              /(?:^|\s)(Warrior|Paladin|Hunter|Rogue|Priest|Mage|Warlock|Druid|Shaman)(?:\s|$)/.test(
                reference.condition,
              ),
          };
          batches.set(id, batch);
        }
        batch.sourceIds.add(reference.sourceId);
        batch.referenceLevel = Math.min(
          batch.referenceLevel,
          getChapterLabel(reference, profile).minimumLevel,
        );
        batch.conditional ||=
          Boolean(step.condition || directive.condition) ||
          view.runtimeChecks.some(
            (check) =>
              ![".isOnQuest", ".isQuestComplete", ".isQuestNotComplete"].includes(check.tag) ||
              Number(check.arguments.split(",")[0]) !== id,
          );
        const objectiveIndex =
          state === "objectives-complete" ? Number(directive.arguments.split(",")[1] ?? 1) : null;
        const key = `${state}-${objectiveIndex ?? 0}`;
        if (batch.phases.has(key)) continue;
        batch.phases.add(key);
        if (state === "accepted" && directive.text)
          batch.title = directive.text.replace(/^Accept\s+/i, "");
        if (state === "objectives-complete") {
          const mixed = view.directives.some(
            (entry) => entry.questId !== null && entry.questId !== id,
          );
          const context = [
            directive.text,
            ...(!mixed
              ? view.directives.filter((entry) => entry.tag === "text").map((entry) => entry.text)
              : []),
          ].join(" ");
          batch.collection ||=
            /\b(loot|collect|gather|skin|drop|bring)\b/i.test(context) ||
            view.directives.some((entry) => entry.tag === ".collect");
          const killObjective =
            /\b(kill|slay|defeat|destroy)\b/i.test(context) &&
            !view.directives.some((entry) =>
              [".use", ".gossip", ".cast", ".interact"].includes(entry.tag),
            );
          batch.kill ||= killObjective;
          batch.nonKillObjective ||= !killObjective;
        }
        const parents =
          state === "accepted"
            ? view.directives
                .filter(
                  (entry) =>
                    entry.tag === ".turnin" && entry.questId !== null && entry.questId !== id,
                )
                .map((entry) => entry.questId!)
            : [];
        batch.actions.push({
          id: `quest-${id}-${batch.actions.length}`,
          legId: "unassigned",
          title: directive.text || `${state}: ${batch.title}`,
          instructions: [
            directive.text || `${state}: ${batch.title}`,
            ...view.directives
              .filter((entry) => entry.tag === ".target")
              .map((entry) => `Target: ${entry.arguments}`),
            ...(!view.directives.some((entry) => entry.questId !== null && entry.questId !== id)
              ? view.directives
                  .filter((entry) => entry.tag === "text" && entry.text)
                  .map((entry) => entry.text)
              : []),
          ],
          questChanges: [{ questId: id, title: batch.title, state, objectiveIndex }],
          positions: view.directives.flatMap((entry) =>
            entry.position ? [{ sourceLine: entry.sourceLine, position: entry.position }] : [],
          ),
          source: { chapterId: guide.chapterId, version: guide.version, stepId: step.id },
          kind: "quests",
          leaderOnly: false,
          targetLevel: null,
          targetStopId: null,
          raidOnly: false,
          ...(parents.length ? { requiredQuestIds: parents } : {}),
        });
      }
    }
  }
  return [...batches]
    .filter(
      ([, batch]) =>
        batch.phases.has("accepted-0") &&
        batch.phases.has("rewarded-0") &&
        batch.actions.some((action) =>
          action.questChanges.some((change) => change.state === "objectives-complete"),
        ),
    )
    .map(([questId, batch]) => ({
      id: `quest-${questId}`,
      questId,
      title: batch.title,
      zone: batch.zone,
      referenceLevel: batch.referenceLevel,
      sourceIds: [...batch.sourceIds],
      conditional: batch.conditional,
      objectiveType: batch.collection
        ? "collection"
        : batch.kill && !batch.nonKillObjective
          ? "shared-kills"
          : "unclassified",
      actions: [...batch.actions]
        .sort((left, right) => {
          const phases = { accepted: 0, "objectives-complete": 1, rewarded: 2 };
          return phases[left.questChanges[0]!.state] - phases[right.questChanges[0]!.state];
        })
        .map((action) => ({
          ...action,
          questChanges: action.questChanges.map((change) => ({ ...change, title: batch.title })),
        })),
    }));
}
