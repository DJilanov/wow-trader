import assert from "node:assert/strict";
import { reviewShamanSharedEquipmentSource } from "./shaman-shared-equipment-source.mjs";

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, label);
  return found[0];
}

/** Review the exact current Elements thresholds and power proc, without server claims.
 * @param {object} evidence @param {object} extension @returns {object}
 */
export function extractShamanElementsSource(evidence, extension) {
  reviewShamanSharedEquipmentSource(evidence);
  assert.equal(extension.schema, "kfc-shaman-shared-equipment-text-extension.v1");
  assert.equal(extension.parentCapturedRowsPreserved, true);
  assert.equal(extension.fullItemEffectAdmission, false);
  const set = one(evidence.tables.ItemSet, (row) => row.id === 187, "Elements set");
  assert.equal(set.Name_lang, "The Elements");
  assert.deepEqual(
    set.ItemID.filter(Boolean).sort((a, b) => a - b),
    [16666, 16667, 16668, 16669, 16670, 16671, 16672, 16673],
  );
  assert.deepEqual(
    evidence.tables.ItemSetSpell.filter((row) => row.ItemSetID === 187)
      .map((row) => [row.Threshold, row.SpellID])
      .sort((a, b) => a[0] - b[0]),
    [
      [2, 18679],
      [3, 9346],
      [4, 1302718],
      [5, 450626],
      [6, 18378],
    ],
  );
  const effects = (id) =>
    extension.tables.SpellEffect.filter((row) => row.SpellID === id).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
  const signature = (id) =>
    effects(id).map((row) => [
      row.EffectIndex,
      row.Effect,
      row.EffectAura,
      row.EffectBasePointsF,
      row.EffectTriggerSpell,
      row.EffectMiscValue,
      row.EffectSpellClassMask,
      row.EffectBonusCoefficient,
    ]);
  assert.deepEqual(signature(18679), [[0, 6, 22, 8, 0, [126, 0], [0, 0, 0, 0], 0]]);
  assert.deepEqual(signature(9346), [
    [0, 6, 13, 18, 0, [126, 0], [0, 0, 0, 0], 0],
    [1, 6, 135, 18, 0, [126, 0], [0, 0, 0, 0], 1],
  ]);
  assert.deepEqual(signature(18378), [[0, 6, 85, 8, 0, [0, 0], [0, 0, 0, 0], 0]]);
  assert.deepEqual(signature(450626), [[0, 6, 42, 0, 27775, [0, 0], [0, 0, 0, 0], 0]]);
  assert.deepEqual(signature(27775), [
    [0, 6, 13, 65, 0, [126, 0], [0, 0, 0, 0], 0],
    [1, 6, 135, 65, 0, [126, 0], [0, 0, 0, 0], 1],
  ]);
  assert.deepEqual(signature(27499), signature(27775));
  for (const id of [18679, 9346, 18378, 450626, 27775, 27499])
    for (const row of effects(id)) {
      for (const key of [
        "DifficultyID",
        "EffectAmplitude",
        "EffectAttributes",
        "EffectAuraPeriod",
        "EffectChainTargets",
        "EffectItemType",
        "EffectMechanic",
        "EffectPointsPerResource",
        "EffectPos_facing",
        "EffectRealPointsPerLevel",
        "BonusCoefficientFromAP",
        "Coefficient",
        "Variance",
        "ResourceCoefficient",
        "ScalingClass",
        "Node__Field_12_0_0_63534_001",
      ])
        assert.equal(row[key], 0, "Unreviewed Elements payload " + key);
      for (const key of ["EffectChainAmplitude", "PvpMultiplier", "GroupSizeBasePointsCoefficient"])
        assert.equal(row[key], 1);
      assert.deepEqual(row.ImplicitTarget, [1, 0]);
      assert.deepEqual(row.EffectRadiusIndex, [0, 0]);
    }
  const proc = one(
    extension.tables.SpellAuraOptions,
    (row) => row.SpellID === 450626,
    "Elements proc conditions",
  );
  assert.deepEqual(
    [
      proc.DifficultyID,
      proc.CumulativeAura,
      proc.ProcCategoryRecovery,
      proc.ProcChance,
      proc.ProcCharges,
      proc.SpellProcsPerMinuteID,
      proc.ProcTypeMask,
    ],
    [0, 0, 0, 100, 0, 0, [81924, 0]],
  );
  const misc = one(
      extension.tables.SpellMisc,
      (row) => row.SpellID === 27775,
      "Elements proc duration",
    ),
    duration = one(
      extension.lookups.SpellDuration,
      (row) => row.id === misc.DurationIndex,
      "Elements duration lookup",
    );
  assert.deepEqual(
    [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
    [10000, 10000, 0],
  );
  const family = one(
    extension.tables.SpellClassOptions,
    (row) => row.SpellID === 450626,
    "Reused proc root family",
  );
  assert.deepEqual(
    [family.SpellClassSet, family.ModalNextSpell, family.SpellClassMask],
    [10, 0, [0, 0, 0, 0]],
  );
  const disarm = one(
    extension.tables.SpellAuraOptions,
    (row) => row.SpellID === 1302718,
    "Elements disarm",
  );
  assert.deepEqual(
    [disarm.ProcChance, disarm.ProcCategoryRecovery, disarm.ProcTypeMask],
    [5, 60000, [40, 0]],
  );
  return {
    schema: "kfc-shaman-elements-source-review.v1",
    sourceBuild: 70532,
    setId: 187,
    itemIds: set.ItemID.filter(Boolean).sort((a, b) => a - b),
    flatThresholds: [
      { pieces: 2, channel: "all-resistances", amount: 8 },
      { pieces: 3, channel: "spell-damage-and-healing", amount: 18 },
      { pieces: 6, channel: "mp5", amount: 8 },
    ],
    proc: {
      pieces: 5,
      spellId: 450626,
      buffId: 27775,
      power: 65,
      durationMs: 10000,
      clientProcChance: 1,
      rawConditions: structuredClone(proc),
      rawRootFamily: structuredClone(family),
      healingCoefficientField: 1,
    },
    disarm: {
      pieces: 4,
      spellId: 1302718,
      classification: "inactive-in-declared-post-mitigation-assignment",
      reason: "The workload has no incoming melee hit dispatch or attacker to disarm.",
    },
    serverProcRateVerified: false,
    procRoutingVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    publicationAllowed: false,
  };
}

function once(source, before, after) {
  assert.equal(source.split(before).length, 2, "Elements integration anchor: " + before);
  return source.replace(before, after);
}

/** Add the five-piece proc beside existing exact-ID flat bonuses for the owned healer.
 * @param {{implementation:string,actor:string,coreSets:string,evidence:object,extension:object}} input
 * @returns {{implementation:string,actor:string,coreSets:string,rules:object}}
 */
export function renderShamanElements(input) {
  assert(!input.actor.includes("kfcElements"));
  assert(!input.coreSets.includes("KFCShamanAdditionalHealingSetBonuses"));
  const rules = extractShamanElementsSource(input.evidence, input.extension),
    values = `const kfcShamanElementsSetID int32 = ${rules.setId}
const kfcShamanElementsProcID int32 = ${rules.proc.spellId}
const kfcShamanElementsBuffID int32 = ${rules.proc.buffId}
const kfcShamanElementsPower = ${rules.proc.power}
const kfcShamanElementsDurationMs = ${rules.proc.durationMs}
const kfcShamanElementsClientChance = ${rules.proc.clientProcChance}
var kfcShamanElementsOwnedIDs = map[int32]bool{${input.evidence.ownedActions.map((row) => row.id + ":true").join(",")}}
`;
  const implementation = once(input.implementation, "// KFC_SHAMAN_ELEMENTS_VALUES", values),
    actor = once(
      input.actor,
      "type RestorationShaman struct {",
      "type RestorationShaman struct {\n\tkfcElements *kfcShamanElementsState",
    );
  const coreSets = once(
    input.coreSets,
    "setItemCount := make(map[*ItemSet]int32)",
    "\tif forever {\n\t\tif provider,ok:=character.Env.Raid.GetPlayerFromUnit(&character.Unit).(interface{KFCShamanAdditionalHealingSetBonuses() []ActiveSetBonus});ok { activeBonuses=append(activeBonuses,provider.KFCShamanAdditionalHealingSetBonuses()...) }\n\t}\n\tsetItemCount := make(map[*ItemSet]int32)",
  );
  return { implementation, actor, coreSets, rules };
}
