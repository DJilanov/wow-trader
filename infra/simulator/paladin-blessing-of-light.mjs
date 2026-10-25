import assert from "node:assert/strict";

/** @param {object} evidence @returns {object} */
export function extractPaladinBlessingOfLight(evidence) {
  assert.equal(evidence.schema, "kfc-paladin-blessing-of-light-source.v1");
  assert.equal(evidence.className, "Paladin");
  assert.equal(evidence.classMask, 2);
  const ids = [19977, 19978, 19979, 25890];
  const expected = [
    [40, 210, 60],
    [50, 300, 85],
    [60, 400, 115],
    [60, 400, 115],
  ];
  for (const name of ["Spell", "SpellName", "SpellLevels", "SpellMisc", "SpellClassOptions"])
    assert.deepEqual(
      evidence.tables[name].map((row) => row.SpellID ?? row.id).sort((a, b) => a - b),
      ids,
    );
  assert.equal(evidence.tables.SpellEffect.length, 8);
  const ranks = ids.map((spellId, index) => {
    const effects = evidence.tables.SpellEffect.filter((row) => row.SpellID === spellId).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
    const level = evidence.tables.SpellLevels.find((row) => row.SpellID === spellId);
    const misc = evidence.tables.SpellMisc.find((row) => row.SpellID === spellId);
    const duration = evidence.durations.find((row) => row.id === misc.DurationIndex);
    const options = evidence.tables.SpellClassOptions.find((row) => row.SpellID === spellId);
    const name = evidence.tables.SpellName.find((row) => row.id === spellId).Name_lang;
    assert.equal(name, spellId === 25890 ? "Greater Blessing of Light" : "Blessing of Light");
    assert.equal(options.SpellClassSet, 10);
    assert.equal(level.SpellLevel, expected[index][0]);
    assert.equal(effects.length, 2);
    effects.forEach((row, effectIndex) => {
      assert.equal(row.EffectIndex, effectIndex);
      assert.equal(row.DifficultyID, 0);
      assert.equal(row.Effect, 6);
      assert.equal(row.EffectAura, 4);
      assert.equal(row.EffectBasePointsF, expected[index][effectIndex + 1]);
      assert.equal(row.EffectBonusCoefficient, 0);
      assert.equal(row.EffectTriggerSpell, 0);
      assert.equal(row.EffectRealPointsPerLevel, 0);
      assert.deepEqual(row.ImplicitTarget, [spellId === 25890 ? 153 : 21, 0]);
    });
    assert.equal(duration.Duration, 3600000);
    assert.equal(duration.MaxDuration, duration.Duration);
    assert.equal(duration.DurationPerResource, 0);
    return {
      spellId,
      requiredLevel: level.SpellLevel,
      holyLight: effects[0].EffectBasePointsF,
      flashOfLight: effects[1].EffectBasePointsF,
      durationMs: duration.Duration,
    };
  });
  assert.equal(evidence.healingRanks.length, 15);
  assert.equal(new Set(evidence.healingRanks.map((row) => row.spellId)).size, 15);
  const healingRanks = evidence.healingRanks.map((row) => {
    assert(Number.isSafeInteger(row.spellId) && row.spellId > 0);
    assert(["Holy Light", "Flash of Light"].includes(row.name));
    return {
      spellId: row.spellId,
      family: row.name === "Holy Light" ? "holy-light" : "flash-of-light",
    };
  });
  assert.equal(healingRanks.filter((row) => row.family === "holy-light").length, 9);
  return {
    schema: "kfc-paladin-blessing-of-light.v1",
    sourceBuild: evidence.source.build.buildNumber,
    ranks,
    healingRanks,
    scope:
      "explicit external pre-pull player assignments; no automatic class expansion or extra provider assumptions",
    scalingCases: ["full-tooltip-reference", "coefficient-factor"],
    multiplierCases: ["before-healing-light", "after-healing-light"],
    serverMechanicsVerified: false,
    classMechanicsAdmission: false,
    startsNewClassClock: false,
    publicationAllowed: false,
  };
}

/** @param {{implementation:string,blessing:object}} input @returns {string} */
export function renderPaladinBlessingOfLight({ implementation, blessing }) {
  assert.equal(blessing.schema, "kfc-paladin-blessing-of-light.v1");
  assert.equal(implementation.split("// KFC_PALADIN_BLESSING_OF_LIGHT_VALUES").length, 2);
  const ranks = blessing.ranks
    .map(
      (row) =>
        `${row.spellId}:{${row.requiredLevel},${row.holyLight},${row.flashOfLight},${row.durationMs}}`,
    )
    .join(",");
  const families = blessing.healingRanks
    .map((row) => `${row.spellId}:${row.family === "holy-light" ? 0 : 1}`)
    .join(",");
  return implementation.replace(
    "// KFC_PALADIN_BLESSING_OF_LIGHT_VALUES",
    `var kfcPaladinBlessingOfLightRanks = map[int32]kfcPaladinBlessingOfLightRank{${ranks}}\nvar kfcPaladinBlessingOfLightFamilies = map[int32]int{${families}}`,
  );
}

/** Integrate only the owned basic heal payloads and the declared workload boundary.
 * @param {{baseline:string,workload:string}} source @returns {{baseline:string,workload:string}}
 */
export function integratePaladinBlessingOfLight(source) {
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  let baseline = once(
    source.baseline,
    "KFCIlluminationMetrics *core.ResourceMetrics",
    "KFCIlluminationMetrics *core.ResourceMetrics; KFCBlessingOfLight *kfcPaladinBlessingOfLightState",
  );
  baseline = once(
    baseline,
    "spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), spell.OutcomeHealingCrit)",
    "spell.CalcAndDealHealing(sim, target, sim.Roll(low, high)+holy.kfcBlessingOfLightBonus(sim, target, spell), spell.OutcomeHealingCrit)",
  );
  let workload = once(
    source.workload,
    "type KFCPaladinHealingWorkload struct {",
    'type KFCPaladinHealingWorkload struct {\n\tBlessingOfLight *KFCPaladinBlessingOfLightPolicy `json:"blessingOfLight,omitempty"`',
  );
  workload = once(
    workload,
    "type KFCPaladinHealingWorkloadResult struct {",
    'type KFCPaladinHealingWorkloadResult struct {\n\tBlessingOfLight *KFCPaladinBlessingOfLightPolicy `json:"blessingOfLight,omitempty"`',
  );
  workload = once(
    workload,
    "\tplayer.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}",
    '\tfor _, party := range request.Raid.Parties {\n\t\tif party.Buffs != nil && party.Buffs.ManaTideTotems != 0 { return nil, fmt.Errorf("external Mana Tide needs a separately declared resource policy") }\n\t}\n\tplayer.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}',
  );
  workload = once(
    workload,
    "\ttotalDamage := 0.0",
    "\tif frame.BlessingOfLight != nil {\n\t\tif err = healer.ConfigureKFCPaladinBlessingOfLight(*frame.BlessingOfLight); err != nil { return nil, err }\n\t}\n\ttotalDamage := 0.0",
  );
  workload = once(
    workload,
    "VigilRefundMode: frame.VigilRefundMode}",
    "VigilRefundMode: frame.VigilRefundMode, BlessingOfLight: frame.BlessingOfLight}",
  );
  return { baseline, workload };
}
