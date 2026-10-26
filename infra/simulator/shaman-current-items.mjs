import assert from "node:assert/strict";

const corrections = [
  [
    1484,
    88,
    11,
    "ShadowPower",
    0,
    27,
    [
      [7, 6],
      [54, 8],
      [5, 5],
      [88, 27],
    ],
  ],
  [1936, 3, 1, "Agility", 2, 4, [[3, 4]]],
  [
    20070,
    50,
    40,
    "BonusArmor",
    40,
    30,
    [
      [7, 8],
      [32, 14],
      [50, 30],
    ],
  ],
  [
    20214,
    50,
    40,
    "BonusArmor",
    40,
    30,
    [
      [7, 8],
      [32, 14],
      [50, 30],
    ],
  ],
  [
    250616,
    3,
    1,
    "Agility",
    7,
    6,
    [
      [3, 6],
      [38, 16],
    ],
  ],
  [
    272603,
    47,
    16,
    "SpellPenetration",
    0,
    5,
    [
      [7, 36],
      [5, 20],
      [47, 5],
    ],
  ],
];

/** Review explicit current stat amendments without zeroing absent channels.
 * @param {object} evidence @returns {object}
 */
export function reviewShamanCurrentItemStats(evidence) {
  assert.equal(evidence.schema, "kfc-shaman-current-equipment-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.selectedRowsAreSourceSubsets, true);
  assert.equal(evidence.serverMechanicsVerified, false);
  assert.equal(evidence.numericalQualification, false);
  assert.equal(evidence.publicationAllowed, false);
  assert.deepEqual(
    evidence.changedIds,
    corrections.map((row) => row[0]),
  );
  const start = evidence.engineStats.indexOf("Strength Stat = iota"),
    end = evidence.engineStats.indexOf("\n\tLen", start);
  assert(start > 0 && end > start);
  const names = evidence.engineStats
    .slice(start, end)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[A-Z]\w*(?: Stat = iota)?$/.test(line))
    .map((line) => line.split(" ")[0]);
  assert.equal(names.length, 44);
  assert.equal(evidence.diagnostic.length, 6);
  return {
    schema: "kfc-shaman-current-stat-review.v1",
    sourceBuild: 70532,
    corrections: corrections.map(([id, statType, engineStat, name, before, after, signature]) => {
      assert.equal(names[engineStat], name, "Engine stat identity changed");
      assert(
        evidence.normalizer.includes(`${statType}: ${engineStat},`),
        "Current normalizer mapping changed",
      );
      const item = evidence.items.filter((row) => row.id === id),
        current = evidence.currentItems.filter((row) => row.itemId === id),
        raw = evidence.tables.ItemSparse.filter((row) => row.id === id);
      assert.equal(item.length, 1);
      assert.equal(current.length, 1);
      assert.equal(raw.length, 1);
      assert.equal(item[0].name, current[0].name);
      assert.equal(raw[0].Display_lang, current[0].name);
      assert.equal(item[0].stats.length, 44);
      assert(item[0].stats.every(Number.isFinite));
      assert.equal(item[0].stats[engineStat], before);
      assert.deepEqual(
        current[0].stats.map((row) => [row.statType, row.value]),
        signature,
        "Unreviewed current stat change",
      );
      assert.deepEqual(current[0].effectIds, []);
      assert.deepEqual(current[0].issues, []);
      assert.deepEqual(
        evidence.tables.ItemXItemEffect.filter((row) => row.ItemID === id),
        [],
      );
      const diagnostic = evidence.diagnostic.filter((row) => row.id === id);
      assert.equal(diagnostic.length, 1);
      assert.deepEqual(
        [
          diagnostic[0].statType,
          diagnostic[0].engineStat,
          diagnostic[0].engine,
          diagnostic[0].current,
        ],
        [statType, engineStat, before, after],
      );
      return { id, statType, engineStat, name, before, after };
    }),
    absentChannelsAssumedZero: false,
    acquisitionChanged: false,
    fullEquipmentAdmission: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Amend only the six reviewed stat cells; preserve all other items and acquisition.
 * @param {object} parent @param {object[]} parentSources @param {object} evidence
 * @returns {object}
 */
export function recoverShamanCurrentItems(parent, parentSources, evidence) {
  const review = reviewShamanCurrentItemStats(evidence),
    db = structuredClone(parent),
    sources = structuredClone(parentSources);
  const originals = new Map(evidence.items.map((item) => [item.id, item])),
    originalSources = new Map(evidence.sources.map((item) => [item.id, item]));
  assert.equal(new Set(parent.items.map((row) => row.id)).size, parent.items.length);
  assert.equal(new Set(parentSources.map((row) => row.id)).size, parentSources.length);
  const changes = [];
  for (const row of review.corrections) {
    const item = db.items.find((item) => item.id === row.id),
      source = sources.find((source) => source.id === row.id);
    assert(item && source, "Missing reviewed Shaman current item");
    assert.deepEqual(item, originals.get(row.id));
    assert.deepEqual(source, originalSources.get(row.id));
    const before = structuredClone(item);
    item.stats[row.engineStat] = row.after;
    source.statReview = {
      ...source.statReview,
      build: 70532,
      scope: "explicit current item modifiers",
      fields: [...new Set([...(source.statReview?.fields ?? []), "stats"])],
      historicalAcquisitionPreserved: true,
      currentModifierOverrides: [
        ...(source.statReview?.currentModifierOverrides ?? []),
        { statType: row.statType, before: row.before, after: row.after },
      ],
    };
    changes.push({ id: row.id, engineStat: row.engineStat, before, after: structuredClone(item) });
  }
  const changed = new Set(review.corrections.map((row) => row.id));
  for (let index = 0; index < parent.items.length; index++)
    if (!changed.has(parent.items[index].id))
      assert.deepEqual(db.items[index], parent.items[index]);
  for (let index = 0; index < parentSources.length; index++)
    if (!changed.has(parentSources[index].id))
      assert.deepEqual(sources[index], parentSources[index]);
  return {
    schema: "kfc-shaman-current-item-recovery.v1",
    db,
    sources,
    review,
    changes,
    addedIds: [],
    numericalReuseAllowed: false,
    fullEquipmentAdmission: false,
    publicationAllowed: false,
  };
}

/** Bind native regression rows to the reviewed catalog amendment.
 * @param {string} implementation @param {object} evidence @returns {string}
 */
export function renderShamanCurrentItemTests(implementation, evidence) {
  const review = reviewShamanCurrentItemStats(evidence),
    anchor = "// KFC_SHAMAN_CURRENT_ITEM_ROWS";
  assert.equal(implementation.split(anchor).length, 2);
  return implementation.replace(
    anchor,
    "var kfcShamanCurrentItemRows = []struct{id int32;stat stats.Stat;before,after float64}{\n" +
      review.corrections
        .map((row) => `{${row.id},stats.${row.name},${row.before},${row.after}},`)
        .join("\n") +
      "\n}",
  );
}
