import type {
  CampaignAction,
  CampaignPlan,
  CampaignQuestChange,
  CampaignSource,
} from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { getGuideStepView } from "./guide-archive.js";
import { campaignActionSource } from "./campaign-source-conditions.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { eligibleCampaignLibrarySource } from "./campaign-library-source-profile.js";
import { isCommonCampaignQuestMethod } from "./campaign-shared-source.js";

export const WAILING_CAVERNS_CATCHUP_LEG_ID = "wailing-caverns-catchup";
export const WAILING_CAVERNS_CATCHUP_QUEST_IDS = [959, 1487, 6981] as const;
const phaseTags = new Map<string, CampaignQuestChange["state"]>([
  [".accept", "accepted"],
  [".complete", "objectives-complete"],
  [".turnin", "rewarded"],
]);
type Phase = readonly [number, CampaignQuestChange["state"], number | null];
interface CapturedTask {
  readonly step: number;
  readonly title: string;
  readonly phases: readonly Phase[];
  readonly inside?: true;
}
const tasks: readonly CapturedTask[] = [
  { step: 15, title: "Learn Ratchet's flight path", phases: [] },
  { step: 16, title: "Pick up Trouble at the Docks", phases: [[959, "accepted", null]] },
  { step: 17, title: "Reach Ebru above the cavern entrance", phases: [] },
  { step: 18, title: "Pick up Deviate Eradication", phases: [[1487, "accepted", null]] },
  {
    step: 20,
    title: "Recover each player's port from Mad Magglish",
    phases: [[959, "objectives-complete", 1]],
  },
  { step: 21, title: "Enter Wailing Caverns", phases: [] },
  {
    step: 23,
    title: "Complete all four seven-kill counters",
    phases: [1, 2, 3, 4].map((index): Phase => [1487, "objectives-complete", index]),
    inside: true,
  },
  {
    step: 25,
    title: "Finish Naralex's event and start The Glowing Shard",
    phases: [[6981, "accepted", null]],
    inside: true,
  },
  { step: 27, title: "Return to Ratchet", phases: [] },
  {
    step: 28,
    title: "Ask Sputtervalve about the shard",
    phases: [[6981, "objectives-complete", 1]],
  },
  { step: 29, title: "Deliver Trouble at the Docks", phases: [[959, "rewarded", null]] },
  { step: 30, title: "Reach Falla Sagewind above Wailing Caverns", phases: [] },
  { step: 31, title: "Deliver The Glowing Shard to Falla", phases: [[6981, "rewarded", null]] },
  { step: 32, title: "Return to Ebru's cave", phases: [] },
  { step: 34, title: "Deliver Deviate Eradication", phases: [[1487, "rewarded", null]] },
];

