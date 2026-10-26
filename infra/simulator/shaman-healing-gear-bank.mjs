import assert from "node:assert/strict";
import { assertShamanEquippedLoadout } from "./shaman-equipped-domain.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

const singleSlots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16];

/** Enumerate the actual slot, paired-slot, set and enchant comparison groups.
 * @param {object} domain @param {string} profileId @returns {string[]}
 */
export function shamanHealingGearGroups(domain, profileId) {
  assert.equal(domain.schema, "kfc-shaman-equipped-domain.v1");
  const profile = domain.profiles.find((row) => row.id === profileId);
  assert(profile, "Unknown Shaman acquisition profile");
  const items = new Map(domain.items.map((row) => [row.id, row]));
  const sets = [
    ...new Set(
      profile.slots
        .flat()
        .map((id) => items.get(id).setId)
        .filter(Boolean),
    ),
  ].sort((a, b) => a - b);
  return [
    ...singleSlots.map((slot) => "slot-" + slot),
    "rings",
    "trinkets",
    "hands",
    ...sets.map((id) => "set-" + id),
    ...Array.from({ length: 17 }, (_, slot) => "enchant-" + slot),
  ];
}

/** Retain all legal candidates in each comparison group without stat or quality pruning.
 * Complete ownership, paired-hand, profession and conditional-access checks remain mandatory.
 * @param {{domain:object,profileId:string,race:number,gear:object,group?:string}} input
 * @returns {Generator<{group:string,id:string,gear:object}>}
 */
export function* shamanHealingGearCandidates({ domain, profileId, race, gear, group }) {
  const groups = shamanHealingGearGroups(domain, profileId);
  assert(group === undefined || groups.includes(group), "Unknown Shaman comparison group");
  const profile = domain.profiles.find((row) => row.id === profileId);
  const validation = { domain, profileId, race, professions: profile.professions };
  assertShamanEquippedLoadout({ ...validation, equipment: gear });
  const items = new Map(domain.items.map((row) => [row.id, row]));
  const enchants = new Map(
    domain.enchants.map((row) => [`${row.slot}/${row.itemId}`, new Set(row.effectIds)]),
  );
  const include = (name) => group === undefined || group === name;
  const seen = new Set();
  function candidate(name, changes, enchantChanges = []) {
    const proposed = structuredClone(gear);
    for (const [slot, id] of changes) {
      proposed.items[slot] = { id };
      const effect = gear.items[slot].enchant;
      if (id && effect && enchants.get(`${slot}/${id}`)?.has(effect))
        proposed.items[slot].enchant = effect;
    }
    for (const [slot, effect] of enchantChanges) {
      delete proposed.items[slot].enchant;
      if (effect) proposed.items[slot].enchant = effect;
    }
    try {
      assertShamanEquippedLoadout({ ...validation, equipment: proposed });
    } catch (error) {
      if (!(error instanceof assert.AssertionError)) throw error;
      return;
    }
    const id = simulationHash(proposed);
    if (seen.has(id)) return;
    seen.add(id);
    return { group: name, id, gear: proposed };
  }
  for (const slot of singleSlots) {
    const name = "slot-" + slot;
    if (!include(name)) continue;
    for (const id of profile.slots[slot]) {
      const row = candidate(name, [[slot, id]]);
      if (row) yield row;
    }
  }
  for (const [left, right, name] of [
    [10, 11, "rings"],
    [12, 13, "trinkets"],
  ]) {
    if (!include(name)) continue;
    for (const first of profile.slots[left])
      for (const second of profile.slots[right]) {
        const row = candidate(name, [
          [left, first],
          [right, second],
        ]);
        if (row) yield row;
      }
  }
  if (include("hands")) {
    for (const mainHand of profile.slots[14]) {
      const offHands = items.get(mainHand).handType === 4 ? [0] : [0, ...profile.slots[15]];
      for (const offHand of offHands) {
        const row = candidate("hands", [
          [14, mainHand],
          [15, offHand],
        ]);
        if (row) yield row;
      }
    }
  }
  const sets = new Map();
  for (const [slot, ids] of profile.slots.entries())
    for (const id of ids) {
      const setId = items.get(id).setId;
      if (!setId || !include("set-" + setId)) continue;
      if (!sets.has(setId)) sets.set(setId, new Map());
      const entries = sets.get(setId);
      if (!entries.has(slot)) entries.set(slot, []);
      entries.get(slot).push(id);
    }
  for (const [setId, entries] of sets) {
    const slots = [...entries];
    const combinations = slots.reduce((count, [, ids]) => count * BigInt(ids.length + 1), 1n);
    assert(combinations <= 1000000n, "Set bank limit exceeded; no partial coverage is accepted");
    function* assignments(index, selected) {
      if (index === slots.length) {
        if (selected.length >= 2) yield selected;
        return;
      }
      yield* assignments(index + 1, selected);
      const [slot, ids] = slots[index];
      for (const id of ids) yield* assignments(index + 1, [...selected, [slot, id]]);
    }
    for (const assignment of assignments(0, [])) {
      const row = candidate("set-" + setId, assignment);
      if (row) yield row;
    }
  }
  for (const [slot, spec] of gear.items.entries()) {
    const name = "enchant-" + slot;
    if (!include(name) || !spec.id) continue;
    for (const effect of [0, ...enchants.get(`${slot}/${spec.id}`)]) {
      const row = candidate(name, [], [[slot, effect]]);
      if (row) yield row;
    }
  }
}
