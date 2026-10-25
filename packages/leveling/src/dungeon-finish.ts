import { DUNGEON_VISITS, DUNGEON_QUESTS } from "./dungeon-catalog.js";
import { questEligibility, questGateResult } from "./quest-eligibility.js";
import { resolveQuestReward, type QuestRewardFact } from "./quest-rewards.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import {
  premadeProgressSchema,
  type PremadeProgress,
  type PremadeMember,
} from "./premade-model.js";
import {
  dungeonFinishRunSchema,
  dungeonFinishBarSchema,
  type DungeonFinishId,
  type DungeonFinishRun,
} from "./dungeon-finish-model.js";

export interface DungeonFinishOption {
  readonly id: DungeonFinishId;
  readonly name: string;
  readonly area: string;
  readonly recommendedLevel: number;
  readonly expertLevel: number;
  readonly questIds: readonly number[];
  readonly preparation: string;
  readonly sourceUrl: string;
  readonly availability: "reference" | "announced";
}
const questSource = "https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location";
const officialSource = "https://worldofwarcraft.blizzard.com/en-gb/news/24301455";
const options: readonly Omit<DungeonFinishOption, "questIds" | "sourceUrl" | "availability">[] = [
  {
    id: "blackrock-depths",
    name: "Blackrock Depths",
    area: "Blackrock Mountain",
    recommendedLevel: 55,
    expertLevel: 52,
    preparation:
      "Choose prison, key, quest or Emperor scope. Batch outside hand-ins; Windsor and the royal chain can require separate visits.",
  },
  {
    id: "lower-blackrock",
    name: "Lower Blackrock Spire",
    area: "Blackrock Mountain",
    recommendedLevel: 60,
    expertLevel: 54,
    preparation:
      "Pick up eligible Burning Steppes quests. Key gems and Vaelan's deliveries can require extra visits; rewards do not repeat.",
  },
  {
    id: "dire-maul-east",
    name: "Dire Maul East",
    area: "Feralas",
    recommendedLevel: 56,
    expertLevel: 52,
    preparation:
      "Plan Pusillin and the eastern route. Prepare the key or a confirmed alternative before moving to the other wings.",
  },
  {
    id: "dire-maul-west",
    name: "Dire Maul West",
    area: "Feralas",
    recommendedLevel: 60,
    expertLevel: 54,
    preparation:
      "Verify Crescent Key or a working lockpicking alternative. Choose a route your tank and healer can sustain.",
  },
  {
    id: "dire-maul-north",
    name: "Dire Maul North",
    area: "Feralas",
    recommendedLevel: 60,
    expertLevel: 54,
    preparation:
      "Choose normal boss farming or Tribute before starting. Tribute, Knot and Gordok tasks have different requirements.",
  },
  {
    id: "scholomance",
    name: "Scholomance",
    area: "Western Plaguelands",
    recommendedLevel: 60,
    expertLevel: 54,
    preparation:
      "Arrange Skeleton Key access. Batch eligible Chillwind and Light's Hope pickups; class and profession rewards are personal.",
  },
  {
    id: "stratholme-live",
    name: "Stratholme Living",
    area: "Eastern Plaguelands",
    recommendedLevel: 60,
    expertLevel: 54,
    preparation:
      "Arrange Scarlet Hold access and eligible Light's Hope pickups. Prepare Egan's item only for the selected soul quest.",
  },
  {
    id: "stratholme-undead",
    name: "Stratholme Undead",
    area: "Eastern Plaguelands",
    recommendedLevel: 60,
    expertLevel: 54,
    preparation:
      "Arrange side-entrance access or use a verified approach. Keep first-visit and later follow-up rewards separate.",
  },
  {
    id: "blackmaw-hold",
    name: "Blackmaw Hold",
    area: "Azshara",
    recommendedLevel: 55,
    expertLevel: 55,
    preparation:
      "Announced for levels 55–60. Confirm access, route and boss tuning in game; quest identities, rewards and clear XP are not invented.",
  },
  {
    id: "shapers-terrace",
    name: "Shaper's Terrace",
    area: "Un'Goro Crater",
    recommendedLevel: 58,
    expertLevel: 58,
    preparation:
      "Announced for levels 58–60. Blizzard describes using Un'Goro power crystals inside; verify the actual access and item requirements.",
  },
];
export const DUNGEON_FINISH_OPTIONS: readonly DungeonFinishOption[] = options.map((option) => ({
  ...option,
  questIds: [
    ...new Set(
      DUNGEON_VISITS.filter((visit) =>
        option.id === "blackrock-depths"
          ? ["brd-prison", "brd-emperor"].includes(visit.id)
          : visit.id === option.id,
      ).flatMap((visit) => visit.questIds),
    ),
  ],
  sourceUrl: ["blackmaw-hold", "shapers-terrace"].includes(option.id)
    ? officialSource
    : questSource,
  availability: ["blackmaw-hold", "shapers-terrace"].includes(option.id)
    ? "announced"
    : "reference",
}));

