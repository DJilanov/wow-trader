import assert from "node:assert/strict";
import { currentLevel60Ratings } from "./current-prebis-staging.mjs";

const expectedSets = [
  1, 41, 65, 81, 121, 122, 123, 124, 141, 142, 143, 144, 161, 162, 163, 181, 182, 183, 184, 185,
  186, 187, 188, 189, 321, 444, 467, 468, 469, 471, 472, 473, 483, 484, 485, 486, 487, 488, 489,
  490, 491, 516, 1968,
];

const dynamicKinds = {
  9233: "hostile-melee-proc",
  17332: "hostile-melee-proc",
  18979: "hostile-melee-proc",
  21347: "self-health-regeneration",
  23863: "hostile-melee-proc",
  27498: "hostile-melee-proc",
  27778: "incoming-damage-shield",
  27780: "incoming-crowd-control",
  27787: "hostile-melee-proc",
  27867: "incoming-crowd-control",
  450527: "healing-cast-mana",
  450576: "healing-cast-mana",
  450577: "hostile-attack-mana",
  450585: "healing-cast-self-heal",
  450587: "hostile-melee-proc",
  450608: "healing-cast-mana-dummy",
  450625: "healing-cast-spell-power",
  450626: "healing-cast-spell-power",
  1291796: "low-health-restoration",
  1291807: "hostile-melee-proc",
  1292028: "hostile-melee-proc",
  1293670: "low-health-shield",
  1293674: "incoming-retaliation",
  1299737: "hostile-spell-drain",
  1299740: "hostile-melee-proc",
  1299743: "incoming-melee-spell-power",
  1301123: "hostile-melee-proc",
  1302380: "enemy-spell-reflection",
  1302698: "incoming-control-removal",
  1302708: "incoming-movement-speed",
  1302712: "incoming-control-removal",
  1302716: "incoming-crowd-control",
  1302718: "incoming-crowd-control",
  1302721: "incoming-control-removal",
  1302375: "party-health-regeneration",
};

const expectedMasks = {
  9233: 20,
  17332: 20,
  18979: 20,
  23863: 20,
  27498: 4,
  27778: 139944,
  27780: 139944,
  27787: 4,
  27867: 139944,
  450527: 81920,
  450576: 81920,
  450577: 68,
  450585: 81920,
  450587: 4,
  450608: 81964,
  450625: 81924,
  450626: 81924,
  1291796: 2148182696,
  1291807: 4,
  1292028: 4,
  1293670: 2148182696,
  1293674: 139944,
  1299737: 65536,
  1299740: 4,
  1299743: 40,
  1301123: 20,
  1302380: 2148182696,
  1302698: 139944,
  1302708: 139944,
  1302712: 139944,
  1302716: 131072,
  1302718: 40,
  1302721: 139944,
};

const inactiveAuras = {
  30: "Weapon-skill bonuses are ignored by campaign rules.",
  31: "The admitted healing assignment has no movement.",
  102: "No hostile attack rotation or creature-specific attack-power conversion is admitted.",
  117: "The admitted assignment has no fear events.",
  131: "No hostile attack rotation or creature-specific attack-power conversion is admitted.",
  232: "The admitted assignment has no snare or root events.",
  305: "The admitted assignment has no movement or mounted segment.",
  593: "Friendly healing has no melee avoidance roll.",
};

const ratingChannels = [
  [0x20, "MeleeHit", "Hit - Melee"],
  [0x40, null, "Hit - Ranged"],
  [0x80, "SpellHit", "Hit - Spell"],
  [0x100, "MeleeCrit", "Crit - Melee"],
  [0x200, null, "Crit - Ranged"],
  [0x400, "SpellCrit", "Crit - Spell"],
];

/** Maximum number of distinct set items that fit distinct eligible slots.
 * This is an upper bound; it does not certify a complete acquisition-legal loadout.
 * @param {number[][]} slots @param {Set<number>} itemIds @returns {number}
 */
function matchingSize(slots, itemIds) {
  const assigned = new Map();
  function assign(slot, visited) {
    for (const id of slots[slot]) {
      if (!itemIds.has(id) || visited.has(id)) continue;
      visited.add(id);
      const previous = assigned.get(id);
      if (previous === undefined || assign(previous, visited)) {
        assigned.set(id, slot);
        return true;
      }
    }
    return false;
  }
  for (let slot = 0; slot < slots.length; slot++) assign(slot, new Set());
  return assigned.size;
}

/** Parse the deliberately narrow generated Go data grammar, rejecting drift.
 * @param {string} text @returns {Map<number, object>}
 */
