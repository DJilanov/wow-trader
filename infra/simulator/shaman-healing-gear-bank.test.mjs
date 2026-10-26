import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { assertShamanEquippedLoadout } from "./shaman-equipped-domain.mjs";
import {
  shamanHealingGearCandidates,
  shamanHealingGearGroups,
} from "./shaman-healing-gear-bank.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/shaman-healing-gear-bank-source.v1.json.gz", import.meta.url)),
  ),
);
const { domain, seed } = fixture,
  profile = domain.profiles[0];
const input = { domain, profileId: profile.id, race: 7, gear: seed };
const rows = (group, extra = {}) => [...shamanHealingGearCandidates({ ...input, ...extra, group })];

test("every actual slot, paired-slot, represented set and enchant group is available", () => {
  assert.equal(fixture.selectedRowsAreSourceSubsets, true);
  assert.equal(fixture.unitFixtureOnly, true);
  assert.equal(domain.items.length, 52);
  const groups = shamanHealingGearGroups(domain, profile.id);
  for (const slot of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16]) assert(groups.includes("slot-" + slot));
  for (const name of ["hands", "rings", "trinkets", "set-81", "set-122", "set-187", "set-519"])
    assert(groups.includes(name));
  for (let slot = 0; slot < 17; slot++) assert(groups.includes("enchant-" + slot));
  assert.equal(new Set(groups).size, groups.length);
});

test("paired jewelry retains repeatable copies but excludes restricted duplicates", () => {
  const rings = rows("rings"),
    trinkets = rows("trinkets");
  assert(rings.some((row) => row.gear.items[10].id === 942 && row.gear.items[11].id === 942));
  assert(!rings.some((row) => row.gear.items[10].id === 1156 && row.gear.items[11].id === 1156));
  assert(trinkets.some((row) => row.gear.items[12].id === 1490 && row.gear.items[13].id === 1490));
  assert(!trinkets.some((row) => row.gear.items[12].id === 4381 && row.gear.items[13].id === 4381));
  const pairs = new Set(
    rings.map((row) =>
      row.gear.items
        .slice(10, 12)
        .map((spec) => spec.id)
        .join("/"),
    ),
  );
  assert(pairs.has("942/1156") && pairs.has("1156/942"));
});

test("complete hand alternatives include one-hand plus held item and every empty two-hand offhand", () => {
  const hands = rows("hands");
  assert(hands.some((row) => row.gear.items[14].id === 2816 && row.gear.items[15].id === 6341));
  assert(hands.some((row) => row.gear.items[14].id === 1155 && row.gear.items[15].id === 0));
  const itemMap = new Map(domain.items.map((row) => [row.id, row]));
  for (const row of hands) {
    const main = itemMap.get(row.gear.items[14].id);
    if (main.handType === 4) assert.equal(row.gear.items[15].id, 0);
    assertShamanEquippedLoadout({
      domain,
      profileId: profile.id,
      race: 7,
      professions: profile.professions,
      equipment: row.gear,
    });
  }
  for (const id of profile.slots[14])
    assert(
      hands.some((row) => row.gear.items[14].id === id),
      "Missing actual hand candidate " + id,
    );
});

test("set comparisons cross every owned piece threshold and retain the full reward witness", () => {
  for (const setId of [81, 122, 187, 519]) {
    const proposals = rows("set-" + setId),
      ids = new Set(domain.items.filter((row) => row.setId === setId).map((row) => row.id));
    const maximum = { 81: 5, 122: 5, 187: 8, 519: 8 }[setId];
    const counts = new Set(
      proposals.map((row) => row.gear.items.filter((spec) => ids.has(spec.id)).length),
    );
    for (let count = 2; count <= maximum; count++)
      assert(counts.has(count), `Missing set ${setId} count ${count}`);
    assert(![...counts].some((count) => count > maximum));
  }
  assert(
    rows("set-519").some(
      (row) => simulationHash(row.gear) === simulationHash(fixture.fullRewardWitness),
    ),
  );
});

test("each enchant and no-enchant alternative is retained; incompatible enchants do not follow an item swap", () => {
  const candidates = domain.enchants.filter(
    (row) => row.effectIds.length > 0 && seed.items[row.slot].id === row.itemId,
  );
  assert(candidates.length);
  const chosen = candidates[0],
    gear = structuredClone(seed);
  gear.items[chosen.slot].enchant = chosen.effectIds[0];
  const generated = rows("enchant-" + chosen.slot, { gear });
  assert.deepEqual(
    new Set(generated.map((row) => row.gear.items[chosen.slot].enchant ?? 0)),
    new Set([0, ...chosen.effectIds]),
  );
  for (const row of shamanHealingGearCandidates({ ...input, gear }))
    for (const [slot, spec] of row.gear.items.entries())
      if (spec.enchant)
        assert(
          domain.enchants
            .find((pair) => pair.slot === slot && pair.itemId === spec.id)
            .effectIds.includes(spec.enchant),
        );
});

test("generated loadouts are independent, legal and deterministic, with no candidate or source mutation", () => {
  const before = structuredClone(fixture),
    all = [...shamanHealingGearCandidates(input)];
  assert.equal(new Set(all.map((row) => row.id)).size, all.length);
  assert(all.length > 500);
  for (const row of all) {
    assert.equal(row.id, simulationHash(row.gear));
    assertShamanEquippedLoadout({
      domain,
      profileId: profile.id,
      race: 7,
      professions: profile.professions,
      equipment: row.gear,
    });
  }
  assert.deepEqual(rows("hands"), rows("hands"));
  const other = structuredClone(all[1].gear);
  all[0].gear.items[0].id = 999999;
  assert.deepEqual(all[1].gear, other);
  assert.deepEqual(fixture, before);
  assert(!all.some((row) => row.gear.items.some((spec) => [19682, 19687].includes(spec.id))));
});

test("invalid seed, faction, acquisition profile and group reject rather than report empty coverage", () => {
  const bad = structuredClone(seed);
  bad.items[0].id = 999999;
  for (const change of [
    { gear: bad },
    { race: 3 },
    { profileId: "unreviewed" },
    { group: "enchant-99" },
  ])
    assert.throws(() => [...shamanHealingGearCandidates({ ...input, ...change })]);
});
