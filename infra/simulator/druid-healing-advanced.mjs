import assert from "node:assert/strict";
import { extractDruidHealingBaseline } from "./druid-healing-model.mjs";

const talentFields = [
  ["naturesFocus", 17063, /a (\d+)% chance/],
  ["naturalist", 17069, /by ([\d.]+) sec/],
  ["giftOfNature", 17104, /by (\d+)%/],
  ["giftOfTheEarthmother", 414673, /by ([\d.]+) seconds/],
  ["tranquilSpirit", 24968, /by (\d+)%/],
  ["improvedRejuvenation", 17111, /by (\d+)%/],
  ["improvedRegrowth", 17074, /by (\d+)%/],
  ["improvedTranquility", 17123, /cooldown by (\d+)%/],
  ["genesis", 1223081, /by (\d+)%/],
];
function one(rows, id, label) {
  const matches = rows.filter((row) => row.SpellID === id);
  assert.equal(matches.length, 1, `Expected one ${label} row for ${id}`);
  return matches[0];
}
/** Preserve exact special-spell records and resolved healing talent values.
 * @param {object} evidence @returns {object}
 */
export function extractDruidAdvancedHealing(evidence) {
  const baseline = extractDruidHealingBaseline(evidence),
    tables = evidence.rawTables,
    lookups = evidence.lookupTables,
    names = new Map(tables.SpellName.map((row) => [row.id, row.Name_lang])),
    spells = new Map(tables.Spell.map((row) => [row.id, row])),
    durations = new Map(lookups.SpellDuration.map((row) => [row.id, row.Duration])),
    casts = new Map(lookups.SpellCastTimes.map((row) => [row.id, row])),
    radii = new Map(lookups.SpellRadius.map((row) => [row.id, row]));
  const talents = Object.fromEntries(
    talentFields.map(([field, id, pattern]) => {
      const matches = evidence.classTalents.filter(
        (row) => row.spellId === id && row.layoutResolved,
      );
      assert.equal(matches.length, 1, field);
      const talent = matches[0];
      assert.equal(talent.ranks.length, talent.maxRanks);
      const values = [
        0,
        ...talent.ranks.map((rank, index) => {
          assert.equal(rank.rank, index + 1);
          assert(rank.resolved, field);
          const match = pattern.exec(rank.text);
          assert(match, `Unresolved ${field} value`);
          const value = Number(match[1]);
          assert(Number.isFinite(value) && value > 0);
          return value;
        }),
      ];
      return [
        field,
        {
          spellId: id,
          maxRank: talent.maxRanks,
          values,
          effects: tables.SpellEffect.filter((row) => row.SpellID === id),
        },
      ];
    }),
  );
  const splendor = tables.SpellEffect.filter((row) => row.SpellID === 1223083).sort(
    (a, b) => a.EffectIndex - b.EffectIndex,
  );
  assert.deepEqual(
    splendor.map((row) => [row.EffectAura, row.EffectMiscValue[0]]),
    [
      [107, 1],
      [107, 1],
      [107, 1],
    ],
  );
  assert.deepEqual(
    splendor.map((row) => row.EffectSpellClassMask[0]),
    [18, 64, 2097152],
  );
  const rows = [
    ...new Set(
      evidence.rootAbilityRows
        .filter(
          (row) =>
            [0, 2].includes(row.AcquireMethod) &&
            ["Tranquility", "Wild Growth"].includes(names.get(row.Spell)),
        )
        .map((row) => row.Spell),
    ),
    18562,
  ];
  const swiftnessCooldown = one(tables.SpellCooldowns, 17116, "Nature's Swiftness cooldown");
  assert.equal(swiftnessCooldown.StartRecoveryTime, 0);
  const ranks = rows
    .map((id) => {
      const family =
          names.get(id) === "Tranquility"
            ? "tranquility"
            : names.get(id) === "Wild Growth"
              ? "wild-growth"
              : "swiftmend",
        misc = one(tables.SpellMisc, id, "misc"),
        power = one(tables.SpellPower, id, "power"),
        levels = one(tables.SpellLevels, id, "levels"),
        cooldown = one(tables.SpellCooldowns, id, "cooldown"),
        cast = casts.get(misc.CastingTimeIndex),
        effects = tables.SpellEffect.filter((row) => row.SpellID === id).sort(
          (a, b) => a.EffectIndex - b.EffectIndex,
        ),
        effect = effects[0];
      assert.equal(misc.SchoolMask, 8);
      assert(cast && cast.Base === 0 && cast.Minimum === 0);
      assert.equal(power.PowerType, 0);
      for (const key of [
        "ManaCostPerLevel",
        "ManaPerSecond",
        "PowerCostMaxPct",
        "OptionalCostPct",
        "PowerPctPerSecond",
        "RequiredAuraSpellID",
        "OptionalCost",
      ])
        assert.equal(power[key], 0, `${id}.${key}`);
      if (family === "swiftmend") {
        assert.equal(effects.length, 1);
        assert.equal(effect.Effect, 10);
        assert.equal(effect.EffectBonusCoefficient, 0);
        assert.equal(power.ManaCost, 0);
        assert.equal(power.PowerCostPct, 20);
      } else {
        assert.equal(power.PowerCostPct, 0);
        assert.equal(effect.EffectAura, 8);
        assert.equal(effect.Effect, family === "tranquility" ? 35 : 6);
        assert.equal(effects.length, family === "tranquility" ? 1 : 2);
        if (family === "wild-growth") {
          assert.equal(effects[1].EffectAura, 4);
          assert.deepEqual(effect.ImplicitTarget, [132, 31]);
        }
        assert(
          effect.EffectAuraPeriod > 0 &&
            durations.get(misc.DurationIndex) % effect.EffectAuraPeriod === 0,
        );
      }
      const radiusId =
          family === "tranquility" ? effect.EffectRadiusIndex[0] : effect.EffectRadiusIndex[1],
        radius = radiusId ? radii.get(radiusId) : null;
      if (radius) {
        assert.equal(radius.RadiusPerLevel, 0);
        assert.equal(radius.Radius, radius.RadiusMax);
      }
      const rank =
        family === "swiftmend"
          ? 1
          : Number(/^Rank (\d+)$/.exec(spells.get(id).NameSubtext_lang)?.[1]);
      assert(Number.isSafeInteger(rank) && rank > 0);
      return {
        id,
        family,
        rank,
        requiredLevel: levels.SpellLevel,
        baseLevel: levels.BaseLevel,
        maxLevel: levels.MaxLevel,
        mana: power.ManaCost,
        baseManaFraction: power.PowerCostPct / 100,
        gcdMs: cooldown.StartRecoveryTime,
        cooldownMs: Math.max(cooldown.RecoveryTime, cooldown.CategoryRecoveryTime),
        durationMs: family === "swiftmend" ? 0 : durations.get(misc.DurationIndex),
        tickMs: effect.EffectAuraPeriod,
        base: effect.EffectBasePointsF,
        coefficient: effect.EffectBonusCoefficient,
        pointsPerLevel: effect.EffectRealPointsPerLevel,
        variance: effect.Variance,
        radius: radius?.Radius ?? 0,
      };
    })
    .sort((a, b) => a.family.localeCompare(b.family) || a.rank - b.rank);
  assert.equal(ranks.filter((row) => row.family === "tranquility").length, 4);
  assert.equal(ranks.filter((row) => row.family === "wild-growth").length, 3);
  for (const rank of ranks)
    for (const [key, value] of Object.entries(rank))
      if (typeof value === "number")
        assert(Number.isFinite(value) && value >= 0, `${rank.id}.${key}`);
  return {
    schema: "kfc-druid-advanced-healing.v1",
    sourceBuild: baseline.sourceBuild,
    talents,
    splendorMs: {
      rejuvenation: splendor[0].EffectBasePointsF,
      regrowth: splendor[1].EffectBasePointsF,
    },
    ranks,
    naturesSwiftnessCooldownMs: swiftnessCooldown.RecoveryTime,
    wildGrowthDecayVerified: false,
    swiftmendSelectionVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** Derive the actor without changing the authenticated baseline or its compiled parent.
 * @param {{baselineSource:string,implementation:string,rules:object,baseline:object}} input
 * @returns {{baselineSource:string,implementation:string}}
 */
export function renderDruidAdvancedHealing({ baselineSource, implementation, rules, baseline }) {
  assert.equal(rules.schema, "kfc-druid-advanced-healing.v1");
  const replace = (text, before, after) => {
    assert.equal(text.split(before).length, 2, `Druid anchor changed: ${before}`);
    return text.replace(before, after);
  };
  baselineSource = replace(
    baselineSource,
    '\t\t\tif options.TalentsString != "" {\n\t\t\t\tpanic("Druid baseline controls do not admit unverified healing talents")\n\t\t\t}\n',
    "",
  );
  baselineSource = replace(
    baselineSource,
    "\tfamilySpells map[string][]*core.Spell",
    "\tfamilySpells map[string][]*core.Spell\n\tpositions map[int32]KFCDruidFriendlyPosition\n\thealingPolicy KFCDruidHealingPolicy",
  );
  baselineSource = replace(
    baselineSource,
    "int32(part.DurationMs / part.TickMs)",
    "int32((part.DurationMs + resto.kfcHotExtension(rank.Family)) / part.TickMs)",
  );
  baselineSource = replace(
    baselineSource,
    "dot.SnapshotAttackerMultiplier = dot.Spell.CasterHealingMultiplier()",
    "dot.SnapshotAttackerMultiplier = resto.kfcPeriodicHealingMultiplier(dot.Spell, rank.Family)",
  );
  baselineSource = replace(
    baselineSource,
    "resto.familySpells[rank.Family] = append(resto.familySpells[rank.Family], spell)\n\t}\n}",
    "resto.familySpells[rank.Family] = append(resto.familySpells[rank.Family], spell)\n\t}\n\tresto.registerKFCAdvancedHealing()\n}",
  );
  const arrays = Object.entries(rules.talents)
      .map(([name, talent]) => `var kfcDruid_${name} = []float64{${talent.values.join(",")}}`)
      .join("\n"),
    families = [...baseline.ranks, ...rules.ranks]
      .map((rank) => `${rank.id}:${JSON.stringify(rank.family)}`)
      .join(","),
    ranks = rules.ranks
      .map(
        (rank) =>
          `{ID:${rank.id},Family:${JSON.stringify(rank.family)},Rank:${rank.rank},RequiredLevel:${rank.requiredLevel},BaseLevel:${rank.baseLevel},MaxLevel:${rank.maxLevel},Mana:${rank.mana},BaseManaFraction:${rank.baseManaFraction},GCDMs:${rank.gcdMs},CooldownMs:${rank.cooldownMs},DurationMs:${rank.durationMs},TickMs:${rank.tickMs},Base:${rank.base},Coefficient:${rank.coefficient},PointsPerLevel:${rank.pointsPerLevel},Radius:${rank.radius}}`,
      )
      .join(",\n");
  implementation = replace(
    implementation,
    "// KFC_DRUID_ADVANCED_DATA",
    `${arrays}\nconst kfcDruidSwiftnessCooldownMs=${rules.naturesSwiftnessCooldownMs}\nconst kfcDruidRejuvenationExtensionMs=${rules.splendorMs.rejuvenation}\nconst kfcDruidRegrowthExtensionMs=${rules.splendorMs.regrowth}\nvar kfcDruidFamilies=map[int32]string{${families}}\nvar kfcDruidAdvancedRanks=[]kfcDruidAdvancedRank{\n${ranks},\n}`,
  );
  return { baselineSource, implementation };
}
