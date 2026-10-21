import { getChapterLabel, type ChapterReference } from "./chapter-catalog.js";
import { getGuideStepView, type ImportedChapter, type ImportedDirective } from "./guide-archive.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import type { ClassSlug } from "./model.js";
import { gateQuestIds } from "./dungeon-model.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { premadePreparationQuests } from "./premade.js";
import {
  PREMADE_STOPS,
  premadeEntryLevel,
  selectedPremadeQuests,
  getPremadeQuest,
} from "./premade.js";
import {
  emptyPremadeProgress,
  premadeProgressSchema,
  type PremadeProgress,
  type PremadeMember,
} from "./premade-model.js";
import { emptyCampaignProgress, type CampaignProgress } from "./campaign-model.js";
import type { QuestRewardFact } from "./quest-rewards.js";
import type { QuestValidationCoverage } from "./quest-validation-certificates.js";
import { getDungeonBundle } from "./dungeon-bundles.js";
import type { GuaranteedDungeonId } from "./dungeon-bundle-model.js";
import type { CampaignCombatPlan } from "./combat-model.js";
import { questEligibility, questGateResult } from "./quest-eligibility.js";
import { campaignPickupLevelMet } from "./campaign-pickup-budget.js";
import { extractCampaignQuestBatches, type CampaignQuestBatch } from "./campaign-catchup.js";
import {
  buildCampaignQuestLibrary,
  buildCampaignSourceLevelGates,
  type LibraryObjective,
} from "./campaign-library.js";
import {
  integrateCampaignQuestLibrary,
  type CampaignLibrarySelection,
} from "./campaign-library-route.js";
import {
  CAMPAIGN_BRIDGES,
  CAMPAIGN_STARTS,
  CAMPAIGN_VERSION,
  type CampaignRace,
  type CampaignOutdoorBlock,
} from "./campaign-route.js";

export interface CampaignSource {
  readonly reference: ChapterReference;
  readonly guide: ImportedChapter;
}
export interface CampaignQuestChange {
  readonly questId: number;
  readonly state: "accepted" | "objectives-complete" | "rewarded";
  readonly title: string;
  readonly objectiveIndex: number | null;
}
export interface CampaignAction {
  readonly id: string;
  readonly legId: string;
  readonly title: string;
  readonly instructions: readonly string[];
  readonly questChanges: readonly CampaignQuestChange[];
  readonly positions: readonly {
    readonly sourceLine: number;
    readonly position: NonNullable<ImportedDirective["position"]>;
  }[];
  readonly source: {
    readonly chapterId: string;
    readonly version: string;
    readonly stepId: string;
  } | null;
  readonly kind: "instructions" | "quests" | "checkpoint" | "unverified" | "xp-check";
  readonly leaderOnly: boolean;
  readonly targetLevel: number | null;
  readonly targetCurrentXp?: number;
  readonly targetStopId: PremadeProgress["selectedStopId"] | null;
  readonly raidOnly: boolean;
  readonly requiredQuestIds?: readonly number[];
  readonly xpOptional?: boolean;
  readonly xpTargetLevel?: number;
  readonly catchUpBatchId?: string;
  readonly libraryQuestId?: number;
  readonly libraryBackbone?: boolean;
  readonly libraryObjective?: LibraryObjective;
  readonly libraryRequired?: boolean;
  readonly sourceGateConflictQuestIds?: readonly number[];
  readonly pickupQuestId?: number;
  readonly bundleId?: GuaranteedDungeonId;
}
export interface CampaignLeg {
  readonly id: string;
  readonly title: string;
  readonly from: number;
  readonly to: number;
  readonly kind: "starter" | "preparation" | "xp-bridge" | "dungeon" | "finish";
  readonly actionIds: readonly string[];
  readonly questIds: readonly number[];
  readonly unresolvedQuestIds: readonly number[];
  readonly stopId: PremadeProgress["selectedStopId"] | null;
  readonly bundleId?: GuaranteedDungeonId;
}
export interface CampaignLifecycleExclusion {
  readonly actionId: string;
  readonly questId: number;
  readonly state: CampaignQuestChange["state"];
  readonly reason: "missing-prior-pickup" | "incomplete-lifecycle";
}
export interface CampaignPlan {
  readonly release: string;
  readonly race: CampaignRace;
  readonly leaderClass: ClassSlug | null;
  readonly targetBuild: number;
  readonly legs: readonly CampaignLeg[];
  readonly actions: readonly CampaignAction[];
  readonly bookmarkAliases?: Readonly<Record<string, string>>;
  readonly executionRevision?: string;
  readonly rewardFacts?: readonly QuestRewardFact[];
  readonly rewardRevision?: string;
  readonly rewardBuild?: number | null;
  readonly rewardNotice?: string | null;
  readonly questValidationCoverage?: QuestValidationCoverage;
  readonly questValidationRuntimeBuild?: number;
  readonly catchUpBatches?: readonly CampaignQuestBatch[];
  readonly defaultCatchUpBatches?: Readonly<Record<string, readonly string[]>>;
  readonly lifecycleExclusions?: readonly CampaignLifecycleExclusion[];
  readonly library?: CampaignLibrarySelection;
  readonly combat?: CampaignCombatPlan;
}

const beforeStop: Readonly<Record<string, readonly string[]>> = {
  thanes: ["ironforge-rendezvous", "early-party-kills"],
  lordaeron: ["northern-approach"],
  deadmines: ["defias-unlock"],
  stockade: [
    "stockade-letter-unlock",
    "redridge-kill-batch",
    "duskwood-watch",
    "wetlands-prerequisites",
  ],
  excavation: ["excavation-approach"],
  blackfathom: ["ashenvale-crossing"],
  dalaran: ["dalaran-approach"],
  gnomeregan: ["hillsbrad-gnomer"],
  "razorfen-kraul": ["desolace-scarlet-unlock", "lonebrow-rfk-preparation"],
  "drowned-city": ["stv-group-batch"],
  "scarlet-monastery": ["scarlet-northern-return"],
  kroldok: ["post-scarlet-east"],
  "razorfen-downs": ["tanaris-rfd-crossing"],
  uldaman: ["badlands-uldaman"],
  maraudon: ["desolace-maraudon"],
  "zul-farrak": ["tanaris-zulfarrak"],
  alcaz: ["dustwallow-alcaz"],
  "sunken-temple": ["searing-group-kills", "searing-temple-prep"],
  "blackrock-depths": ["burning-group-kills", "burning-onyxia-prep"],
  "lower-blackrock": ["blackrock-world-returns"],
  stratholme: ["plaguelands-strath-prep"],
};
const changes = new Map<string, CampaignQuestChange["state"]>([
  [".accept", "accepted"],
  [".complete", "objectives-complete"],
  [".turnin", "rewarded"],
]);
const brdQuestIds = [
  4241, 4242, 4264, 4282, 4322, 4341, 4342, 4361, 4362, 3801, 3802, 7848, 4126, 4263, 4136, 4123,
];
const raidQuestIds = new Set([
  4182, 4183, 4184, 4185, 4186, 4223, 4224, 4241, 4242, 4264, 4282, 4322, 4341, 4342, 4361, 4362,
  3801, 3802, 7848,
]);
const retainedDungeonQuestIds = new Set(
  PREMADE_STOPS.flatMap((stop) => [
    ...selectedPremadeQuests(stop, emptyPremadeProgress()).map((choice) => choice.questId),
    ...premadePreparationQuests(stop, emptyPremadeProgress()).map((quest) => quest.id),
  ]),
);
const historicalLonebrow = {
  id: 1100,
  title: "Lonebrow's Journal",
  pickupStage: "before" as const,
  pickup:
    "Historical Classic pickup: take Henrig Lonebrow's Journal beside the Great Lift in Thousand Needles; check the current Forever object and all five players' eligibility.",
  objective:
    "Read the journal and carry your own copy to Falfindel Waywarder in Thalanaar. Confirm all five have the required item before leaving.",
  turnin:
    "Historical Classic hand-in: Falfindel Waywarder, Thalanaar. Deliver the journal before accepting The Crone of the Kraul.",
  position: null,
};

