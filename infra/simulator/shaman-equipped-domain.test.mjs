import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { collectShamanHealingEquipment } from "./shaman-healing-equipment.mjs";
import { collectShamanHealingEnchants } from "./shaman-healing-improvements.mjs";
import {
  assertShamanEquippedLoadout,
  prepareShamanEquippedDomain,
} from "./shaman-equipped-domain.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL(`fixtures/${name}.json.gz`, import.meta.url))));
const equipment = fixture("shaman-healing-equipment-source.v1");
const { enchants } = fixture("druid-healing-enchants-source.v1");

function sourceInput(change = () => {}) {
  const rows = structuredClone(equipment);
  change(rows);
  const items = new Map(rows.items.map((row) => [row.id, row]));
  const sources = new Map(rows.sources.map((row) => [row.id, row]));
  const context = {
    ...rows.context,
    currentIds: new Set(),
    originalItems: Array(17).fill(undefined),
  };
  const pool = collectShamanHealingEquipment(items, sources, context);
  return {
    database: { items: rows.items },
    sources: rows.sources,
    accessDomain: {
      schema: "kfc-shaman-five-thunders-access-domain.v1",
      statPruning: false,
      qualityPruning: false,
      profiles: [
        {
          id: "2-4-11",
          faction: 2,
          professions: [4, 11],
          accessPolicy: {
            schema: "kfc-shaman-five-thunders-access-policy.v1",
            id: "no-five-thunders",
            completedPhase: 0,
            accessReference: "none",
            liveServerAccessVerified: false,
          },
          availableRewardIds: [],
          sourceOverrides: [],
          slots: pool.slots,
          seed: structuredClone(rows.seed),
        },
      ],
    },
    enchantDomain: collectShamanHealingEnchants({ items: rows.items, slots: pool.slots, enchants }),
  };
}

function candidate(domain, gear = equipment.seed) {
  return {
    domain,
    profileId: "2-4-11",
    race: 7,
    professions: [4, 11],
    equipment: structuredClone(gear),
  };
}

test("the compiled domain preserves all actual pool/slot/enchant pairs and reference status", () => {
  const input = sourceInput(),
    domain = prepareShamanEquippedDomain(input);
  assert.deepEqual(domain.profiles[0].slots, input.accessDomain.profiles[0].slots);
  assert.equal(domain.enchants.length, input.enchantDomain.itemSlots.length);
  assert.equal(domain.enchantRecipes.length, input.enchantDomain.enchants.length);
  assert(domain.enchantRecipes.some((row) => row.status === "provisional"));
  assert.equal(domain.items.length, new Set(domain.profiles[0].slots.flat()).size);
  assert.equal(domain.statPruning, false);
  assert.equal(domain.qualityPruning, false);
  assert.equal(domain.publicationAllowed, false);
});

test("full loadouts preserve caller data and bind race, professions and access policy", () => {
  const domain = prepareShamanEquippedDomain(sourceInput()),
    value = candidate(domain),
    before = structuredClone(value),
    result = assertShamanEquippedLoadout(value);
  assert.deepEqual(value, before);
  assert.deepEqual(result.equipment, value.equipment);
  assert.deepEqual(result.professions, [4, 11]);
  assert.equal(result.faction, 2);
  value.professions.reverse();
  assert.deepEqual(assertShamanEquippedLoadout(value), result);
  result.equipment.items[0].id = 999;
  result.accessPolicy.completedPhase = 4;
  assert.deepEqual(value.domain, domain);
  assert.notEqual(value.equipment.items[0].id, 999);
  assert.equal(domain.profiles[0].accessPolicy.completedPhase, 0);
  assert.equal(result.wholeEquippedWorkloadAdmissionRequired, true);
});

test("unknown profiles, faction mismatches and invalid profession/race inputs fail", () => {
  const domain = prepareShamanEquippedDomain(sourceInput());
  for (const changes of [
    { profileId: "2-4-11:five-thunders-through-4" },
    { race: 3 },
    { race: 9 },
    { race: 0 },
    { race: 11 },
    { race: NaN },
    { professions: [4, 4] },
    { professions: [4, 8] },
    { professions: [4, 11, 1] },
    { professions: [4, "11"] },
  ])
    assert.throws(() => assertShamanEquippedLoadout({ ...candidate(domain), ...changes }));
});

