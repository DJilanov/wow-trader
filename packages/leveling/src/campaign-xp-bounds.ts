import type { CombatKillEstimate, CombatXpPosition } from "./combat-xp.js";
import { advanceCombatPosition } from "./combat-xp.js";
import { estimatePartyCreatureKills, type PartyCreatureKillInput } from "./combat-party-xp.js";
import {
  advancePartyXpKills,
  createPartyXpFrontier,
  partyXpFrontierBounds,
} from "./combat-party-frontier.js";
import {
  advancePartyXpEnvelopeKills,
  awardPartyXpEnvelope,
  type PartyXpEnvelope,
} from "./combat-party-envelope.js";
import type { DungeonRewardEstimate } from "./dungeon-xp.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

export interface CampaignXpBounds {
  readonly minimum: CombatXpPosition;
  readonly maximum: CombatXpPosition;
}

export interface CampaignXpBoundsTransition {
  readonly before: CampaignXpBounds;
  readonly after: CampaignXpBounds | null;
  readonly maximumQuestXp: number | null;
  readonly maximumCombatXp: number | null;
}

export function campaignXpBoundsTransition(input: {
  readonly before: CombatXpPosition;
  readonly maximumBefore: CombatXpPosition | null;
  readonly after: CombatXpPosition;
  readonly maximumAfter: CombatXpPosition | null;
  readonly maximumQuestXp: number | null;
  readonly maximumCombatXp: number | null;
  readonly minimumXp: number;
}): CampaignXpBoundsTransition | undefined {
  if (!input.maximumBefore) return undefined;
  if (
    compare(input.before, input.maximumBefore) === 0 &&
    input.maximumAfter &&
    compare(input.after, input.maximumAfter) === 0 &&
    input.minimumXp === (input.maximumQuestXp ?? 0) + (input.maximumCombatXp ?? 0)
  )
    return undefined;
  return {
    before: { minimum: input.before, maximum: input.maximumBefore },
    after: input.maximumAfter ? { minimum: input.after, maximum: input.maximumAfter } : null,
    maximumQuestXp: input.maximumQuestXp,
    maximumCombatXp: input.maximumCombatXp,
  };
}

function total(position: CombatXpPosition): number {
  return (
    position.currentXp +
    Array.from(
      { length: position.level - 1 },
      (_value, index) => FOREVER_XP_CURVE[index + 1]!,
    ).reduce((sum, xp) => sum + xp, 0)
  );
}

/** Conservation of interval contributions is weaker than proof of an attainable XP trajectory. */
export function campaignXpBoundsConserved(input: {
  readonly before: CampaignXpBounds;
  readonly after: CampaignXpBounds;
  readonly minimumXp: number;
  readonly maximumXp: number;
}): boolean {
  validate(input.before);
  validate(input.after);
  const cap = total({ level: 60, currentXp: 0 });
  if (
    !Number.isSafeInteger(input.minimumXp) ||
    !Number.isSafeInteger(input.maximumXp) ||
    input.minimumXp < 0 ||
    input.maximumXp < input.minimumXp
  )
    return false;
  if (!input.maximumXp)
    return (
      compare(input.before.minimum, input.after.minimum) === 0 &&
      compare(input.before.maximum, input.after.maximum) === 0
    );
  return (
    total(input.after.minimum) >= Math.min(cap, total(input.before.minimum) + input.minimumXp) &&
    total(input.after.maximum) <= Math.min(cap, total(input.before.maximum) + input.maximumXp)
  );
}

export interface BoundedCombatKillEstimate extends CombatKillEstimate {
  readonly maximumExit: CombatXpPosition | null;
}

function compare(left: CombatXpPosition, right: CombatXpPosition): number {
  return left.level - right.level || left.currentXp - right.currentXp;
}

function validate(bounds: CampaignXpBounds): void {
  advanceCombatPosition(bounds.minimum, 0);
  advanceCombatPosition(bounds.maximum, 0);
  if (compare(bounds.minimum, bounds.maximum) > 0) throw new Error("Reversed campaign XP bounds.");
}