function campaignBackboneSources(leaderClass: ClassSlug | null): ReadonlySet<number> {
  return new Set([
    127,
    ...(leaderClass === "hunter" ? [129, 6, 7] : [128, 130, 8, 9]),
    10,
    11,
    ...(leaderClass === "hunter" ? [] : [12]),
    13,
    14,
    15,
    16,
    leaderClass === "hunter" ? 17 : 18,
    19,
    20,
    21,
    ...(leaderClass === "hunter" ? [26] : [24, 25]),
    27,
    28,
    leaderClass === "warlock" ? 30 : 29,
    31,
    32,
    33,
    34,
    35,
    36,
    37,
    38,
    39,
    40,
    41,
    42,
    43,
    44,
    45,
    46,
    47,
  ]);
}

function lifecycleSafePlan(plan: CampaignPlan): CampaignPlan {
  const states = new Map<number, CampaignQuestChange["state"]>();
  const exclusions: CampaignLifecycleExclusion[] = [];
  const actions = plan.actions.flatMap((action): readonly CampaignAction[] => {
    const retained = action.questChanges.filter((change) => {
      if (change.state === "accepted") {
        states.set(change.questId, change.state);
        return true;
      }
      const current = states.get(change.questId);
      if (current !== "accepted" && current !== "objectives-complete") {
        exclusions.push({
          actionId: action.id,
          questId: change.questId,
          state: change.state,
          reason: "missing-prior-pickup",
        });
        return false;
      }
      states.set(change.questId, change.state);
      return true;
    });
    if (retained.length === action.questChanges.length) return [action];
    if (!retained.length) return [];
    const description = (change: CampaignQuestChange): string =>
      `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Hand in" : `Complete objective ${change.objectiveIndex ?? 1} of`} ${change.title}.`;
    return [
      {
        ...action,
        title: retained.map(description).join(" · "),
        instructions: retained.map(description),
        questChanges: retained,
      },
    ];
  });
  const actionIds = new Set(actions.map((action) => action.id));
  return {
    ...plan,
    actions,
    legs: plan.legs.map((leg) => {
      const owned = actions.filter((action) => action.legId === leg.id);
      return {
        ...leg,
        actionIds: owned.map((action) => action.id),
        questIds: [
          ...new Set(
            owned.flatMap((action) => action.questChanges.map((change) => change.questId)),
          ),
        ],
      };
    }),
    bookmarkAliases: Object.fromEntries(
      Object.entries(plan.bookmarkAliases ?? {}).filter(([, target]) => actionIds.has(target)),
    ),
    lifecycleExclusions: exclusions,
  };
}

function lifecycleCompletePlan(plan: CampaignPlan): CampaignPlan {
  const phases = new Map<number, Set<CampaignQuestChange["state"]>>();
  for (const action of plan.actions)
    for (const change of action.questChanges) {
      const states = phases.get(change.questId) ?? new Set<CampaignQuestChange["state"]>();
      states.add(change.state);
      phases.set(change.questId, states);
    }
  const incomplete = new Set(
    [...phases]
      .filter(([, states]) => !states.has("accepted") || !states.has("rewarded"))
      .map(([questId]) => questId),
  );
  if (!incomplete.size) return plan;
  const required = plan.actions.find((action) =>
    action.requiredQuestIds?.some((questId) => incomplete.has(questId)),
  );
  if (required) throw new Error(`Required quest lifecycle is incomplete before ${required.id}.`);
  const exclusions: CampaignLifecycleExclusion[] = [...(plan.lifecycleExclusions ?? [])];
  const actions = plan.actions.flatMap((action): readonly CampaignAction[] => {
    const removed = action.questChanges.filter((change) => incomplete.has(change.questId));
    if (!removed.length) return [action];
    exclusions.push(
      ...removed.map((change) => ({
        actionId: action.id,
        questId: change.questId,
        state: change.state,
        reason: "incomplete-lifecycle" as const,
      })),
    );
    const retained = action.questChanges.filter((change) => !incomplete.has(change.questId));
    if (!retained.length) return [];
    const description = (change: CampaignQuestChange): string =>
      `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Hand in" : `Complete objective ${change.objectiveIndex ?? 1} of`} ${change.title}.`;
    return [
      {
        ...action,
        title: retained.map(description).join(" · "),
        instructions: retained.map(description),
        questChanges: retained,
      },
    ];
  });
  const actionIds = new Set(actions.map((action) => action.id));
  return {
    ...plan,
    actions,
    legs: plan.legs.map((leg) => {
      const owned = actions.filter((action) => action.legId === leg.id);
      return {
        ...leg,
        actionIds: owned.map((action) => action.id),
        questIds: [
          ...new Set(
            owned.flatMap((action) => action.questChanges.map((change) => change.questId)),
          ),
        ],
      };
    }),
    bookmarkAliases: Object.fromEntries(
      Object.entries(plan.bookmarkAliases ?? {}).filter(([, target]) => actionIds.has(target)),
    ),
    lifecycleExclusions: exclusions,
  };
}

