import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignNativeInstructions } from "./campaign-addon-native.js";
import { campaignZoneId, campaignZoneInText } from "./campaign-geography.js";

const westfallPhases = [
  {
    id: "start-116-116-source-step-0228",
    phases: [
      [184, "rewarded"],
      [36, "accepted"],
    ],
  },
  { id: "start-116-116-source-step-0232", phases: [[36, "rewarded"]] },
  { id: "start-116-116-source-step-0237", phases: [[109, "rewarded"]] },
] as const;
// Flight-master display markers may accompany transit; unlock and training commands remain barriers.
const transferTags = new Set([".goto", ".waypoint", ".line", ".zone", ".fly", ".hs", ".target"]);

function pureTransfer(
  action: CampaignAction,
  zone: string,
  native: CampaignNativeInstructions,
): boolean {
  if (
    !action.leaderOnly ||
    action.legId !== "start-116" ||
    action.questChanges.length ||
    action.itemCollections?.length ||
    action.source?.conditions
  )
    return false;
  const directives = native(action)?.directives ?? [];
  const transfer = directives.find((directive) => [".zone", ".fly", ".hs"].includes(directive.tag));
  const destination =
    action.movement?.destination ??
    (transfer
      ? (campaignZoneId(transfer.arguments.split(",")[0]!) ?? campaignZoneInText(transfer.text))
      : null);
  return destination === zone && directives.every((directive) => transferTags.has(directive.tag));
}

/** Consolidate the reviewed first Westfall tasks; a redirected terminal flight is not an existing visit. */
export function starterWestfallActions(
  plan: CampaignPlan,
  couriers: readonly CampaignAction[],
  native: CampaignNativeInstructions,
): { readonly actions: readonly CampaignAction[]; readonly retired: CampaignAction } | null {
  const transfer = plan.actions.find((action) => action.id === "start-116-116-source-step-0227");
  const cityReturn = plan.actions.find((action) => action.id === "start-116-116-source-step-0242");
  if (
    !transfer ||
    !cityReturn ||
    !pureTransfer(transfer, "1436", native) ||
    !pureTransfer(cityReturn, "1453", native)
  )
    return null;
  const extra: CampaignAction[] = [cityReturn];
  for (const expected of westfallPhases) {
    const action = plan.actions.find((entry) => entry.id === expected.id);
    if (
      !action ||
      action.itemCollections?.length ||
      action.questChanges.length !== expected.phases.length ||
      action.questChanges.some(
        (change, index) =>
          change.questId !== expected.phases[index]![0] ||
          change.state !== expected.phases[index]![1] ||
          change.objectiveIndex !== null,
      )
    )
      return null;
    extra.push(action);
  }
  // A newly imported ingredient collection needs its own visit/loot review before rescheduling.
  if (
    plan.actions.some((action) => action.itemCollections?.some((target) => target.questId === 36))
  )
    return null;
  const militia = plan.actions.filter(
    (action) =>
      action.leaderOnly &&
      action.legId === "start-116" &&
      action.questChanges.some((change) => change.questId === 12),
  );
  if (
    militia.some(
      (action) =>
        action.source !== null ||
        action.libraryQuestId !== 12 ||
        action.libraryObjective !== "shared-kills" ||
        !action.fundingCheckpointId ||
        !action.xpOptional ||
        action.libraryRequired ||
        action.libraryBackbone ||
        action.questChanges.some((change) => change.questId !== 12),
    )
  )
    return null;
  const militiaPhases = militia.flatMap((action) => action.questChanges);
  if (
    militia.length &&
    (militiaPhases.filter((change) => change.state === "accepted").length !== 1 ||
      militiaPhases.filter((change) => change.state === "rewarded").length !== 1 ||
      militiaPhases[0]?.state !== "accepted" ||
      militiaPhases.at(-1)?.state !== "rewarded")
  )
    return null;
  extra.push(...militia);
  const ids = new Set([...couriers, ...extra].map((action) => action.id));
  if (
    plan.actions.some(
      (action) =>
        action.legId === "start-116" &&
        action.location?.zone === "1436" &&
        !ids.has(action.id) &&
        action !== transfer,
    )
  )
    return null;
  return { actions: plan.actions.filter((action) => ids.has(action.id)), retired: transfer };
}
