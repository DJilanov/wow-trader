import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  priestRankSensitivityPolicies,
  validatePriestRankSensitivitySource,
  renderPriestRankSensitivitySources,
} from "./priest-healing-rank-sensitivity.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const bytes = readFileSync(
  new URL("./fixtures/priest-rank-sensitivity-source.v2.json.gz", import.meta.url),
);
assert.equal(sha(bytes), "4a5e8313c90c7b1b365fab90aa28ade1d0972c527d9adc314a0b265493c7b513");
const evidence = JSON.parse(gunzipSync(bytes));
const implementation = readFileSync(
  new URL("./priest-healing-rank-sensitivity.go", import.meta.url),
  "utf8",
);

test("rank evidence includes all parent ranks and distinct Penance and Nova payloads", () => {
  const ranks = validatePriestRankSensitivitySource(evidence);
  assert.equal(ranks.length, 63);
  assert.equal(ranks.flatMap((row) => row.children).length, 10);
  assert.deepEqual(
    ranks.find((row) => row.id === 1240720),
    { id: 1240720, requiredLevel: 40, children: [1240723] },
  );
  assert.deepEqual(
    ranks.find((row) => row.id === 15431),
    { id: 15431, requiredLevel: 36, children: [23459] },
  );
  assert(
    ranks.some((row) => row.id === 25316),
    "Acquisition policy is separate from compiled rank coverage",
  );
});

test("stress cases keep the speculative coefficient and proc hypotheses explicit", () => {
  const policies = priestRankSensitivityPolicies();
  assert.equal(policies.length, 7);
  assert.equal(new Set(policies.map((row) => row.id)).size, 7);
  assert.equal(policies[0].kind, "unscaled-reference");
  assert.equal(policies[0].coefficientLossPerLevel, 0);
  assert.deepEqual([...new Set(policies.slice(1).map((row) => row.fullScalingGap))], [12, 17, 22]);
  for (const policy of policies) assert(Object.isFrozen(policy));
});

test("source validation rejects invented evidence and malformed rank coverage", () => {
  for (const change of [
    (e) => {
      e.hypothesis.level60Verified = true;
    },
    (e) => {
      e.hypothesis.procFormulaVerified = true;
    },
    (e) => {
      e.publicationAllowed = true;
    },
    (e) => {
      e.ranks.pop();
    },
    (e) => {
      e.ranks[0].requiredLevel = 0;
    },
    (e) => {
      e.ranks[0].requiredLevel = 61;
    },
    (e) => {
      e.ranks[0].id = e.ranks[1].id;
    },
    (e) => {
      e.ranks[0].children = [e.ranks[1].id];
    },
    (e) => {
      Object.values(e.sources)[0].source += "\n";
    },
  ]) {
    const mutated = globalThis.structuredClone(evidence);
    change(mutated);
    assert.throws(() => validatePriestRankSensitivitySource(mutated));
  }
});

test("derived components preserve frozen sources and include shield replacement capacity", () => {
  const before = globalThis.structuredClone(evidence);
  const sources = renderPriestRankSensitivitySources(evidence, implementation);
  assert.deepEqual(evidence, before);
  assert.deepEqual(sources, renderPriestRankSensitivitySources(evidence, implementation));
  const shield = sources["sim/priest/kfc_healing_patch_rules.go"];
  assert(
    shield.includes(
      "rank.Coefficient*priest.kfcHealingRankFactor(rank.ID)*spell.HealingPower(target)",
    ),
  );
  assert(
    sources["sim/priest/kfc_healing_active_spells.go"].includes(
      "priest.kfcHealingRankFactor(data.ID)*spell.HealingPower(recipient)",
    ),
  );
  assert(sources["sim/priest/kfc_healing_rank_sensitivity.go"].includes("1240723: 1240720,"));
  assert(
    !sources["sim/priest/kfc_healing_rank_sensitivity.go"].includes("KFC_RANK_SCALING_METADATA"),
  );
  assert(
    sources["sim/priest/healing/kfc_healing_workload.go"].includes("output.RankScaling = &policy"),
  );
});

test("rank scaling changes only bonus healing terms, leaving base amounts, costs and passive talent stats intact", () => {
  const sources = renderPriestRankSensitivitySources(evidence, implementation);
  for (const path of [
    "sim/priest/kfc_healing_baseline.go",
    "sim/priest/kfc_healing_active_spells.go",
  ]) {
    assert.equal(
      sources[path].replaceAll(/\*priest\.kfcHealingRankFactor\((?:rank|data)\.ID\)/g, ""),
      evidence.sources[path].source,
    );
  }
  const talents = sources["sim/priest/kfc_healing_talents.go"];
  for (const name of ["Inspiration", "DivineAegis", "RenewedHope", "LitanyOfLight"])
    assert(talents.includes(`priest.kfcHealingRankProc(sim, spell, "${name}")`));
  assert(talents.includes("previous = metadata.Family"));
  assert.equal(
    sources["sim/priest/kfc_healing_benchmark.go"],
    evidence.sources["sim/priest/kfc_healing_benchmark.go"].source,
  );
});

test("changed source anchors cannot silently create a partially patched runtime", () => {
  const mutated = globalThis.structuredClone(evidence);
  const row = mutated.sources["sim/priest/kfc_healing_patch_rules.go"];
  row.source = row.source.replace(
    "rank.Coefficient*spell.HealingPower(target)",
    "rank.Coefficient * spell.HealingPower(target)",
  );
  row.byteSha256 = sha(row.source);
  assert.throws(
    () => renderPriestRankSensitivitySources(mutated, implementation),
    /anchor changed/,
  );
  assert.throws(
    () =>
      renderPriestRankSensitivitySources(
        evidence,
        implementation.replace("// KFC_RANK_SCALING_METADATA", ""),
      ),
    /anchor changed/,
  );
});