export function buildCampaignPlan(
  race: CampaignRace,
  archiveHash: string,
  sources: readonly CampaignSource[],
  leaderClass: ClassSlug | null = null,
  options: { readonly includeLibrary?: boolean } = {},
): CampaignPlan {
  if (!/^[a-f0-9]{64}$/.test(archiveHash))
    throw new Error("Campaign requires a validated archive hash.");
  const profile = createCampaignSourceProfile(race, leaderClass);
  const usable = sources.filter(
    (source) =>
      source.reference.family === "questing" && source.reference.factions.includes("alliance"),
  );
  if (usable.some((source) => source.guide.targetBuild !== 70205))
    throw new Error("Campaign sources use a different client build.");
  const actions: CampaignAction[] = [],
    legs: CampaignLeg[] = [];
  const deferredBookmarks = new Map<
    string,
    { readonly chapterId: string; readonly stepId: string }
  >();
  const dungeonTags = [
    ...new Set(
      PREMADE_STOPS.flatMap((stop) => stop.visitIds).flatMap(
        (id) => DUNGEON_VISITS.find((visit) => visit.id === id)?.sourceTag ?? [],
      ),
    ),
  ];
  const dungeonOwnership = new Set(
    PREMADE_STOPS.flatMap((stop) =>
      selectedPremadeQuests(stop, emptyPremadeProgress()).map((quest) => quest.questId),
    ),
  );
  const deduplicated = new Set<string>();
  const titles = new Map<number, string>();
  for (const source of usable)
    for (const step of source.guide.steps)
      for (const directive of step.directives) {
        if (
          directive.questId !== null &&
          directive.text &&
          [".accept", ".turnin"].includes(directive.tag)
        )
          titles.set(directive.questId, directive.text.replace(/^(Accept|Turn in)\s+/i, ""));
      }
  function add(legId: string, key: string, value: Omit<CampaignAction, "id" | "legId">): void {
    actions.push({ id: `${legId}-${key}`, legId, ...value });
  }
  function instructions(
    legId: string,
    title: string,
    lines: readonly string[],
    leaderOnly = false,
    key = "brief",
  ): void {
    add(legId, key, {
      title,
      instructions: lines,
      questChanges: [],
      positions: [],
      source: null,
      kind: "instructions",
      leaderOnly,
      targetLevel: null,
      targetStopId: null,
      raidOnly: false,
    });
  }
  function sourceActions(
    block: CampaignOutdoorBlock,
    leaderOnly: boolean,
    keySuffix = "",
  ): readonly number[] {
    const requested = block.quests === "starter-source" ? null : new Set(block.quests);
    const found = new Set<number>();
    const candidates = usable.filter((source) =>
      block.sourceIds.includes(source.reference.sourceId),
    );
    for (const source of candidates)
      for (const step of source.guide.steps) {
        const view = getGuideStepView(
          {
            ...step,
            directives: step.directives.filter(
              (directive) => ![".group", ".solo"].includes(directive.tag),
            ),
          },
          profile,
          {
            dungeons: dungeonTags,
          },
        );
        if (view.condition !== "match") continue;
        const retained: CampaignQuestChange[] = [];
        const descriptions: string[] = [];
        for (const directive of view.directives) {
          const state = changes.get(directive.tag),
            id = directive.questId;
          if (!state || id === null || (requested && !requested.has(id))) continue;
          if (block.purpose === "starter" && [96390, 96391, 96392, 96393].includes(id)) {
            deferredBookmarks.set(`${block.id}-${source.reference.sourceId}-${step.id}`, {
              chapterId: source.guide.chapterId,
              stepId: step.id,
            });
            continue;
          }
          if (
            block.purpose !== "starter" &&
            dungeonOwnership.has(id) &&
            state !== "accepted" &&
            !block.id.startsWith("dungeon-")
          )
            continue;
          if (state === "rewarded" && block.deferHandIns?.includes(id)) continue;
          if (state !== "rewarded" && block.handInOnly?.includes(id)) continue;
          const index =
            directive.tag === ".complete" ? Number(directive.arguments.split(",")[1] ?? 1) : null;
          const key = `${leaderOnly ? "leader" : "party"}-${directive.tag}-${id}-${index ?? 0}`;
          found.add(id);
          if (deduplicated.has(key)) continue;
          deduplicated.add(key);
          const title = titles.get(id) ?? getPremadeQuest(id)?.title ?? `Quest ${id}`;
          retained.push({ questId: id, state, title, objectiveIndex: index });
          const offset = view.directives.indexOf(directive);
          const nextObjective = view.directives.findIndex(
            (candidate, candidateIndex) => candidateIndex > offset && candidate.tag === ".complete",
          );
          const mobs =
            state === "objectives-complete"
              ? view.directives
                  .slice(offset + 1, nextObjective < 0 ? undefined : nextObjective)
                  .filter((candidate) => candidate.tag === ".mob")
                  .map((candidate) => candidate.arguments.replace(/^\+/, ""))
              : [];
          descriptions.push(
            directive.text ||
              (mobs.length
                ? `Defeat ${mobs.join(" / ")} for ${title} (objective ${index}).`
                : `${state === "accepted" ? "Accept" : state === "rewarded" ? "Hand in" : `Complete objective ${index} of`} ${title}.`),
          );
        }
        if (!retained.length) {
          if (block.quests !== "starter-source") continue;
          const utility = view.directives.filter((directive) =>
            [".fp", ".fly", ".hs", ".home", ".zone", ".trainer", ".vendor"].includes(directive.tag),
          );
          if (!utility.length) continue;
          add(block.id, `${source.reference.sourceId}-${step.id}`, {
            title: utility
              .map(
                (directive) =>
                  directive.text ||
                  `${({ ".fp": "Learn flight point", ".fly": "Fly to", ".hs": "Use Hearthstone", ".home": "Set Hearthstone", ".zone": "Travel to", ".trainer": "Train class skills", ".vendor": "Visit vendor" } as Readonly<Record<string, string>>)[directive.tag]} ${directive.arguments}`,
              )
              .join(" · "),
            instructions: view.directives
              .filter((directive) => directive.tag === "text" && directive.text)
              .map((directive) => directive.text),
            questChanges: [],
            positions: view.directives.flatMap((directive) =>
              directive.position
                ? [{ sourceLine: directive.sourceLine, position: directive.position }]
                : [],
            ),
            source: {
              chapterId: source.guide.chapterId,
              version: source.guide.version,
              stepId: step.id,
            },
            kind: "instructions",
            leaderOnly,
            targetLevel: null,
            targetStopId: null,
            raidOnly: false,
          });
          continue;
        }
        const mixedObjectives = view.directives.some(
          (directive) =>
            directive.questId !== null &&
            changes.has(directive.tag) &&
            requested !== null &&
            !requested.has(directive.questId),
        );
        const context = mixedObjectives
          ? []
          : view.directives
              .filter((directive) => directive.tag === "text" && directive.text)
              .map((directive) => directive.text);
        const raidOnly = retained.every((change) => raidQuestIds.has(change.questId));
        add(block.id, `${source.reference.sourceId}-${step.id}${keySuffix}`, {
          title: descriptions.join(" · "),
          instructions: [
            ...descriptions,
            ...context,
            ...(block.id === "ironforge-rendezvous" &&
            retained.some((change) => change.questId === 96391 && change.state === "accepted")
              ? view.directives
                  .filter(
                    (directive) => [".use", ".collect"].includes(directive.tag) && directive.text,
                  )
                  .map((directive) => directive.text)
              : []),
          ],
          questChanges: retained,
          positions: view.directives.flatMap((directive) =>
            directive.position
              ? [{ sourceLine: directive.sourceLine, position: directive.position }]
              : [],
          ),
          source: {
            chapterId: source.guide.chapterId,
            version: source.guide.version,
            stepId: step.id,
          },
          kind: "quests",
          leaderOnly,
          targetLevel: null,
          targetStopId: null,
          raidOnly,
          xpOptional:
            block.id.startsWith("start-") &&
            [125, 126].includes(source.reference.sourceId) &&
            !/Warrior|Paladin|Hunter|Rogue|Priest|Mage|Warlock|Druid|Shaman/i.test(step.condition),
          ...(block.purpose === "starter" ? { xpTargetLevel: 16 } : {}),
        });
      }
    return requested ? [...requested].filter((id) => !found.has(id)) : [];
  }
  function outdoor(block: CampaignOutdoorBlock): void {
    const start = actions.length;
    instructions(block.id, block.title, block.instructions, block.purpose === "starter");
    const unresolved =
      block.id === "ironforge-rendezvous"
        ? [
            ...sourceActions({ ...block, quests: [96392, 96390] }, false, "-unlock"),
            ...sourceActions({ ...block, quests: [96391] }, false),
          ]
        : [
            ...sourceActions(block, block.purpose === "starter"),
            ...(block.extraPickupIds
              ? sourceActions({ ...block, quests: block.extraPickupIds }, false, "-pickup")
              : []),
          ];
    const requestedIds =
      block.quests === "starter-source" ? [] : [...block.quests, ...(block.extraPickupIds ?? [])];
    const missingPickups = requestedIds.filter(
      (id) =>
        !deduplicated.has(`party-.accept-${id}-0`) &&
        [...deduplicated].some(
          (key) => key.startsWith(`party-.complete-${id}-`) || key === `party-.turnin-${id}-0`,
        ),
    );
    if (missingPickups.length)
      sourceActions(
        {
          ...block,
          quests: missingPickups,
          sourceIds: usable.map((source) => source.reference.sourceId),
        },
        false,
      );
    for (const id of requestedIds) {
      const quest = getPremadeQuest(id) ?? (id === 1100 ? historicalLonebrow : null);
      if (!quest || quest.pickupStage === "unknown") continue;
      const position = quest.position
        ? [
            {
              sourceLine: 0,
              position: {
                zone: String(quest.position.mapId),
                floor: null,
                space: "map-percent" as const,
                x: quest.position.x,
                y: quest.position.y,
              },
            },
          ]
        : [];
      for (const [key, state] of [
        ["accept", "accepted"],
        ["objective", "objectives-complete"],
        ["hand-in", "rewarded"],
      ] as const) {
        if (dungeonOwnership.has(id) && state !== "accepted") continue;
        if (state === "rewarded" && block.deferHandIns?.includes(id)) continue;
        if (state !== "rewarded" && block.handInOnly?.includes(id)) continue;
        const dedupKey = `party-${state === "accepted" ? ".accept" : state === "rewarded" ? ".turnin" : ".complete"}-${id}-${state === "objectives-complete" ? 1 : 0}`;
        if (deduplicated.has(dedupKey)) continue;
        if (
          state === "objectives-complete" &&
          [...deduplicated].some((value) => value.startsWith(`party-.complete-${id}-`))
        )
          continue;
        deduplicated.add(dedupKey);
        add(block.id, `${key}-${id}`, {
          title: `${key === "accept" ? "Accept" : key === "hand-in" ? "Hand in" : "Complete"} ${quest.title}`,
          instructions: [
            state === "accepted"
              ? (quest.pickup ??
                quest.objective ??
                "Check the referenced quest's actual pickup eligibility in game.")
              : state === "rewarded"
                ? (quest.turnin ?? quest.objective ?? "Report the actual in-game hand-in.")
                : (quest.objective ?? "Check the quest's current objective in game."),
          ],
          questChanges: [
            {
              questId: id,
              state,
              title: quest.title,
              objectiveIndex: state === "objectives-complete" ? 1 : null,
            },
          ],
          positions: state === "accepted" ? position : [],
          source: null,
          kind: "quests",
          leaderOnly: false,
          targetLevel: null,
          targetStopId: null,
          raidOnly: false,
        });
      }
    }
    if (block.purpose !== "starter") orderLegActions(start);
    if (block.id === "ironforge-rendezvous") {
      add(block.id, "xp-readiness", {
        title: "Record actual party XP after the required preparation",
        instructions: [
          "Record fresh levels and XP for all five after these hand-ins. If everyone meets Hall of Thanes' entry requirement, the following extra-XP phase is not needed. Unknown or stale bars do not prove readiness.",
        ],
        questChanges: [],
        positions: [],
        source: null,
        kind: "xp-check",
        leaderOnly: false,
        targetLevel: null,
        targetStopId: "thanes",
        raidOnly: false,
      });
    }
    legs.push({
      id: block.id,
      title: block.title,
      from: block.from,
      to: block.to,
      kind: block.purpose,
      actionIds: actions.slice(start).map((action) => action.id),
      questIds: [
        ...new Set(
          actions
            .slice(start)
            .flatMap((action) => action.questChanges.map((change) => change.questId)),
        ),
      ],
      unresolvedQuestIds: unresolved.filter((id) => id !== 1100 && !getPremadeQuest(id)),
      stopId: null,
    });
  }
  function orderLegActions(start: number): void {
    const pending = actions.slice(start);
    const dependencies = pending.map(() => new Set<number>());
    const phaseIndices = (questId: number, state: CampaignQuestChange["state"]): number[] =>
      pending.flatMap((action, actionIndex) =>
        action.questChanges.some((change) => change.questId === questId && change.state === state)
          ? [actionIndex]
          : [],
      );
    pending.forEach((action, actionIndex) => {
      for (const change of action.questChanges) {
        const parents =
          change.state === "accepted"
            ? gateQuestIds(
                getPremadeQuest(change.questId)?.gate ?? { kind: "all", gates: [] },
              ).flatMap((id) => phaseIndices(id, "rewarded"))
            : [
                ...phaseIndices(change.questId, "accepted"),
                ...(change.state === "rewarded"
                  ? phaseIndices(change.questId, "objectives-complete")
                  : []),
              ];
        for (const parent of parents)
          if (parent !== actionIndex) dependencies[actionIndex]!.add(parent);
      }
      if (action.id.endsWith("-deliveries"))
        for (let i = 0; i < pending.length; i++)
          if (i !== actionIndex) dependencies[actionIndex]!.add(i);
    });
    const emitted = new Set<number>(),
      ordered: CampaignAction[] = [];
    while (ordered.length < pending.length) {
      const candidate = pending.findIndex(
        (_action, actionIndex) =>
          !emitted.has(actionIndex) &&
          [...dependencies[actionIndex]!].every((parent) => emitted.has(parent)),
      );
      if (candidate < 0)
        throw new Error(`Conflicting quest lifecycle in campaign block ${pending[0]?.legId}.`);
      emitted.add(candidate);
      ordered.push(pending[candidate]!);
    }
    actions.splice(start, pending.length, ...ordered);
  }
  const startingIds =
    leaderClass === "hunter" && race === "human"
      ? [115, 116, 117, 126]
      : leaderClass === "hunter" && race === "dwarf"
        ? [118, 123, 124, 126]
        : CAMPAIGN_STARTS[race];
  for (const id of startingIds) {
    const source = usable.find((source) => source.reference.sourceId === id);
    if (!source) throw new Error(`Starting chapter ${id} is unavailable for ${race}.`);
    const label = getChapterLabel(source.reference, profile);
    outdoor({
      id: `start-${id}`,
      title: label.zone,
      from: label.minimumLevel,
      to: label.maximumLevel,
      purpose: "starter",
      sourceIds: [id],
      quests: "starter-source",
      instructions: [
        "Follow your race's early source instructions. These checks record Player 1 only; other races use their own branch before the level-16 Ironforge rendezvous.",
        "Keep required class training and combat/pet unlocks. Early source quests can contain short collections; do not add unrelated material/profession farming or assume their XP is verified.",
      ],
    });
  }
  for (const stop of PREMADE_STOPS) {
    for (const id of beforeStop[stop.id] ?? []) {
      const block = CAMPAIGN_BRIDGES.find((entry) => entry.id === id);
      if (!block) throw new Error(`Missing preparation block ${id}.`);
      outdoor(block);
    }
    if (stop.dataStatus === "missing-quest-data") continue;
    const bundle =
      stop.dataStatus === "guaranteed-bundle" ? getDungeonBundle(stop.id, "alliance") : null;
    const legId = `dungeon-${stop.id}`,
      start = actions.length;
    instructions(legId, `${stop.name}: prepare before entering`, [stop.preparation, ...stop.notes]);
    add(legId, "entry", {
      title: `Actual entry check: ${stop.name}`,
      instructions: [
        "Save the actual level/XP of all five players. Next previews later instructions; only Done checks a ready departure.",
      ],
      questChanges: [],
      positions: [],
      source: null,
      kind: "checkpoint",
      leaderOnly: false,
      targetLevel: null,
      targetStopId: stop.id,
      raidOnly: false,
      requiredQuestIds:
        (
          {
            thanes: [96391],
            deadmines: [155],
            stockade: [303, 389],
            excavation: [275],
            dalaran: [92432],
            "scarlet-monastery": [1052],
            "razorfen-kraul": [1100],
          } as Readonly<Record<string, readonly number[]>>
        )[stop.id] ?? [],
    });
    if (bundle) {
      add(legId, "bundle-rewards", {
        title: `${stop.name}: four guaranteed quest slots · planning only`,
        instructions: [
          "All four faction quest slots are selected by default. Quest availability is owner-confirmed; IDs, objectives, access and hand-in locations remain pending.",
          `The default planning quest level is ${bundle.planningQuestLevel}; the editable level-specific Dalaran reward tier and 2.375 coefficient fund the forecast, not your actual XP bar.`,
          "Review or skip this optional stop. No quest IDs, pickups or completion events are invented. Record actual party XP after playing before deciding the next departure.",
        ],
        questChanges: [],
        positions: [],
        source: null,
        kind: "instructions",
        leaderOnly: false,
        targetLevel: null,
        targetStopId: stop.id,
        raidOnly: false,
        bundleId: bundle.dungeonId,
      });
    } else if (stop.id === "blackrock-depths") {
      sourceActions(
        {
          id: legId,
          title: stop.name,
          from: 55,
          to: 57,
          purpose: "preparation",
          sourceIds: [47],
          quests: brdQuestIds,
          instructions: [],
        },
        false,
      );
      instructions(
        legId,
        "BRD visit scope and final deliveries",
        [
          "The source order separates Windsor/Kharan's probe, outside hand-ins, Crumpled Note, A Shred of Hope and Jail Break before the Emperor/Core deliveries. This is multiple eligible visits, not all rewards from one clear.",
          "The old source chapter's nominal 59–60 bracket is relocated here for the owner's expert group. Current pickup/boss difficulty still needs in-game review; conservative entry and actual XP checks remain active.",
        ],
        false,
        "deliveries",
      );
    } else {
      const core = selectedPremadeQuests(stop, emptyPremadeProgress()).filter(
        (choice) => choice.questId !== 5848,
      );
      const selected = [
        ...premadePreparationQuests(stop, emptyPremadeProgress())
          .filter(
            (quest) =>
              !actions
                .slice(0, start)
                .some(
                  (action) =>
                    !action.leaderOnly &&
                    action.questChanges.some(
                      (change) => change.questId === quest.id && change.state === "rewarded",
                    ),
                ),
          )
          .map((quest) => ({ questId: quest.id, role: "prerequisite" as const })),
        ...core,
      ];
      for (const phase of ["accepted", "objectives-complete", "rewarded"] as const) {
        for (const choice of selected) {
          const quest = getPremadeQuest(choice.questId);
          if (!quest) throw new Error(`Missing dungeon quest ${choice.questId}.`);
          const key = `party-${phase === "accepted" ? ".accept" : phase === "rewarded" ? ".turnin" : ".complete"}-${quest.id}-${phase === "objectives-complete" ? 1 : 0}`;
          if (deduplicated.has(key)) continue;
          deduplicated.add(key);
          add(legId, `${phase}-${quest.id}`, {
            title: `${phase === "accepted" ? "Accept" : phase === "rewarded" ? "Hand in" : "Complete"} ${quest.title}`,
            instructions: [
              phase === "accepted"
                ? (quest.pickup ?? stop.preparation)
                : phase === "rewarded"
                  ? (quest.turnin ?? stop.handIn)
                  : (quest.objective ?? stop.clear),
              ...(quest.pickupStage === "unknown"
                ? [
                    "Historical quest identity: current pickup, objective and delivery details require verification before treating this as runnable.",
                  ]
                : []),
            ],
            questChanges: [
              {
                questId: quest.id,
                state: phase,
                title: quest.title,
                objectiveIndex: phase === "objectives-complete" ? 1 : null,
              },
            ],
            positions:
              phase === "accepted" && quest.position
                ? [
                    {
                      sourceLine: 0,
                      position: {
                        zone: String(quest.position.mapId),
                        floor: null,
                        space: "map-percent",
                        x: quest.position.x,
                        y: quest.position.y,
                      },
                    },
                  ]
                : [],
            source: null,
            kind: "quests",
            leaderOnly: false,
            targetLevel: null,
            targetStopId: null,
            raidOnly: choice.role === "raid",
          });
        }
      }
      instructions(
        legId,
        "Batch the actual rewards, then prepare the next stop",
        [stop.handIn, stop.bridge],
        false,
        "deliveries",
      );
    }
    orderLegActions(start);
    legs.push({
      id: legId,
      title: stop.name,
      from: stop.level,
      to: stop.nextLevel,
      kind: "dungeon",
      actionIds: actions.slice(start).map((action) => action.id),
      questIds: [
        ...new Set(
          actions
            .slice(start)
            .flatMap((action) => action.questChanges.map((change) => change.questId)),
        ),
      ],
      unresolvedQuestIds: [],
      stopId: stop.id,
      ...(bundle ? { bundleId: bundle.dungeonId } : {}),
    });
  }
  outdoor(CAMPAIGN_BRIDGES.find((block) => block.id === "final-xp-fallback")!);
  const finalId = "level-60-finish";
  add(finalId, "checkpoint", {
    title: "All five have reached level 60",
    instructions: [
      "Record fresh actual level 60 / XP 0 for all five. Unchecked or skipped steps remain visible; reaching 60 does not certify unfinished raid attunements.",
    ],
    questChanges: [],
    positions: [],
    source: null,
    kind: "checkpoint",
    leaderOnly: false,
    targetLevel: 60,
    targetStopId: null,
    raidOnly: false,
  });
  legs.push({
    id: finalId,
    title: "Party level-60 finish",
    from: 60,
    to: 60,
    kind: "finish",
    actionIds: [`${finalId}-checkpoint`],
    questIds: [],
    unresolvedQuestIds: [],
    stopId: null,
  });
  if (new Set(actions.map((action) => action.id)).size !== actions.length)
    throw new Error("Duplicate campaign action identity.");
  const base: CampaignPlan = {
    release: `${CAMPAIGN_VERSION}-${archiveHash.slice(0, 16)}-${race}-${leaderClass ?? "general"}`,
    race,
    leaderClass,
    targetBuild: 70205,
    executionRevision: "workflow-20261015-v3",
    catchUpBatches: extractCampaignQuestBatches(
      usable,
      profile,
      new Set(actions.flatMap((action) => action.questChanges.map((change) => change.questId))),
      dungeonTags,
    ),
    legs,
    actions,
    bookmarkAliases: Object.fromEntries(
      [...deferredBookmarks]
        .flatMap(([oldId, source]) => {
          if (actions.some((action) => action.id === oldId)) return [];
          const target = actions.find(
            (action) =>
              action.source?.chapterId === source.chapterId &&
              action.source.stepId === source.stepId &&
              action.legId === "ironforge-rendezvous",
          );
          return target ? [[oldId, target.id]] : [];
        })
        .concat(
          usable
            .filter((source) => [116, 119, 125].includes(source.reference.sourceId))
            .flatMap((source) =>
              source.guide.steps
                .filter((step) =>
                  step.directives.some((directive) => [9, 12].includes(directive.questId ?? 0)),
                )
                .map((step) => [
                  `early-party-kills-${source.reference.sourceId}-${step.id}`,
                  "ironforge-rendezvous-xp-readiness",
                ]),
            ),
        ),
    ),
  };
  const safeBase = lifecycleSafePlan(base);
  const backboneSources = campaignBackboneSources(leaderClass);
  const routedChapterIds = new Set(
    safeBase.actions.flatMap((action) => (action.source ? [action.source.chapterId] : [])),
  );
  const levelGateSources = new Set([
    ...backboneSources,
    ...usable
      .filter((source) => routedChapterIds.has(source.guide.chapterId))
      .map((source) => source.reference.sourceId),
  ]);
  const expanded =
    options.includeLibrary === false
      ? safeBase
      : integrateCampaignQuestLibrary(
          safeBase,
          buildCampaignQuestLibrary(usable, profile, dungeonTags, backboneSources),
          retainedDungeonQuestIds,
          buildCampaignSourceLevelGates(usable, profile, dungeonTags, levelGateSources),
        );
  return lifecycleCompletePlan(expanded);
}

