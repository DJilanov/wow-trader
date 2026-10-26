import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { reviewShamanHealingSetScope } from "./shaman-healing-set-scope.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name + ".json.gz", import.meta.url))));
const input = {
  evidence: fixture("shaman-shared-equipment-source.v1"),
  certificate: fixture("shaman-healing-set-scope-source.v1"),
  workloadSource: readFileSync(
    new URL("./shaman-healing-workload-run.go", import.meta.url),
    "utf8",
  ),
};

test("accounts for all 104 source bonuses without dropping any set or item", () => {
  const scope = reviewShamanHealingSetScope(input);
  assert.equal(scope.setCount, 33);
  assert.equal(scope.sourceBonusRows, 104);
  assert.equal(scope.thresholdGroups, 102);
  assert.equal(scope.unclassifiedRows, 0);
  assert.deepEqual(Object.values(scope.counts), [66, 9, 24, 5]);
  assert(scope.decisions.every((row) => row.retainedInEquipmentDomain));
  assert.equal(scope.runtimeProofsAndEquippedWorkloadBindingStillRequired, true);
  assert.equal(scope.fullClassAdmission, false);
});

test("preserves mixed thresholds, owned set components and the legal reachability boundary", () => {
  const scope = reviewShamanHealingSetScope(input);
  assert.deepEqual(
    scope.decisions
      .filter((row) => row.setId === 121 && row.pieces === 3)
      .map((row) => row.classification),
    ["reviewed-flat-runtime", "inactive-in-declared-assignment"],
  );
  assert.equal(
    scope.decisions.filter(
      (row) =>
        row.setId === 185 && row.pieces === 3 && row.classification === "reviewed-flat-runtime",
    ).length,
    2,
  );
  assert.equal(
    scope.decisions.find((row) => row.setId === 162 && row.pieces === 4).component,
    "reactive",
  );
  assert(
    scope.decisions
      .filter((row) => row.setId === 2111)
      .every((row) => row.classification === "unreachable-in-declared-domain"),
  );
});

test("rejects changed proc families, friendly recipients, movement payloads and assignment boundaries", () => {
  for (const edit of [
    (value) => {
      value.evidence.tables.SpellAuraOptions.find((row) => row.SpellID === 18979).ProcTypeMask[0] |=
        0x4000;
    },
    (value) => {
      value.evidence.tables.SpellEffect.find((row) => row.SpellID === 27868).ImplicitTarget = [
        1, 0,
      ];
    },
    (value) => {
      value.evidence.tables.SpellEffect.find((row) => row.SpellID === 1302707).EffectAura = 29;
    },
    (value) => {
      value.workloadSource = value.workloadSource.replace(
        "units[event.RaidIndex] == &healer.Unit",
        "false",
      );
    },
    (value) => {
      value.certificate.profileMaximums.pop();
    },
    (value) => {
      value.certificate.flatRoots.pop();
    },
  ]) {
    const changed = structuredClone(input);
    edit(changed);
    assert.throws(() => reviewShamanHealingSetScope(changed));
  }
});
