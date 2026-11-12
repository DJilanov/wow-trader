import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignLibraryQuest } from "./campaign-library.js";
import type { CombatDataset, CombatQuestReference } from "./combat-model.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";
import reviewed from "./campaign-reviewed-duskwood-handoffs.json" with { type: "json" };
import reviewedArathi from "./campaign-reviewed-arathi-handoffs.json" with { type: "json" };

type HandoffReview = typeof reviewed | typeof reviewedArathi;

const proofs = new Map<number, {
  readonly review: HandoffReview;
  readonly proof: HandoffReview["proofs"][number];
}>();
for (const review of [reviewed, reviewedArathi])
  for (const proof of review.proofs) proofs.set(proof.quest.questId, { review, proof });

export interface ReviewedHandoffRequirements {
  readonly prerequisiteIds: readonly number[];
  readonly freshQuestIds: readonly number[];
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalized(entry)]),
    );
  return value;
}

function same(first: unknown, second: unknown): boolean {
  return JSON.stringify(normalized(first)) === JSON.stringify(normalized(second));
}

/** Resolve only reviewed wording; callers must still prove the complete physical handoff. */
export function reviewedHandoffRequirements(
  plan: Pick<CampaignPlan, "targetBuild" | "sourceArchiveSha256">,
  provider: CombatDataset["provider"],
  program: CampaignLibraryQuest,
  quest: QuestCatalogEntry,
  reference: CombatQuestReference | undefined,
): ReviewedHandoffRequirements | null {
  const record = proofs.get(quest.questId);
  if (!record) return null;
  const { review, proof } = record;
  if (
    !reference ||
    plan.targetBuild !== review.targetBuild ||
    plan.sourceArchiveSha256 !== review.sourceArchiveSha256 ||
    provider.revision !== review.provider.revision ||
    provider.questSha256 !== review.provider.questSha256 ||
    provider.npcSha256 !== review.provider.npcSha256 ||
    provider.itemSha256 !== review.provider.itemSha256 ||
    provider.objectSha256 !== review.provider.objectSha256 ||
    !same(quest, proof.quest) ||
    !same(reference, proof.reference) ||
    program.questId !== quest.questId ||
    !program.complete ||
    program.held ||
    program.objective !== "delivery" ||
    program.actions.length !== 2
  )
    return null;
  const phases = ["accepted", "rewarded"] as const;
  for (const [index, expected] of [proof.pickup, proof.handIn].entries()) {
    const action = program.actions[index];
    if (
      !action ||
      action.kind !== "quests" ||
      action.leaderOnly ||
      action.raidOnly ||
      action.dungeonFinishOnly ||
      action.questChanges.length !== 1 ||
      action.questChanges[0]!.questId !== quest.questId ||
      action.questChanges[0]!.state !== phases[index] ||
      !same(action.source, expected.source) ||
      !same(
        action.positions.map((row) => row.position),
        expected.positions,
      )
    )
      return null;
  }
  return { prerequisiteIds: proof.sourcePrerequisites, freshQuestIds: proof.requiresFreshQuestIds };
}

/** Replace reviewed guidance only at its exact captured interaction. */
export function reviewedHandoffInstruction(action: CampaignAction, instruction: string): string {
  const change = action.questChanges[0];
  if (
    action.questChanges.length !== 1 ||
    (change?.state !== "accepted" && change?.state !== "rewarded")
  ) return instruction;
  const proof = proofs.get(change.questId)?.proof;
  const phase = change.state === "accepted" ? proof?.pickup : proof?.handIn;
  if (
    !proof ||
    !phase ||
    !same(action.source, phase.source) ||
    !same(
      action.positions.map((row) => row.position),
      phase.positions,
    )
  )
    return instruction;
  return (
    proof.instructionReplacements.find((replacement) => replacement.from === instruction)?.to ??
    instruction
  );
}
