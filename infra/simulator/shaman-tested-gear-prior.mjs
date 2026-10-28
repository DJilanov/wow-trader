import assert from "node:assert/strict";
import { shamanHealingGearGroups } from "./shaman-healing-gear-bank.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

function groupSlots(group, profile, items) {
  if (group === "rings") return [10, 11];
  if (group === "trinkets") return [12, 13];
  if (group === "hands") return [14, 15];
  const slot = /^(?:slot|enchant)-(\d+)$/.exec(group);
  if (slot) {
    const index = Number(slot[1]);
    assert(index >= 0 && index < 17);
    return [index];
  }
  const set = /^set-(\d+)$/.exec(group);
  assert(set, "Unknown Shaman comparison group");
  const id = Number(set[1]);
  return profile.slots.flatMap((ids, index) =>
    ids.some((itemId) => items.get(itemId)?.setId === id) ? [index] : [],
  );
}

function signature(group, slots, gear) {
  assert(Array.isArray(gear.items) && gear.items.length === 17);
  return simulationHash(
    group.startsWith("enchant-")
      ? slots.map((slot) => gear.items[slot].enchant ?? 0)
      : slots.map((slot) => gear.items[slot]),
  );
}

/** Build a bounded candidate prior, never a reusable simulation result or permanent item blacklist.
 * Item fingerprints must include effective stats, effect references and allowed enchants.
 * Changes to handler logic can be supplied through forceRetestItemIds when matching.
 * @param {{domain:object,profileId:string,source:{modelIdentity:string,recordSha256:string},itemFingerprints:Record<string,string>,rankedCandidates:Iterable<{gear:object,groups:string[],eligible:boolean,key:string}>,limit?:number}} input
 * @returns {object}
 */
export function createShamanTestedGearPrior({
  domain,
  profileId,
  source,
  itemFingerprints,
  rankedCandidates,
  limit = 5,
}) {
  assert(Number.isSafeInteger(limit) && limit >= 1 && limit <= 20);
  assert(/^[a-f0-9]{64}$/.test(source.modelIdentity));
  assert(/^[a-f0-9]{64}$/.test(source.recordSha256));
  for (const value of Object.values(itemFingerprints)) assert(/^[a-f0-9]{64}$/.test(value));
  const profile = domain.profiles.find((row) => row.id === profileId);
  assert(profile);
  const items = new Map(domain.items.map((row) => [row.id, row]));
  const groups = Object.fromEntries(
    shamanHealingGearGroups(domain, profileId).map((group) => [
      group,
      { slots: groupSlots(group, profile, items), signatures: [], sourceKeys: [] },
    ]),
  );
  const seen = new Map(Object.keys(groups).map((group) => [group, new Set()]));
  for (const candidate of rankedCandidates) {
    if (!candidate.eligible) continue;
    for (const group of candidate.groups) {
      if (group === "incumbent") continue;
      const entry = groups[group];
      assert(entry, "Source group is absent from its declared profile");
      if (entry.signatures.length >= limit) continue;
      const value = signature(group, entry.slots, candidate.gear);
      if (seen.get(group).has(value)) continue;
      seen.get(group).add(value);
      entry.signatures.push(value);
      entry.sourceKeys.push(candidate.key);
    }
  }
  return {
    schema: "kfc-shaman-tested-gear-prior.v1",
    profileId,
    source: { ...source },
    limit,
    itemFingerprints: { ...itemFingerprints },
    groups,
    numericalResultsReusable: false,
    publicationAllowed: false,
  };
}

/** Keep previous leading group configurations and always admit new/changed items and groups.
 * An empty source group falls back to complete enumeration; legality stays with the gear bank.
 * @param {{prior:object,domain:object,profileId:string,itemFingerprints:Record<string,string>,forceRetestItemIds?:number[]}} input
 * @returns {(candidate:{group:string,gear:object})=>boolean}
 */
export function shamanTestedGearPriorMatcher({
  prior,
  domain,
  profileId,
  itemFingerprints,
  forceRetestItemIds = [],
}) {
  assert.equal(prior.schema, "kfc-shaman-tested-gear-prior.v1");
  assert.equal(prior.profileId, profileId);
  assert.equal(prior.numericalResultsReusable, false);
  assert.equal(prior.publicationAllowed, false);
  const profile = domain.profiles.find((row) => row.id === profileId);
  assert(profile);
  const items = new Map(domain.items.map((row) => [row.id, row]));
  const groups = new Map(
    shamanHealingGearGroups(domain, profileId).map((group) => [
      group,
      groupSlots(group, profile, items),
    ]),
  );
  const forced = new Set(forceRetestItemIds);
  return (candidate) => {
    const slots = groups.get(candidate.group);
    assert(slots, "Candidate group is absent from its current profile");
    const entry = prior.groups[candidate.group];
    if (!entry || !entry.signatures.length || simulationHash(entry.slots) !== simulationHash(slots))
      return true;
    for (const slot of slots) {
      const id = candidate.gear.items[slot].id;
      if (!id) continue;
      const current = itemFingerprints[id];
      if (forced.has(id) || !current || current !== prior.itemFingerprints[id]) return true;
    }
    return entry.signatures.includes(signature(candidate.group, slots, candidate.gear));
  };
}
