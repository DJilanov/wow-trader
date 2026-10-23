import assert from "node:assert/strict";
import { extractPriestActiveHealing } from "./priest-healing-active-spells-model.mjs";

/** Extract Holy Nova's separate damage/heal ranks and Inner Focus's distinct masks.
 * @param {object} evidence
 * @returns {object}
 */
export function extractPriestHealingBenchmarkMechanics(evidence) {
  assert.equal(evidence.className, "Priest");
  const { rawTables: t, lookupTables: l } = evidence;
  function one(table, id) {
    const rows = t[table].filter((row) => row.SpellID === id);
    assert.equal(rows.length, 1, `${table}:${id}`);
    return rows[0];
  }
  function effect(id, index = 0) {
    const rows = t.SpellEffect.filter((row) => row.SpellID === id && row.EffectIndex === index);
    assert.equal(rows.length, 1);
    return rows[0];
  }
  function payload(id) {
    const e = effect(id),
      level = one("SpellLevels", id);
    assert(!t.SpellScaling.some((row) => row.SpellID === id));
    assert.equal(e.EffectPointsPerResource, 0);
    assert.equal(e.BonusCoefficientFromAP, 0);
    assert.equal(e.ScalingClass, 0);
    return {
      id,
      base: e.EffectBasePointsF,
      variance: e.Variance,
      coefficient: e.EffectBonusCoefficient,
      pointsPerLevel: e.EffectRealPointsPerLevel,
      requiredLevel: level.SpellLevel,
      baseLevel: level.BaseLevel,
      maxLevel: level.MaxLevel,
    };
  }
  function radius(id) {
    const ids = effect(id).EffectRadiusIndex.filter((value) => value > 0);
    assert(ids.length > 0);
    const rows = ids.map((value) => l.SpellRadius.find((row) => row.id === value));
    assert(rows.every((row) => row && row.RadiusPerLevel === 0 && row.Radius === row.RadiusMax));
    assert(rows.every((row) => row.Radius === rows[0].Radius));
    return rows[0].Radius;
  }
  const names = new Map(t.SpellName.map((row) => [row.id, row.Name_lang]));
  const roots = new Set(
    evidence.rootAbilityRows
      .filter(
        (row) =>
          row.AcquireMethod === 0 &&
          names.get(row.Spell) === "Holy Nova" &&
          t.SpellEffect.some((e) => e.SpellID === row.Spell && e.Effect === 2),
      )
      .map((row) => row.Spell),
  );
  const nova = [...roots]
    .map((id) => {
      const root = t.Spell.find((row) => row.id === id),
        rank = Number(/^Rank ([1-9][0-9]*)$/.exec(root.NameSubtext_lang)?.[1]);
      assert(Number.isSafeInteger(rank));
      const children = [
        ...new Set(evidence.references.filter((row) => row.from === id).map((row) => row.to)),
      ].filter((child) => t.SpellEffect.some((row) => row.SpellID === child && row.Effect === 10));
      assert.equal(children.length, 1);
      const cost = one("SpellPower", id),
        cooldown = one("SpellCooldowns", id);
      assert.equal(cost.PowerType, 0);
      assert.equal(cost.PowerCostPct, 0);
      assert.equal(cost.RequiredAuraSpellID, 0);
      for (const field of [
        "ManaCostPerLevel",
        "ManaPerSecond",
        "PowerCostMaxPct",
        "OptionalCostPct",
        "PowerPctPerSecond",
        "OptionalCost",
      ])
        assert.equal(cost[field], 0, `${id}:${field}`);
      assert.equal(cooldown.RecoveryTime, 0);
      assert.equal(cooldown.CategoryRecoveryTime, 0);
      assert.deepEqual(effect(children[0]).ImplicitTarget, [20, 0]);
      assert(root.Description_lang.includes("These effects cause no threat."));
      return {
        rank,
        damage: payload(id),
        healing: payload(children[0]),
        mana: cost.ManaCost,
        gcdMs: cooldown.StartRecoveryTime,
        damageRadius: radius(id),
        healingRadius: radius(children[0]),
      };
    })
    .sort((a, b) => a.rank - b.rank);
  assert.equal(nova.length, 6);
  nova.forEach((row, index) => assert.equal(row.rank, index + 1));
  const free = effect(14751, 0),
    crit = effect(14751, 1);
  assert.deepEqual([free.EffectAura, free.EffectMiscValue[0]], [108, 14]);
  assert.deepEqual([crit.EffectAura, crit.EffectMiscValue[0]], [107, 7]);
  const active = extractPriestActiveHealing(evidence);
  return {
    schema: "kfc-priest-healing-benchmark-mechanics.v1",
    nova,
    holyReach: active.holyReach,
    focus: {
      free: free.EffectBasePointsF,
      crit: crit.EffectBasePointsF,
      freeMask: free.EffectSpellClassMask.map((value) => value >>> 0),
      critMask: crit.EffectSpellClassMask.map((value) => value >>> 0),
      cooldownMs: one("SpellCooldowns", 14751).RecoveryTime,
    },
    masks: t.SpellClassOptions.filter((row) => row.SpellClassSet === 6).map((row) => ({
      id: row.SpellID,
      mask: row.SpellClassMask.map((value) => value >>> 0),
    })),
    channels: active.ranks
      .filter((row) => row.family === "penance")
      .map((row) => ({ parent: row.id, child: row.payloadId })),
    assumptions: {
      novaEnemyTargets: "single-boss-distance",
      incomingDamage: "explicit-post-mitigation-before-absorbs",
      healerDeath: "infeasible-no-spirit-form-recovery",
      focusChannel: "consume-on-parent-keep-crit-on-linked-bolts-until-channel-ends",
    },
    classMechanicsAdmission: false,
    workloadQualification: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Render an isolated healing benchmark component over its preserved predecessors.
 * @param {{priest:string,talents:string,healingAgent:string,implementation:string,evidence:object}} input
 * @returns {{priest:string,talents:string,healingAgent:string,implementation:string}}
 */
export function renderPriestHealingBenchmarkSources(input) {
  function replace(source, before, after) {
    assert.equal(
      source.split(before).length,
      2,
      "Healing benchmark source anchor changed: " + before,
    );
    return source.replace(before, after);
  }
  assert(!input.priest.includes("registerKFCBenchmarkHolyNova()"));
  const data = extractPriestHealingBenchmarkMechanics(input.evidence);
  let priest = replace(
    input.priest,
    "\tpriest.registerHolyNovaSpell()",
    "\tif !priest.KFCHealingMode { priest.registerHolyNovaSpell() }",
  );
  priest = replace(
    priest,
    "\tpriest.registerKFCActiveHealing()",
    "\tpriest.registerKFCActiveHealing()\n\tpriest.registerKFCBenchmarkHolyNova()",
  );
  priest = replace(
    priest,
    "\tProcPrayerOfMending core.ApplySpellResults",
    "\tProcPrayerOfMending core.ApplySpellResults\n\tKFCNova []*core.Spell\n\tKFCFocusChannelAura *core.Aura\n\tKFCFocusChannelChild *core.Spell",
  );
  priest = replace(
    priest,
    "func (priest *Priest) RegisterSpell(config core.SpellConfig) *core.Spell {",
    `func (priest *Priest) RegisterSpell(config core.SpellConfig) *core.Spell {
    if !config.Flags.Matches(core.SpellFlagPassiveSpell) {
      condition := config.ExtraCastCondition
      config.ExtraCastCondition = func(sim *core.Simulation,target *core.Unit) bool {
        return (!priest.KFCHealingMode || !priest.HasHealthBar() || priest.CurrentHealth()>0) && (condition==nil || condition(sim,target))
      }
      if config.ApplyEffects != nil {
        apply := config.ApplyEffects
        config.ApplyEffects = func(sim *core.Simulation,target *core.Unit,spell *core.Spell) {
          if priest.KFCHealingMode && priest.HasHealthBar() && priest.CurrentHealth()<=0 { return }
          apply(sim,target,spell)
        }
      }
    }`,
  );
  let talents = replace(
    input.talents,
    "func (priest *Priest) registerInnerFocus() {",
    "func (priest *Priest) registerInnerFocus() {\n\tif priest.KFCHealingMode { priest.registerKFCHealingInnerFocus(); return }",
  );
  for (const sign of ["-", "+"])
    talents = replace(
      talents,
      `if priest.HolyNova != nil {\n\t\t\t\tpriest.HolyNova.Cost.Multiplier ${sign}= 100\n\t\t\t}`,
      `priest.kfcChangeNovaCosts(${sign}100)`,
    );
  let healingAgent = replace(
    input.healingAgent,
    "\tbasePriest.PowerInfusionTarget =",
    "\tbasePriest.KFCHealingMode = true\n\tbasePriest.PowerInfusionTarget =",
  );
  healingAgent = replace(
    healingAgent,
    "\thpriest.Priest.KFCHealingMode = true",
    "\thpriest.Priest.KFCHealingMode = true\n\thpriest.Priest.RegisterKFCHealingDamageTracking()",
  );
  function fields(row) {
    return `ID:${row.id},RequiredLevel:${row.requiredLevel},BaseLevel:${row.baseLevel},MaxLevel:${row.maxLevel},Base:${row.base},Variance:${row.variance},Coefficient:${row.coefficient},PointsPerLevel:${row.pointsPerLevel}`;
  }
  const nova = data.nova.map(
    (row) =>
      `{Rank:${row.rank},Damage:kfcHealingRank{${fields(row.damage)}},Healing:kfcHealingRank{${fields(row.healing)}},Mana:${row.mana},GCDMs:${row.gcdMs},DamageRadius:${row.damageRadius},HealingRadius:${row.healingRadius}}`,
  );
  const generated = `var kfcNovaRanks=[]kfcNovaRank{\n${nova.join(",\n")},\n}\nvar kfcFocusFreeMask=[4]uint32{${data.focus.freeMask.join(",")}}\nvar kfcFocusCritMask=[4]uint32{${data.focus.critMask.join(",")}}\nconst kfcFocusFree = ${data.focus.free}\nconst kfcFocusCrit = ${data.focus.crit}\nconst kfcFocusCooldownMs = ${data.focus.cooldownMs}\nvar kfcPriestSpellMasks=map[int32][4]uint32{\n${data.masks.map((row) => `${row.id}:{${row.mask.join(",")}}`).join(",\n")},\n}\nvar kfcPenanceHealingChildren=map[int32]int32{${data.channels.map((row) => `${row.parent}:${row.child}`).join(",")}}`;
  return {
    priest,
    talents,
    healingAgent,
    implementation: replace(input.implementation, "// KFC_CLIENT_HEALING_BENCHMARK", generated),
  };
}
