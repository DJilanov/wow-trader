import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/** @typedef {{id:number,family:string,rank:number,requiredLevel:number,children:number[]}} HealingRank */
/** @typedef {{path:string,byteSha256:string,source:string}} SourceRow */
/** @typedef {{schema:string,clientVersion:string,publicationAllowed:boolean,ranks:HealingRank[],sources:Record<string,SourceRow>,hypothesis:{status:string,level60Verified:boolean,procFormulaVerified:boolean,fullScalingGaps:number[],coefficientLossPerLevel:number}}} RankEvidence */
/** @typedef {{schema:string,id:string,kind:string,fullScalingGap:number,coefficientLossPerLevel:number,classProcMode:string}} RankPolicy */

const schema = "kfc-shaman-rank-sensitivity.v1";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const prefix = "sim/shaman/restoration/";
const paths = [
  "kfc_baseline.go",
  "kfc_water.go",
  "kfc_riptide.go",
  "kfc_resource_actives.go",
  "kfc_workload.go",
  "kfc_workload_run.go",
].map((name) => prefix + name);

/** Explicit stress cases; these coefficients and proc probabilities are not server-verified.
 * @returns {ReadonlyArray<Readonly<RankPolicy>>}
 */
export function shamanRankSensitivityPolicies() {
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
  for (const fullScalingGap of [12, 17, 22]) {
    for (const classProcMode of ["unchanged", "coefficient-factor"]) {
      policies.push({
        schema,
        id: `gap-${fullScalingGap}-loss-0.05-procs-${classProcMode}`,
        kind: "level-distance-sensitivity",
        fullScalingGap,
        coefficientLossPerLevel: 0.05,
        classProcMode,
      });
    }
  }
  return Object.freeze(policies.map((policy) => Object.freeze(policy)));
}

/** @param {RankEvidence} evidence @returns {HealingRank[]} */
export function validateShamanRankSensitivitySource(evidence) {
  assert.equal(evidence.schema, "kfc-shaman-rank-sensitivity-source.v1");
  assert.equal(evidence.clientVersion, "1.60.1.70532");
  assert.equal(evidence.publicationAllowed, false);
  assert.equal(evidence.hypothesis.status, "speculative-level60-extrapolation");
  assert.equal(evidence.hypothesis.level60Verified, false);
  assert.equal(evidence.hypothesis.procFormulaVerified, false);
  assert.deepEqual(evidence.hypothesis.fullScalingGaps, [12, 17, 22]);
  assert.equal(evidence.hypothesis.coefficientLossPerLevel, 0.05);
  assert(Array.isArray(evidence.ranks));
  assert.equal(evidence.ranks.length, 26);
  const ids = new Set();
  const families = new Map();
  for (const row of evidence.ranks) {
    assert(Number.isSafeInteger(row.id) && row.id > 0 && !ids.has(row.id));
    ids.add(row.id);
    assert(Number.isInteger(row.rank) && row.rank > 0);
    assert(
      Number.isInteger(row.requiredLevel) && row.requiredLevel >= 1 && row.requiredLevel <= 60,
    );
    assert(Array.isArray(row.children));
    assert.equal(row.children.length, row.family === "healing-stream" ? 1 : 0);
    families.set(row.family, (families.get(row.family) ?? 0) + 1);
  }
  assert.deepEqual([...families].sort(), [
    ["chain-heal", 3],
    ["healing-stream", 5],
    ["healing-wave", 9],
    ["lesser-healing-wave", 6],
    ["riptide", 3],
  ]);
  for (const row of evidence.ranks) {
    for (const child of row.children) {
      assert(Number.isSafeInteger(child) && child > 0 && !ids.has(child));
      ids.add(child);
    }
  }
  assert.deepEqual(Object.keys(evidence.sources).sort(), [...paths].sort());
  for (const [path, row] of Object.entries(evidence.sources)) {
    assert(row.path.endsWith("/" + path));
    assert.equal(sha(row.source), row.byteSha256, path);
  }
  return structuredClone(evidence.ranks);
}

