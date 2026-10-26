import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Effect, aura, first misc value, primary target, triggered spell. The complete
// vector is checked so a newly helpful payload cannot inherit an old exclusion.
const rules = [
  [872, 1291896, "gathering", [[33, 0, 0, 23, 0]]],
  [1490, 1300364, "detection", [[6, 152, 0, 1, 0]]],
  [4264, 9174, "rage", [[30, 0, 1, 1, 0]]],
  [4328, 9774, "movement-control", [[6, 77, 7, 1, 0]]],
  [7189, 8892, "movement", [[6, 31, 0, 1, 0]]],
  [7391, 9175, "movement", [[6, 31, 0, 1, 0]]],
  [
    8348,
    10578,
    "hostile-action",
    [
      [2, 0, 0, 6, 0],
      [6, 3, 0, 6, 0],
    ],
  ],
  [8367, 10618, "magic-absorb", [[6, 69, 126, 1, 0]]],
  [9404, 12438, "falling", [[6, 105, 0, 1, 0]]],
  [9449, 13494, "attack-speed", [[6, 319, 0, 1, 0]]],
  [10030, 12022, "party-stamina", [[35, 29, 2, 1, 0]]],
  [10518, 12438, "falling", [[6, 105, 0, 1, 0]]],
  [10543, 12561, "fire-absorb", [[6, 69, 4, 1, 0]]],
  [
    10588,
    22641,
    "hostile-action",
    [
      [96, 0, 0, 6, 0],
      [64, 0, 0, 6, 13327],
    ],
  ],
  [
    10625,
    1300180,
    "stealth",
    [
      [6, 16, 0, 1, 0],
      [6, 33, 0, 1, 0],
    ],
  ],
  [10721, 13234, "malfunctioning-absorb", [[6, 69, 127, 1, 0]]],
  [10724, 13141, "movement", [[6, 31, 0, 1, 0]]],
  [10726, 13180, "hostile-action", [[3, 0, 0, 6, 0]]],
  [11625, 1300754, "hostile-action", [[6, 6, 0, 6, 0]]],
  [11702, 1300763, "gathering", [[3, 0, 0, 6, 0]]],
  [11811, 1300752, "armor", [[6, 674, 1, 1, 0]]],
  [12344, 16349, "encounter-actor", [[61, 0, 4622, 0, 0]]],
  [
    12532,
    16470,
    "armor-with-cast-lock",
    [
      [6, 674, 1, 1, 0],
      [6, 60, 127, 1, 0],
    ],
  ],
  [
    13164,
    17275,
    "fire-resistance",
    [
      [6, 15, 0, 1, 0],
      [6, 22, 4, 1, 0],
    ],
  ],
  [13213, 1308917, "disarm-removal", [[108, 0, 3, 21, 0]]],
  [13353, 17490, "guardian", [[28, 0, 11200, 32, 0]]],
  [13379, 18400, "cosmetic", [[6, 23, 0, 1, 17512]]],
  [
    13382,
    6251,
    "guardian",
    [
      [28, 0, 11199, 47, 0],
      [0, 0, 0, 0, 0],
    ],
  ],
  [13515, 1299443, "hostile-action", [[6, 12, 0, 6, 0]]],
  [13965, 1318944, "hostile-critical-strike", [[6, 306, 0, 6, 0]]],
  [14134, 18364, "hostile-periodic", [[6, 23, 0, 1, 18374]]],
  [16022, 19804, "guardian", [[28, 0, 12473, 18, 0]]],
  [17744, 21954, "poison-removal", [[38, 0, 4, 1, 0]]],
  [18047, 1301625, "lava", [[6, 69, 4, 1, 0]]],
  [18340, 1302362, "shadow-absorb", [[6, 69, 32, 1, 0]]],
  [18370, 1302264, "dodge", [[6, 49, 0, 1, 0]]],
  [18537, 1302356, "hostile-melee-control", [[6, 42, 0, 1, 1302357]]],
  [18634, 23131, "frost-reflection", [[6, 74, 16, 1, 0]]],
  [18638, 23097, "fire-reflection", [[6, 74, 4, 1, 0]]],
  [18639, 23132, "shadow-reflection", [[6, 74, 32, 1, 0]]],
  [20071, 23991, "physical-absorb", [[6, 69, 1, 1, 0]]],
  [20072, 23991, "physical-absorb", [[6, 69, 1, 1, 0]]],
  [21115, 25746, "physical-absorb", [[6, 69, 1, 1, 0]]],
  [21116, 25747, "physical-absorb", [[6, 69, 1, 1, 0]]],
  [21117, 25746, "physical-absorb", [[6, 69, 1, 1, 0]]],
  [21118, 25747, "physical-absorb", [[6, 69, 1, 1, 0]]],
  [21119, 25750, "physical-absorb", [[6, 69, 1, 1, 0]]],
  [21120, 25750, "physical-absorb", [[6, 69, 1, 1, 0]]],
  [249469, 1249110, "damage-power", [[6, 13, 48, 1, 0]]],
  [
    249470,
    1249113,
    "attack-power",
    [
      [6, 99, 0, 1, 0],
      [6, 124, 0, 1, 0],
    ],
  ],
  [260819, 23453, "transport", [[3, 0, 0, 1, 0]]],
  [260820, 23442, "transport", [[252, 0, 0, 1, 0]]],
  [260821, 1269339, "transport", [[3, 0, 0, 1, 0]]],
  [260824, 1270941, "hostile-action", [[3, 0, 0, 6, 0]]],
  [272437, 1291097, "all-school-absorb", [[6, 69, 127, 1, 0]]],
  [272440, 1291105, "block", [[6, 51, 0, 1, 0]]],
  [274444, 438273, "movement-control", [[6, 77, 1, 1, 0]]],
  [280310, 12883, "vision", [[6, 76, 15, 1, 0]]],
  [280311, 12883, "vision", [[6, 76, 15, 1, 0]]],
  [280312, 12883, "vision", [[6, 76, 15, 1, 0]]],
];

