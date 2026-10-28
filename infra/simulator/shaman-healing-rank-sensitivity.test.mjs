import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  renderShamanRankSensitivitySources,
  shamanRankSensitivityPolicies,
  validateShamanRankSensitivitySource,
} from "./shaman-healing-rank-sensitivity.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = readFileSync(
  new URL("./fixtures/shaman-rank-sensitivity-source.v1.json.gz", import.meta.url),
);
assert.equal(sha(bytes), "99c467dbaef7ac5179ad9370425922a3b6324f5fa27e06dab7559077b3d8d176");
const evidence = JSON.parse(gunzipSync(bytes));
const implementation = readFileSync(
  new URL("./shaman-healing-rank-sensitivity.go", import.meta.url),
  "utf8",
);
const prefix = "sim/shaman/restoration/";

test("source covers every direct, Chain, Stream and Riptide rank without mana spells", () => {
  const ranks = validateShamanRankSensitivitySource(evidence);
  assert.equal(ranks.length, 26);
  assert.equal(ranks.flatMap((row) => row.children).length, 5);
  assert.deepEqual(
    ranks.find((row) => row.id === 8004),
    {
      id: 8004,
      family: "lesser-healing-wave",
      rank: 1,
      requiredLevel: 20,
      children: [],
    },
  );
  assert.deepEqual(
    ranks.find((row) => row.id === 5394),
    {
      id: 5394,
      family: "healing-stream",
      rank: 1,
      requiredLevel: 20,
      children: [5672],
    },
  );
  assert.equal(ranks.find((row) => row.id === 408521).requiredLevel, 40);
  assert(!ranks.some((row) => row.family === "mana-tide" || row.family === "water-shield"));
});

test("sensitivity cases retain an unscaled reference and explicit unverified hypotheses", () => {
  const policies = shamanRankSensitivityPolicies();
  assert.equal(policies.length, 7);
  assert.equal(new Set(policies.map((row) => row.id)).size, 7);
  assert.equal(policies[0].kind, "unscaled-reference");
  assert.equal(policies[0].coefficientLossPerLevel, 0);
  assert.deepEqual([...new Set(policies.slice(1).map((row) => row.fullScalingGap))], [12, 17, 22]);
  assert(Object.isFrozen(policies));
  for (const policy of policies) assert(Object.isFrozen(policy));
});

test("invalid evidence, missing families, duplicate payloads and edited source bytes reject", () => {
  for (const change of [
    (e) => {
      e.publicationAllowed = true;
    },
    (e) => {
      e.hypothesis.level60Verified = true;
    },
    (e) => {
      e.hypothesis.procFormulaVerified = true;
    },
    (e) => {
      e.ranks.pop();
    },
    (e) => {
      e.ranks[0].id = e.ranks[1].id;
    },
    (e) => {
      e.ranks[0].requiredLevel = 61;
    },
    (e) => {
      e.ranks[0].family = "mana-tide";
    },
    (e) => {
      e.ranks.find((row) => row.children.length).children = [8004];
    },
    (e) => {
      e.ranks.find((row) => row.children.length).children = [];
    },
    (e) => {
      Object.values(e.sources)[0].source += "\n";
    },
    (e) => {
      delete e.sources[prefix + "kfc_water.go"];
    },
  ]) {
    const altered = structuredClone(evidence);
    change(altered);
    assert.throws(() => validateShamanRankSensitivitySource(altered));
  }
});

test("derivation preserves parent bytes and maps periodic Stream payloads to learned levels", () => {
  const before = structuredClone(evidence);
  const sources = renderShamanRankSensitivitySources(evidence, implementation);
  assert.deepEqual(evidence, before);
  assert.deepEqual(sources, renderShamanRankSensitivitySources(evidence, implementation));
  const derived = sources[prefix + "kfc_rank_sensitivity.go"];
  assert(derived.includes("5672: 5394,"));
  assert(derived.includes("8004: 20,"));
  assert(derived.includes("408521: 40,"));
  assert(!derived.includes("KFC_SHAMAN_RANK_METADATA"));
  assert(!derived.includes("1325257:"));
});

test("both Stream scaling branches and Riptide power modes scale only bonus healing", () => {
  const sources = renderShamanRankSensitivitySources(evidence, implementation);
  for (const [name, needle] of [
    ["kfc_water.go", / \* resto\.kfcShamanRankFactor\(rank\.ID\)/g],
    ["kfc_riptide.go", /\*resto\.kfcShamanRankFactor\(rank\.ID\)/g],
  ]) {
    assert.equal([...sources[prefix + name].matchAll(needle)].length, 2);
    assert.equal(
      sources[prefix + name].replaceAll(needle, ""),
      evidence.sources[prefix + name].source,
    );
  }
  assert.equal(
    sources[prefix + "kfc_baseline.go"].replace(
      "\n\tkfcRankScaling *kfcShamanRankScalingState",
      "",
    ),
    evidence.sources[prefix + "kfc_baseline.go"].source,
  );
});

test("proc sensitivity runs after eligibility checks and before consuming cooldown or charge", () => {
  const sources = renderShamanRankSensitivitySources(evidence, implementation);
  const actives = sources[prefix + "kfc_resource_actives.go"];
  const gate = actives.indexOf("if !resto.kfcShamanRankProc(sim, spell)");
  assert(gate > actives.indexOf("resto.WaterShieldAura.GetStacks() == 0"));
  assert(gate < actives.indexOf("controller.shieldICD.Use(sim)"));
  assert(gate < actives.indexOf("resto.WaterShieldAura.RemoveStack(sim)"));
  assert(sources[prefix + "kfc_workload.go"].includes('json:"rankScaling,omitempty"'));
  assert(sources[prefix + "kfc_workload_run.go"].includes("output.RankScaling = &policy"));
});

test("changed source anchors cannot silently produce a partially scaled runtime", () => {
  const altered = structuredClone(evidence);
  const row = altered.sources[prefix + "kfc_water.go"];
  row.source = row.source.replace(
    "rank.Coefficient * pulse.HealingPower(unit)",
    "rank.Coefficient*pulse.HealingPower(unit)",
  );
  row.byteSha256 = sha(row.source);
  assert.throws(
    () => renderShamanRankSensitivitySources(altered, implementation),
    /anchor changed/,
  );
  assert.throws(
    () =>
      renderShamanRankSensitivitySources(
        evidence,
        implementation.replace("// KFC_SHAMAN_RANK_METADATA", ""),
      ),
    /anchor changed/,
  );
});
