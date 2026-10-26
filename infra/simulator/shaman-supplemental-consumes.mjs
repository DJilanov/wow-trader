import assert from "node:assert/strict";

const definitions = [
  ["healthElixir", 2, 2458, 2378, [[34, 27, 0]], { health: 27 }],
  ["healthElixir", 1, 3825, 3593, [[34, 120, 0]], { health: 120 }],
  ["healthElixir", 3, 250334, 1250928, [[34, 200, 0]], { health: 200 }],
  ["healthElixir", 4, 250335, 1250931, [[34, 400, 0]], { health: 400 }],
  ["zanzaBuff", 4, 8410, 10667, [[29, 25, 0]], { strength: 25 }],
  ["zanzaBuff", 5, 8412, 10669, [[29, 25, 1]], { agility: 25 }],
  ["zanzaBuff", 6, 8423, 10692, [[29, 25, 3]], { intellect: 25 }],
  ["zanzaBuff", 7, 8424, 10693, [[29, 25, 4]], { spirit: 25 }],
  ["zanzaBuff", 8, 8411, 10668, [[29, 25, 2]], { stamina: 25 }],
  ["alcohol", 1, 21151, 25804, [[29, 15, 2]], { stamina: 15 }],
  ["alcohol", 2, 18269, 22789, [[29, 10, 2]], { stamina: 10 }],
  ["alcohol", 3, 21114, 25722, [[29, 10, 2]], { stamina: 10 }],
  ["alcohol", 4, 20709, 25037, [[29, 5, 2]], { stamina: 5 }],
  [
    "alcohol",
    5,
    18284,
    22790,
    [
      [29, 25, 4],
      [29, -5, 3],
    ],
    { spirit: 25, intellect: -5 },
  ],
  ["spellPowerBuff", 1, 9155, 11390, [[13, 20, 126]], { spellDamage: 20 }],
  ["spellPowerBuff", 2, 13454, 17539, [[13, 35, 126]], { spellDamage: 35 }],
  ["spellPowerBuff", 3, 250342, 1250971, [[13, 15, 126]], { spellDamage: 15 }],
  ["firePowerBuff", 1, 6373, 7844, [[13, 10, 4]], { firePower: 10 }],
  ["shadowPowerBuff", 1, 9264, 11474, [[13, 40, 32]], { shadowPower: 40 }],
  ["frostPowerBuff", 1, 17708, 21920, [[13, 15, 16]], { frostPower: 15 }],
  [
    "miscConsumes.raptorPunch",
    1,
    5342,
    6114,
    [
      [29, 4, 3],
      [29, -5, 2],
    ],
    { intellect: 4, stamina: -5 },
  ],
  ["miscConsumes.jujuEmber", 1, 12455, 16326, [[22, 15, 4]], { fireResistance: 15 }],
  ["miscConsumes.jujuChill", 1, 12457, 16325, [[22, 15, 16]], { frostResistance: 15 }],
];

const baseAxes = {
  flask: [0, 1, 2, 3, 4],
  food: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11],
  mainHandImbue: [0, 16, 20],
  defaultPotion: [0, 5],
  defaultConjured: [0, 2],
  manaRegenElixir: [0, 2],
};

function durationMilliseconds(field, value) {
  if (field === "miscConsumes.raptorPunch") return 300000;
  if (field.startsWith("miscConsumes.juju")) return 600000;
  if (field === "alcohol") return 900000;
  if (
    field === "zanzaBuff" ||
    (field === "healthElixir" && value <= 2) ||
    (field === "spellPowerBuff" && value === 2)
  )
    return 3600000;
  return 1800000;
}

function one(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
}

/** Capture source values and distinct consume families, without a performance ranking.
 * @param {object} source @returns {object}
 */
