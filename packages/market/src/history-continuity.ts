export interface MarketHistoryLink {
  readonly fromBuild: number;
  readonly toBuild: number;
  readonly notBefore: Date;
}

/** Links are already restricted to one product, region, realm and Auction House. */
export function resolveMarketHistoryBuilds(
  targetBuild: number,
  cutoff: Date,
  links: readonly MarketHistoryLink[],
): ReadonlyMap<number, Date> {
  if (
    !Number.isSafeInteger(targetBuild) ||
    targetBuild <= 0 ||
    !Number.isFinite(cutoff.getTime())
  ) {
    throw new RangeError("Invalid market history scope");
  }
  for (const link of links) {
    if (
      !Number.isSafeInteger(link.fromBuild) ||
      link.fromBuild <= 0 ||
      !Number.isSafeInteger(link.toBuild) ||
      link.toBuild <= link.fromBuild ||
      !Number.isFinite(link.notBefore.getTime())
    ) {
      throw new RangeError("History links must advance builds and have a valid cutoff");
    }
  }
  const builds = new Map<number, Date>([[targetBuild, new Date(cutoff)]]);
  const pending = [targetBuild];
  while (pending.length > 0) {
    const build = pending.pop()!;
    const minimum = builds.get(build)!.getTime();
    for (const link of links) {
      if (link.toBuild !== build) continue;
      const since = new Date(Math.max(minimum, link.notBefore.getTime()));
      const previous = builds.get(link.fromBuild);
      if (!previous || previous.getTime() > since.getTime()) {
        builds.set(link.fromBuild, since);
        pending.push(link.fromBuild);
        if (builds.size > 100) throw new RangeError("Market history exceeds 100 linked builds");
      }
    }
  }
  return builds;
}
