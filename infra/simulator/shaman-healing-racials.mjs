import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const prefix = "sim/shaman/restoration/";

/** Validate the captured client effects and the separately attributed playable-race reference.
 * @param {object} evidence @returns {object}
 */
export function extractShamanHealingRacialRules(evidence) {
  assert.equal(evidence.schema, "kfc-shaman-racial-source.v1");
  assert.equal(evidence.clientVersion, "1.60.1.70532");
  assert.equal(evidence.serverVerified, false);
  assert.equal(evidence.publicationAllowed, false);
  assert.equal(
    evidence.source.byteSha256,
    "9196f29921c4ba0cb38b5f649cdcf19ff03f667f6d560e8493a69b69682d7fcc",
  );
  assert.deepEqual(
    evidence.races.map((row) => [row.id, row.clientId, row.faction]),
    [
      [1, 3, 1],
      [5, 2, 2],
      [6, 6, 2],
      [7, 8, 2],
      [10, 96, 2],
    ],
  );
  assert.deepEqual(evidence.playableRaceReference.races, {
    Horde: ["Orc", "Tauren", "Troll", "Skyborne (Windshaper)"],
    Alliance: ["Dwarf"],
  });
  const effects = evidence.tables.SpellEffect;
  assert.equal(effects.length, 11);
  for (const [spellId, expected] of [
    [
      1259719,
      [
        [0, 163, 2],
        [1, 50, 2],
      ],
    ],
    [
      20550,
      [
        [0, 133, 5],
        [1, 163, 2],
        [2, 50, 2],
      ],
    ],
    [
      20554,
      [
        [0, 319, 10],
        [1, 140, 10],
        [2, 65, 10],
      ],
    ],
    [
      20572,
      [
        [0, 166, 10],
        [1, 167, 10],
        [2, 317, 10],
      ],
    ],
  ]) {
    const rows = effects
      .filter((row) => row.SpellID === spellId)
      .sort((a, b) => a.EffectIndex - b.EffectIndex);
    assert.deepEqual(
      rows.map((row) => [row.EffectIndex, row.EffectAura, row.EffectBasePointsF]),
      expected,
    );
    for (const row of rows) {
      assert.equal(row.DifficultyID, 0);
      assert.equal(row.Effect, 6);
      assert.equal(row.ScalingClass, 0);
      assert.deepEqual(row.ImplicitTarget, [1, 0]);
    }
  }
  assert.equal(evidence.tables.SpellPower.length, 0);
  for (const [spellId, durationMs, raceMask] of [
    [20554, 10000, 128],
    [20572, 15000, 2],
  ]) {
    const misc = evidence.tables.SpellMisc.filter((row) => row.SpellID === spellId);
    assert.equal(misc.length, 1);
    const duration = evidence.tables.SpellDuration.find((row) => row.id === misc[0].DurationIndex);
    assert(duration);
    assert.equal(duration.Duration, durationMs);
    assert.equal(duration.MaxDuration, durationMs);
    const cooldowns = evidence.tables.SpellCooldowns.filter((row) => row.SpellID === spellId);
    assert.equal(cooldowns.length, 1);
    assert.equal(cooldowns[0].RecoveryTime, 180000);
    const abilities = evidence.tables.SkillLineAbility.filter((row) => row.Spell === spellId);
    assert.equal(abilities.length, 1);
    assert.deepEqual(abilities[0].RaceMasks, [raceMask, 0]);
  }
  for (const [path, row] of Object.entries(evidence.sources)) {
    assert.equal(sha(row.source), row.byteSha256, path);
    assert(row.path.endsWith("/" + path));
  }
  return {
    schema: "kfc-shaman-healing-racial-rules.v1",
    sourceBuild: evidence.clientVersion,
    playableRaces: structuredClone(evidence.races),
    criticalHealingMultiplier: 1.02,
    ownedActions: [
      { race: 7, spellId: 20554, durationMs: 10000, cooldownMs: 180000 },
      { race: 5, spellId: 20572, durationMs: 15000, cooldownMs: 180000 },
    ],
    implicitActivation: false,
    serverVerified: false,
    publicationAllowed: false,
  };
}

/** @param {string} source @param {string} before @param {string} after @param {number} count @returns {string} */
function replace(source, before, after, count = 1) {
  assert.equal(
    source.split(before).length - 1,
    count,
    `Shaman racial source anchor changed: ${before}`,
  );
  return source.replaceAll(before, after);
}