export function dungeonFinishTotalXp(bar: {
  readonly level: number;
  readonly currentXp: number;
}): number {
  if (
    !Number.isInteger(bar.level) ||
    bar.level < 1 ||
    bar.level > 60 ||
    !Number.isInteger(bar.currentXp) ||
    bar.currentXp < 0 ||
    (bar.level === 60 ? bar.currentXp !== 0 : bar.currentXp >= FOREVER_XP_CURVE[bar.level]!)
  )
    throw new Error("Enter a valid level and XP bar shown in game.");
  let total = bar.currentXp;
  for (let level = 1; level < bar.level; level++) total += FOREVER_XP_CURVE[level]!;
  return total;
}
const capXp = dungeonFinishTotalXp({ level: 60, currentXp: 0 });

export function dungeonFinishPartyKey(progress: PremadeProgress): string {
  return JSON.stringify(
    progress.members.map((member) => [member.raceId ?? null, member.classSlug]),
  );
}

export function recordDungeonFinishRun(
  progress: PremadeProgress,
  input: DungeonFinishRun,
): PremadeProgress {
  const run = dungeonFinishRunSchema.parse(input);
  if (progress.dungeonFinish.runs.some((entry) => entry.id === run.id))
    throw new Error("This clear is already recorded.");
  if (progress.dungeonFinish.runs.length >= 200)
    throw new Error("The clear log is full. Export a backup before removing older entries.");
  if (run.partyKey !== dungeonFinishPartyKey(progress))
    throw new Error("The party changed. Reopen the clear form.");
  for (let index = 0; index < 5; index++) {
    const before = run.before[index]!,
      after = run.after[index]!;
    const gain = dungeonFinishTotalXp(after) - dungeonFinishTotalXp(before);
    if (gain < 0) throw new Error(`Player ${index + 1}: XP cannot go backwards during a clear.`);
    if (run.questXp[index] !== null && run.questXp[index]! > gain)
      throw new Error(`Player ${index + 1}: quest XP cannot exceed the total XP gain.`);
    const saved = progress.members[index]!;
    if (
      !saved.xpNeedsUpdate &&
      saved.level !== null &&
      saved.currentXp !== null &&
      (saved.level !== before.level || saved.currentXp !== before.currentXp)
    )
      throw new Error(
        `Player ${index + 1}: the starting bar differs from saved progress. Update progress before recording this clear.`,
      );
  }
  return premadeProgressSchema.parse({
    ...progress,
    dungeonFinish: { ...progress.dungeonFinish, runs: [...progress.dungeonFinish.runs, run] },
    members: progress.members.map((member, index) => ({
      ...member,
      ...run.after[index],
      xpNeedsUpdate: false,
    })),
  });
}

