import { campaignGroundJourney } from "./campaign-transport.js";

/** Order a small set of city returns by public-transport legs, including the next route destination. */
export function campaignHubOrder(
  from: string,
  destinations: readonly string[],
  exit: string | undefined,
): readonly string[] {
  const hubs = [...new Set(destinations)];
  if (hubs.length > 12)
    throw new Error("Dungeon return batch exceeds the twelve-hub planning budget.");
  const distance = new Map<string, number>();
  const cost = (left: string, right: string): number => {
    const key = `${left}:${right}`;
    let value = distance.get(key);
    if (value === undefined) {
      value = campaignGroundJourney(left, right)?.length ?? Infinity;
      distance.set(key, value);
    }
    return value;
  };
  const memo = new Map<string, { readonly cost: number; readonly order: readonly string[] }>();
  const visit = (
    current: string,
    remaining: number,
  ): { readonly cost: number; readonly order: readonly string[] } => {
    if (!remaining) return { cost: exit ? cost(current, exit) : 0, order: [] };
    const key = `${current}:${remaining}`;
    const cached = memo.get(key);
    if (cached) return cached;
    let best: { readonly cost: number; readonly order: readonly string[] } = {
      cost: Infinity,
      order: [],
    };
    for (const [index, hub] of hubs.entries()) {
      if (!(remaining & (1 << index))) continue;
      const tail = visit(hub, remaining & ~(1 << index));
      const total = cost(current, hub) + tail.cost;
      if (total < best.cost) best = { cost: total, order: [hub, ...tail.order] };
    }
    memo.set(key, best);
    return best;
  };
  return visit(from, (1 << hubs.length) - 1).order;
}