export function extractShamanSupplementalConsumeRules(source) {
  assert.equal(source.schema, "kfc-shaman-supplemental-consume-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  assert.equal(
    source.source.manifest.byteSha256,
    "9196f29921c4ba0cb38b5f649cdcf19ff03f667f6d560e8493a69b69682d7fcc",
  );
  assert.equal(source.serverVerified, false);
  assert.equal(source.acquisitionLiveVerified, false);
  assert.equal(source.publicationAllowed, false);
  const { tables } = source;
  const expectedIds = [...definitions.map((row) => row[2]), 21546].sort((a, b) => a - b);
  assert.deepEqual(
    [...source.itemIds].sort((a, b) => a - b),
    expectedIds,
  );
  assert.deepEqual(
    tables.ItemSparse.map((row) => row.id).sort((a, b) => a - b),
    expectedIds,
  );
  const items = definitions.map(([field, value, itemId, spellId, payload, stats]) => {
    const item = one(tables.ItemSparse, (row) => row.id === itemId, "Consume item");
    assert(item.RequiredLevel <= 60 && item.RequiredSkill === 0 && item.RequiredSkillRank === 0);
    assert.equal(item.AllowableClass, -1);
    assert.deepEqual(item.AllowableRace, [-1, -1]);
    const link = one(tables.ItemXItemEffect, (row) => row.ItemID === itemId, "Consume use link");
    const use = one(tables.ItemEffect, (row) => row.id === link.ItemEffectID, "Consume use");
    assert.deepEqual([use.SpellID, use.TriggerType, use.PlayerConditionID], [spellId, 0, 0]);
    const effects = tables.SpellEffect.filter((row) => row.SpellID === spellId).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
    const auras = effects.filter((row) => row.Effect === 6);
    assert.deepEqual(
      auras.map((row) => [row.EffectAura, row.EffectBasePointsF, row.EffectMiscValue[0]]),
      payload,
    );
    for (const row of effects) {
      assert.equal(row.DifficultyID, 0);
      assert.equal(row.EffectRealPointsPerLevel, 0);
      assert.equal(row.ScalingClass, 0);
      assert.equal(row.EffectBonusCoefficient, 0);
      assert.equal(row.BonusCoefficientFromAP, 0);
      assert.equal(row.Variance, 0);
      if (row.Effect === 6) {
        assert.equal(row.EffectTriggerSpell, 0);
        assert.equal(row.EffectAuraPeriod, 0);
        assert.deepEqual(
          row.ImplicitTarget,
          field.startsWith("miscConsumes.juju") ? [21, 0] : [1, 0],
        );
      } else {
        assert.equal(field, "alcohol");
        assert.equal(row.Effect, 64);
        const child = one(
          tables.SpellEffect,
          (entry) => entry.SpellID === row.EffectTriggerSpell,
          "Alcohol child",
        );
        assert.equal(child.Effect, 100);
        assert.equal(child.EffectAura, 0);
        assert.equal(child.EffectTriggerSpell, 0);
      }
    }
    const misc = one(tables.SpellMisc, (row) => row.SpellID === spellId, "Consume spell metadata");
    const duration = one(
      tables.SpellDuration,
      (row) => row.id === misc.DurationIndex,
      "Consume duration",
    );
    assert(
      duration.Duration > 0 &&
        duration.Duration === duration.MaxDuration &&
        duration.DurationPerResource === 0,
    );
    assert.equal(duration.Duration, durationMilliseconds(field, value));
    return {
      field,
      value,
      itemId,
      spellId,
      name: item.Display_lang,
      durationMs: duration.Duration,
      requiredLevel: item.RequiredLevel,
      stats: { ...stats },
      acquisition: "nonraid-reference-live-access-unverified",
    };
  });
  const renamed = one(tables.SpellEffect, (row) => row.SpellID === 1310077, "Renamed Holy elixir");
  const renamedLink = one(
    tables.ItemXItemEffect,
    (row) => row.ItemID === 21546,
    "Renamed Holy elixir item link",
  );
  const renamedUse = one(
    tables.ItemEffect,
    (row) => row.id === renamedLink.ItemEffectID,
    "Renamed Holy elixir use",
  );
  assert.equal(renamedUse.SpellID, 1310077);
  assert.deepEqual(
    [renamed.Effect, renamed.EffectAura, renamed.EffectBasePointsF, renamed.EffectMiscValue[0]],
    [6, 13, 40, 2],
  );
  return {
    schema: "kfc-shaman-supplemental-consume-rules.v1",
    sourceBuild: 70532,
    items,
    axes: shamanSupplementalConsumeAxes(),
    rejectedLegacyMappings: [
      {
        field: "firePowerBuff",
        value: 2,
        itemId: 21546,
        currentSpellId: 1310077,
        currentSchoolMask: 2,
        reason:
          "Current item grants Holy damage, not the inherited forty Fire damage; no Holy damage action is scheduled.",
      },
    ],
    numericExtensions: { healthElixir: { 3: 250334, 4: 250335 } },
    unchangedLegacyHealthMapping: { value: 1, itemId: 3825, health: 120 },
    stacking: "one-enum-choice-per-family-prepull-engine-additive-reference",
    duration: "reject-assignments-longer-than-the-selected-prepull-buff-no-refresh-assumed",
    sourceValuesVerified: true,
    stackingServerVerified: false,
    acquisitionLiveVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Every supported value remains available to bounded coordinate feedback.
 * @returns {Record<string, number[]>}
 */
export function shamanSupplementalConsumeAxes() {
  const axes = structuredClone(baseAxes);
  for (const [field, value] of definitions) {
    axes[field] ??= [0];
    if (!axes[field].includes(value)) axes[field].push(value);
  }
  for (const values of Object.values(axes)) values.sort((a, b) => a - b);
  return axes;
}

/** Validate the actual sparse protobuf JSON consume object, including nested booleans.
 * @param {unknown} consumes @param {number} durationSeconds @returns {void}
 */
export function assertShamanSupplementalConsumes(consumes, durationSeconds) {
  assert(Number.isFinite(durationSeconds) && durationSeconds >= 1 && durationSeconds <= 1800);
  assert(consumes && typeof consumes === "object" && !Array.isArray(consumes));
  const axes = shamanSupplementalConsumeAxes();
  const allowed = new Set(Object.keys(axes).filter((field) => !field.includes(".")));
  allowed.add("miscConsumes");
  assert(
    Object.keys(consumes).every((key) => allowed.has(key)),
    "Unreviewed Shaman consume field",
  );
  for (const [field, value] of Object.entries(consumes)) {
    if (field === "miscConsumes") {
      assert(value && typeof value === "object" && !Array.isArray(value));
      for (const [key, enabled] of Object.entries(value)) {
        assert(axes["miscConsumes." + key], "Unreviewed miscellaneous consume");
        assert.equal(typeof enabled, "boolean");
      }
    } else assert(axes[field].includes(value), "Unreviewed Shaman consume value: " + field);
  }
  for (const [field, value] of definitions) {
    const selected = field.includes(".")
      ? Number(consumes.miscConsumes?.[field.split(".")[1]] ?? false)
      : (consumes[field] ?? 0);
    if (selected !== value) continue;
    // Durations are separately source-checked by the extractor; no mid-fight reapplication is implicit.
    const milliseconds = durationMilliseconds(field, value);
    assert(
      durationSeconds * 1000 <= milliseconds,
      "Selected consume expires before assignment ends: " + field,
    );
  }
}

/** Integrate only the owned consume gate and missing numeric effects into the frozen parent.
 * @param {{equipped:string,passives:string}} sources @returns {{equipped:string,passives:string}}
 */
export function renderShamanSupplementalConsumes(sources) {
  const start = sources.equipped.indexOf("func validateKFCShamanEquippedConsumes(");
  const end = sources.equipped.indexOf("\nfunc kfcShamanEquippedSupport(", start);
  assert(start >= 0 && end > start);
  let equipped = sources.equipped.slice(0, start) + sources.equipped.slice(end + 1);
  const gate =
    "if err = validateKFCShamanEquippedConsumes(player.Consumes); err != nil {\n\t\treturn nil, err\n\t}";
  assert.equal(equipped.split(gate).length, 2);
  equipped = equipped.replace(
    gate,
    gate +
      "\n\tif err = validateKFCShamanSupplementalConsumeDuration(player.Consumes, input.Encounter.Duration); err != nil { return nil, err }",
  );
  const talent = "func (resto *RestorationShaman) ApplyTalents() {\n";
  assert.equal(sources.passives.split(talent).length, 2);
  const passives = sources.passives.replace(
    talent,
    talent + "\tresto.applyKFCShamanSupplementalConsumes()\n",
  );
  assert(!sources.passives.includes("applyKFCShamanSupplementalConsumes"));
  return { equipped, passives };
}