const admitted = [
  4262, 4381, 8346, 11808, 11819, 13143, 13937, 13968, 18371, 18637, 272438, 272439,
];
const pending = new Set([
  "magic-absorb",
  "party-stamina",
  "fire-absorb",
  "malfunctioning-absorb",
  "fire-resistance",
  "shadow-absorb",
  "fire-reflection",
  "shadow-reflection",
  "all-school-absorb",
]);
const outside = new Set(["guardian", "encounter-actor"]);
const assignmentHashes = {
  workload: "453473e7037cbb4f0c3a0f3700e01849007597d3bea0a541e5e660cc917225c3",
  utility: "510aedb403584a58b0393c25e5b0597c07928b3c4d74776ddc81b9bdcef06e94",
  consumes: "d5d0f17a304ce41486570b2142ffb1b42fd59c23b0a27861ce5d39e8466f985f",
  shield: "055861eecad34192bd93a6539e7e6046d1947e0f2f0f0477c765cc2f98e96af5",
  passives: "28bfcb0742e847bd32e14b7ea07a9ad48f63d541721a461aa1a048379ca9aae2",
};
const reasons = {
  gathering: "No gathering/corpse interaction or gathered consumable use occurs during this fight.",
  detection: "The controlled fight has no proximity acquisition or detection checks.",
  rage: "The Shaman has a mana resource; this effect energizes rage only.",
  "movement-control": "No roots, movement impairments or loss-of-control events are scheduled.",
  movement: "Positions remain fixed; running speed cannot improve this assignment.",
  falling: "No falling or fall damage is scheduled.",
  stealth: "No threat/detection traversal is scheduled; stealth supplies no healing resource.",
  "hostile-action":
    "This use targets an enemy; the healing controller has no hostile action decisions.",
  "attack-speed":
    "This modifies attack speed, not spell casting; no outgoing attacks are scheduled.",
  armor:
    "Incoming demand is already post-mitigation and never targets the caster; resource self damage is magical.",
  "armor-with-cast-lock":
    "Armor cannot reduce this demand or magical resource damage; the extra cast lock supplies no healing benefit.",
  "encounter-actor":
    "A server encounter script is not part of the declared player-only roster; no summoned support is inferred.",
  "disarm-removal": "No disarm is scheduled; this current effect supplies no heal or mana payload.",
  guardian:
    "Activating a separate actor is outside this player-only assignment; its equipment remains a candidate.",
  cosmetic: "The triggered payload is a dance emote, not a healing/resource/stat effect.",
  "hostile-critical-strike":
    "The mark increases critical chance against an enemy, not friendly healing critical chance.",
  "hostile-periodic":
    "The triggered area payload damages enemies; it supplies no friendly healing resource.",
  "poison-removal": "No poison aura or poison-removal objective is scheduled.",
  lava: "The description restricts this zero-value protection to lava; no lava is scheduled. It is not a general Fire shield.",
  dodge:
    "No avoidable attack against the caster is scheduled; magical resource damage cannot be dodged.",
  "hostile-melee-control":
    "No hostile melee attack against the caster triggers the disarm payload.",
  "frost-reflection":
    "No incoming Frost spell exists in this assignment or its two resource self-damage actions.",
  "physical-absorb":
    "This school mask covers physical damage only; the caster only takes Fire/Shadow resource damage.",
  "damage-power":
    "This modifies Frost/Shadow damage only, not healing or the owned Intellect conversion.",
  "attack-power":
    "Attack power does not feed the owned Intellect-to-SpellPower conversion; no attacks are scheduled.",
  transport:
    "Leaving the encounter is outside the declared stationary assignment; no transport benefit is scored.",
  block: "No blockable attack against the caster is scheduled.",
  vision: "Vision range does not change the explicit friendly positions or casting range.",
  "magic-absorb":
    "Can absorb resource self damage; require school-specific pools, duration, replacement and ordering controls.",
  "party-stamina":
    "Can change caster health and party stamina; stacking with raid support, range and health changes need explicit qualification.",
  "fire-absorb":
    "Can absorb Circle's Fire self damage; must not absorb Demonic Rune's Shadow damage.",
  "malfunctioning-absorb":
    "The all-school pool is relevant; the described overload has no captured server probability or script.",
  "fire-resistance":
    "Can mitigate Circle self damage; verify school resistance and damage-shield behavior separately.",
  "shadow-absorb":
    "Can absorb Demonic Rune's Shadow self damage; must not absorb Circle's Fire damage.",
  "fire-reflection":
    "Self-cast periodic Fire eligibility is unverified; do not assume this returns damage, prevents it or has no effect.",
  "shadow-reflection":
    "Self-cast Rune eligibility is unverified; do not assume this returns damage, prevents it or has no effect.",
  "all-school-absorb":
    "The all-school pool can absorb resource self damage; depletion/explosion and shared cooldown behavior need controls.",
};

