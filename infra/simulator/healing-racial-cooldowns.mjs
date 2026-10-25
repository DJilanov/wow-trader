import assert from "node:assert/strict";

/** @param {object} evidence @returns {object} */
export function extractHealingRacialRules(evidence) {
  assert.equal(evidence.schema, "kfc-healing-racial-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(
    evidence.source.manifest.byteSha256,
    "9196f29921c4ba0cb38b5f649cdcf19ff03f667f6d560e8493a69b69682d7fcc",
  );
  assert.equal(evidence.serverVerified, false);
  assert.equal(evidence.publicationAllowed, false);
  assert.equal(evidence.effects.length, 3);
  for (const [index, aura] of [319, 140, 65].entries()) {
    const rows = evidence.effects.filter((row) => row.EffectIndex === index);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.deepEqual(
      [
        row.SpellID,
        row.DifficultyID,
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.ScalingClass,
        row.EffectRealPointsPerLevel,
      ],
      [20554, 0, 6, aura, 10, 0, 0],
    );
    assert.deepEqual(row.ImplicitTarget, [1, 0]);
  }
  assert.equal(evidence.misc.length, 1);
  assert.equal(evidence.misc[0].SpellID, 20554);
  const duration = evidence.durations.find((row) => row.id === evidence.misc[0].DurationIndex);
  assert(duration);
  assert.deepEqual(
    [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
    [10000, 10000, 0],
  );
  assert.equal(evidence.cooldowns.length, 1);
  assert.deepEqual(
    [
      evidence.cooldowns[0].SpellID,
      evidence.cooldowns[0].RecoveryTime,
      evidence.cooldowns[0].CategoryRecoveryTime,
      evidence.cooldowns[0].StartRecoveryTime,
    ],
    [20554, 180000, 0, 0],
  );
  assert.equal(evidence.power.length, 0);
  assert.equal(evidence.abilities.length, 1);
  assert.equal(evidence.abilities[0].Spell, 20554);
  assert.deepEqual(evidence.abilities[0].RaceMasks, [128, 0]);
  return {
    schema: "kfc-healing-racial-rules.v1",
    spellId: 20554,
    race: "troll",
    castSpeedMultiplier: 1.1,
    durationMs: 10000,
    cooldownMs: 180000,
    implicitActivation: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** Extend the frozen resource policy with one explicit, owned racial.
 * @param {string} source @param {object} rules @returns {string}
 */
export function renderHealingRacialCooldowns(source, rules) {
  assert.equal(rules.schema, "kfc-healing-racial-rules.v1");
  assert.equal(rules.spellId, 20554);
  const changes = [
    [
      '"github.com/wowsims/classic/sim/core"',
      '"github.com/wowsims/classic/sim/core"\n\t"github.com/wowsims/classic/sim/core/proto"',
    ],
    [
      "\t\treviewed := policy.SpellID == 15604",
      '\t\tif policy.SpellID == 20554 && (healer.Race != proto.Race_RaceTroll || policy.MinimumMissingMana != 0) {\n\t\t\treturn fmt.Errorf("invalid racial owner or mana threshold")\n\t\t}\n\t\treviewed := policy.SpellID == 15604 || policy.SpellID == 20554',
    ],
    ["unreviewed healing resource cooldown", "unreviewed explicit healing cooldown"],
  ];
  let derived = source;
  for (const [before, after] of changes) {
    assert.equal(derived.split(before).length, 2, "Missing or ambiguous racial policy anchor");
    derived = derived.replace(before, after);
  }
  return derived;
}