/** Each interval encloses the party. Its minimum corner is never treated as a joint outcome. */
export function estimateBoundedPartyKills(
  input: Omit<PartyCreatureKillInput, "positions"> & {
    readonly positions: readonly CampaignXpBounds[];
  },
): readonly BoundedCombatKillEstimate[] {
  const { positions, ...batch } = input;
  if (!positions.length || positions.length > 5)
    throw new Error("Bounded combat requires one to five participants.");
  positions.forEach(validate);
  const exact = positions.every((bounds) => compare(bounds.minimum, bounds.maximum) === 0);
  if (exact) {
    const initial = positions.map((bounds) => bounds.minimum);
    const simple = estimatePartyCreatureKills({ ...batch, positions: initial });
    if (
      input.npc.minimumLevel === input.npc.maximumLevel &&
      simple.every((estimate) => estimate.xp !== null && estimate.xp === estimate.maximumXp)
    )
      return simple.map((estimate) => ({ ...estimate, maximumExit: estimate.exit }));
    const joint = advancePartyXpKills(createPartyXpFrontier(initial), batch, {
      maximumStates: 512,
      maximumTransitions: 25000,
    });
    if (joint.status === "bounded") {
      const bounds = partyXpFrontierBounds(joint.frontier);
      return bounds.map((bound, player) => ({
        xp: bound.minimumXp,
        maximumXp: bound.maximumXp,
        exit: bound.minimumExit,
        maximumExit: bound.maximumExit,
        basis: joint.frontier.combatBasis[player]!,
        reason: null,
        observedSources: joint.frontier.observedSources[player]!,
      }));
    }
  }
  const envelope: PartyXpEnvelope = {
    domain: "conservative-box",
    members: positions.map((bounds) => ({
      minimumXp: 0,
      maximumXp: 0,
      minimumExit: bounds.minimum,
      maximumExit: bounds.maximum,
    })),
    combatBasis: positions.map(() => "excluded"),
    observedSources: positions.map(() => []),
  };
  const result = advancePartyXpEnvelopeKills(envelope, batch);
  if (result.status === "unknown")
    return positions.map((bounds) => ({
      xp: null,
      maximumXp: null,
      exit: bounds.minimum,
      maximumExit: null,
      basis: "unknown",
      reason: result.reason,
    }));
  return result.envelope.members.map((bounds, player) => ({
    xp: bounds.minimumXp,
    maximumXp: bounds.maximumXp,
    exit: bounds.minimumExit,
    maximumExit: bounds.maximumExit,
    basis: result.envelope.combatBasis[player]!,
    reason: null,
    observedSources: result.envelope.observedSources[player]!,
  }));
}

/** Award only after the caller has proved eligibility; unknown rewards never become zero. */
export function resolveBoundedQuestReward(
  bounds: CampaignXpBounds,
  resolve: (level: number) => DungeonRewardEstimate,
): DungeonRewardEstimate & {
  readonly maximumXp: number | null;
  readonly exitBounds: CampaignXpBounds | null;
} {
  validate(bounds);
  const rewards = Array.from(
    { length: bounds.maximum.level - bounds.minimum.level + 1 },
    (_value, index) => resolve(bounds.minimum.level + index),
  );
  if (rewards.some((reward) => reward.xp === null))
    return {
      xp: null,
      maximumXp: null,
      basis: "unknown",
      exitBounds: null,
      source: "A reachable hand-in level has no reward evidence.",
    };
  if (rewards.some((reward) => !Number.isSafeInteger(reward.xp) || reward.xp! < 0))
    throw new Error("Invalid bounded quest reward.");
  const awarded = awardPartyXpEnvelope(
    {
      domain: "conservative-box",
      members: [
        { minimumXp: 0, maximumXp: 0, minimumExit: bounds.minimum, maximumExit: bounds.maximum },
      ],
      combatBasis: ["excluded"],
      observedSources: [[]],
    },
    [new Map(rewards.map((reward, index) => [bounds.minimum.level + index, reward.xp]))],
  );
  if (awarded.status !== "bounded") throw new Error("Validated reward could not be enclosed.");
  return {
    xp: Math.min(...rewards.map((reward) => reward.xp!)),
    maximumXp: Math.max(...rewards.map((reward) => reward.xp!)),
    basis: rewards.some((reward) => reward.basis === "base-estimate")
      ? "base-estimate"
      : rewards[0]!.basis,
    source: [...new Set(rewards.map((reward) => reward.source))].join("; "),
    exitBounds: {
      minimum: awarded.envelope.members[0]!.minimumExit,
      maximum: awarded.envelope.members[0]!.maximumExit,
    },
  };
}