export function campaignIncludedLegs(
  plan: CampaignPlan,
  progress?: PremadeProgress,
): readonly CampaignLeg[] {
  return plan.legs.filter(
    (leg) =>
      !leg.bundleId ||
      getDungeonBundle(leg.bundleId, "alliance", progress?.guaranteedBundles)?.included !== false,
  );
}

export function campaignXpTarget(
  action: CampaignAction,
  progress: PremadeProgress,
  facts: readonly QuestRewardFact[] = [],
): { readonly level: number; readonly currentXp: number } | null {
  const stop = PREMADE_STOPS.find((entry) => entry.id === action.targetStopId);
  const level = stop ? premadeEntryLevel(stop, progress, facts) : action.targetLevel;
  return level === null ? null : { level, currentXp: stop ? 0 : (action.targetCurrentXp ?? 0) };
}

export function campaignCatchUpTarget(
  plan: CampaignPlan,
  progress: PremadeProgress,
  legId: string,
): number {
  const legs = campaignIncludedLegs(plan, progress);
  const index = legs.findIndex((leg) => leg.id === legId);
  if (index < 0) throw new Error("Unknown or inactive campaign block.");
  const destination = legs
    .slice(index + 1)
    .find((leg) => leg.kind === "dungeon" || leg.kind === "finish");
  const stop = PREMADE_STOPS.find((entry) => entry.id === destination?.stopId);
  return stop
    ? premadeEntryLevel(stop, progress, plan.rewardFacts)
    : (destination?.from ?? legs[index]!.to);
}

