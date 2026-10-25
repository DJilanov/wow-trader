import assert from "node:assert/strict";
import { simulationHash } from "./simulation-cache.mjs";

export const healerRaidSupportIdentity =
  "e73056b7d7385b98f13bbd8c1ca77444bec743e38d22d627a680eb0415837f7d";

/** Bind current aura values and the absence of the removed Enhancing Totems talent.
 * @param {object} evidence @returns {object}
 */
export function validateHealingRaidBuffSource(evidence) {
  assert.equal(evidence.schema, "kfc-healer-raid-buff-source.v1");
  assert.equal(evidence.source.clientVersion, "1.60.1.70532");
  assert.equal(
    evidence.source.manifestSha256,
    "9196f29921c4ba0cb38b5f649cdcf19ff03f667f6d560e8493a69b69682d7fcc",
  );
  assert.equal(evidence.source.traitDefinitionCount, 659);
  assert.equal(evidence.traitDefinitions.length, 659);
  assert(
    !evidence.traitDefinitions.some((row) => [16259, 16295].includes(row.SpellID)),
    "Enhancing Totems needs a new review",
  );
  assert(evidence.traitDefinitions.some((row) => row.SpellID === 16187));
  assert.equal(evidence.effects.length, 4);
  for (const [id, effect, aura, amount, misc, target] of [
    [20217, 6, 137, 10, [-1, 31], 21],
    [24907, 65, 57, 3, [0, 0], 1],
    [25360, 65, 29, 89, [1, 0], 1],
    [25362, 65, 29, 53, [0, 0], 1],
  ]) {
    const rows = evidence.effects.filter((row) => row.SpellID === id);
    assert.equal(rows.length, 1);
    assert.deepEqual(
      [rows[0].Effect, rows[0].EffectAura, rows[0].EffectBasePointsF, rows[0].EffectMiscValue],
      [effect, aura, amount, misc],
    );
    assert.deepEqual(rows[0].ImplicitTarget, [target, 0]);
    for (const key of ["DifficultyID", "Variance", "ScalingClass", "EffectRealPointsPerLevel"])
      assert.equal(rows[0][key], 0);
  }
  return {
    schema: "kfc-healer-raid-buff-rules.v1",
    kingsStatMultiplier: 1.1,
    moonkinSpellCrit: 0.03,
    strengthOfEarth: 53,
    graceOfAir: 89,
    enhancingTotemsAvailable: false,
    serverVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

function assertSupport(support) {
  assert.equal(support.version, "full-v2");
  assert.equal(
    simulationHash(support),
    healerRaidSupportIdentity,
    "Healer raid support changed; review the shared policy before starting a new study",
  );
}

/** Apply the reviewed shared raid support; acquisition and complete-loadout checks stay separate.
 * @param {object} settings @param {object} support @returns {object}
 */
export function createHealerRaidSettings(settings, support) {
  assertSupport(support);
  const player = settings.player;
  assert(
    player &&
      [1, 4, 5, 7, "ClassDruid", "ClassPaladin", "ClassPriest", "ClassShaman"].includes(
        player.class,
      ),
  );
  assert([undefined, 0, 60].includes(player.level));
  assert.equal(settings.settings?.ruleset, "RulesetForever");
  assert.equal(player.equipment?.items?.length, 17);
  assert(!player.healingModel, "External healing must not be credited to the studied healer");
  const next = globalThis.structuredClone(settings);
  next.player.level = 60;
  next.raidBuffs = globalThis.structuredClone(support.raid);
  next.partyBuffs = globalThis.structuredClone(support.party);
  next.player.buffs = globalThis.structuredClone(support.individual);
  return next;
}

/** Share the exact input policy with native/browser controls instead of hand-copying buff fields.
 * @param {object} support @returns {string}
 */
export function renderHealerRaidFrameFixture(support) {
  assertSupport(support);
  return `package healing\n\nconst kfcHealingFullRaidDefaultsJSON = ${JSON.stringify(JSON.stringify(support))}\n`;
}
