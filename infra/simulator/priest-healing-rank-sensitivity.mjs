import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const schema = "kfc-priest-rank-sensitivity.v1";

/** Explicit stress cases; the level-60 and class-proc formulas are unverified.
 * @returns {ReadonlyArray<Readonly<{schema:string,id:string,kind:string,fullScalingGap:number,coefficientLossPerLevel:number,classProcMode:string}>>}
 */
export function priestRankSensitivityPolicies() {
  const policies = [
    {
      schema,
      id: "unscaled-reference",
      kind: "unscaled-reference",
      fullScalingGap: 0,
      coefficientLossPerLevel: 0,
      classProcMode: "unchanged",
    },
  ];
  for (const gap of [12, 17, 22]) {
    for (const mode of ["unchanged", "coefficient-factor"]) {
      policies.push({
        schema,
        id: `gap-${gap}-loss-0.05-procs-${mode}`,
        kind: "level-distance-sensitivity",
        fullScalingGap: gap,
        coefficientLossPerLevel: 0.05,
        classProcMode: mode,
      });
    }
  }
  return Object.freeze(policies.map((policy) => Object.freeze(policy)));
}

/** @param {Record<string, unknown>} evidence @returns {Array<{id:number,requiredLevel:number,children:number[]}>} */
export function validatePriestRankSensitivitySource(evidence) {
  assert.equal(evidence.schema, "kfc-priest-rank-sensitivity-source.v2");
  assert.equal(evidence.publicationAllowed, false);
  assert.equal(evidence.clientVersion, "1.60.1.70532");
  assert.equal(evidence.hypothesis.status, "speculative-level60-extrapolation");
  assert.equal(evidence.hypothesis.level60Verified, false);
  assert.equal(evidence.hypothesis.procFormulaVerified, false);
  assert.equal(evidence.hypothesis.fullScalingGap, 17);
  assert.equal(evidence.hypothesis.coefficientLossPerLevel, 0.05);
  assert(Array.isArray(evidence.ranks));
  assert.equal(evidence.ranks.length, 63);
  const ids = new Set();
  for (const row of evidence.ranks) {
    assert(Number.isSafeInteger(row.id) && row.id > 0 && !ids.has(row.id));
    ids.add(row.id);
    assert(Number.isInteger(row.requiredLevel) && row.requiredLevel > 0 && row.requiredLevel <= 60);
    assert(Number.isInteger(row.rank) && row.rank > 0);
    assert(Array.isArray(row.children));
  }
  for (const row of evidence.ranks) {
    for (const child of row.children) {
      assert(Number.isSafeInteger(child) && child > 0 && !ids.has(child));
      ids.add(child);
    }
  }
  for (const row of Object.values(evidence.sources)) assert.equal(sha(row.source), row.byteSha256);
  return evidence.ranks.map(({ id, requiredLevel, children }) => ({
    id,
    requiredLevel,
    children: [...children],
  }));
}