export function activeCampaignActions(
  plan: CampaignPlan,
  progress: PremadeProgress,
): readonly CampaignAction[] {
  const includedLegs = new Set(campaignIncludedLegs(plan, progress).map((leg) => leg.id));
  const base = plan.actions
    .filter(
      (action) =>
        includedLegs.has(action.legId) &&
        (progress.raidGoals || !action.raidOnly) &&
        (!action.targetStopId ||
          getDungeonBundle(action.targetStopId, "alliance", progress.guaranteedBundles)
            ?.included !== false),
    )
    .map((original) => {
      const action = progress.raidGoals
        ? original
        : {
            ...original,
            questChanges: original.questChanges.filter(
              (change) => !raidQuestIds.has(change.questId),
            ),
          };
      if (action.targetStopId === null) return action;
      const target = campaignXpTarget(action, progress, plan.rewardFacts);
      return target
        ? { ...action, targetLevel: target.level, targetCurrentXp: target.currentXp }
        : action;
    });
  const result: CampaignAction[] = [];
  for (const [index, action] of base.entries()) {
    if (base[index - 1]?.legId === action.legId) {
      result.push(action);
      continue;
    }
    const leg = plan.legs.find((entry) => entry.id === action.legId);
    if (!leg || leg.kind !== "xp-bridge") {
      result.push(action);
      continue;
    }
    const selected = [
      ...new Set([
        ...(plan.defaultCatchUpBatches?.[leg.id] ?? []),
        ...(progress.selectedBatches?.[leg.id] ?? []),
      ]),
    ];
    for (const id of selected) {
      const batch = plan.catchUpBatches?.find((entry) => entry.id === id);
      const block = CAMPAIGN_BRIDGES.find((entry) => entry.id === leg.id);
      if (
        !batch ||
        !block ||
        batch.objectiveType !== "shared-kills" ||
        batch.conditional ||
        !batch.sourceIds.some((sourceId) => block.sourceIds.includes(sourceId))
      )
        continue;
      for (const extra of batch.actions) {
        const extraId = `${leg.id}-${extra.id}`;
        if (
          !base.some((entry) => entry.id === extraId) &&
          !result.some((entry) => entry.id === extraId)
        )
          result.push({
            ...extra,
            id: extraId,
            legId: leg.id,
            xpOptional: true,
            xpTargetLevel: leg.to,
            catchUpBatchId: batch.id,
          });
      }
    }
    result.push(action);
  }
  return result;
}

