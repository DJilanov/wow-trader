import type { Talent, TalentClass, TalentTree } from "./schemas.js";

export interface TalentRankText {
  readonly text: string | null;
  readonly evidence:
    "demo_transcribed" | "source_complete_unverified" | "derived_estimate" | "unknown";
}

export type TalentAllocation = Readonly<Record<string, number>>;

export interface AllocationSummary {
  readonly available: number;
  readonly spent: number;
  readonly remaining: number;
  readonly requiredLevel: number;
  readonly treePoints: readonly number[];
}

export function slugifyForeverName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createTalentKey(className: string, treeName: string, talentName: string): string {
  return [className, treeName, talentName].map(slugifyForeverName).join(":");
}

export function getTalentRankText(talent: Talent, rank: number): TalentRankText {
  if (rank < 1 || rank > talent.max) return { text: null, evidence: "unknown" };
  const text = Array.isArray(talent.desc)
    ? (talent.desc[rank - 1] ?? null)
    : (talent.desc[String(rank)] ?? null);
  if (text && talent.confirmed?.includes(rank)) return { text, evidence: "demo_transcribed" };
  const estimate = talent.est?.[String(rank)];
  if (estimate) return { text: estimate, evidence: "derived_estimate" };
  return text
    ? { text, evidence: "source_complete_unverified" }
    : { text: null, evidence: "unknown" };
}

export function summarizeAllocation(
  classData: TalentClass,
  className: string,
  level: number,
  allocation: TalentAllocation,
): AllocationSummary {
  const available = Math.max(0, Math.min(60, Math.floor(level)) - 9);
  const treePoints = classData.trees.map((tree) => pointsInTree(tree, className, allocation));
  const spent = treePoints.reduce((total, points) => total + points, 0);
  return {
    available,
    spent,
    remaining: available - spent,
    requiredLevel: spent === 0 ? 10 : spent + 9,
    treePoints,
  };
}

export function getAddBlockReason(
  classData: TalentClass,
  className: string,
  treeIndex: number,
  talent: Talent,
  level: number,
  allocation: TalentAllocation,
): string | null {
  const tree = classData.trees[treeIndex];
  if (!tree) return "Talent tree is unavailable";
  const key = createTalentKey(className, tree.name, talent.name);
  const current = allocation[key] ?? 0;
  if (current >= talent.max) return "Maximum rank learned";
  if (summarizeAllocation(classData, className, level, allocation).remaining <= 0) {
    return "No unspent talent points";
  }

  const earlierPoints = tree.talents.reduce((total, candidate) => {
    if (candidate.row >= talent.row) return total;
    const candidateKey = createTalentKey(className, tree.name, candidate.name);
    return total + (allocation[candidateKey] ?? 0);
  }, 0);
  const requiredEarlierPoints = (talent.row - 1) * 5;
  if (earlierPoints < requiredEarlierPoints) {
    return `Requires ${requiredEarlierPoints} points in ${tree.name}`;
  }

  if (talent.req) {
    const prerequisite = tree.talents.find(({ name }) => name === talent.req);
    if (!prerequisite) return `Missing prerequisite data for ${talent.req}`;
    const prerequisiteKey = createTalentKey(className, tree.name, prerequisite.name);
    if ((allocation[prerequisiteKey] ?? 0) < prerequisite.max) {
      return `Requires ${prerequisite.name} at maximum rank`;
    }
  }

  return null;
}

export function canRemoveTalentRank(
  classData: TalentClass,
  className: string,
  treeIndex: number,
  talent: Talent,
  level: number,
  allocation: TalentAllocation,
): boolean {
  const tree = classData.trees[treeIndex];
  if (!tree) return false;
  const key = createTalentKey(className, tree.name, talent.name);
  const current = allocation[key] ?? 0;
  if (current <= 0) return false;
  const candidate = { ...allocation, [key]: current - 1 };
  return isAllocationValid(classData, className, level, candidate);
}

export function isAllocationValid(
  classData: TalentClass,
  className: string,
  level: number,
  allocation: TalentAllocation,
): boolean {
  const summary = summarizeAllocation(classData, className, level, allocation);
  if (summary.remaining < 0) return false;

  for (const tree of classData.trees) {
    for (const talent of tree.talents) {
      const key = createTalentKey(className, tree.name, talent.name);
      const rank = allocation[key] ?? 0;
      if (!Number.isInteger(rank) || rank < 0 || rank > talent.max) return false;
      if (rank === 0) continue;

      const earlierPoints = tree.talents.reduce((total, candidate) => {
        if (candidate.row >= talent.row) return total;
        return total + (allocation[createTalentKey(className, tree.name, candidate.name)] ?? 0);
      }, 0);
      if (earlierPoints < (talent.row - 1) * 5) return false;

      if (talent.req) {
        const prerequisite = tree.talents.find(({ name }) => name === talent.req);
        if (!prerequisite) return false;
        const prerequisiteRank =
          allocation[createTalentKey(className, tree.name, prerequisite.name)] ?? 0;
        if (prerequisiteRank < prerequisite.max) return false;
      }
    }
  }
  return true;
}

export function pointsInTree(
  tree: TalentTree,
  className: string,
  allocation: TalentAllocation,
): number {
  return tree.talents.reduce(
    (total, talent) =>
      total + (allocation[createTalentKey(className, tree.name, talent.name)] ?? 0),
    0,
  );
}