/** @param {string} source @param {string} before @param {string} after @param {number} count @returns {string} */
function replace(source, before, after, count = 1) {
  assert.equal(
    source.split(before).length - 1,
    count,
    `Rank-sensitivity anchor changed: ${before}`,
  );
  return source.replaceAll(before, after);
}

/** Derive new class sources without modifying the frozen runtime or base spell amounts.
 * @param {RankEvidence} evidence @param {string} implementation @returns {Record<string,string>}
 */
export function renderShamanRankSensitivitySources(evidence, implementation) {
  const ranks = validateShamanRankSensitivitySource(evidence);
  const sources = Object.fromEntries(
    Object.entries(evidence.sources).map(([path, row]) => [path, row.source]),
  );
  sources[prefix + "kfc_baseline.go"] = replace(
    sources[prefix + "kfc_baseline.go"],
    "type RestorationShaman struct {",
    "type RestorationShaman struct {\n\tkfcRankScaling *kfcShamanRankScalingState",
  );
  sources[prefix + "kfc_water.go"] = replace(
    sources[prefix + "kfc_water.go"],
    "rank.Coefficient * pulse.HealingPower(unit)",
    "rank.Coefficient * resto.kfcShamanRankFactor(rank.ID) * pulse.HealingPower(unit)",
    2,
  );
  sources[prefix + "kfc_riptide.go"] = replace(
    sources[prefix + "kfc_riptide.go"],
    "rank.PeriodicCoefficient*pulse.HealingPower(target)",
    "rank.PeriodicCoefficient*resto.kfcShamanRankFactor(rank.ID)*pulse.HealingPower(target)",
    2,
  );
  sources[prefix + "kfc_resource_actives.go"] = replace(
    sources[prefix + "kfc_resource_actives.go"],
    "\tcontroller.shieldICD.Use(sim)",
    "\tif !resto.kfcShamanRankProc(sim, spell) { return }\n\tcontroller.shieldICD.Use(sim)",
  );
  for (const name of ["KFCShamanHealingWorkload", "KFCShamanHealingWorkloadResult"]) {
    sources[prefix + "kfc_workload.go"] = replace(
      sources[prefix + "kfc_workload.go"],
      `type ${name} struct {`,
      `type ${name} struct {\n\tRankScaling *KFCShamanRankScalingPolicy \`json:"rankScaling,omitempty"\``,
    );
  }
  sources[prefix + "kfc_workload_run.go"] = replace(
    sources[prefix + "kfc_workload_run.go"],
    "\tif frame.UseNaturesSwiftness && healer.kfcActives.swiftnessSpell == nil {",
    "\tif frame.RankScaling != nil {\n\t\tif err = healer.ConfigureKFCShamanRankScaling(sim, *frame.RankScaling); err != nil { return nil, err }\n\t}\n\tif frame.UseNaturesSwiftness && healer.kfcActives.swiftnessSpell == nil {",
  );
  sources[prefix + "kfc_workload_run.go"] = replace(
    sources[prefix + "kfc_workload_run.go"],
    "\tfor iteration := int32(0);",
    "\tif frame.RankScaling != nil { policy := *frame.RankScaling; output.RankScaling = &policy }\n\tfor iteration := int32(0);",
  );
  const metadata = [
    "var kfcShamanRankLearnedLevels = map[int32]int{",
    ...ranks.map((row) => `\t${row.id}: ${row.requiredLevel},`),
    "}",
    "var kfcShamanRankRoots = map[int32]int32{",
    ...ranks.flatMap((row) => [row.id, ...row.children].map((id) => `\t${id}: ${row.id},`)),
    "}",
  ].join("\n");
  sources[prefix + "kfc_rank_sensitivity.go"] = replace(
    implementation,
    "// KFC_SHAMAN_RANK_METADATA",
    metadata,
  );
  return sources;
}
