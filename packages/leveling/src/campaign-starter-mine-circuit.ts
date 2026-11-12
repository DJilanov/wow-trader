import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";

const phaseTags = new Set([".accept", ".complete", ".turnin"]);
const circuitTags = new Set([
  ".goto",
  ".waypoint",
  ".line",
  ".target",
  ".mob",
  ".unitscan",
  ".accept",
  ".complete",
  ".turnin",
  ".isNotOnQuest",
]);

function phaseKey(change: CampaignAction["questChanges"][number]): string {
  return `${change.questId}:${change.state}:${change.objectiveIndex ?? 0}`;
}

function fragment(
  action: CampaignAction,
  questIds: ReadonlySet<number>,
  id: string,
): CampaignAction {
  const retained = action.questChanges.filter((change) => questIds.has(change.questId));
  const removed = action.questChanges.filter((change) => !questIds.has(change.questId));
  return {
    ...action,
    id,
    questChanges: retained,
    title: retained
      .map((change) => `${change.state === "accepted" ? "Accept" : "Turn in"} ${change.title}`)
      .join(" · "),
    instructions: action.instructions.filter(
      (line) =>
        !removed.some((change) => line.includes(change.title)) ||
        retained.some((change) => line.includes(change.title)),
    ),
  };
}

/** Reviewed Elwynn circuit. The caller must qualify the complete proposal across party scenarios. */
export function proposeCampaignStarterMineCircuit(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
): CampaignPlan | null {
  if (plan.race !== "human") return null;
  const matches = (
    stepId: string,
    questId: number,
    state: CampaignAction["questChanges"][number]["state"],
  ): CampaignAction | null => {
    const found = plan.actions.filter(
      (action) =>
        action.source?.stepId === stepId &&
        sources.some(
          (source) =>
            source.reference.sourceId === 116 &&
            source.guide.chapterId === action.source?.chapterId &&
            source.guide.version === action.source.version &&
            source.guide.targetBuild === plan.targetBuild,
        ) &&
        action.questChanges.some((change) => change.questId === questId && change.state === state),
    );
    return found.length === 1 ? found[0]! : null;
  };
  const collection = matches("source-step-0054", 60, "objectives-complete");
  const exploration = matches("source-step-0073", 62, "objectives-complete");
  const dust = matches("source-step-0085", 47, "rewarded");
  const mine = matches("source-step-0086", 62, "rewarded");
  const candles = matches("source-step-0096", 60, "rewarded");
  const pickup = matches("source-step-0050", 85, "accepted");
  if (
    !collection ||
    !exploration ||
    !dust ||
    !mine ||
    !candles ||
    !pickup ||
    !pickup.leaderOnly ||
    pickup.raidOnly ||
    pickup.dungeonFinishOnly
  )
    return null;
  const selected = [collection, exploration, dust, mine, candles];
  const native = campaignNativeInstructions(plan, sources);
  if (
    plan.legs.find((leg) => leg.id === pickup.legId)?.kind !== "starter" ||
    selected.some((action) => {
      const lowered = native(action);
      return (
        action.legId !== pickup.legId ||
        !action.leaderOnly ||
        action.raidOnly ||
        action.dungeonFinishOnly ||
        action.itemCollections?.length ||
        action.requiredQuestIds?.length ||
        action.movement ||
        !lowered ||
        lowered.directives.some((directive) => !circuitTags.has(directive.tag))
      );
    })
  )
    return null;
  if (
    collection.questChanges.length !== 2 ||
    !collection.questChanges.every(
      (change) => [47, 60].includes(change.questId) && change.state === "objectives-complete",
    ) ||
    exploration.questChanges.length !== 1 ||
    !mine.questChanges.some((change) => change.questId === 76 && change.state === "accepted") ||
    !candles.questChanges.some((change) => change.questId === 61 && change.state === "accepted")
  )
    return null;
  for (const [action, expected] of [
    [dust, ["47:rewarded:0"]],
    [mine, ["62:rewarded:0", "76:accepted:0"]],
    [candles, ["60:rewarded:0", "61:accepted:0"]],
  ] as const) {
    const ids = new Set(expected.map((key) => Number(key.split(":")[0])));
    const found = action.questChanges.filter((change) => ids.has(change.questId)).map(phaseKey);
    if (found.length !== expected.length || found.some((key, index) => key !== expected[index]))
      return null;
  }
  const pickupIndex = plan.actions.indexOf(pickup);
  if (
    selected.some((action) => plan.actions.indexOf(action) <= pickupIndex) ||
    [47, 60, 62].some(
      (questId) =>
        !plan.actions
          .slice(0, pickupIndex)
          .some(
            (action) =>
              action.leaderOnly &&
              action.legId === pickup.legId &&
              action.questChanges.some(
                (change) => change.questId === questId && change.state === "accepted",
              ),
          ),
    )
  )
    return null;

  const moved: CampaignAction[] = [exploration, collection];
  const replacements = new Map<string, CampaignAction | null>();
  for (const [action, ids, suffix] of [
    [dust, [47], "dust-return"],
    [mine, [62, 76], "mine-return"],
    [candles, [60, 61], "candles-return"],
  ] as const) {
    const selectedIds = new Set<number>(ids);
    const all = action.questChanges.every((change) => selectedIds.has(change.questId));
    moved.push(all ? action : fragment(action, selectedIds, `${action.id}-${suffix}`));
    const remainder = action.questChanges.filter((change) => !selectedIds.has(change.questId));
    replacements.set(
      action.id,
      remainder.length
        ? fragment(action, new Set(remainder.map((change) => change.questId)), action.id)
        : null,
    );
  }
  replacements.set(collection.id, null);
  replacements.set(exploration.id, null);
  const gate = plan.actions.slice(0, pickupIndex).at(-1);
  const insertionId =
    gate?.kind === "xp-check" &&
    gate.pickupQuestId !== undefined &&
    pickup.questChanges.some((change) => change.questId === gate.pickupQuestId)
      ? gate.id
      : pickup.id;
  const actions = plan.actions.flatMap((action) => {
    if (action.id === insertionId) return [...moved, action];
    if (!replacements.has(action.id)) return [action];
    const replacement = replacements.get(action.id);
    return replacement ? [replacement] : [];
  });
  const before = plan.actions.flatMap((action) => action.questChanges.map(phaseKey)).sort();
  const after = actions.flatMap((action) => action.questChanges.map(phaseKey)).sort();
  if (before.length !== after.length || before.some((key, index) => key !== after[index]))
    throw new Error("Starter mine circuit changed its selected quest phases.");
  // Native lowering must retain the same canonical phases when a source NPC visit is split.
  const lowered = campaignNativeInstructions({ ...plan, actions }, sources);
  if (
    moved.some((action) => {
      const value = lowered(action);
      return (
        !value ||
        value.directives.filter((directive) => phaseTags.has(directive.tag)).length !==
          action.questChanges.length
      );
    })
  )
    return null;
  return {
    ...plan,
    actions,
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
    })),
  };
}
