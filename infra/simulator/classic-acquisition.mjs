export const classicReferenceRevision = "7779ebbf79dc7f1341e6ab939b28a3402c9a730a";
export const classicReferenceSha256 =
  "07a0691b49e618794e480bc68ca25a35011a5d6a9b5f2da0cee94740d49c55ce";
const dungeons = new Set([
  209, 491, 717, 718, 719, 721, 722, 796, 1176, 1337, 1477, 1581, 1583, 1584, 2017, 2057, 2100,
  2437, 2557,
]);
const raids = new Set([1977, 2159, 2677, 2717, 3428, 3429, 3456]);
const raidBosses = new Set([6109, 12397, 14887, 14888, 14889, 14890]);
const raidReputations = new Set([749, 910, 270]);

export function classicPreRaidEvidence(item, presetPaths = []) {
  if (
    !Number.isInteger(item.id) ||
    item.id <= 0 ||
    item.id > 40000 ||
    !Number.isInteger(item.type) ||
    item.type < 1 ||
    item.type > 14 ||
    item.ilvl < 40 ||
    (item.expansion && item.expansion !== 1) ||
    item.effectItemId ||
    item.randomSuffixOptions?.length
  )
    return { allowed: false, reason: "unsupported-version-type-or-unresolved-variant" };
  const sources = item.sources || [];
  if (
    sources.some(
      (source) =>
        raids.has(source.drop?.zoneId) ||
        raidBosses.has(source.drop?.npcId) ||
        raids.has(source.soldBy?.zoneId) ||
        raidReputations.has(source.rep?.repFactionId),
    )
  )
    return { allowed: false, reason: "raid-derived" };
  const drops = sources.filter((source) => dungeons.has(source.drop?.zoneId));
  if (drops.length)
    return {
      allowed: true,
      kind: "dungeon",
      zoneIds: [...new Set(drops.map((source) => source.drop.zoneId))].sort((a, b) => a - b),
      evidence:
        "Pinned Classic dungeon acquisition; Forever source and availability remain unverified.",
    };
  // These are explicit upstream pre-raid profiles, not a phase/quality heuristic.
  if (presetPaths.length)
    return {
      allowed: true,
      kind: "classic-pre-raid",
      presets: [...new Set(presetPaths)].sort(),
      evidence:
        "Explicit pinned Classic pre-raid preset. Historical acquisition only; Forever availability unverified.",
    };
  return { allowed: false, reason: "no-reviewed-nonraid-acquisition" };
}
