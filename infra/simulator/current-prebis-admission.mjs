import assert from "node:assert/strict";
import { classicPreRaidEvidence, classicReferenceSha256 } from "./classic-acquisition.mjs";

const reviewedIds = [
  7718, 7722, 9401, 9408, 9426, 9431, 10769, 10770, 10776, 11310, 13107, 16671, 16681, 16685, 16702,
  16710, 16714, 16716, 16717, 16723, 16724, 16736, 22879, 23258, 23298, 23313,
];
const pvpAccess = new Map([
  [22879, { faction: 2, name: "Horde", vendor: 12792, setId: 0 }],
  [23258, { faction: 2, name: "Horde", vendor: 12792, setId: 0 }],
  [23298, { faction: 1, name: "Alliance", vendor: 12777, setId: 548 }],
  [23313, { faction: 1, name: "Alliance", vendor: 12777, setId: 548 }],
]);
const partialSetIds = new Set([183, 184, 185, 187, 188, 189]);
const reviewedSetIds = new Set([181, 182, 183, 184, 185, 186, 187, 188, 189, 548]);

export function mergeCurrentPrebisRecovery(equipment, review, normalized) {
  assert.equal(review.schema, "kfc-current-prebis-review.v1");
  assert.equal(review.status, "reviewed-stationary-model-historical-acquisition");
  assert.equal(review.clientVersion, "1.60.1.70425");
  assert.equal(review.historicalDatabaseBytesSha256, classicReferenceSha256);
  assert.deepEqual(
    review.candidates.map((candidate) => candidate.item.id),
    reviewedIds,
    "Reviewed recovery IDs changed",
  );
  assert.deepEqual(
    normalized.candidates,
    review.candidates,
    "Current values or metadata differ from the reviewed recovery",
  );
  assert.deepEqual(normalized.blocked, review.blocked, "Unresolved recovery gates changed");
  assert.deepEqual(
    review.blocked.map((candidate) => candidate.id),
    [9394, 9419, 18760],
  );
  const merged = globalThis.structuredClone(equipment);
  const existing = new Map(merged.items.map((item) => [item.id, item]));
  assert.equal(existing.size, merged.items.length, "Duplicate existing equipment identity");
  const currentItems = [];
  let addedCount = 0;
  for (const candidate of review.candidates) {
    const item = globalThis.structuredClone(candidate.item);
    const metadata = candidate.currentMetadata;
    const evidence = classicPreRaidEvidence(
      { ...item, sources: candidate.historicalSources ?? [] },
      candidate.historicalAcquisition.presets ?? [],
    );
    assert(evidence.allowed, `Unreviewed recovery acquisition ${item.id}`);
    assert.deepEqual(
      evidence,
      candidate.historicalAcquisition,
      `Recovery acquisition changed ${item.id}`,
    );
    const notes = [
      "Current-client stats and wearer metadata. Historical non-raid acquisition remains provisional; Forever drops/vendor availability are not confirmed.",
    ];
    if (item.setId) {
      assert(reviewedSetIds.has(item.setId), `Unreviewed recovery set ${item.setId}`);
      notes.push(
        "Set utility and health regeneration may be unmodeled in stationary damage scenarios.",
      );
      if (partialSetIds.has(item.setId))
        notes.push(
          "The five-piece proc is not modeled; the conservative engine excludes its contribution.",
        );
      if (item.setId === 548)
        notes.push("The four-piece Gouge cooldown reduction is not simulated.");
    }
    const effects = candidate.effectReviews ?? [];
    if (effects.length) {
      assert.equal(item.id, 10776, "Unreviewed recovery item effect");
      assert.equal(effects.length, 1);
      assert.equal(effects[0].status, "passive-utility-not-modeled");
      notes.push(
        "Root/snare-duration reduction is not simulated; no damage bonus is assigned to it.",
      );
    }
    const access = pvpAccess.get(item.id);
    if (access) {
      assert.equal(metadata.classMask, 8);
      assert.deepEqual(item.classAllowlist, [6]);
      assert.equal(metadata.setId, access.setId);
      assert.equal(item.setId ?? 0, access.setId);
      assert.deepEqual(
        candidate.historicalSources.map((source) => source.soldBy?.npcId),
        [access.vendor],
      );
      // This is source availability in the explicit historical-access model,
      // not a claim that the current client has a faction wearer flag.
      item.factionRestriction = access.faction;
      notes.push(
        `Historical PvP access is modeled as ${access.name}-only. Current race masks remain unrestricted; server access is unverified. Stored PvP rank indices are not displayed rank requirements.`,
      );
    }
    const sources = access
      ? [{ kind: "pvp", faction: access.name }]
      : evidence.kind === "dungeon"
        ? evidence.zoneIds.map((zoneId) => ({ kind: "dungeon", zoneId }))
        : [{ kind: "classic-pre-raid" }];
    if (existing.has(item.id)) {
      assert.deepEqual(
        existing.get(item.id),
        item,
        `Refusing to overwrite existing item ${item.id}`,
      );
    } else {
      merged.items.push(item);
      existing.set(item.id, item);
      addedCount++;
    }
    currentItems.push({
      id: item.id,
      name: item.name,
      requiredLevel: metadata.requiredLevel,
      maxCount: metadata.maxCount,
      uniqueEquipped: metadata.uniqueEquipped,
      limitCategory: metadata.limitCategory,
      raceMasks: metadata.raceMasks,
      requiredSkill: 0,
      requiredAbility: 0,
      requiredPvpRankRaw: metadata.requiredPvpRank,
      setId: metadata.setId,
      status: "current-client-historical-acquisition",
      statsProvenance: "current-client",
      acquisitionProvenance: "historical-provisional",
      sources,
      acquisition: candidate.historicalAcquisition,
      effectReviews: effects,
      note: notes.join(" "),
    });
  }
  return { equipment: merged, currentItems: globalThis.structuredClone(currentItems), addedCount };
}
