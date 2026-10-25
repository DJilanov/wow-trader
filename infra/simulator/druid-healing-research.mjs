import assert from "node:assert/strict";
import { extractDruidHealingBaseline } from "./druid-healing-model.mjs";
import { extractDruidAdvancedHealing } from "./druid-healing-advanced.mjs";

/** Enumerate declared stress cases, not observed server formulas or a full Cartesian search.
 * @returns {ReadonlyArray<Readonly<object>>}
 */
export function druidHealingResearchPolicies() {
  const reference = {
    schema: "kfc-druid-healing-research.v1",
    id: "reference",
    fullScalingGap: 0,
    coefficientLossPerLevel: 0,
    classProcMode: "unchanged",
    omenProcChance: 0.2,
    omenEvents: "direct-heals",
    regrowthPeriodicCrits: true,
  };
  const policies = [reference];
  for (const gap of [12, 17, 22])
    for (const mode of ["unchanged", "coefficient-factor"])
      policies.push({
        ...reference,
        id: `gap-${gap}-procs-${mode}`,
        fullScalingGap: gap,
        coefficientLossPerLevel: 0.05,
        classProcMode: mode,
      });
  for (const chance of [0, 0.1, 0.3, 1])
    policies.push({ ...reference, id: `omen-${chance}`, omenProcChance: chance });
  policies.push({ ...reference, id: "omen-healing-casts", omenEvents: "healing-casts" });
  policies.push({ ...reference, id: "regrowth-no-periodic-crits", regrowthPeriodicCrits: false });
  policies.push({
    ...reference,
    id: "combined-mana-stress",
    fullScalingGap: 12,
    coefficientLossPerLevel: 0.05,
    classProcMode: "coefficient-factor",
    omenProcChance: 0,
    regrowthPeriodicCrits: false,
  });
  return Object.freeze(policies.map((policy) => Object.freeze(policy)));
}

/** Authenticate the current cost/charge/ICD data without asserting its server proc rate.
 * @param {object} client @param {object} omen @returns {object}
 */