export interface DungeonFinishEstimate {
  readonly samples: number;
  readonly clears: number | null;
  readonly minutes: number | null;
  readonly remainingXp: readonly (number | null)[];
  readonly repeatXp: readonly (number | null)[];
}
export function estimateDungeonFinish(
  progress: PremadeProgress,
  dungeonId: DungeonFinishId,
  build: number,
): DungeonFinishEstimate {
  const party = dungeonFinishPartyKey(progress);
  const remainingXp = progress.members.map((member) =>
    member.level === null ||
    member.currentXp === null ||
    member.xpNeedsUpdate ||
    !dungeonFinishBarSchema.safeParse({ level: member.level, currentXp: member.currentXp }).success
      ? null
      : capXp - dungeonFinishTotalXp({ level: member.level, currentXp: member.currentXp }),
  );
  const runs = progress.dungeonFinish.runs
    .filter(
      (run) =>
        run.dungeonId === dungeonId &&
        run.scope === progress.dungeonFinish.selectedScope &&
        run.build === build &&
        run.partyKey === party &&
        run.questXp.every((xp) => xp !== null) &&
        progress.members.every(
          (member, index) =>
            member.level !== null &&
            member.level >= run.before[index]!.level &&
            member.level <= Math.min(60, run.after[index]!.level + 1),
        ),
    )
    .slice(-5);
  const repeatXp = progress.members.map((_, index) =>
    runs.length
      ? runs.reduce(
          (total, run) =>
            total +
            dungeonFinishTotalXp(run.after[index]!) -
            dungeonFinishTotalXp(run.before[index]!) -
            run.questXp[index]!,
          0,
        ) / runs.length
      : null,
  );
  const counts = remainingXp.map((xp, index) =>
    xp === 0
      ? 0
      : xp === null || repeatXp[index] === null || repeatXp[index]! <= 0
        ? null
        : Math.ceil(xp / repeatXp[index]!),
  );
  const clears = counts.every((count) => count !== null) ? Math.max(...(counts as number[])) : null;
  return {
    samples: runs.length,
    clears,
    minutes:
      clears === null || !runs.length
        ? clears === 0
          ? 0
          : null
        : Math.ceil((clears * runs.reduce((total, run) => total + run.minutes, 0)) / runs.length),
    remainingXp,
    repeatXp,
  };
}

export function dungeonFinishQuestRewards(
  option: DungeonFinishOption,
  member: PremadeMember,
  facts: readonly QuestRewardFact[],
): readonly {
  readonly questId: number;
  readonly title: string;
  readonly xp: number | null;
  readonly status:
    "claimed" | "level-locked" | "restricted" | "prerequisite" | "available" | "unverified";
}[] {
  return option.questIds.flatMap((questId) => {
    const quest = DUNGEON_QUESTS.find((entry) => entry.id === questId);
    if (!quest) return [];
    const eligibility = questEligibility(questId, facts);
    const claimed = member.questStates[String(questId)] === "rewarded";
    const restricted =
      quest.faction === "horde" ||
      Boolean(quest.classSlug && member.classSlug && quest.classSlug !== member.classSlug) ||
      Boolean(quest.raceIds.length && member.raceId && !quest.raceIds.includes(member.raceId));
    const unknownIdentity =
      Boolean(quest.classSlug && !member.classSlug) ||
      Boolean(quest.raceIds.length && !member.raceId);
    const locked =
      member.level !== null &&
      eligibility.minimumLevel !== null &&
      member.level < eligibility.minimumLevel;
    const gate = eligibility.gate ? questGateResult(eligibility.gate, member) : "ready";
    const status = claimed
      ? "claimed"
      : restricted
        ? "restricted"
        : locked
          ? "level-locked"
          : gate === "blocked"
            ? "prerequisite"
            : member.level === null ||
                unknownIdentity ||
                gate === "unknown" ||
                !quest.restrictionsKnown
              ? "unverified"
              : "available";
    return [
      {
        questId,
        title: quest.title,
        xp:
          status === "claimed"
            ? 0
            : status === "available" && member.level !== null
              ? resolveQuestReward(questId, member.level, facts).xp
              : null,
        status,
      },
    ];
  });
}

export function rankedDungeonFinishOptions(
  progress: PremadeProgress,
): readonly DungeonFinishOption[] {
  const score = (id: DungeonFinishId): number =>
    progress.dungeonFinish.targets
      .filter((target) => target.dungeonId === id && !target.obtained)
      .reduce((total, target) => total + target.priority, 0);
  return [...DUNGEON_FINISH_OPTIONS].sort(
    (left, right) => score(right.id) - score(left.id) || left.expertLevel - right.expertLevel,
  );
}