export function capturedWailingCavernsActions(
  plan: CampaignPlan,
  source: CampaignSource,
  catalog: QuestCatalog,
): readonly CampaignAction[] | null {
  const profile = campaignPlanSourceProfile(plan);
  if (!eligibleCampaignLibrarySource(source, profile, true)) return null;
  const titles = new Map(catalog.quests.map((quest) => [quest.questId, quest.title]));
  const actions: CampaignAction[] = [];
  for (const task of tasks) {
    const step = source.guide.steps.find(
      (entry) => entry.id === `source-step-${String(task.step).padStart(4, "0")}`,
    );
    if (!step) return null;
    const view = getGuideStepView(step, profile, { dungeons: ["WC"] });
    if (view.condition !== "match" || view.conditionalDirectives.length) return null;
    const directives = view.directives;
    if (
      !isCommonCampaignQuestMethod(
        directives.filter(
          (row) =>
            ![".use", ".skipgossip", ".fp", ".collect", ".zoneskip", ".subzone"].includes(row.tag),
        ),
        new Set([...WAILING_CAVERNS_CATCHUP_QUEST_IDS, 1486]),
      )
    )
      return null;
    if (
      directives.some(
        (row) => row.tag === ".collect" && (task.step !== 25 || row.arguments !== "10441,1,6981,1"),
      )
    )
      return null;
    if (
      directives.some(
        (row) => row.tag === ".zoneskip" && (task.step !== 21 || row.arguments !== "1414,1"),
      )
    )
      return null;
    if (
      directives.some(
        (row) => row.tag === ".subzone" && (task.step !== 27 || row.arguments !== "392"),
      )
    )
      return null;
    if (
      directives.some(
        (row) => row.tag === ".fp" && (task.step !== 15 || row.arguments !== "Ratchet"),
      )
    )
      return null;
    if (
      directives.some(
        (row) =>
          row.tag === ".skipgossip" &&
          (![25, 28].includes(task.step) || !/^(?:[1-9]\d{0,5})?$/.test(row.arguments.trim())),
      )
    )
      return null;
    if (
      directives.some((row) =>
        [".cast", ".train", ".trainer", ".fly", ".hs", ".home"].includes(row.tag),
      )
    )
      return null;
    if (
      directives.some(
        (row) => row.tag === ".use" && (task.step !== 25 || row.arguments !== "10441"),
      )
    )
      return null;
    const changes = directives.flatMap((row): readonly CampaignQuestChange[] => {
      const state = phaseTags.get(row.tag);
      if (
        !state ||
        row.questId === null ||
        !WAILING_CAVERNS_CATCHUP_QUEST_IDS.some((id) => id === row.questId)
      )
        return [];
      return [
        {
          questId: row.questId,
          state,
          title: titles.get(row.questId)!,
          objectiveIndex:
            state === "objectives-complete" ? Number(row.arguments.split(",")[1] ?? 1) : null,
        },
      ];
    });
    if (
      JSON.stringify(
        changes.map((change) => [change.questId, change.state, change.objectiveIndex]),
      ) !== JSON.stringify(task.phases)
    )
      return null;
    const utility = directives.some((row) => row.tag === ".fp" && row.arguments === "Ratchet");
    if (task.step === 15 && !utility) return null;
    const target = (
      {
        16: "Crane Operator Bigglefuzz",
        18: "Ebru",
        28: "Sputtervalve",
        29: "Crane Operator Bigglefuzz",
        31: "Falla Sagewind",
        34: "Ebru",
      } as Readonly<Record<number, string>>
    )[task.step];
    if (
      target &&
      !directives.some(
        (row) => row.tag === ".target" && row.arguments.replace(/^\+/, "") === target,
      )
    )
      return null;
    if (
      task.step === 25 &&
      (!directives.some((row) => row.tag === ".use" && row.arguments === "10441") ||
        !directives.some((row) => row.tag === ".collect" && row.arguments === "10441,1,6981,1") ||
        !directives.some((row) => row.tag === ".mob" && row.arguments === "Mutanus the Devourer"))
    )
      return null;
    if (
      task.step === 25 &&
      (!directives.some(
        (row) => row.tag === ".target" && row.arguments === "Disciple of Naralex",
      ) ||
        ![
          "Lord Cobrahn",
          "Lord Pythas",
          "Lord Serpentis",
          "Lady Anacondra",
          "ritual of awakening",
        ].every((name) => directives.some((row) => row.tag === "text" && row.text.includes(name))))
    )
      return null;
    actions.push({
      id: `${WAILING_CAVERNS_CATCHUP_LEG_ID}-${step.id}`,
      legId: WAILING_CAVERNS_CATCHUP_LEG_ID,
      title: task.title,
      instructions: directives
        .filter((row) => ["text", ".goto", ".subzone", ".fp"].includes(row.tag))
        .flatMap((row) => (row.text ? [row.text] : []))
        .concat(
          task.step === 25
            ? [
                "Each player must loot and use their own Glowing Shard: one each, five for the party.",
              ]
            : [],
        ),
      questChanges: changes,
      source: campaignActionSource(source.guide, step, directives),
      positions: directives.flatMap((row) =>
        row.position ? [{ sourceLine: row.sourceLine, position: row.position }] : [],
      ),
      kind: changes.length ? "quests" : "instructions",
      leaderOnly: false,
      raidOnly: false,
      targetLevel: null,
      targetStopId: null,
      libraryBackbone: true,
      xpOptional: false,
      location: {
        zone: "1413",
        visitOverride: true,
        ...(task.inside ? { insideDungeon: "wailing-caverns" } : {}),
      },
      ...(utility ? { nativeUtilityTags: [".fp"] } : {}),
    });
  }
  return actions;
}
