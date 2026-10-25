import assert from "node:assert/strict";
import { extractShamanHealingActiveSource } from "./shaman-healing-active-source.mjs";

/** Retain exact owned resource/instant-cast inputs and their eligible healing masks.
 * @param {{evidence:object,domain:object,spellPolicy:object}} input @returns {object}
 */
export function extractShamanHealingResourceActives({ evidence, domain, spellPolicy }) {
  const actives = extractShamanHealingActiveSource(evidence);
  assert.equal(domain.schema, "kfc-shaman-healing-talent-domain-source.v1");
  assert.equal(spellPolicy.schema, "kfc-shaman-healing-spell-policy.v1");
  assert.equal(domain.sourceBuild, actives.sourceBuild);
  const heals = spellPolicy.actions.filter(
      (row) => row.kind === "heal" && row.status === "conditional-client-candidate",
    ),
    eligible = heals.filter((heal) => {
      const classes = evidence.rawTables.SpellClassOptions.filter(
        (row) => row.SpellID === heal.spellId,
      );
      assert.equal(classes.length, 1);
      assert.equal(classes[0].SpellClassSet, 11);
      return classes[0].SpellClassMask.some(
        (mask, index) => (mask & actives.naturesSwiftness.mask[index]) !== 0,
      );
    });
  assert.equal(heals.length, 21);
  assert.equal(eligible.length, 18);
  assert(eligible.every((row) => row.family !== "riptide"));
  assert(!heals.some((row) => row.spellId === 25357));
  const level = (id) => {
    const row = spellPolicy.actions.find((row) => row.spellId === id);
    assert(row && row.kind === "cooldown" && row.requiredLevel > 0);
    return row.requiredLevel;
  };
  return {
    schema: "kfc-shaman-healing-resource-actives-source.v1",
    sourceBuild: actives.sourceBuild,
    waterShield: { ...actives.waterShield, requiredLevel: level(actives.waterShield.id) },
    naturesSwiftness: {
      ...actives.naturesSwiftness,
      requiredLevel: level(actives.naturesSwiftness.id),
    },
    classHealIds: heals.map((row) => row.spellId).sort((a, b) => a - b),
    swiftnessEligibleIds: eligible.map((row) => row.spellId).sort((a, b) => a - b),
    talentMaximums: domain.trees.map((_tree, index) =>
      domain.fields.filter((row) => row.treeIndex === index).map((row) => row.maximum),
    ),
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Render raw source values without claiming a verified server trigger/cooldown policy.
 * @param {{implementation:string,source:object}} input @returns {string}
 */
export function renderShamanHealingResourceActives({ implementation, source }) {
  assert.equal(source.schema, "kfc-shaman-healing-resource-actives-source.v1");
  assert.equal(implementation.split("// KFC_SHAMAN_RESOURCE_ACTIVE_VALUES").length, 2);
  const shield = source.waterShield,
    swiftness = source.naturesSwiftness;
  assert.equal(shield.cooldownMs, 0);
  assert.equal(shield.charges, 3);
  assert.equal(shield.procChance, 1);
  assert.equal(swiftness.charges, 1);
  assert.equal(swiftness.cooldownMs, 180000);
  assert.deepEqual(
    source.talentMaximums.map((row) => row.length),
    [16, 18, 16],
  );
  const values = `const kfcShamanShieldID int32 = ${shield.id}
const kfcShamanShieldProcID int32 = ${shield.triggeredSpellId}
const kfcShamanShieldLevel = ${shield.requiredLevel}
const kfcShamanShieldCharges int32 = ${shield.charges}
const kfcShamanShieldDurationMs = ${shield.durationMs}
const kfcShamanShieldGCDMs = ${shield.gcdMs}
const kfcShamanShieldICDMs = ${shield.internalCooldownMs}
const kfcShamanShieldManaPercent = ${shield.maximumManaPercent}
const kfcShamanSwiftnessID int32 = ${swiftness.id}
const kfcShamanSwiftnessLevel = ${swiftness.requiredLevel}
const kfcShamanSwiftnessCooldownMs = ${swiftness.cooldownMs}
var kfcShamanClassHealIDs = map[int32]bool{${source.classHealIds.map((id) => id + ":true").join(",")}}
var kfcShamanSwiftnessHealIDs = map[int32]bool{${source.swiftnessEligibleIds.map((id) => id + ":true").join(",")}}
var kfcShamanComponentTalentMaximums = [][]int{${source.talentMaximums.map((ranks) => "{" + ranks.join(",") + "}").join(",")}}`;
  return implementation.replace("// KFC_SHAMAN_RESOURCE_ACTIVE_VALUES", values);
}

/** Extend only the derived healer dispatch and migrate one now-obsolete negative ownership control.
 * @param {{shaman:string,baseline:string,passives:string,guardTests:string}} input @returns {object}
 */
export function integrateShamanHealingResourceActives({ shaman, baseline, passives, guardTests }) {
  function once(source, before, after) {
    assert.equal(source.split(before).length, 2, "Unknown Shaman resource-active boundary");
    return source.replace(before, after);
  }
  shaman = once(
    shaman,
    "\tKFCControlledWaterTotems bool",
    "\tKFCControlledWaterTotems bool\n\tKFCControlledHealingActives bool",
  );
  shaman = once(
    shaman,
    "\tshaman.registerWaterShieldSpell()",
    "\tif !shaman.KFCControlledHealingActives { shaman.registerWaterShieldSpell() }",
  );
  baseline = once(
    baseline,
    "\tkfcWater *kfcShamanWaterController",
    "\tkfcWater *kfcShamanWaterController\n\tkfcActives *kfcShamanResourceActives",
  );
  baseline = once(
    baseline,
    "\tresto.KFCControlledWaterTotems = true",
    "\tresto.KFCControlledWaterTotems = true\n\tresto.KFCControlledHealingActives = true",
  );
  baseline = once(
    baseline,
    "\t\t})\n\t}\n}\n",
    "\t\t})\n\t}\n\tresto.registerKFCShamanResourceActives()\n}\n",
  );
  passives = once(
    passives,
    "\tresto := &RestorationShaman{Shaman: shaman.NewShaman(character, player.TalentsString, proto.ShamanWeaponImbue(0), proto.ShamanWeaponImbue(0))}",
    "\tvalidateKFCShamanComponentTalentEncoding(player.TalentsString)\n\tresto := &RestorationShaman{Shaman: shaman.NewShaman(character, player.TalentsString, proto.ShamanWeaponImbue(0), proto.ShamanWeaponImbue(0))}",
  );
  passives = once(
    passives,
    "\t\tdefinition, ok := kfcShamanPassiveDefinitions[string(field.Name())]",
    "\t\tif kfcShamanResourceTalentAllowed(field) { return true }\n\t\tdefinition, ok := kfcShamanPassiveDefinitions[string(field.Name())]",
  );
  guardTests = once(guardTests, '"--00000000000001"', '"000000000000005"');
  return { shaman, baseline, passives, guardTests };
}