test("only known item fields, complete slots and compatible nonraid enchant effects are accepted", () => {
  const domain = prepareShamanEquippedDomain(sourceInput());
  const value = candidate(domain);
  const pair = domain.enchants.find(
    (row) => row.slot === 0 && row.itemId === value.equipment.items[0].id,
  );
  assert(pair.effectIds.includes(2544));
  value.equipment.items[0].enchant = 2544;
  assert.equal(assertShamanEquippedLoadout(value).equipment.items[0].enchant, 2544);
  for (const mutate of [
    (value) => {
      value.equipment.items.pop();
    },
    (value) => {
      value.equipment.bonus = 1;
    },
    (value) => {
      value.equipment.items[0] = null;
    },
    (value) => {
      value.equipment.items[0].id = 99999999;
    },
    (value) => {
      value.equipment.items[0].stats = [999];
    },
    (value) => {
      value.equipment.items[0].randomSuffix = 1;
    },
    (value) => {
      value.equipment.items[0].enchant = NaN;
    },
    (value) => {
      value.equipment.items[0].enchant = 2566;
    },
    (value) => {
      value.equipment.items[0].enchant = 2587;
    },
    (value) => {
      value.equipment.items[15].enchant = 1;
    },
    (value) => {
      value.equipment.items[0].id = 0;
    },
  ]) {
    const changed = candidate(domain);
    mutate(changed);
    assert.throws(() => assertShamanEquippedLoadout(changed));
  }
});

test("paired hands reject dual wield and two-hand plus shield while retaining legal alternatives", () => {
  const input = sourceInput(),
    domain = prepareShamanEquippedDomain(input),
    value = candidate(domain),
    staff = input.database.items.find(
      (row) => domain.profiles[0].slots[14].includes(row.id) && row.handType === 4,
    ),
    shield = input.database.items.find(
      (row) => domain.profiles[0].slots[15].includes(row.id) && row.weaponType === 7,
    );
  assert(staff && shield);
  value.equipment.items[14] = { id: staff.id };
  assertShamanEquippedLoadout(value);
  value.equipment.items[15] = { id: shield.id };
  assert.throws(() => assertShamanEquippedLoadout(value));
  const oneHand = input.database.items.find(
    (row) => domain.profiles[0].slots[14].includes(row.id) && row.handType !== 4,
  );
  assert(oneHand);
  value.equipment.items[14] = { id: oneHand.id };
  assertShamanEquippedLoadout(value);
  value.equipment.items[15] = structuredClone(value.equipment.items[14]);
  assert.throws(() => assertShamanEquippedLoadout(value));
});

test("unique copies, shared categories and exclusive reward choices are whole-loadout constraints", () => {
  for (const kind of ["unique", "limitCategory", "questChoice"]) {
    const input = sourceInput((rows) => {
      const [first, second] = rows.seed.items.slice(10, 12).map((row) => row.id);
      if (kind === "unique") rows.items.find((row) => row.id === first).unique = true;
      else
        for (const id of [first, second]) {
          const row = rows.sources.find((row) => row.id === id);
          if (kind === "limitCategory") row.limitCategory = 999;
          else {
            row.sources = [{ kind: "dungeon-quest", questId: 999 }];
            rows.items.find((item) => item.id === id).sources = [];
          }
        }
    });
    // Category/quest collisions deliberately invalidate the source seed as well.
    if (kind !== "unique") {
      assert.throws(() => prepareShamanEquippedDomain(input));
      continue;
    }
    const domain = prepareShamanEquippedDomain(input),
      value = candidate(domain);
    value.equipment.items[11] = structuredClone(value.equipment.items[10]);
    assert.throws(() => assertShamanEquippedLoadout(value));
  }
  for (const kind of ["limitCategory", "questChoices"]) {
    const domain = prepareShamanEquippedDomain(sourceInput());
    const value = candidate(domain);
    for (const spec of value.equipment.items.slice(10, 12)) {
      const row = domain.items.find((row) => row.id === spec.id);
      if (kind === "limitCategory") row.limitCategory = 999;
      else row.questChoices = ["quest:999"];
    }
    assert.throws(() => assertShamanEquippedLoadout(value));
  }
});

test("drift, duplicate IDs/profiles and missing item/enchant contracts fail preparation", () => {
  for (const mutate of [
    (value) => {
      value.database.items.push(value.database.items[0]);
    },
    (value) => {
      value.accessDomain.profiles.push(value.accessDomain.profiles[0]);
    },
    (value) => {
      value.accessDomain.profiles[0].slots[0].pop();
    },
    (value) => {
      value.enchantDomain.itemSlots.pop();
    },
    (value) => {
      value.enchantDomain.itemSlots.push(value.enchantDomain.itemSlots[0]);
    },
    (value) => {
      value.enchantDomain.itemSlots[0].enchantKeys.push("invented");
    },
  ]) {
    const input = sourceInput();
    mutate(input);
    assert.throws(() => prepareShamanEquippedDomain(input));
  }
});

test("compiling and inspecting the domain cannot mutate the captured sources", () => {
  const input = sourceInput(),
    before = structuredClone(input),
    domain = prepareShamanEquippedDomain(input);
  domain.profiles[0].slots[0].pop();
  domain.profiles[0].accessPolicy.completedPhase = 99;
  domain.enchants[0].recipeKeys.pop();
  assert.deepEqual(input, before);
});