function one(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
}

function validateAssignment(code) {
  for (const [name, expected] of Object.entries(assignmentHashes)) {
    assert.equal(
      createHash("sha256").update(code[name]).digest("hex"),
      expected,
      name + " scope needs a new source review",
    );
  }
  for (const [name, fragments] of Object.entries({
    workload: [
      "units[event.RaidIndex] == &healer.Unit",
      "unscheduled enemy behaviors need separate workload admission",
      "player.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}",
      "result.Damage = event.Amount",
      "kfcShamanEquippedInactiveExtras(sim, units)",
    ],
    utility: [
      "SpellSchool: core.SpellSchoolFire",
      "dot.Spell.CalcAndDealPeriodicDamage(sim, &resto.Unit, damage",
    ],
    consumes: [
      "SpellSchool:      SpellSchoolShadow",
      "demonicRuneDamage.CalcAndDealDamage(sim, &character.Unit, damage",
    ],
    passives: ["resto.AddStatDependency(stats.Intellect, stats.SpellPower"],
  })) {
    for (const fragment of fragments)
      assert(code[name].includes(fragment), `${name} assignment changed: ${fragment}`);
  }
}

/** Review every current on-use root without discarding gear or granting runtime admission.
 * @param {object} source @returns {object}
 */
export function reviewShamanActiveItemScope(source) {
  assert.equal(source.schema, "kfc-shaman-active-item-source.v1");
  assert.equal(source.sourceBuild, 70532);
  assert.equal(source.serverMechanicsVerified, false);
  assert.deepEqual(source.unresolvedDescriptionSpellIds, []);
  assert.equal(source.rows.length, 72);
  assert.equal(new Set(source.rows.map((row) => row.itemId)).size, 72);
  validateAssignment(source.code);
  const { tables } = source;
  assert.equal(source.spellClosure.length, 75);
  assert.equal(new Set(source.spellClosure).size, 75);
  for (const name of ["Spell", "SpellName"]) {
    assert.deepEqual(
      tables[name].map((row) => row.id).sort((a, b) => a - b),
      [...source.spellClosure].sort((a, b) => a - b),
    );
  }
  assert(tables.SpellEffect.every((row) => source.spellClosure.includes(row.SpellID)));
  const effects = (id) =>
    tables.SpellEffect.filter((row) => row.SpellID === id).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
  for (const id of source.spellClosure) {
    one(tables.Spell, (row) => row.id === id, "Spell " + id);
    one(tables.SpellName, (row) => row.id === id, "SpellName " + id);
    for (const effect of effects(id))
      if (effect.EffectTriggerSpell)
        assert(
          source.spellClosure.includes(effect.EffectTriggerSpell),
          "Missing triggered spell " + effect.EffectTriggerSpell,
        );
  }
  const definitions = new Map(
    rules.map(([id, spellId, kind, vectors]) => [id, { spellId, kind, vectors }]),
  );
  assert.equal(definitions.size, 60);
  const decisions = source.rows.map((row) => {
    const common = {
      itemId: row.itemId,
      name: row.name,
      spellId: row.effect.SpellID,
      retainedInEquipmentDomain: true,
      serverAcquisitionVerified: false,
    };
    assert.equal(row.link.ItemID, row.itemId);
    assert.equal(row.link.ItemEffectID, row.effect.id);
    assert.deepEqual(
      [row.effect.TriggerType, row.effect.ChrSpecializationID, row.effect.PlayerConditionID],
      [0, 0, 0],
    );
    if (admitted.includes(row.itemId)) {
      assert.equal(row.explicitUseControllerAdmitted, true);
      return {
        ...common,
        classification: "existing-owned-controller",
        reason:
          "Separate parent native/browser controller evidence is retained; this source review adds no runtime admission.",
      };
    }
    assert.equal(row.explicitUseControllerAdmitted, false);
    const rule = definitions.get(row.itemId);
    assert(rule, "Unreviewed active item " + row.itemId);
    assert.equal(row.effect.SpellID, rule.spellId);
    const payload = effects(rule.spellId);
    assert.deepEqual(
      payload.map((entry) => [
        entry.Effect,
        entry.EffectAura,
        entry.EffectMiscValue[0],
        entry.ImplicitTarget[0],
        entry.EffectTriggerSpell,
      ]),
      rule.vectors,
      "Changed root mechanics for item " + row.itemId,
    );
    const { kind } = rule;
    if (kind === "cosmetic")
      assert.deepEqual(
        effects(17512).map((entry) => [entry.Effect, entry.EffectAura]),
        [[77, 0]],
      );
    if (kind === "hostile-periodic")
      assert.deepEqual(
        effects(18374).map((entry) => [entry.Effect, entry.EffectAura, ...entry.ImplicitTarget]),
        [[2, 0, 22, 15]],
      );
    if (kind === "hostile-melee-control")
      assert.deepEqual(
        effects(1302357).map((entry) => [entry.Effect, entry.EffectAura, ...entry.ImplicitTarget]),
        [[6, 67, 6, 0]],
      );
    if (row.itemId === 10588) {
      assert.deepEqual(
        effects(13327).map((entry) => [
          entry.Effect,
          entry.EffectAura,
          entry.ImplicitTarget[0],
          entry.EffectTriggerSpell,
        ]),
        [
          [6, 12, 6, 0],
          [64, 0, 6, 22646],
        ],
      );
      assert.deepEqual(
        effects(22646).map((entry) => [entry.Effect, entry.EffectAura, entry.ImplicitTarget[0]]),
        [[6, 4, 6]],
      );
    }
    if (kind === "lava") {
      assert.equal(payload[0].EffectBasePointsF, 0);
      assert(
        one(
          tables.Spell,
          (entry) => entry.id === rule.spellId,
          "Lava description",
        ).Description_lang.includes("Lava"),
      );
    }
    const classification = pending.has(kind)
      ? "needs-runtime-or-reference-qualification"
      : outside.has(kind)
        ? "outside-declared-actor-scope"
        : "inactive-or-no-benefit-in-declared-assignment";
    const decision = { ...common, kind, classification, reason: reasons[kind] };
    assert(decision.reason, kind);
    if (pending.has(kind)) {
      decision.clientEffects = payload;
      decision.itemUse = row.effect;
      const misc = one(tables.SpellMisc, (entry) => entry.SpellID === rule.spellId, "Use metadata");
      decision.duration =
        misc.DurationIndex === 0
          ? null
          : one(tables.SpellDuration, (entry) => entry.id === misc.DurationIndex, "Use duration");
      decision.auraOptions = tables.SpellAuraOptions.filter(
        (entry) => entry.SpellID === rule.spellId,
      );
      decision.radius = payload.flatMap((entry) =>
        [...new Set(entry.EffectRadiusIndex.filter((id) => id !== 0))].map((id) =>
          one(tables.SpellRadius, (value) => value.id === id, "Use radius"),
        ),
      );
      decision.runtimeAdmitted = false;
    }
    return decision;
  });
  assert.deepEqual(
    decisions
      .filter((row) => row.classification === "existing-owned-controller")
      .map((row) => row.itemId)
      .sort((a, b) => a - b),
    admitted,
  );
  assert.deepEqual(
    decisions
      .filter((row) => row.kind)
      .map((row) => row.itemId)
      .sort((a, b) => a - b),
    [...definitions.keys()].sort((a, b) => a - b),
  );
  const counts = Object.fromEntries(
    [...new Set(decisions.map((row) => row.classification))].map((kind) => [
      kind,
      decisions.filter((row) => row.classification === kind).length,
    ]),
  );
  return structuredClone({
    schema: "kfc-shaman-active-item-scope.v1",
    sourceBuild: source.sourceBuild,
    candidateItems: 2025,
    currentUseItems: decisions.length,
    spellClosureCount: source.spellClosure.length,
    counts,
    decisions,
    remainingRelevantItemIds: decisions
      .filter((row) => row.classification === "needs-runtime-or-reference-qualification")
      .map((row) => row.itemId),
    outsideActorItemIds: decisions
      .filter((row) => row.classification === "outside-declared-actor-scope")
      .map((row) => row.itemId),
    schoolSpecificShieldSupportRequired: true,
    serverMechanicsVerified: false,
    allCandidateActiveChoicesAdmitted: false,
    fullEquipmentAdmission: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  });
}