/** @param {string} source @param {string} before @param {string} after @returns {string} */
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Rank-sensitivity source anchor changed: ${before}`);
  return source.replace(before, after);
}

/** Derive new sources without changing a frozen runtime or rank's base healing/mana.
 * @param {Record<string,unknown>} evidence @param {string} implementation @returns {Record<string,string>}
 */
export function renderPriestRankSensitivitySources(evidence, implementation) {
  const ranks = validatePriestRankSensitivitySource(evidence);
  const sources = Object.fromEntries(
    Object.entries(evidence.sources).map(([path, row]) => [path, row.source]),
  );
  sources["sim/priest/priest.go"] = replaceOnce(
    sources["sim/priest/priest.go"],
    "type Priest struct {",
    "type Priest struct {\n\tkfcRankScaling *kfcHealingRankScalingState",
  );
  const baselinePath = "sim/priest/kfc_healing_baseline.go";
  for (const [before, after] of [
    [
      "rank.Coefficient*spell.HealingPower(target)",
      "rank.Coefficient*priest.kfcHealingRankFactor(rank.ID)*spell.HealingPower(target)",
    ],
    [
      "rank.Coefficient*dot.Spell.HealingPower(target)",
      "rank.Coefficient*priest.kfcHealingRankFactor(rank.ID)*dot.Spell.HealingPower(target)",
    ],
  ])
    sources[baselinePath] = replaceOnce(sources[baselinePath], before, after);
  const shieldPath = "sim/priest/kfc_healing_patch_rules.go";
  sources[shieldPath] = replaceOnce(
    sources[shieldPath],
    "rank.Coefficient*spell.HealingPower(target)",
    "rank.Coefficient*priest.kfcHealingRankFactor(rank.ID)*spell.HealingPower(target)",
  );
  const activePath = "sim/priest/kfc_healing_active_spells.go";
  for (const [before, after] of [
    [
      "payload.Coefficient*spell.HealingPower(recipient)",
      "payload.Coefficient*priest.kfcHealingRankFactor(data.ID)*spell.HealingPower(recipient)",
    ],
    [
      "data.Coefficient*spell.HealingPower(target)",
      "data.Coefficient*priest.kfcHealingRankFactor(data.ID)*spell.HealingPower(target)",
    ],
  ])
    sources[activePath] = replaceOnce(sources[activePath], before, after);
  const talentsPath = "sim/priest/kfc_healing_talents.go";
  let talents = sources[talentsPath];
  for (const talent of ["Inspiration", "DivineAegis"]) {
    const start = talents.indexOf(`func (priest *Priest) registerKFC${talent}()`);
    const next = talents.indexOf("\nfunc ", start + 1);
    assert(start >= 0);
    const end = next < 0 ? talents.length : next;
    let body = replaceOnce(
      talents.slice(start, end),
      "sim *core.Simulation, _ *core.Spell, result",
      "sim *core.Simulation, spell *core.Spell, result",
    );
    body =
      talent === "Inspiration"
        ? replaceOnce(
            body,
            "if result.DidCrit() && result.Damage > 0 {",
            'if result.DidCrit() && result.Damage > 0 && priest.kfcHealingRankProc(sim, spell, "Inspiration") {',
          )
        : replaceOnce(
            body,
            "if !result.DidCrit() || result.Damage <= 0 {",
            'if !result.DidCrit() || result.Damage <= 0 || !priest.kfcHealingRankProc(sim, spell, "DivineAegis") {',
          );
    talents = talents.slice(0, start) + body + talents.slice(end);
  }
  talents = replaceOnce(
    talents,
    "if !soul.IsActive() {",
    'if !soul.IsActive() || !priest.kfcHealingRankProc(sim, spell, "RenewedHope") {',
  );
  talents = replaceOnce(
    talents,
    'if previous != "" && previous != metadata.Family {',
    'if previous != "" && previous != metadata.Family && priest.kfcHealingRankProc(sim, spell, "LitanyOfLight") {',
  );
  sources[talentsPath] = talents;
  const workloadPath = "sim/priest/healing/kfc_healing_workload.go";
  let workload = replaceOnce(
    sources[workloadPath],
    "type KFCHealingWorkload struct {",
    'type KFCHealingWorkload struct {\n\tRankScaling *priest.KFCHealingRankScalingPolicy `json:"rankScaling,omitempty"`',
  );
  workload = replaceOnce(
    workload,
    "type KFCHealingWorkloadResult struct {",
    'type KFCHealingWorkloadResult struct {\n\tRankScaling *priest.KFCHealingRankScalingPolicy `json:"rankScaling,omitempty"`',
  );
  workload = replaceOnce(
    workload,
    "\tpositions := map[int32]priest.KFCFriendlyPosition{}",
    "\tif frame.RankScaling != nil {\n\t\tif err = healer.ConfigureKFCHealingRankScaling(*frame.RankScaling); err != nil { return nil, err }\n\t}\n\tpositions := map[int32]priest.KFCFriendlyPosition{}",
  );
  workload = replaceOnce(
    workload,
    "\tfor iteration := int32(0);",
    "\tif frame.RankScaling != nil { policy := *frame.RankScaling; output.RankScaling = &policy }\n\tfor iteration := int32(0);",
  );
  sources[workloadPath] = workload;
  const metadata = [
    "var kfcRankLearnedLevels = map[int32]int{",
    ...ranks.map((row) => `\t${row.id}: ${row.requiredLevel},`),
    "}",
    "var kfcRankRoots = map[int32]int32{",
    ...ranks.flatMap((row) => [row.id, ...row.children].map((id) => `\t${id}: ${row.id},`)),
    "}",
  ].join("\n");
  sources["sim/priest/kfc_healing_rank_sensitivity.go"] = replaceOnce(
    implementation,
    "// KFC_RANK_SCALING_METADATA",
    metadata,
  );
  return sources;
}