function generatedDefinitions(text) {
  const sets = new Map();
  const pattern =
    /\n\t(\d+): \{Name: ("(?:[^"\\]|\\.)*"), Profession: proto\.Profession\((\d+)\), Bonuses: map\[int32\]foreverEquipmentBonus\{\n(.*?)\n\t\}\},/gs;
  for (const match of text.matchAll(pattern)) {
    const bonuses = new Map();
    for (const line of match[4].trim().split("\n")) {
      const bonus = line.match(
        /^\s*(\d+): \{Supported: (true|false), Stats: stats\.Stats\{(.*?)\}, SpiritRegen: ([\d.]+)\},$/,
      );
      assert(bonus, "Unexpected generated set bonus grammar");
      const stats = {};
      for (const field of bonus[3].split(",").filter(Boolean)) {
        const value = field.trim().match(/^stats\.(\w+): (-?[\d.]+)$/);
        assert(value, "Unexpected generated set stat grammar");
        stats[value[1]] = Number(value[2]);
      }
      assert(!bonuses.has(Number(bonus[1])), "Duplicate generated threshold");
      bonuses.set(Number(bonus[1]), {
        supported: bonus[2] === "true",
        stats,
        spiritRegen: Number(bonus[4]),
      });
    }
    assert(!sets.has(Number(match[1])), "Duplicate generated set");
    sets.set(Number(match[1]), {
      name: JSON.parse(match[2]),
      profession: Number(match[3]),
      bonuses,
    });
  }
  assert(sets.size > 40, "Missing generated set inventory");
  return sets;
}

/** Independently account for every current bonus before numerical set admission.
 * The audit exposes pending runtime work; it never qualifies or excludes gear.
 * @param {object} source @param {string} generatedSource @returns {object}
 */
