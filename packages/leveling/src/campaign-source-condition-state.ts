import type { ImportedDirective } from "./guide-archive.js";
import type { PremadeMember } from "./premade-model.js";

type QuestState = PremadeMember["questStates"][string];
export type CampaignSourceQuestStates = Readonly<
  Record<string, QuestState | readonly QuestState[]>
>;
export type CampaignSourceDecision = "execute" | "skip" | "unknown";

export interface CampaignSourceSkip {
  readonly actionId: string;
  readonly decision: "skip" | "unknown";
}

export interface CampaignSourceConditionContext {
  readonly questStates: CampaignSourceQuestStates;
  readonly itemCounts?: ReadonlyMap<number, number>;
  readonly itemLowerBounds?: ReadonlyMap<number, number>;
  readonly moneyCopper?: number;
}

function any(results: readonly CampaignSourceDecision[]): CampaignSourceDecision {
  return results.includes("execute") ? "execute" : results.includes("unknown") ? "unknown" : "skip";
}

function invert(result: CampaignSourceDecision): CampaignSourceDecision {
  return result === "unknown" ? result : result === "execute" ? "skip" : "execute";
}

function stateResult(
  states: CampaignSourceQuestStates,
  id: number,
  predicate: (state: QuestState) => boolean,
): CampaignSourceDecision {
  const state = states[String(id)] ?? "not-started";
  const possibilities = typeof state === "string" ? [state] : state;
  if (!possibilities.length) return "unknown";
  const results = possibilities.map(predicate);
  return results.every(Boolean) ? "execute" : results.some(Boolean) ? "unknown" : "skip";
}

function evaluate(
  check: ImportedDirective,
  context: CampaignSourceConditionContext,
): CampaignSourceDecision {
  if (check.tag === ".money") {
    const match = /^([<>])(\d+(?:\.\d+)?)$/.exec(check.arguments.trim());
    if (
      !match ||
      context.moneyCopper === undefined ||
      !Number.isSafeInteger(context.moneyCopper) ||
      context.moneyCopper < 0
    )
      return "unknown";
    // RXP completes the step when this comparison succeeds, including equality for >.
    const threshold = Number(match[2]) * 10000;
    return (match[1] === ">" ? context.moneyCopper >= threshold : context.moneyCopper < threshold)
      ? "skip"
      : "execute";
  }
  if (check.tag === ".itemcount") {
    const [expression, amount, flags, ...extra] = check.arguments.split(",");
    const ids = expression?.match(/\d+/g)?.map(Number) ?? [];
    const match = /^([<>]?)(=?)(\d+)$/.exec((amount ?? "").replace(/\s/g, ""));
    if (
      !ids.length ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      !match ||
      flags ||
      extra.length ||
      (!context.itemCounts && !context.itemLowerBounds)
    )
      return "unknown";
    let count = 0;
    for (const id of ids) {
      const value = context.itemCounts
        ? context.itemCounts.get(id)
        : (context.itemLowerBounds!.get(id) ?? 0);
      if (value === undefined || !Number.isSafeInteger(value) || value < 0) return "unknown";
      count += value;
    }
    const total = Number(match[3]);
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(count)) return "unknown";
    if (!context.itemCounts) {
      // A minimum holding proves monotone thresholds, never equality or an empty bag.
      const operator = `${match[1]}${match[2]}` || ">=";
      if (operator === ">=" || operator === ">")
        return (operator === ">=" ? count >= total : count > total) ? "execute" : "unknown";
      if (operator === "<") return count >= total ? "skip" : "unknown";
      return count > total ? "skip" : "unknown";
    }
    const satisfied =
      (match[2] === "=" && count === total) ||
      (match[1] === "<"
        ? count < total
        : match[1] === ">"
          ? count > total
          : match[2] !== "=" && count >= total);
    return satisfied ? "execute" : "skip";
  }
  const args = check.arguments.split(",").map((value) => value.trim());
  if (!args.length || args.some((value) => !/^[1-9]\d*$/.test(value))) return "unknown";
  const ids = args.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id))) return "unknown";
  const active = (state: QuestState): boolean =>
    state === "accepted" || state === "objectives-complete";
  const states = context.questStates;
  switch (check.tag) {
    case ".isOnQuest":
      return any(ids.map((id) => stateResult(states, id, active)));
    case ".isNotOnQuest":
      return invert(any(ids.map((id) => stateResult(states, id, active))));
    case ".isQuestTurnedIn":
      return any(ids.map((id) => stateResult(states, id, (state) => state === "rewarded")));
    case ".isQuestAvailable":
      return any(ids.map((id) => stateResult(states, id, (state) => state !== "rewarded")));
    case ".isQuestComplete":
    case ".isQuestNotComplete": {
      if (ids.length !== 1) return "unknown";
      const result = stateResult(states, ids[0]!, (state) => state === "objectives-complete");
      return check.tag === ".isQuestComplete" ? result : invert(result);
    }
    default:
      return "unknown";
  }
}

/** Unrecorded resources stay unknown; one proven skip dominates other unknown controls. */
export function evaluateCampaignSourceChecks(
  checks: readonly ImportedDirective[],
  context: CampaignSourceConditionContext,
): CampaignSourceDecision {
  let unknown = false;
  for (const check of checks) {
    const result = evaluate(check, context);
    if (result === "skip") return "skip";
    if (result === "unknown") unknown = true;
  }
  return unknown ? "unknown" : "execute";
}
