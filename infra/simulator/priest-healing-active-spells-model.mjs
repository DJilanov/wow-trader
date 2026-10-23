import assert from "node:assert/strict";

const families = new Map([
  ["Binding Heal", "binding-heal"],
  ["Prayer of Healing", "prayer-of-healing"],
  ["Prayer of Mending", "prayer-of-mending"],
  ["Penance", "penance"],
]);

/** Capture every class-trained candidate rank and its own effect, cost and targeting records.
 * @param {object} evidence
 * @returns {object}
 */
export function extractPriestActiveHealing(evidence) {
  assert.equal(evidence.schema, "kfc-class-spell-evidence.v1");
  assert.equal(evidence.className, "Priest");
  const { rawTables: t, lookupTables: l } = evidence,
    names = new Map(t.SpellName.map((row) => [row.id, row.Name_lang]));
  function row(table, id) {
    const found = t[table].filter((value) => value.SpellID === id);
    assert.equal(found.length, 1, `${table}:${id}`);
    return found[0];
  }
  function effect(id, index) {
    const found = t.SpellEffect.filter(
      (value) => value.SpellID === id && value.EffectIndex === index,
    );
    assert.equal(found.length, 1, `effect:${id}:${index}`);
    return found[0];
  }
  function duration(id) {
    const misc = row("SpellMisc", id),
      found = l.SpellDuration.filter((value) => value.id === misc.DurationIndex);
    assert.equal(found.length, 1);
    assert.equal(found[0].Duration, found[0].MaxDuration);
    assert.equal(found[0].DurationPerResource, 0);
    return found[0].Duration;
  }
  function radius(id, index) {
    const selected = effect(id, index).EffectRadiusIndex.filter((value) => value > 0);
    assert(selected.length > 0);
    const values = selected.map((value) => l.SpellRadius.find((entry) => entry.id === value));
    assert(
      values.every(
        (value) => value && value.RadiusPerLevel === 0 && value.Radius === value.RadiusMax,
      ),
    );
    assert(values.every((value) => value.Radius === values[0].Radius));
    return values[0].Radius;
  }
  function payload(id, index) {
    const e = effect(id, index),
      level = row("SpellLevels", id);
    assert.equal(e.Effect, 10, `Expected direct healing: ${id}:${index}`);
    assert.equal(e.EffectPointsPerResource, 0);
    assert.equal(e.BonusCoefficientFromAP, 0);
    assert.equal(e.ScalingClass, 0);
    return {
      base: e.EffectBasePointsF,
      variance: e.Variance,
      coefficient: e.EffectBonusCoefficient,
      pointsPerLevel: e.EffectRealPointsPerLevel,
      baseLevel: level.BaseLevel,
      maxLevel: level.MaxLevel,
    };
  }
  const ranks = [];
  const ids = new Set(
    evidence.rootAbilityRows
      .filter((value) => value.AcquireMethod === 0 && families.has(names.get(value.Spell)))
      .map((value) => value.Spell),
  );
  for (const id of ids) {
    const family = families.get(names.get(id)),
      spell = t.Spell.find((value) => value.id === id),
      rank = Number(/^Rank ([1-9][0-9]*)$/.exec(spell?.NameSubtext_lang)?.[1]);
    assert(Number.isSafeInteger(rank));
    const power = row("SpellPower", id),
      misc = row("SpellMisc", id),
      level = row("SpellLevels", id),
      cooldown = row("SpellCooldowns", id);
    assert.equal(power.PowerType, 0);
    for (const field of [
      "ManaCostPerLevel",
      "ManaPerSecond",
      "PowerCostPct",
      "PowerCostMaxPct",
      "OptionalCostPct",
      "PowerPctPerSecond",
      "RequiredAuraSpellID",
      "OptionalCost",
    ])
      assert.equal(power[field], 0, `${id}:${field}`);
    assert.equal(cooldown.RecoveryTime, 0);
    assert.equal(cooldown.AuraSpellID, 0);
    const cast = l.SpellCastTimes.find((value) => value.id === misc.CastingTimeIndex),
      range = l.SpellRange.find((value) => value.id === misc.RangeIndex);
    assert(cast && cast.Base === cast.Minimum);
    assert(range && range.RangeMin[1] === 0 && range.RangeMax[1] > 0);
    assert(
      !t.SpellScaling.some((value) => value.SpellID === id),
      `Unimplemented scaling row: ${id}`,
    );
    const record = {
      id,
      family,
      rank,
      requiredLevel: level.SpellLevel,
      mana: power.ManaCost,
      castMs: cast.Base,
      gcdMs: cooldown.StartRecoveryTime,
      cooldownMs: cooldown.CategoryRecoveryTime,
      range: range.RangeMax[1],
      travelSpeed: misc.Speed,
      launchDelay: misc.LaunchDelay,
      radius: 0,
      excludedTargetAura: 0,
      excludeCaster: (misc.Attributes[1] & 0x80000) !== 0,
      payloadId: id,
      secondary: null,
      channelPeriodMs: 0,
      channelDurationMs: 0,
      charges: 0,
    };
    if (family === "penance") {
      const children = [
        ...new Set(evidence.references.filter((link) => link.from === id).map((link) => link.to)),
      ].filter((child) =>
        t.SpellEffect.some((value) => value.SpellID === child && value.Effect === 10),
      );
      assert.equal(children.length, 1, `Penance healing child: ${id}`);
      record.payloadId = children[0];
      const channels = [
        ...new Set(
          evidence.references
            .filter((link) => link.from === record.payloadId)
            .map((link) => link.to),
        ),
      ].filter((child) =>
        t.SpellEffect.some(
          (value) =>
            value.SpellID === child && value.EffectAura === 23 && value.EffectAuraPeriod > 0,
        ),
      );
      assert.equal(channels.length, 1, `Penance channel helper: ${id}`);
      const periods = t.SpellEffect.filter(
        (value) => value.SpellID === channels[0] && value.EffectAuraPeriod > 0,
      );
      assert.equal(periods.length, 1);
      record.channelPeriodMs = periods[0].EffectAuraPeriod;
      record.channelDurationMs = duration(channels[0]);
      assert.equal(record.channelDurationMs % record.channelPeriodMs, 0);
      Object.assign(record, payload(record.payloadId, 0));
    } else if (family === "prayer-of-mending") {
      const e = effect(id, 0),
        charges = effect(id, 1),
        links = t.SpellXDescriptionVariables.filter((value) => value.SpellID === id);
      assert.equal(e.Effect, 3);
      assert.equal(charges.Effect, 3);
      assert.equal(links.length, 1);
      const variables = l.SpellDescriptionVariables.find(
        (value) => value.id === links[0].SpellDescriptionVariablesID,
      );
      assert(variables);
      assert.equal(
        variables.Variables,
        "$twinD=$?s1225132[${$1225132m1/100+1)}][${1}]\r\n$spiritualH=$?s14898[${$14898m1/100+1)}][${1}]\r\n$mult=${$<twinD>*$<spiritualH>}",
      );
      Object.assign(record, {
        base: e.EffectBasePointsF,
        variance: e.Variance,
        coefficient: e.EffectBonusCoefficient,
        pointsPerLevel: e.EffectRealPointsPerLevel,
        baseLevel: level.BaseLevel,
        maxLevel: level.MaxLevel,
      });
      record.charges = charges.EffectBasePointsF;
      assert.equal(record.charges, row("SpellAuraOptions", 401877).CumulativeAura);
      record.radius = radius(401880, 0);
    } else {
      assert(
        !t.SpellXDescriptionVariables.some((value) => value.SpellID === id),
        `Unimplemented healing expression: ${id}`,
      );
      Object.assign(record, payload(id, 0));
      if (family === "binding-heal") {
        assert(record.excludeCaster);
        assert.deepEqual(effect(id, 0).ImplicitTarget, [21, 0]);
        assert.deepEqual(effect(id, 1).ImplicitTarget, [1, 0]);
        record.secondary = payload(id, 1);
      } else {
        record.radius = radius(id, 0);
        const restrictions = row("SpellAuraRestrictions", id);
        record.excludedTargetAura = restrictions.ExcludeTargetAuraSpell;
        assert.equal(restrictions.CasterAuraSpell, 0);
        assert.equal(restrictions.TargetAuraSpell, 0);
        assert.equal(restrictions.ExcludeCasterAuraSpell, 0);
      }
    }
    for (const [field, value] of Object.entries(record))
      if (typeof value === "number") assert(Number.isFinite(value) && value >= 0, `${id}.${field}`);
    ranks.push(record);
  }
  ranks.sort((a, b) => a.family.localeCompare(b.family) || a.rank - b.rank);
  for (const family of families.values()) {
    const selected = ranks.filter((value) => value.family === family);
    assert(selected.length > 0);
    selected.forEach((value, index) => assert.equal(value.rank, index + 1));
  }
  const reach = evidence.classTalents.filter(
    (value) => value.spellId === 27789 && value.layoutResolved,
  );
  assert.equal(reach.length, 1);
  const reachLinks = l.TraitDefinitionEffectPoints.filter(
    (value) => value.TraitDefinitionID === reach[0].definitionId && value.EffectIndex === 1,
  );
  assert.equal(reachLinks.length, 1);
  assert.equal(reachLinks[0].OperationType, 0);
  const reachPoints = l.CurvePoint.filter((value) => value.CurveID === reachLinks[0].CurveID).sort(
    (a, b) => a.Pos[0] - b.Pos[0],
  );
  assert.equal(reachPoints.length, reach[0].maxRanks);
  reachPoints.forEach((value, index) => assert.equal(value.Pos[0], index + 1));
  const reachEffect = effect(27789, 1);
  assert.equal(reachEffect.EffectAura, 108);
  assert.equal(reachEffect.EffectMiscValue[0], 6);
  for (const rank of ranks.filter((value) => value.family === "prayer-of-healing"))
    assert(
      row("SpellClassOptions", rank.id).SpellClassMask.some(
        (mask, index) => (mask & reachEffect.EffectSpellClassMask[index]) !== 0,
      ),
      "Holy Reach does not cover Prayer of Healing",
    );
  const metadata = ranks.map((value) => {
    const options = row("SpellClassOptions", value.id);
    assert.equal(options.SpellClassSet, 6);
    return {
      id: value.id,
      family: value.family,
      mask: options.SpellClassMask.map((mask) => mask >>> 0),
    };
  });
  return {
    schema: "kfc-priest-active-healing.v1",
    ranks,
    metadata,
    holyReach: [0, ...reachPoints.map((value) => value.Pos[1])],
    mendingAuraId: 401877,
    mendingDurationMs: duration(401877),
    mendingMaxCharges: row("SpellAuraOptions", 401877).CumulativeAura,
    assumptions: {
      friendlyPositions: "explicit-2d-static-benchmark-coordinates",
      partyPetsIncluded: true,
      mendingTotalTriggers: "five-from-aura-stack-cap",
      mendingBounce: "lowest-health-fraction-then-unit-index",
      mendingHealTrigger: "nonperiodic-raw-positive-heal",
      mendingDamageTrigger: "post-absorption-positive-damage",
      mendingApplication: "friendly-distance-travel-with-old-aura-removed-on-cast",
      mendingFormula: "(base+coefficient*healing-power)*(1+twin/100)*(1+spiritual/100)",
      bindingThreatMultiplier: 0.5,
    },
    trainingVerified: false,
    serverMechanicsVerified: false,
    modelAdmission: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Render active healing over the preserved talent component.
 * @param {{priest:string,healingAgent:string,implementation:string,evidence:object}} input
 * @returns {{priest:string,healingAgent:string,implementation:string}}
 */
export function renderPriestActiveHealingSources(input) {
  function replace(source, before, after) {
    assert.equal(source.split(before).length, 2, "Active healing source anchor changed: " + before);
    return source.replace(before, after);
  }
  assert(!input.priest.includes("registerKFCActiveHealing()"));
  const data = extractPriestActiveHealing(input.evidence);
  let priest = replace(
    input.priest,
    "\tpriest.registerPenanceSpell()",
    "\tif !priest.KFCHealingMode { priest.registerPenanceSpell() }",
  );
  priest = replace(
    priest,
    "\tpriest.registerKFCBaselineHealing()",
    "\tpriest.registerKFCBaselineHealing()\n\tpriest.registerKFCActiveHealing()",
  );
  priest = replace(
    priest,
    "\tProcPrayerOfMending core.ApplySpellResults",
    "\tProcPrayerOfMending core.ApplySpellResults\n\tKFCHealingMode bool\n\tKFCPositions map[int32]KFCFriendlyPosition\n\tKFCBindingHeal []*core.Spell\n\tKFCMending []*core.Spell\n\tKFCMendingAuras core.AuraArray\n\tKFCMendingRemaining int\n\tKFCMendingTarget *core.Unit\n\tKFCMendingHeal *core.Spell\n\tKFCMendingRank *kfcActiveHealingRank\n\tKFCMendingBusy bool\n\tKFCMendingSerial uint64",
  );
  const healingAgent = replace(
    input.healingAgent,
    "\thpriest.Priest.Initialize()",
    "\thpriest.Priest.KFCHealingMode = true\n\thpriest.Priest.Initialize()",
  );
  function rankFields(rank, id = rank.id) {
    return `ID:${id},Family:${JSON.stringify(rank.family)},Rank:${rank.rank},RequiredLevel:${rank.requiredLevel},BaseLevel:${rank.baseLevel},MaxLevel:${rank.maxLevel},Base:${rank.base},Variance:${rank.variance},PointsPerLevel:${rank.pointsPerLevel},Coefficient:${rank.coefficient},Mana:${rank.mana},CastMs:${rank.castMs},GCDMs:${rank.gcdMs},CooldownMs:${rank.cooldownMs}`;
  }
  const rows = data.ranks.map(
    (rank) =>
      `{Data:kfcHealingRank{${rankFields(rank)}},Secondary:kfcHealingRank{${rankFields({ ...rank, ...(rank.secondary ?? {}) })}},PayloadID:${rank.payloadId},Range:${rank.range},Radius:${rank.radius},TravelSpeed:${rank.travelSpeed},LaunchDelay:${rank.launchDelay},ExcludedTargetAura:${rank.excludedTargetAura},ExcludeCaster:${rank.excludeCaster},ChannelPeriodMs:${rank.channelPeriodMs},ChannelDurationMs:${rank.channelDurationMs},Charges:${rank.charges}}`,
  );
  const metadata = data.metadata.map(
    (value) =>
      `kfcClientHealingSpells[${value.id}]=kfcHealingSpellMetadata{Family:${JSON.stringify(value.family)},Mask:[4]uint32{${value.mask.join(",")}}}`,
  );
  const generated = `var kfcActiveHealingRanks=[]kfcActiveHealingRank{\n${rows.join(",\n")},\n}\nvar kfcHolyReachRadius=[]float64{${data.holyReach.join(",")}}\nconst kfcMendingAuraID = ${data.mendingAuraId}\nconst kfcMendingDurationMs = ${data.mendingDurationMs}\nconst kfcMendingMaxCharges = ${data.mendingMaxCharges}\nfunc init(){\n${metadata.join("\n")}\n}`;
  return {
    priest,
    healingAgent,
    implementation: replace(input.implementation, "// KFC_CLIENT_ACTIVE_HEALING", generated),
  };
}
