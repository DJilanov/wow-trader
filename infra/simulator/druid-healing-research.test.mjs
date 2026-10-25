import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  druidHealingResearchPolicies,
  extractDruidHealingResearch,
} from "./druid-healing-research.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url))));
const client = fixture("druid-client-healing-source.v1.json.gz"),
  omen = fixture("druid-omen-source.v1.json.gz");

test("Druid research preserves client ranks, charge and ICD without asserting a proc rate", () => {
  const rules = extractDruidHealingResearch(client, omen);
  assert.equal(rules.ranks.length, 39);
  assert.equal(rules.omen.eligibleSpellIds.length, 39);
  assert.equal(rules.omen.icdMs, 10000);
  assert.equal(rules.omen.clientProcChance, 1);
  assert.equal(rules.procFrequencyVerified, false);
  assert.equal(rules.serverDownrankingVerified, false);
});
test("bounded sensitivity covers rank gaps, proc scaling, cast eligibility and Regrowth crits", () => {
  const policies = druidHealingResearchPolicies();
  assert.equal(policies.length, 14);
  assert.equal(new Set(policies.map((row) => row.id)).size, 14);
  assert(policies.some((row) => row.omenProcChance === 0));
  assert(policies.some((row) => row.omenProcChance === 1));
  assert(policies.some((row) => row.omenEvents === "healing-casts"));
  assert(policies.some((row) => row.regrowthPeriodicCrits === false));
  assert(policies.every((row) => Object.isFrozen(row)));
});
test("changed client cost or ICD metadata requires a new reviewed model", () => {
  for (const [table, id, field, value] of [
    ["SpellAuraOptions", 16864, "ProcCategoryRecovery", 0],
    ["SpellEffect", 16870, "EffectBasePointsF", -50],
  ]) {
    const changed = JSON.parse(JSON.stringify(omen));
    changed.tables[table].find((row) => row.SpellID === id)[field] = value;
    assert.throws(() => extractDruidHealingResearch(client, changed));
  }
});
