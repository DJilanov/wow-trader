import assert from "node:assert/strict";
import { auditPaladinHealingSets } from "./paladin-healing-set-audit.mjs";

const remaining = [
  [81, 4, 1302380, "hostile-reflection"],
  [124, 3, 1299743, "incoming-melee"],
  [163, 4, 1293674, "outgoing-melee"],
  [181, 4, 27867, "hostile-control"],
  [181, 5, 450527, "existing-cast-mana"],
  [182, 5, 450576, "existing-cast-mana"],
  [183, 4, 27780, "hostile-control"],
  [184, 4, 1302698, "control-removal"],
  [185, 4, 1302708, "movement"],
  [186, 4, 1302712, "control-removal"],
  [187, 4, 1302718, "incoming-melee"],
  [188, 4, 1302716, "hostile-control"],
  [189, 4, 1302721, "control-removal"],
];

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

/** Close the current stationary, player-only healing set scope without excluding gear.
 * @param {object} source @param {string} generatedSource @param {string} targetDefinitions
 * @returns {object}
 */
export function extractPaladinHealingSetAdmission(source, generatedSource, targetDefinitions) {
  const audit = auditPaladinHealingSets(source, generatedSource),
    { tables } = source;
  assert(targetDefinitions.includes("TARGET_UNIT_CASTER                          = 1,"));
  assert(targetDefinitions.includes("TARGET_UNIT_TARGET_ENEMY                    = 6,"));
  const decisions = remaining.map(([setId, pieces, spellId, kind]) => {
    const root = one(
      tables.ItemSetSpell,
      (row) => row.ItemSetID === setId && row.Threshold === pieces,
      "remaining threshold",
    );
    assert.equal(root.SpellID, spellId);
    const effect = one(
      tables.SpellEffect,
      (row) => row.SpellID === spellId,
      "remaining root effect",
    );
    const proc = one(
      tables.SpellAuraOptions,
      (row) => row.SpellID === spellId,
      "remaining trigger options",
    );
    assert.equal(effect.Effect, 6);
    assert.equal(effect.EffectAura, 42);
    assert.deepEqual(effect.ImplicitTarget, [1, 0]);
    const children = tables.SpellEffect.filter((row) => row.SpellID === effect.EffectTriggerSpell);
    assert(children.length > 0);
    let reason;
    if (kind === "existing-cast-mana") {
      assert.equal(proc.ProcChance, 5);
      assert.deepEqual(proc.ProcTypeMask, [81920, 0]);
      assert.equal(proc.ProcCategoryRecovery, 0);
      assert.equal(children.length, 1);
      assert.deepEqual(
        [children[0].Effect, children[0].EffectBasePointsF, children[0].EffectMiscValue],
        [30, 200, [0, 0]],
      );
      reason =
        "Existing owned common handler: completed healing casts,5% current reference,200 capped mana; native/browser observations and threshold controls qualify it.";
    } else if (kind === "incoming-melee") {
      assert.deepEqual(proc.ProcTypeMask, [40, 0]);
      reason =
        "The declared workload rejects incoming damage to the caster; its admitted self-damage is magical rather than a taken melee swing or ability.";
    } else if (kind === "outgoing-melee") {
      const childProc = one(
        tables.SpellAuraOptions,
        (row) => row.SpellID === effect.EffectTriggerSpell,
        "retaliation melee trigger",
      );
      assert.deepEqual(childProc.ProcTypeMask, [20, 0]);
      reason =
        "Enraging Light modifies later melee attacks. The healing controller has no hostile attacks,melee rotation or autos.";
    } else if (kind === "control-removal") {
      assert.equal(children.length, 1);
      assert.deepEqual(
        [children[0].Effect, children[0].EffectAura, children[0].ImplicitTarget],
        [108, 0, [1, 0]],
      );
      assert([3, 7, 11].includes(children[0].EffectMiscValue[0]));
      reason =
        "Only removes a control effect. The stationary benchmark schedules no disarm,root or snare and no hostile attacker can apply one to its caster.";
    } else if (kind === "movement") {
      assert.equal(children.length, 1);
      assert.deepEqual(
        [children[0].Effect, children[0].EffectAura, children[0].EffectBasePointsF],
        [6, 129, 10],
      );
      reason =
        "Movement-speed-only effect. The benchmark's positions are fixed and its controller has no movement segment.";
    } else if (kind === "hostile-control") {
      assert(children.every((row) => JSON.stringify(row.ImplicitTarget) === "[6,0]"));
      assert(children.every((row) => [7, 26, 27, 33].includes(row.EffectAura)));
      reason =
        "The child targets an enemy attacker. No hostile unit damages this benchmark's caster; Rune/Circle originate from the friendly caster and do not supply an enemy recipient.";
    } else {
      assert.equal(kind, "hostile-reflection");
      const description = one(
        tables.Spell,
        (row) => row.id === effect.EffectTriggerSpell,
        "reflection recipient rule",
      ).Description_lang;
      assert.equal(description, "Return next hostile spell to sender.");
      assert.equal(children[0].EffectAura, 28);
      reason =
        "The declared workload has no hostile spell cast on its caster. Friendly self-targeted item damage is not a hostile sender; the client text explicitly requires a hostile spell.";
    }
    return {
      setId,
      pieces,
      spellId,
      kind,
      classification:
        kind === "existing-cast-mana"
          ? "existing-runtime-qualified"
          : "inactive-in-declared-assignment",
      reason,
      retainedInEquipmentDomain: true,
    };
  });
  const knownNew = new Set([
    "183:5",
    "185:5",
    "187:5",
    "188:5",
    "162:4",
    "163:6",
    "182:4",
    "184:6",
    "189:6",
    "1968:4",
  ]);
  const unresolved = audit.summary.runtimeReviewThresholds.filter(
    (row) => !knownNew.has(`${row.setId}:${row.pieces}`),
  );
  assert.deepEqual(
    unresolved.map((row) => [row.setId, row.pieces]),
    decisions.map((row) => [row.setId, row.pieces]),
  );
  const sets = tables.ItemSet.map((row) => {
    assert([0, 164].includes(row.RequiredSkill));
    return {
      id: row.id,
      name: row.Name_lang,
      profession: row.RequiredSkill === 164 ? 2 : 0,
      thresholds: [
        ...new Set(
          tables.ItemSetSpell.filter((bonus) => bonus.ItemSetID === row.id).map(
            (bonus) => bonus.Threshold,
          ),
        ),
      ].sort((a, b) => a - b),
    };
  }).sort((a, b) => a.id - b.id);
  assert.equal(sets.length, 43);
  assert.equal(
    sets.reduce((sum, set) => sum + set.thresholds.length, 0),
    134,
  );
  assert(!sets.some((row) => row.id === 1673));
  return {
    schema: "kfc-paladin-healing-set-admission.v1",
    sourceBuild: 70532,
    sets,
    decisions,
    scope:
      "Stationary player-only healing: no hostile damage to the caster,no hostile rotation,no movement or control events; magical friendly self-damage remains admitted under its declared reference.",
    remainingUnclassifiedThresholds: 0,
    globalOtherClassSupportChanged: false,
    wholeLoadoutAcquisitionStillRequired: true,
    serverMechanicsVerified: false,
    assignmentScoringRequired: "external-demand-v1",
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Add class-owned metadata without changing effect application or generic support claims.
 * @param {object} rules @param {string} implementation @param {string} coreSets @returns {object}
 */
export function renderPaladinHealingSetAdmission(rules, implementation, coreSets) {
  assert.equal(rules.schema, "kfc-paladin-healing-set-admission.v1");
  const anchor = "// KFC_PALADIN_ADMITTED_SET_VALUES";
  assert.equal(implementation.split(anchor).length, 2);
  const values =
    "var kfcPaladinAdmittedSets = map[int32]kfcPaladinAdmittedSet{\n" +
    rules.sets
      .map(
        (row) =>
          `${row.id}:{Name:${JSON.stringify(row.name)},Profession:proto.Profession(${row.profession}),Thresholds:[]int32{${row.thresholds.join(",")}}},`,
      )
      .join("\n") +
    "\n}";
  const hook = "func (character *Character) GetActiveSetBonusNames() []string {\n";
  assert.equal(coreSets.split(hook).length, 2);
  const insertion = `${hook}\tif character.Env != nil && character.Env.IsForever() {\n\t\tif provider,ok:=character.Env.Raid.GetPlayerFromUnit(&character.Unit).(interface{KFCReviewedHealingEquipmentSetNames() []string});ok{return provider.KFCReviewedHealingEquipmentSetNames()}\n\t}\n`;
  return {
    implementation: implementation.replace(anchor, values),
    coreSets: coreSets.replace(hook, insertion),
  };
}