export function extractDruidHealingResearch(client, omen) {
  assert.equal(omen.schema, "kfc-druid-omen-source.v1");
  assert.equal(omen.source.build.buildNumber, 70532);
  assert.equal(omen.procFrequencyVerified, false);
  assert.equal(omen.eligibleEventsVerified, false);
  const one = (table, id) => {
    const found = omen.tables[table].filter((row) => (row.SpellID ?? row.id) === id);
    assert.equal(found.length, 1);
    return found[0];
  };
  const proc = one("SpellAuraOptions", 16864),
    charge = one("SpellAuraOptions", 16870),
    effect = one("SpellEffect", 16870);
  assert.deepEqual(
    [proc.ProcChance, proc.ProcCategoryRecovery, proc.SpellProcsPerMinuteID, proc.ProcTypeMask],
    [100, 10000, 0, [81940, 0]],
  );
  assert.equal(charge.ProcCharges, 1);
  assert.equal(one("SpellLevels", 16864).SpellLevel, 20);
  assert.equal(one("SpellMisc", 16870).DurationIndex, 8);
  assert.equal(omen.tables.SpellDuration[0].Duration, 15000);
  assert.deepEqual(
    [effect.Effect, effect.EffectAura, effect.EffectMiscValue[0], effect.EffectBasePointsF],
    [6, 108, 14, -100],
  );
  const ranks = [
    ...extractDruidHealingBaseline(client).ranks,
    ...extractDruidAdvancedHealing(client).ranks,
  ];
  const eligible = [];
  for (const rank of ranks) {
    const options = client.rawTables.SpellClassOptions.filter((row) => row.SpellID === rank.id);
    assert.equal(options.length, 1);
    assert.equal(options[0].SpellClassSet, 7);
    if (
      options[0].SpellClassMask.some(
        (mask, index) => (mask & effect.EffectSpellClassMask[index]) !== 0,
      )
    )
      eligible.push(rank.id);
  }
  return {
    schema: "kfc-druid-healing-research-source.v1",
    ranks: ranks.map(({ id, requiredLevel }) => ({ id, requiredLevel })),
    omen: {
      clientProcChance: proc.ProcChance / 100,
      icdMs: proc.ProcCategoryRecovery,
      charge: 1,
      durationMs: 15000,
      eligibleSpellIds: eligible,
    },
    procFrequencyVerified: false,
    serverDownrankingVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

function once(source, before, after) {
  assert.equal(source.split(before).length, 2, before);
  return source.replace(before, after);
}

/** Derive sensitivity hooks without changing the frozen reference or other classes.
 * @param {{baseline:string,advanced:string,druid:string,omen:string,workload:string}} input
 * @param {object} rules @param {string} implementation @returns {Record<string,string>}
 */
export function renderDruidHealingResearch(input, rules, implementation) {
  assert.equal(rules.schema, "kfc-druid-healing-research-source.v1");
  let baseline = once(
    input.baseline,
    "familySpells map[string][]*core.Spell",
    "familySpells map[string][]*core.Spell\n\tresearch *kfcDruidHealingResearchState",
  );
  baseline = once(
    baseline,
    "part.Coefficient*dot.Spell.HealingPower(target)",
    "part.Coefficient*resto.kfcDruidRankFactor(rank.ID)*dot.Spell.HealingPower(target)",
  );
  baseline = once(
    baseline,
    "dot.CalcAndDealPeriodicSnapshotHealing(sim, target, dot.OutcomeTick)",
    "dot.CalcAndDealPeriodicSnapshotHealing(sim, target, resto.kfcDruidResearchTickOutcome(dot, rank.Family))",
  );
  let advanced = input.advanced;
  const periodic = "rank.Coefficient*dot.Spell.HealingPower(target)";
  assert.equal(advanced.split(periodic).length, 3);
  advanced = advanced.replaceAll(
    periodic,
    "rank.Coefficient*resto.kfcDruidRankFactor(rank.ID)*dot.Spell.HealingPower(target)",
  );
  advanced = once(
    advanced,
    'if result.DidCrit() && kfcDruidFamilies[spell.ActionID.SpellID] != "" {',
    'if result.DidCrit() && kfcDruidFamilies[spell.ActionID.SpellID] != "" && resto.kfcDruidResearchProc(sim, spell, "Nature Grace") {',
  );
  let druid = once(
    input.druid,
    "type Druid struct {",
    "type Druid struct {\n\tKFCHealingOmenProcChance func(*core.Spell) float64\n\tKFCHealingOmenCastTriggers bool",
  );
  let omen = once(
    input.omen,
    "omenChance := func(spell *core.Spell) float64 {",
    "omenChance := func(spell *core.Spell) float64 {\n\t\tif druid.KFCHealingOmenProcChance != nil && spell.ProcMask.Matches(core.ProcMaskSpellHealing) { return druid.KFCHealingOmenProcChance(spell) }",
  );
  const commentStart = omen.indexOf("\t// 16864 lists"),
    commentEnd = omen.indexOf("\ticd :=", commentStart);
  assert(commentStart > 0 && commentEnd > commentStart);
  omen =
    omen.slice(0, commentStart) +
    "\t// The inherited rate is provisional. Explicit healer research can vary it and its event eligibility.\n" +
    "\t// Client charge, duration and ICD are captured; the claimed historical event logs are not authenticated.\n" +
    omen.slice(commentEnd);
  omen = once(
    omen,
    "proc := func(sim *core.Simulation, spell *core.Spell, result *core.SpellResult)",
    "proc := func(sim *core.Simulation, spell *core.Spell, landed bool)",
  );
  omen = once(omen, "if !result.Landed() ||", "if !landed ||");
  assert.equal(omen.split("proc(sim, spell, result)").length, 3);
  omen = omen.replaceAll("proc(sim, spell, result)", "proc(sim, spell, result.Landed())");
  const healingCallback =
    "OnHealDealt: func(aura *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {\n\t\t\tproc(sim, spell, result.Landed())\n\t\t},";
  omen = once(
    omen,
    healingCallback,
    `OnHealDealt: func(aura *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
      if !druid.KFCHealingOmenCastTriggers { proc(sim, spell, result.Landed()) }
    },
    OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
      if druid.KFCHealingOmenCastTriggers && eligible[spell] && spell.ProcMask.Matches(core.ProcMaskSpellHealing) { proc(sim,spell,true) }
    },`,
  );
  let workload = once(
    input.workload,
    "type KFCDruidHealingWorkload struct {",
    'type KFCDruidHealingWorkload struct {\n\tResearch *KFCDruidHealingResearchPolicy `json:"research,omitempty"`',
  );
  workload = once(
    workload,
    "type KFCDruidHealingWorkloadResult struct {",
    'type KFCDruidHealingWorkloadResult struct {\n\tResearch *KFCDruidHealingResearchPolicy `json:"research,omitempty"`',
  );
  workload = once(
    workload,
    "\tpositions := map[int32]KFCDruidFriendlyPosition{}",
    "\tif frame.Research != nil { if err = healer.ConfigureKFCDruidHealingResearch(*frame.Research); err != nil {return nil,err} }\n\tpositions := map[int32]KFCDruidFriendlyPosition{}",
  );
  workload = once(
    workload,
    "\tfor iteration := int32(0);",
    "\tif frame.Research != nil { policy := *frame.Research; output.Research = &policy }\n\tfor iteration := int32(0);",
  );
  const metadata = `var kfcDruidResearchLevels=map[int32]int{${rules.ranks.map((rank) => `${rank.id}:${rank.requiredLevel}`).join(",")}}\n`;
  implementation = once(implementation, "// KFC_DRUID_RESEARCH_RANKS", metadata);
  return {
    "sim/druid/restoration/kfc_baseline.go": baseline,
    "sim/druid/restoration/kfc_advanced.go": advanced,
    "sim/druid/druid.go": druid,
    "sim/druid/omen_of_clarity.go": omen,
    "sim/druid/restoration/kfc_druid_workload.go": workload,
    "sim/druid/restoration/kfc_research.go": implementation,
  };
}
