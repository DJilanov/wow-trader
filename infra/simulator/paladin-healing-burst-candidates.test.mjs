import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { paladinHealingBurstPriorityCandidates } from "./paladin-healing-burst-candidates.mjs";
import { eligiblePaladinHealingRanks } from "./paladin-healing-eligibility.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

const bytes = await readFile(
  new URL("./fixtures/paladin-healing-burst-candidates-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "e3ef555f4f76b261a89ee28410a8a2cbe6d535f255697c70675f62c18aa23c5d",
);
const fixture = JSON.parse(gunzipSync(bytes));
assert.equal(fixture.schema, "kfc-paladin-burst-candidate-source.v1");
assert.equal(fixture.cases.length, 3);

for (const saved of fixture.cases) {
  test(
    "burst feedback retains every legal direct/support rank combination: " + saved.frameId,
    () => {
      const before = globalThis.structuredClone(saved.option);
      const rows = [
        ...paladinHealingBurstPriorityCandidates({
          option: saved.option,
          spellPolicy: fixture.spellPolicy,
        }),
      ];
      const fields = saved.option.state.fields;
      const eligible = eligiblePaladinHealingRanks(fixture.spellPolicy, {
        level: 60,
        talents: { holyShock: Boolean(fields.holyShock), lightsVigil: Boolean(fields.lightsVigil) },
        allowConditionalCandidates: true,
      });
      const direct = eligible.filter((rank) =>
        ["holy-light", "flash-of-light"].includes(rank.family),
      );
      const shock = eligible.filter((rank) => rank.family === "holy-shock");
      const vigil = eligible.filter((rank) => rank.family === "lights-vigil");
      assert.deepEqual(rows[0], saved.option);
      assert.equal(new Set(rows.map(simulationHash)).size, rows.length);
      for (const rank of direct) {
        for (const threshold of [0, 400, 1200]) {
          const matching = rows.filter(
            (row) =>
              row.policy.directSpellId === rank.spellId &&
              row.policy.directMinimumMissingHealth === threshold,
          );
          assert(matching.some((row) => !row.policy.holyShock && !row.policy.lightsVigil));
          for (const shockRank of shock) {
            assert(
              matching.some(
                (row) =>
                  row.policy.holyShock &&
                  !row.policy.lightsVigil &&
                  row.policy.ranks["holy-shock"] === shockRank.spellId,
              ),
            );
            for (const vigilRank of vigil)
              for (const maintain of [false, true])
                assert(
                  matching.some(
                    (row) =>
                      row.policy.lightsVigil &&
                      row.policy.maintainVigil === maintain &&
                      row.policy.ranks["holy-shock"] === shockRank.spellId &&
                      row.policy.ranks["lights-vigil"] === vigilRank.spellId,
                  ),
                );
          }
        }
      }
      for (const row of rows) {
        for (const key of [
          "state",
          "gear",
          "consumes",
          "manaRegenElixir",
          "alcohol",
          "useUtilities",
          "favorMinimumBaseCost",
          "resourceOrder",
        ])
          assert.deepEqual(row[key], saved.option[key]);
        assert.notEqual(row.policy.directSpellId, 25292, "Raid-book Holy Light remains excluded");
        if (!row.policy.lightsVigil) {
          assert.equal(row.requireVigil, false);
          assert.equal(row.minimumPartyTargets, 0);
          assert.equal(row.minimumPartyMissingHealth, 0);
        }
        assert(!row.policy.holyShock || fields.holyShock);
        assert(!row.policy.lightsVigil || fields.lightsVigil);
        for (const [family, id] of Object.entries(row.policy.ranks ?? {}))
          assert(eligible.some((rank) => rank.family === family && rank.spellId === id));
      }
      assert.deepEqual(saved.option, before);
    },
  );
}

test("burst rejects every unsupported tank/group resource policy instead of relabeling it", () => {
  for (const field of ["survivalPolicyId", "reservePolicyId", "tankReservePolicyId"]) {
    const option = {
      ...globalThis.structuredClone(fixture.cases[0].option),
      [field]: "earlier-resources",
    };
    assert.throws(
      () => [
        ...paladinHealingBurstPriorityCandidates({ option, spellPolicy: fixture.spellPolicy }),
      ],
      /Burst cannot inherit/,
    );
  }
});

test("burst rejects a raid-book direct rank in the incumbent", () => {
  const option = globalThis.structuredClone(fixture.cases[0].option);
  option.policy.directSpellId = 25292;
  assert.throws(
    () => [...paladinHealingBurstPriorityCandidates({ option, spellPolicy: fixture.spellPolicy })],
    /Ineligible burst direct rank/,
  );
});

test("burst rejects unowned active healing priorities", () => {
  const option = globalThis.structuredClone(fixture.cases[0].option);
  option.state.fields.holyShock = 0;
  option.state.fields.lightsVigil = 0;
  assert.throws(
    () => [...paladinHealingBurstPriorityCandidates({ option, spellPolicy: fixture.spellPolicy })],
    /Burst Holy Shock is not owned/,
  );
});

test("burst rejects active rank overrides from another spell family", () => {
  const option = globalThis.structuredClone(fixture.cases[0].option);
  option.policy.ranks["holy-shock"] = option.policy.directSpellId;
  assert.throws(
    () => [...paladinHealingBurstPriorityCandidates({ option, spellPolicy: fixture.spellPolicy })],
    /Ineligible burst active rank/,
  );
});

test("burst candidates do not share mutable gear, talents, consumes or priority objects", () => {
  const saved = fixture.cases[0].option;
  const before = globalThis.structuredClone(saved);
  const rows = [
    ...paladinHealingBurstPriorityCandidates({ option: saved, spellPolicy: fixture.spellPolicy }),
  ];
  const secondBefore = globalThis.structuredClone(rows[1]);
  rows[0].gear.items[0].id = 0;
  rows[0].consumes.food = 0;
  rows[0].policy.directSpellId = 0;
  rows[0].state.fields.holyShock = 0;
  assert.deepEqual(rows[1], secondBefore);
  assert.deepEqual(saved, before);
});
