import assert from "node:assert/strict";
import { reviewShamanHealingSetScope } from "./shaman-healing-set-scope.mjs";

function one(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
}

/** Rebind the full set inventory to the expanded passive-damage assignment.
 * @param {object} source @returns {object}
 */
export function extractShamanPassiveDamageSetRules(source) {
  assert.equal(source.schema, "kfc-shaman-passive-damage-sets-source.v1");
  assert.equal(source.serverVerified, false);
  assert.equal(source.publicationAllowed, false);
  const scope = reviewShamanHealingSetScope({
    evidence: source.shared,
    certificate: source.certificate,
    workloadSource: source.legacyWorkload,
  });
  assert.equal(
    scope.decisions.filter((row) => row.classification === "inactive-in-declared-assignment")
      .length,
    24,
  );
  const tables = source.shared.tables;
  const effect = (id) =>
    one(tables.SpellEffect, (row) => row.SpellID === id, "Passive set payload");
  const proc = (id) =>
    one(tables.SpellAuraOptions, (row) => row.SpellID === id, "Passive set proc record");
  for (const [setId, threshold, spellId] of [
    [122, 3, 1299737],
    [81, 4, 1302380],
  ])
    one(
      tables.ItemSetSpell,
      (row) => row.ItemSetID === setId && row.Threshold === threshold && row.SpellID === spellId,
      "Owned set threshold",
    );
  const necropile = effect(1299737),
    drain = effect(1299735),
    postmaster = effect(1302380),
    reflect = effect(1302378);
  assert.deepEqual(
    [
      necropile.Effect,
      necropile.EffectAura,
      necropile.EffectTriggerSpell,
      necropile.ImplicitTarget,
    ],
    [6, 42, 1299735, [1, 0]],
  );
  assert.deepEqual(
    [
      drain.Effect,
      drain.EffectAura,
      drain.EffectBasePointsF,
      drain.EffectAmplitude,
      drain.ImplicitTarget,
    ],
    [9, 0, 28, 1, [6, 0]],
  );
  assert.deepEqual(
    [
      proc(1299737).ProcTypeMask,
      proc(1299737).ProcChance,
      proc(1299737).ProcCategoryRecovery,
      proc(1299737).SpellProcsPerMinuteID,
    ],
    [[65536, 0], 100, 10, 0],
  );
  assert.deepEqual(
    [
      postmaster.Effect,
      postmaster.EffectAura,
      postmaster.EffectBasePointsF,
      postmaster.EffectTriggerSpell,
      postmaster.ImplicitTarget,
    ],
    [6, 42, 25, 1302378, [1, 0]],
  );
  assert.deepEqual(
    [reflect.Effect, reflect.EffectAura, reflect.EffectBasePointsF, reflect.ImplicitTarget],
    [6, 28, 100, [1, 0]],
  );
  assert.deepEqual(
    [proc(1302380).ProcTypeMask, proc(1302380).ProcChance, proc(1302380).ProcCategoryRecovery],
    [[-2146784600, 0], 100, 180000],
  );
  assert.deepEqual([proc(1302378).ProcTypeMask, proc(1302378).ProcCharges], [[131072, 0], 1]);
  for (const row of [necropile, drain, postmaster, reflect]) {
    assert.equal(row.DifficultyID, 0);
    assert.equal(row.ScalingClass, 0);
    assert.equal(row.EffectBonusCoefficient, 0);
    assert.equal(row.BonusCoefficientFromAP, 0);
    assert.equal(row.EffectRealPointsPerLevel, 0);
    assert.equal(row.EffectAuraPeriod, 0);
  }
  const misc = (id) => one(tables.SpellMisc, (row) => row.SpellID === id, "Passive set metadata");
  assert.equal(misc(1299735).SchoolMask, 32);
  const duration = one(
    source.durations,
    (row) => row.id === misc(1302378).DurationIndex,
    "Reflection duration",
  );
  assert.deepEqual(
    [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
    [6000, 6000, 0],
  );
  assert(
    source.sources.protective.includes(
      "explosion.CalcAndDealDamage(sim, resto.Env.Encounter.TargetUnits[0]",
    ),
  );
  assert(
    source.sources.protective.includes(
      "ProcMask: core.ProcMaskSpellDamageProc, Flags: core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete",
    ),
  );
  assert(
    source.sources.utility.includes(
      "ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagChanneled | core.SpellFlagNoOnCastComplete",
    ),
  );
  assert(
    source.sources.consumes.includes(
      "SpellFlagPassiveSpell | SpellFlagNoOnCastComplete | SpellFlagIgnoreAttackerModifiers",
    ),
  );
  const text = one(tables.Spell, (row) => row.id === 1302378, "Reflection description");
  assert.equal(text.Description_lang, "Return next hostile spell to sender.");
  const decisions = scope.decisions.map((row) => {
    if (row.setId === 122 && row.spellId === 1299737)
      return {
        ...row,
        classification: "owned-passive-damage-reference-required",
        reason:
          "Adaptive can damage an enemy. Cast-only and explicit passive-damage chance sensitivities replace the old helpful-only exclusion; no server proc chance is inferred.",
      };
    if (row.setId === 81 && row.spellId === 1302380)
      return {
        ...row,
        classification: "owned-passive-damage-reference-required",
        reason:
          "Rune/Circle can cross the owner-health threshold. Model the buff lifecycle with explicit self-ineligible reflection; foreign-caster reflection is outside this assignment.",
      };
    return row;
  });
  return {
    schema: "kfc-shaman-passive-damage-set-rules.v1",
    sourceBuild: 70532,
    necropile: {
      setId: 122,
      pieces: 3,
      rootSpellId: 1299737,
      drainSpellId: 1299735,
      amount: drain.EffectBasePointsF,
      schoolMask: misc(1299735).SchoolMask,
      recoveryMs: proc(1299737).ProcCategoryRecovery,
    },
    postmaster: {
      setId: 81,
      pieces: 4,
      rootSpellId: 1302380,
      buffSpellId: 1302378,
      healthThresholdPercent: postmaster.EffectBasePointsF,
      durationMs: duration.Duration,
      recoveryMs: proc(1302380).ProcCategoryRecovery,
      charges: proc(1302378).ProcCharges,
    },
    decisions,
    sourceBonusRows: decisions.length,
    unchangedInactiveRows: decisions.filter(
      (row) => row.classification === "inactive-in-declared-assignment",
    ).length,
    newlyConditionalRows: decisions.filter(
      (row) => row.classification === "owned-passive-damage-reference-required",
    ).length,
    references: {
      timing: "captured-proc-recovery-ms-reference",
      drainOutcome: "noncritical-hit-reference",
      postmaster: "self-ineligible-after-hit-strict-below-reference",
    },
    procChanceServerVerified: false,
    procChainingServerVerified: false,
    selfReflectionServerVerified: false,
    foreignCasterReflectionAdmitted: false,
    allCandidatesRetained: true,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Validate explicit owned uncertainty rather than treating client defaults as a server rate.
 * @param {unknown} policy @returns {void}
 */
export function assertShamanPassiveDamageSetPolicy(policy) {
  assert(policy && typeof policy === "object" && !Array.isArray(policy));
  const keys = new Set([
    "schema",
    "id",
    "timing",
    "necropileTrigger",
    "necropileChance",
    "drainOutcome",
    "postmaster",
  ]);
  assert(Object.keys(policy).every((key) => keys.has(key)));
  assert.equal(policy.schema, "kfc-shaman-passive-damage-policy.v1");
  assert(typeof policy.id === "string" && policy.id.length > 0 && policy.id.length <= 100);
  assert.equal(policy.timing, "captured-proc-recovery-ms-reference");
  if (policy.necropileTrigger !== undefined)
    assert(["cast-only-reference", "adaptive-damage-reference"].includes(policy.necropileTrigger));
  if (policy.necropileTrigger === "adaptive-damage-reference") {
    assert(
      Number.isFinite(policy.necropileChance) &&
        policy.necropileChance >= 0 &&
        policy.necropileChance <= 1,
    );
    assert.equal(policy.drainOutcome, "noncritical-hit-reference");
  } else assert(policy.necropileChance === undefined && policy.drainOutcome === undefined);
  if (policy.postmaster !== undefined)
    assert.equal(policy.postmaster, "self-ineligible-after-hit-strict-below-reference");
  assert(policy.necropileTrigger !== undefined || policy.postmaster !== undefined);
}

/** Finite sensitivity references for actual owned thresholds; not a BiS ranking.
 * @param {{necropilePieces:number,postmasterPieces:number,adaptiveOwned:boolean}} owned @returns {object[]}
 */
export function shamanPassiveDamageSetPolicies(owned) {
  for (const value of [owned.necropilePieces, owned.postmasterPieces])
    assert(Number.isInteger(value) && value >= 0 && value <= 5);
  assert.equal(typeof owned.adaptiveOwned, "boolean");
  const necropile = owned.necropilePieces >= 3,
    postmaster = owned.postmasterPieces >= 4;
  if (!necropile && !postmaster) return [];
  const base = {
    schema: "kfc-shaman-passive-damage-policy.v1",
    id: "cast-only-self-ineligible-reference",
    timing: "captured-proc-recovery-ms-reference",
    ...(necropile ? { necropileTrigger: "cast-only-reference" } : {}),
    ...(postmaster ? { postmaster: "self-ineligible-after-hit-strict-below-reference" } : {}),
  };
  const choices = [base];
  if (necropile && owned.adaptiveOwned)
    for (const chance of [0, 1])
      choices.push({
        ...base,
        id: "adaptive-necropile-" + chance + "-reference",
        necropileTrigger: "adaptive-damage-reference",
        necropileChance: chance,
        drainOutcome: "noncritical-hit-reference",
      });
  for (const policy of choices) assertShamanPassiveDamageSetPolicy(policy);
  return choices;
}

/** Integrate the owned set references without touching shared handlers or old source bytes.
 * @param {{actor:string,equipped:string,definitions:string,testHelpers:string}} sources @returns {Record<string,string>}
 */
export function renderShamanPassiveDamageSets(sources) {
  assert(
    !sources.actor.includes("registerKFCShamanPassiveDamageSets"),
    "Passive damage integration already present",
  );
  function replace(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  let actor = replace(
    sources.actor,
    "type RestorationShaman struct {\n",
    "type RestorationShaman struct {\n\tkfcPassiveDamageSets *kfcShamanPassiveDamageSets\n",
  );
  actor = replace(
    actor,
    "resto.registerKFCShamanProtectiveItems()",
    "resto.registerKFCShamanProtectiveItems()\n\tresto.registerKFCShamanPassiveDamageSets()",
  );
  const definitions = replace(
    sources.definitions,
    "resto.kfcShamanReactiveAfterDamage(sim, before, incoming, result, periodic)",
    "resto.kfcShamanReactiveAfterDamage(sim, before, incoming, result, periodic)\n\t\t\t\tresto.kfcShamanPassiveDamageAfterDamage(sim, incoming, result)",
  );
  let equipped = replace(
    sources.equipped,
    "type KFCShamanEquippedEffects struct {\n",
    'type KFCShamanEquippedEffects struct {\n\tPassiveDamage *KFCShamanPassiveDamageSetPolicy `json:"passiveDamage,omitempty"`\n',
  );
  const configure =
    "func (resto *RestorationShaman) configureKFCShamanEquippedEffects(sim *core.Simulation, effects KFCShamanEquippedEffects) error {\n";
  equipped = replace(
    equipped,
    configure,
    configure +
      '\tif (resto.kfcPassiveDamageSets != nil && (resto.kfcPassiveDamageSets.necropile || resto.kfcPassiveDamageSets.postmaster)) != (effects.PassiveDamage != nil) { return fmt.Errorf("passive-damage references must match owned sets") }\n\tif effects.PassiveDamage != nil { if err := resto.ConfigureKFCShamanPassiveDamageSets(sim,*effects.PassiveDamage); err != nil { return err } }\n',
  );
  const testHelpers = replace(
    sources.testHelpers,
    "effects := KFCShamanEquippedEffects{}",
    'effects := KFCShamanEquippedEffects{}\n\tif sets[122]>=3 || sets[81]>=4 { p := &KFCShamanPassiveDamageSetPolicy{Schema:"kfc-shaman-passive-damage-policy.v1",ID:"controlled-cast-only-reference",Timing:"captured-proc-recovery-ms-reference"}; if sets[122]>=3 { p.NecropileTrigger="cast-only-reference" }; if sets[81]>=4 { p.Postmaster="self-ineligible-after-hit-strict-below-reference" }; effects.PassiveDamage=p }',
  );
  return { actor, equipped, definitions, testHelpers };
}