export function campaignUnmodeledExtras(
  plan: CampaignPlan,
  progress: PremadeProgress,
): readonly number[] {
  const owned = new Set(
    plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  return [
    ...new Set(
      PREMADE_STOPS.flatMap((stop) =>
        selectedPremadeQuests(stop, progress)
          .filter((choice) => choice.role === "opportunistic" && !owned.has(choice.questId))
          .map((choice) => choice.questId),
      ),
    ),
  ];
}

export function currentCampaignAction(
  plan: CampaignPlan,
  progress: PremadeProgress,
): CampaignAction {
  const active = activeCampaignActions(plan, progress);
  const selectedId = progress.campaigns[plan.release]?.selectedActionId;
  const selected = active.find(
    (action) => action.id === selectedId || action.id === plan.bookmarkAliases?.[selectedId ?? ""],
  );
  if (selected)
    return campaignActionNeeded(plan, progress, selected)
      ? selected
      : nextCampaignAction(plan, progress, selected.id);
  const originalIndex = plan.actions.findIndex((action) => action.id === selectedId);
  if (originalIndex < 0) return active[0]!;
  const laterIds = new Set(plan.actions.slice(originalIndex + 1).map((action) => action.id));
  return active.find((action) => laterIds.has(action.id)) ?? active.at(-1)!;
}

function questChangeNeeded(change: CampaignQuestChange, member: PremadeMember): boolean {
  const state = member.questStates[String(change.questId)];
  if (state === "rewarded") return false;
  if (change.state === "accepted") return state === undefined || state === "not-started";
  if (state === undefined || state === "not-started") return false;
  if (change.state === "objectives-complete")
    return (
      state !== "objectives-complete" &&
      !member.confirmations[`campaign-objective-${change.questId}-${change.objectiveIndex ?? 1}`]
    );
  return true;
}

export function campaignQuestTargets(
  action: CampaignAction,
  progress: PremadeProgress,
): readonly number[] {
  return progress.members.flatMap((member, index) =>
    (!action.leaderOnly || index === 0) &&
    action.questChanges.some((change) => questChangeNeeded(change, member))
      ? [index]
      : [],
  );
}

export function campaignQuestAlreadyReported(
  action: CampaignAction,
  progress: PremadeProgress,
): boolean {
  if (!action.questChanges.length) return false;
  return progress.members.every((member, index) =>
    action.leaderOnly && index !== 0
      ? true
      : action.questChanges.every((change) => {
          const state = member.questStates[String(change.questId)];
          return (
            state !== undefined && state !== "not-started" && !questChangeNeeded(change, member)
          );
        }),
  );
}

export function campaignOptionalXpReady(
  plan: CampaignPlan,
  progress: PremadeProgress,
  action: CampaignAction,
): boolean {
  const leg = plan.legs.find((entry) => entry.id === action.legId);
  if (!leg || action.libraryBackbone || (leg.kind !== "xp-bridge" && !action.xpOptional))
    return false;
  const xpTarget = campaignXpTarget(action, progress, plan.rewardFacts);
  if (action.kind === "xp-check" && xpTarget !== null) {
    const members = action.leaderOnly ? progress.members.slice(0, 1) : progress.members;
    if (action.pickupQuestId !== undefined)
      return members.every((member) =>
        campaignPickupLevelMet(member, xpTarget.level, plan.rewardFacts ?? []),
      );
    return members.every(
      (member) =>
        member.level !== null &&
        member.currentXp !== null &&
        !member.xpNeedsUpdate &&
        (member.level > xpTarget.level ||
          (member.level === xpTarget.level && member.currentXp >= xpTarget.currentXp)),
    );
  }
  if (action.kind === "xp-check") return false;
  if (campaignRequiredDungeonQuest(action)) return false;
  const actionQuestIds = new Set(action.questChanges.map((change) => change.questId));
  if (
    actionQuestIds.size > 0 &&
    progress.members.some((member) =>
      [...actionQuestIds].some((questId) =>
        ["accepted", "objectives-complete"].includes(member.questStates[String(questId)] ?? ""),
      ),
    )
  )
    return false;
  if (
    actionQuestIds.size > 0 &&
    plan.actions.some(
      (candidate) =>
        (progress.raidGoals || !candidate.raidOnly) &&
        candidate.requiredQuestIds?.some((questId) => actionQuestIds.has(questId)),
    )
  )
    return false;
  const target = campaignCatchUpTarget(plan, progress, leg.id);
  const members = action.leaderOnly ? progress.members.slice(0, 1) : progress.members;
  return members.every(
    (member) =>
      member.level !== null &&
      member.currentXp !== null &&
      !member.xpNeedsUpdate &&
      member.level >= target,
  );
}

export function campaignRequiredDungeonQuest(action: CampaignAction): boolean {
  return (
    action.libraryRequired === true ||
    action.questChanges.some((change) => retainedDungeonQuestIds.has(change.questId))
  );
}

export function campaignActionNeeded(
  plan: CampaignPlan,
  progress: PremadeProgress,
  action: CampaignAction,
): boolean {
  if (campaignOptionalXpReady(plan, progress, action)) return false;
  return action.questChanges.length === 0 || campaignQuestTargets(action, progress).length > 0;
}

export function nextCampaignAction(
  plan: CampaignPlan,
  progress: PremadeProgress,
  actionId: string,
): CampaignAction {
  const actions = activeCampaignActions(plan, progress);
  const index = actions.findIndex((action) => action.id === actionId);
  if (index < 0) throw new Error("Unknown or inactive campaign action.");
  return (
    actions.slice(index + 1).find((action) => campaignActionNeeded(plan, progress, action)) ??
    actions.at(-1)!
  );
}

export function campaignActionReasons(
  action: CampaignAction,
  progress: PremadeProgress,
  facts: readonly QuestRewardFact[] = [],
): readonly string[] {
  if (
    action.bundleId ||
    (action.kind === "checkpoint" &&
      PREMADE_STOPS.some(
        (stop) => stop.id === action.targetStopId && stop.dataStatus === "guaranteed-bundle",
      ))
  )
    return [
      "This optional dungeon is funded in planning, but quest identities and access details are pending. Use Next to preview or skip; it cannot be reported as a verified completed quest bundle.",
    ];
  if (action.kind === "unverified")
    return [
      "This proposed dungeon has no verified quest/access bundle; previewing it cannot mark a completed run.",
    ];
  if (action.kind === "quests") {
    if (
      action.requiredQuestIds?.some((id) =>
        campaignQuestTargets(action, progress).some(
          (player) => progress.members[player]!.questStates[String(id)] !== "rewarded",
        ),
      )
    )
      return [
        `Finish the source-chain hand-ins (${action.requiredQuestIds.join(", ")}) for every participating player before this batch.`,
      ];
    for (const player of campaignQuestTargets(action, progress)) {
      const member = progress.members[player]!;
      const staged = { ...member, questStates: { ...member.questStates } };
      for (const change of action.questChanges) {
        if (!questChangeNeeded(change, staged)) continue;
        if (change.state === "accepted") {
          const { minimumLevel, gate } = questEligibility(change.questId, facts);
          if (minimumLevel !== null && !campaignPickupLevelMet(staged, minimumLevel, facts))
            return [
              `Record Player ${player + 1}'s actual level ${minimumLevel} or above before quest ${change.questId}. Conflicting minima remain conservative.`,
            ];
          if (gate && questGateResult(gate, staged) === "blocked")
            if (!action.sourceGateConflictQuestIds?.includes(change.questId))
              return [
                `Quest ${change.questId}: finish the required prerequisite or item check before this pickup.`,
              ];
          const quest = getPremadeQuest(change.questId);
          if (
            quest?.faction === "horde" ||
            (quest?.classSlug && member.classSlug && quest.classSlug !== member.classSlug)
          )
            return [`Player ${player + 1} is not eligible for quest ${change.questId}.`];
        }
        staged.questStates[String(change.questId)] = change.state;
      }
    }
    return [];
  }
  if (action.kind === "xp-check") {
    const members = action.leaderOnly ? progress.members.slice(0, 1) : progress.members;
    const target = campaignXpTarget(action, progress, facts);
    // An informational zone handoff has no eligibility gate. Recording an XP bar
    // may improve its forecast, but must not prevent the player from continuing.
    if (target === null) return [];
    if (
      action.pickupQuestId !== undefined &&
      target !== null &&
      members.every((member) => campaignPickupLevelMet(member, target.level, facts))
    )
      return [];
    const stale = members.some(
      (member) => member.level === null || member.currentXp === null || member.xpNeedsUpdate,
    );
    if (stale)
      return [
        `Record fresh actual levels and XP for ${action.leaderOnly ? "the leader" : "all five"} after preparation; unknown or stale bars cannot decide whether extra quests are needed.`,
      ];
    const ready = members.every(
      (member) =>
        member.level! > target.level ||
        (member.level === target.level && member.currentXp! >= target.currentXp),
    );
    return ready
      ? []
      : [
          `The next requirement needs ${action.leaderOnly ? "the leader" : "all five"} at level ${target.level}${target.currentXp ? ` + ${target.currentXp.toLocaleString("en-US")} XP` : ""}. Cover only the remaining gap, then record fresh actual XP.`,
        ];
  }
  if (action.kind !== "checkpoint") return [];
  const stop = PREMADE_STOPS.find((entry) => entry.id === action.targetStopId);
  const minimum = stop ? premadeEntryLevel(stop, progress, facts) : action.targetLevel;
  if (minimum === null) return ["The entry gate is unknown."];
  if (
    !progress.members.every(
      (member) =>
        member.level !== null &&
        member.currentXp !== null &&
        !member.xpNeedsUpdate &&
        member.level >= minimum,
    )
  )
    return [`Save fresh actual level/XP for all five at level ${minimum} or above.`];
  if (
    action.requiredQuestIds?.some(
      (id) => !progress.members.every((member) => member.questStates[String(id)] === "rewarded"),
    )
  )
    return [
      "Required preparation hand-ins are still missing for one or more players. Being ahead on XP does not replace the unlocks.",
    ];
  return [];
}
export function updateCampaignAction(
  plan: CampaignPlan,
  progress: PremadeProgress,
  actionId: string,
  done: boolean,
): PremadeProgress {
  const active = activeCampaignActions(plan, progress),
    index = active.findIndex((action) => action.id === actionId),
    action = active[index];
  if (!action) throw new Error("Unknown or inactive campaign action.");
  if (done && campaignActionReasons(action, progress, plan.rewardFacts).length)
    throw new Error(campaignActionReasons(action, progress, plan.rewardFacts)[0]);
  const previous = progress.campaigns[plan.release] ?? emptyCampaignProgress();
  const journey: CampaignProgress = {
    ...previous,
    selectedActionId: active[index + 1]?.id ?? action.id,
    completion: done ? { ...previous.completion, [action.id]: "done" } : previous.completion,
  };
  const members = progress.members.map((member, memberIndex) => {
    if (!done || (action.leaderOnly && memberIndex !== 0)) return member;
    const questStates = { ...member.questStates },
      confirmations = { ...member.confirmations };
    let changedReward = false;
    for (const change of action.questChanges) {
      if (!questChangeNeeded(change, { ...member, questStates, confirmations })) continue;
      if (change.state === "objectives-complete") {
        confirmations[`campaign-objective-${change.questId}-${change.objectiveIndex ?? 1}`] = true;
        const objectives = active.flatMap((candidate) =>
          candidate.questChanges.filter(
            (entry) => entry.questId === change.questId && entry.state === "objectives-complete",
          ),
        );
        questStates[String(change.questId)] = objectives.every(
          (entry) =>
            confirmations[`campaign-objective-${change.questId}-${entry.objectiveIndex ?? 1}`],
        )
          ? "objectives-complete"
          : "accepted";
      } else questStates[String(change.questId)] = change.state;
      changedReward ||= change.state === "rewarded";
    }
    return {
      ...member,
      questStates,
      confirmations,
      xpNeedsUpdate: member.xpNeedsUpdate || changedReward,
    };
  });
  const updated = premadeProgressSchema.parse({
    ...progress,
    campaigns: { ...progress.campaigns, [plan.release]: journey },
    members,
  });
  return {
    ...updated,
    campaigns: {
      ...updated.campaigns,
      [plan.release]: {
        ...journey,
        selectedActionId: nextCampaignAction(plan, updated, action.id).id,
      },
    },
  };
}

export function skipCampaignXpBlock(
  plan: CampaignPlan,
  progress: PremadeProgress,
  legId: string,
): PremadeProgress {
  const leg = plan.legs.find((entry) => entry.id === legId);
  if (!leg || leg.kind !== "xp-bridge")
    throw new Error("Required preparation cannot be skipped as XP filler.");
  const actions = activeCampaignActions(plan, progress);
  const last = actions.reduce(
    (result, action, index) => (action.legId === legId ? index : result),
    -1,
  );
  if (last < 0) throw new Error("Unknown campaign block.");
  const minimum = campaignCatchUpTarget(plan, progress, legId);
  if (
    !progress.members.every(
      (member) =>
        member.level !== null &&
        member.currentXp !== null &&
        !member.xpNeedsUpdate &&
        member.level >= minimum,
    )
  )
    throw new Error(
      `Save fresh actual XP for all five at level ${minimum} or above before skipping this XP-only block.`,
    );
  const journey = progress.campaigns[plan.release] ?? emptyCampaignProgress();
  const ids = actions
    .filter((action) => action.legId === legId && campaignOptionalXpReady(plan, progress, action))
    .map((action) => action.id);
  const required = actions.find(
    (action) =>
      action.legId === legId &&
      !ids.includes(action.id) &&
      campaignActionNeeded(plan, progress, action),
  );
  return premadeProgressSchema.parse({
    ...progress,
    campaigns: {
      ...progress.campaigns,
      [plan.release]: {
        selectedActionId: required?.id ?? actions[last + 1]?.id ?? actions[last]!.id,
        completion: {
          ...journey.completion,
          ...Object.fromEntries(
            ids
              .filter((id) => journey.completion[id] !== "done")
              .map((id) => [id, "skipped" as const]),
          ),
        },
      },
    },
  });
}