/** Extend only the derived healing actor; frozen shared core sources are returned unchanged.
 * @param {object} evidence @param {string} implementation @returns {Record<string,string>}
 */
export function renderShamanHealingRacialSources(evidence, implementation) {
  extractShamanHealingRacialRules(evidence);
  const sources = Object.fromEntries(
    Object.entries(evidence.sources).map(([path, row]) => [path, row.source]),
  );
  sources[prefix + "kfc_baseline.go"] = replace(
    sources[prefix + "kfc_baseline.go"],
    "type RestorationShaman struct {",
    "type RestorationShaman struct {\n\tkfcRacials *kfcShamanRacialState",
  );
  for (const [name, receiver, count] of [
    ["kfc_baseline.go", "spell", 2],
    ["kfc_riptide.go", "spell", 1],
    ["kfc_cast_resource_sets.go", "state.heal", 1],
    ["kfc_utility_items.go", "spell", 2],
  ]) {
    sources[prefix + name] = replace(
      sources[prefix + name],
      `${receiver}.OutcomeHealingCrit`,
      `resto.kfcShamanRacialHealingOutcome(${receiver}.OutcomeHealingCrit)`,
      count,
    );
  }
  sources[prefix + "kfc_riptide.go"] = replace(
    sources[prefix + "kfc_riptide.go"],
    "target, amount, multiplier, outcome)",
    "target, amount, multiplier, resto.kfcShamanRacialHealingOutcome(outcome))",
  );
  for (const name of ["KFCShamanHealingWorkload", "KFCShamanHealingWorkloadResult"]) {
    sources[prefix + "kfc_workload.go"] = replace(
      sources[prefix + "kfc_workload.go"],
      `type ${name} struct {`,
      `type ${name} struct {\n\tRacials *KFCShamanRacialPolicy \`json:"racials,omitempty"\``,
    );
  }
  sources[prefix + "kfc_workload.go"] = replace(
    sources[prefix + "kfc_workload.go"],
    "type KFCShamanHealingWorkloadResult struct {",
    'type KFCShamanHealingWorkloadResult struct {\n\tRacialUsesMean []float64 `json:"racialUsesMean,omitempty"`',
  );
  const path = prefix + "kfc_workload_run.go";
  sources[path] = replace(
    sources[path],
    "\tif frame.RankScaling != nil {\n\t\tif err = healer.ConfigureKFCShamanRankScaling",
    "\tif frame.Racials != nil {\n\t\tif err = healer.ConfigureKFCShamanRacials(sim, *frame.Racials); err != nil { return nil, err }\n\t}\n\tif frame.RankScaling != nil {\n\t\tif err = healer.ConfigureKFCShamanRankScaling",
  );
  sources[path] = replace(
    sources[path],
    "\tif frame.RankScaling != nil {\n\t\tpolicy := *frame.RankScaling",
    "\tif frame.Racials != nil { policy := kfcShamanCopyRacialPolicy(*frame.Racials); output.Racials = &policy; output.RacialUsesMean = make([]float64, len(policy.Actions)) }\n\tif frame.RankScaling != nil {\n\t\tpolicy := *frame.RankScaling",
  );
  sources[path] = replace(
    sources[path],
    "\t\tsim.PrePull()",
    "\t\tracialUses := make([]int, len(output.RacialUsesMean))\n\t\tsim.PrePull()",
  );
  sources[path] = replace(
    sources[path],
    "\t\t\tif healer.CurrentHealth() > 0 && healer.IsEnabled() {",
    "\t\t\thealer.useKFCShamanRacials(sim, racialUses)\n\t\t\tif healer.CurrentHealth() > 0 && healer.IsEnabled() {",
  );
  sources[path] = replace(
    sources[path],
    "\t\tif survived {",
    "\t\tfor index, uses := range racialUses { output.RacialUsesMean[index] += float64(uses) }\n\t\tif survived {",
  );
  sources[path] = replace(
    sources[path],
    "\toutput.SurvivalRate /= countFloat",
    "\tfor index := range output.RacialUsesMean { output.RacialUsesMean[index] /= countFloat }\n\toutput.SurvivalRate /= countFloat",
  );
  sources[prefix + "kfc_racials.go"] = implementation;
  return sources;
}