export function auditPaladinHealingSets(source, generatedSource) {
  assert.equal(source.schema, "kfc-paladin-healing-set-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  assert.equal(source.serverMechanicsVerified, false);
  assert.equal(source.publicationAllowed, false);
  assert.equal(source.eligibleItems, 2249);
  const { tables } = source;
  const unique = (rows, key) => {
    const map = new Map(rows.map((row) => [row[key], row]));
    assert.equal(map.size, rows.length, `Duplicate ${key} source row`);
    return map;
  };
  const definitions = unique(tables.ItemSet, "id");
  assert.deepEqual(
    [...definitions.keys()].sort((a, b) => a - b),
    expectedSets,
  );
  assert.equal(tables.ItemSetSpell.length, 136);
  unique(tables.ItemSetSpell, "id");
  unique(tables.SpellEffect, "id");
  const names = unique(tables.SpellName, "id");
  const options = unique(tables.SpellAuraOptions, "SpellID");
  const descriptions = unique(tables.Spell, "id");
  const items = unique(source.items, "id");
  const generated = generatedDefinitions(generatedSource);
  const ratings = currentLevel60Ratings(source.ratings);
  assert(source.enums["flags/ProcTypeMask0.dbdf"].includes("0x4000 DEAL_HELPFUL_SPELL"));
  assert(source.enums["flags/ProcTypeMask0.dbdf"].includes("0x40 DEAL_RANGED_ATTACK"));
  assert(source.enums["flags/CombatRatingFlags.dbdf"].includes("0x400 CR_CRIT_SPELL"));
  assert.equal(source.profiles.length, 30);
  assert(source.integration.talents.includes("holy.registerKFCSoulforgeHealing()"));

  const groups = new Map();
  const bonuses = [];
  for (const bonus of [...tables.ItemSetSpell].sort(
    (a, b) => a.ItemSetID - b.ItemSetID || a.Threshold - b.Threshold || a.SpellID - b.SpellID,
  )) {
    const definition = definitions.get(bonus.ItemSetID);
    assert(definition && names.has(bonus.SpellID) && descriptions.has(bonus.SpellID));
    assert.equal(bonus.ChrSpecID, 0);
    assert.equal(bonus.TraitSubTreeID, 0);
    assert(Number.isInteger(bonus.Threshold) && bonus.Threshold > 0 && bonus.Threshold <= 8);
    const effects = tables.SpellEffect.filter((row) => row.SpellID === bonus.SpellID).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
    assert(effects.length > 0, "Missing current set effect");
    const option = options.get(bonus.SpellID);
    const statValues = {};
    let spiritRegen = 0;
    const classifications = [];
    function add(name, value) {
      assert(Number.isFinite(value));
      statValues[name] = (statValues[name] ?? 0) + value;
    }
    if (Object.hasOwn(dynamicKinds, bonus.SpellID)) {
      const kind = dynamicKinds[bonus.SpellID];
      const mask = option ? option.ProcTypeMask[0] >>> 0 : 0;
      if (Object.hasOwn(expectedMasks, bonus.SpellID)) {
        assert(option, "Missing set proc options");
        assert.equal(mask, expectedMasks[bonus.SpellID], "Unreviewed set trigger mask");
        assert.equal(option.ProcTypeMask[1], 0);
        assert.equal(option.SpellProcsPerMinuteID, 0);
        assert.equal(option.DifficultyID, 0);
      } else assert.equal(option, undefined, "Unreviewed regeneration proc options");
      const absentEvent = [
        "hostile-melee-proc",
        "hostile-attack-mana",
        "hostile-spell-drain",
      ].includes(kind);
      if (kind === "hostile-melee-proc") assert((mask & 20) !== 0 && (mask & 0x4000) === 0);
      if (kind === "hostile-attack-mana") assert.equal(mask, 68);
      if (kind === "hostile-spell-drain") assert.equal(mask, 0x10000);
      classifications.push({
        kind,
        status: absentEvent ? "inactive-in-declared-assignment" : "runtime-review-required",
        reason: absentEvent
          ? "The admitted controller performs no hostile melee, ranged or damage-spell rotation."
          : "Source effect requires an owned runtime, event-scope and lifecycle qualification before numerical admission.",
      });
    } else {
      for (const effect of effects) {
        assert.equal(effect.Effect, 6, "Unclassified non-aura set effect");
        assert.equal(effect.EffectTriggerSpell, 0);
        assert.deepEqual(effect.ImplicitTarget, [1, 0]);
        const value = effect.EffectBasePointsF;
        const misc = effect.EffectMiscValue[0];
        const aura = effect.EffectAura;
        let flat = true;
        if (aura === 13) {
          assert([126, 2].includes(misc));
          add(misc === 126 ? "SpellDamage" : "HolyPower", value);
        } else if (aura === 135) {
          assert.equal(misc, 126);
          add("HealingPower", value);
        } else if (aura === 22) {
          assert([32, 64, 126].includes(misc));
          for (const [bit, school] of [
            [4, "Fire"],
            [8, "Nature"],
            [16, "Frost"],
            [32, "Shadow"],
            [64, "Arcane"],
          ])
            if ((misc & bit) !== 0) add(school + "Resistance", value);
        } else if (aura === 29) {
          assert([0, 2, 3].includes(misc));
          add({ 0: "Strength", 2: "Stamina", 3: "Intellect" }[misc], value);
        } else if (aura === 30 && misc === 95) add("Defense", value);
        else if (aura === 674) {
          assert.equal(misc, 1);
          add("BonusArmor", value);
        } else if ([52, 54, 55, 57, 85, 99, 124].includes(aura)) {
          assert.equal(misc, 0);
          add(
            {
              52: "MeleeCrit",
              54: "MeleeHit",
              55: "SpellHit",
              57: "SpellCrit",
              85: "MP5",
              99: "AttackPower",
              124: "RangedAttackPower",
            }[aura],
            value,
          );
        } else if (aura === 134) {
          assert.equal(misc, 0);
          spiritRegen += value / 100;
        } else if (aura === 189) {
          assert([224, 1792].includes(misc));
          for (const [flag, name, rating] of ratingChannels)
            if ((misc & flag) !== 0 && name) add(name, value / ratings[rating]);
        } else if (aura === 290) {
          assert.equal(misc, 0);
          add("MeleeCrit", value);
          add("SpellCrit", value);
        } else {
          assert(Object.hasOwn(inactiveAuras, aura), `Unclassified set aura ${aura}`);
          if (aura === 30) assert.equal(misc, 173);
          classifications.push({
            kind: "scoped-utility",
            status: "inactive-in-declared-assignment",
            reason: inactiveAuras[aura],
          });
          flat = false;
        }
        if (flat) classifications.push({ kind: "current-flat-effect", status: "source-accounted" });
      }
    }
    const row = {
      setId: bonus.ItemSetID,
      pieces: bonus.Threshold,
      spellId: bonus.SpellID,
      name: names.get(bonus.SpellID).Name_lang,
      description: descriptions.get(bonus.SpellID).Description_lang,
      effectRowIds: effects.map((effect) => effect.id),
      proc: option
        ? {
            chance: option.ProcChance,
            mask: option.ProcTypeMask,
            cooldownMs: option.ProcCategoryRecovery,
            ppmId: option.SpellProcsPerMinuteID,
          }
        : null,
      stats: statValues,
      spiritRegen,
      classifications,
      retainedInEquipmentDomain: true,
    };
    bonuses.push(row);
    const key = `${row.setId}:${row.pieces}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const contexts = source.profiles.map((profile, index) => {
    assert([1, 2].includes(profile.faction));
    assert.equal(profile.slots.length, 17);
    assert.equal(new Set(profile.professions).size, profile.professions.length);
    for (const slot of profile.slots) assert.equal(new Set(slot).size, slot.length);
    return {
      index,
      faction: profile.faction,
      professions: profile.professions.slice(),
      sets: expectedSets.map((id) => {
        const definition = definitions.get(id);
        const members = new Set(
          [...items.values()].filter((item) => item.setId === id).map((item) => item.id),
        );
        assert(members.size > 0);
        for (const member of members)
          assert(definition.ItemID.includes(member), "Catalog/current set membership disagreement");
        assert([0, 164].includes(definition.RequiredSkill));
        const professionQualified =
          definition.RequiredSkill === 0 || profile.professions.includes(2);
        const maximumPieces = matchingSize(profile.slots, members);
        return {
          setId: id,
          maximumPieces,
          professionQualified,
          maximumActivePieces: professionQualified ? maximumPieces : 0,
          completeLoadoutCertified: false,
        };
      }),
    };
  });
  const thresholds = [...groups.values()].map((rows) => {
    const { setId, pieces } = rows[0];
    const stats = {};
    for (const row of rows)
      for (const [name, value] of Object.entries(row.stats))
        stats[name] = (stats[name] ?? 0) + value;
    const spiritRegen = rows.reduce((sum, row) => sum + row.spiritRegen, 0);
    const actual = generated.get(setId)?.bonuses.get(pieces);
    const differences = [];
    if (actual?.supported) {
      for (const name of new Set([...Object.keys(stats), ...Object.keys(actual.stats)])) {
        if (Math.abs((stats[name] ?? 0) - (actual.stats[name] ?? 0)) > 1e-8)
          differences.push({ name, current: stats[name] ?? 0, generated: actual.stats[name] ?? 0 });
      }
      if (Math.abs(spiritRegen - actual.spiritRegen) > 1e-8)
        differences.push({
          name: "SpiritRegen",
          current: spiritRegen,
          generated: actual.spiritRegen,
        });
    }
    const reachableContexts = contexts
      .filter(
        (context) => context.sets.find((set) => set.setId === setId).maximumActivePieces >= pieces,
      )
      .map((context) => context.index);
    const runtimeKinds = rows.flatMap((row) =>
      row.classifications
        .filter((value) => value.status === "runtime-review-required")
        .map((value) => value.kind),
    );
    return {
      setId,
      pieces,
      spellIds: rows.map((row) => row.spellId),
      stats,
      spiritRegen,
      currentGeneratedDefinition: generated.has(setId),
      generatedSupported: actual?.supported ?? false,
      generatedDifferences: differences,
      generatedFlatMatches: actual?.supported === true && differences.length === 0,
      runtimeKinds,
      reachableContexts,
      maximumActivePieces: Math.max(
        ...contexts.map(
          (context) => context.sets.find((set) => set.setId === setId).maximumActivePieces,
        ),
      ),
      status:
        reachableContexts.length === 0
          ? "unreachable-within-slot-upper-bound"
          : runtimeKinds.length > 0
            ? "runtime-review-required"
            : "source-accounted-runtime-verification-required",
    };
  });
  assert.equal(thresholds.length, 134);
  assert.equal(bonuses.length, 136);
  return {
    schema: "kfc-paladin-healing-set-audit.v1",
    sourceBuild: 70532,
    setIds: expectedSets.slice(),
    bonuses,
    thresholds,
    contexts,
    summary: {
      setIds: definitions.size,
      bonusSpells: bonuses.length,
      thresholds: thresholds.length,
      contexts: contexts.length,
      unreachableThresholds: thresholds.filter((row) => row.reachableContexts.length === 0).length,
      missingGeneratedDefinitions: [...definitions.keys()].filter((id) => !generated.has(id)),
      explicitGeneratedDifferences: thresholds.filter((row) => row.generatedDifferences.length > 0),
      runtimeReviewThresholds: thresholds
        .filter((row) => row.reachableContexts.length > 0 && row.runtimeKinds.length > 0)
        .map((row) => ({ setId: row.setId, pieces: row.pieces, kinds: row.runtimeKinds })),
    },
    beaststalkerHealingCastEligible: false,
    soulforgeAndLightforgeProcMasksInterchangeable: false,
    slotMatchingCertifiesAcquisition: false,
    omittedEffectsAssumedZero: false,
    numericalAdmission: false,
    startsNewClassClock: false,
    serverMechanicsVerified: false,
    publicationAllowed: false,
  };
}
