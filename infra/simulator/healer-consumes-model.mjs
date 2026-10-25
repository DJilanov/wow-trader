import assert from "node:assert/strict";

/** @param {object} evidence @returns {object} */
export function extractHealerConsumeRules(evidence) {
  assert.equal(evidence.schema, "kfc-healer-consumes-client-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(
    evidence.source.manifest.byteSha256,
    "9196f29921c4ba0cb38b5f649cdcf19ff03f667f6d560e8493a69b69682d7fcc",
  );
  assert.equal(evidence.serverVerified, false);
  assert.equal(evidence.publicationAllowed, false);
  const root = new Map([
    [13511, 17627],
    [13512, 17628],
    [20747, 25120],
    [20750, 25121],
    [13931, 1249513],
    [13928, 1249522],
    [18254, 1248396],
    [21217, 1249507],
    [18045, 1248395],
  ]);
  for (const [item, spell] of root) {
    assert.equal(evidence.items.filter((x) => x.id === item).length, 1);
    const links = evidence.links.filter((x) => x.ItemID === item);
    assert.equal(links.length, 1);
    const effect = evidence.itemEffects.find((x) => x.id === links[0].ItemEffectID);
    assert(effect);
    assert.equal(effect.SpellID, spell);
    assert.equal(effect.TriggerType, 0);
    assert.equal(effect.PlayerConditionID, 0);
  }
  function effects(spell) {
    return evidence.effects.filter((x) => x.SpellID === spell);
  }
  function aura(spell, index, type, points, misc) {
    const rows = effects(spell).filter((x) => x.EffectIndex === index);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.deepEqual(
      [row.Effect, row.EffectAura, row.EffectBasePointsF, row.EffectMiscValue[0]],
      [6, type, points, misc],
    );
    assert.equal(row.DifficultyID, 0);
    assert.equal(row.ScalingClass, 0);
    assert.equal(row.EffectRealPointsPerLevel, 0);
    return row;
  }
  assert.equal(effects(17628).length, 1, "Supreme Power gained a separate healing effect");
  aura(17628, 0, 13, 150, 126);
  aura(17627, 0, 418, 2000, 0);
  for (const [spell, enchant, passive] of [
    [25120, 2625, 25115],
    [25121, 2627, 25111],
  ]) {
    const rows = effects(spell);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].Effect, 54);
    assert.equal(rows[0].EffectMiscValue[0], enchant);
    const row = evidence.enchants.find((x) => x.id === enchant);
    assert(row);
    assert.deepEqual(row.Effect, [3, 0, 0]);
    assert.deepEqual(row.EffectArg, [passive, 0, 0]);
    assert.equal(row.Condition_ID, 0);
  }
  assert.equal(effects(25115).length, 2);
  aura(25115, 0, 85, 10, 0);
  aura(25115, 1, 135, 20, 126);
  assert.equal(effects(25111).length, 2);
  aura(25111, 0, 13, 24, 126);
  aura(25111, 1, 135, 24, 126);
  for (const [spell, points, child] of [
    [1249507, 7, 1249520],
    [1249513, 22, 1249520],
    [1248395, 15, 1248420],
    [1248396, 15, 1248421],
    [1249522, 1, 1249523],
  ]) {
    const row = aura(spell, 1, 227, points, 0);
    assert.equal(row.EffectTriggerSpell, child);
  }
  aura(1249520, 0, 13, 1, 126);
  aura(1248420, 0, 29, 1, 1);
  aura(1248421, 0, 29, 1, 3);
  aura(1249523, 0, 290, 1, 0);
  return {
    schema: "kfc-healer-consume-rules.v1",
    supremePower: { spellDamage: 150, healingPower: 0 },
    distilledWisdom: { mana: 2000 },
    lesserManaOil: { mp5: 10, healingPower: 20 },
    wizardOil: { spellDamage: 24, healingPower: 24 },
    sagefishDelight: { spellDamage: 7 },
    nightfinSoup: { spellDamage: 22 },
    tenderWolfSteak: { agility: 15 },
    runnTumTuber: { intellect: 15 },
    grilledSquid: { spellCritPercent: 1, meleeCritPercent: 1 },
    serverVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** Derive only the four stale Forever cases; keep Classic and all other effects intact.
 * @param {string} source @param {object} rules @returns {string}
 */
export function renderHealerConsumeRules(source, rules) {
  assert.equal(rules.schema, "kfc-healer-consume-rules.v1");
  const cases = [
    [
      "Flask_FlaskOfSupremePower",
      "\t",
      `character.AddStats(stats.Stats{\n\t\t\tstats.SpellPower: 150,\n\t\t})`,
      `if character.Env.IsForever() { character.AddStat(stats.SpellDamage, 150) } else { character.AddStat(stats.SpellPower, 150) }`,
    ],
    [
      "WeaponImbue_LesserManaOil",
      "\t\t",
      `character.AddStats(stats.Stats{\n\t\t\t\tstats.MP5: 8,\n\t\t\t})`,
      `if character.Env.IsForever() { character.AddStats(stats.Stats{stats.MP5:10, stats.HealingPower:20}) } else { character.AddStat(stats.MP5,8) }`,
    ],
    [
      "Food_FoodSagefishDelight",
      "\t\t",
      `character.AddStats(stats.Stats{\n\t\t\t\tstats.MP5: 6,\n\t\t\t})`,
      `if character.Env.IsForever() { character.AddStat(stats.SpellDamage,7) } else { character.AddStat(stats.MP5,6) }`,
    ],
    [
      "Food_FoodTenderWolfSteak",
      "\t\t",
      `character.AddStats(stats.Stats{\n\t\t\t\tstats.Stamina: 12,\n\t\t\t\tstats.Spirit:  12,\n\t\t\t})`,
      `if character.Env.IsForever() { character.AddStat(stats.Agility,15) } else { character.AddStats(stats.Stats{stats.Stamina:12,stats.Spirit:12}) }`,
    ],
  ];
  let output = source;
  for (const [name, indent, before, after] of cases) {
    const start = output.indexOf(`case proto.${name}:`),
      end = output.indexOf(`\n${indent}case `, start + 1);
    assert(start >= 0 && end > start, name);
    const block = output.slice(start, end);
    assert.equal(block.split(before).length, 2, "Consume source anchor changed: " + name);
    output = output.slice(0, start) + block.replace(before, after) + output.slice(end);
  }
  return output;
}
