import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { prebisSlotTypes } from "./prebis-pool.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

function digest(value, label) {
  assert(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), "Invalid " + label);
}

function slotsForTypes(types) {
  assert(types.every((type) => Number.isInteger(type) && type >= 1 && type <= 14));
  return prebisSlotTypes.flatMap((type, slot) => (types.includes(type) ? [slot] : []));
}

function checkedSnapshot(snapshot) {
  assert(snapshot && typeof snapshot === "object");
  digest(snapshot.mechanicsSha256, "mechanics identity");
  digest(snapshot.requestContextSha256, "request context identity");
  digest(snapshot.eligibilitySha256, "acquisition and eligibility identity");
  for (const key of ["binarySha256", "compiledDatabaseSha256", "codecSha256", "runnerSourceSha256"])
    digest(snapshot.backend?.[key], key);
  assert(Array.isArray(snapshot.incumbent?.items) && snapshot.incumbent.items.length === 17);
  for (const item of snapshot.incumbent.items) {
    assert(item && typeof item === "object");
    assert(Object.keys(item).every((key) => ["id", "enchant"].includes(key)));
    assert(Number.isSafeInteger(item.id) && item.id >= 0 && item.id <= 2147483647);
    assert(item.enchant === undefined || (Number.isSafeInteger(item.enchant) && item.enchant >= 0));
    assert(item.id > 0 || !item.enchant, "Empty slot cannot carry an enchant");
  }
  assert(Array.isArray(snapshot.catalog?.items) && Array.isArray(snapshot.catalog?.enchants));
  assert(snapshot.catalog.items.length <= 100000);
  assert(snapshot.catalog.enchants.length <= 10000);
  assert(snapshot.inspection?.items && snapshot.inspection?.sets);
  assert(!Array.isArray(snapshot.inspection.items) && !Array.isArray(snapshot.inspection.sets));
  const items = new Map(),
    enchants = new Map();
  for (const item of snapshot.catalog.items) {
    assert(Number.isSafeInteger(item.id) && item.id > 0 && item.id <= 2147483647);
    assert(!items.has(item.id), "Duplicate catalog item");
    slotsForTypes([item.type]);
    assert(
      Array.isArray(item.stats) && item.stats.length === 44 && item.stats.every(Number.isFinite),
    );
    assert(item.setId === undefined || (Number.isSafeInteger(item.setId) && item.setId >= 0));
    items.set(item.id, item);
  }
  for (const enchant of snapshot.catalog.enchants) {
    assert(Number.isSafeInteger(enchant.effectId) && enchant.effectId >= 0);
    assert(
      enchant.spellId === undefined ||
        (Number.isSafeInteger(enchant.spellId) && enchant.spellId >= 0),
    );
    slotsForTypes([enchant.type, ...(enchant.extraTypes ?? [])]);
    assert(
      Array.isArray(enchant.stats) &&
        enchant.stats.length === 44 &&
        enchant.stats.every(Number.isFinite),
    );
    const key = `${enchant.effectId}:${enchant.spellId ?? 0}:${enchant.type}`;
    assert(!enchants.has(key), "Duplicate catalog enchant");
    enchants.set(key, enchant);
  }
  for (const item of snapshot.incumbent.items)
    assert(!item.id || items.has(item.id), "Incumbent item is absent from its catalog");
  return { items, enchants };
}

function changedKeys(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((key) => !isDeepStrictEqual(before.get(key), after.get(key)))
    .sort((a, b) => (typeof a === "number" ? a - b : a.localeCompare(b, "en")));
}

function memberSlots(setId, ...catalogs) {
  return [
    ...new Set(
      catalogs.flatMap((catalog) =>
        catalog.items
          .filter((item) => item.setId === setId)
          .flatMap((item) => slotsForTypes([item.type])),
      ),
    ),
  ].sort((a, b) => a - b);
}

/** Plan complete affected gear groups; never authorize old numerical results or prune to a top five.
 * Both catalogs and inspection metadata must be actual source-bound inputs. Context includes
 * race, talents, APL, buffs/debuffs, consumes, workload and objective; mechanics identity includes
 * item/set/enchant handlers. This function validates geometry, not source authenticity or legality.
 * @param {{profile:string,before:object,after:object}} input
 * @returns {object}
 */
export function planSimulatorCatalogUpdate({ profile, before, after }) {
  assert(typeof profile === "string" && /^[a-z][a-z0-9_-]{0,79}$/.test(profile));
  const old = checkedSnapshot(before),
    current = checkedSnapshot(after);
  const changedItemIds = changedKeys(old.items, current.items);
  const changedEnchantKeys = changedKeys(old.enchants, current.enchants);
  const inspectionIds = changedKeys(
    new Map(Object.entries(before.inspection.items)),
    new Map(Object.entries(after.inspection.items)),
  ).map(Number);
  assert(inspectionIds.every((id) => Number.isSafeInteger(id) && id > 0));
  const affectedItemIds = [...new Set([...changedItemIds, ...inspectionIds])].sort((a, b) => a - b);
  const setIds = [
    ...new Set([
      ...Object.keys(before.inspection.sets).map(Number),
      ...Object.keys(after.inspection.sets).map(Number),
      ...[...old.items.values(), ...current.items.values()]
        .map((item) => item.setId)
        .filter(Boolean),
    ]),
  ].sort((a, b) => a - b);
  assert(setIds.every((id) => Number.isSafeInteger(id) && id > 0));
  const changedSetIds = setIds.filter(
    (id) => !isDeepStrictEqual(before.inspection.sets[id], after.inspection.sets[id]),
  );
  const dirty = new Set(),
    reasons = [];
  for (const id of affectedItemIds) {
    const records = [old.items.get(id), current.items.get(id)].filter(Boolean);
    if (!records.length) reasons.push("inspection-item-without-catalog-record:" + id);
    for (const item of records) {
      for (const slot of slotsForTypes([item.type])) dirty.add(slot);
    }
    if (current.items.has(id) && !after.inspection.items[id])
      reasons.push("missing-current-item-inspection:" + id);
    const setId = current.items.get(id)?.setId;
    if (setId && !after.inspection.sets[setId])
      reasons.push("missing-current-set-inspection:" + setId);
  }
  for (const key of changedEnchantKeys) {
    for (const enchant of [old.enchants.get(key), current.enchants.get(key)].filter(Boolean)) {
      for (const slot of slotsForTypes([enchant.type, ...(enchant.extraTypes ?? [])]))
        dirty.add(slot);
    }
  }
  const changedInspectionEnchantKeys = changedKeys(
    new Map(Object.entries(before.inspection.enchants ?? {})),
    new Map(Object.entries(after.inspection.enchants ?? {})),
  );
  for (const key of changedInspectionEnchantKeys) {
    const enchant = current.enchants.get(key) ?? old.enchants.get(key);
    if (!enchant) reasons.push("inspection-enchant-without-catalog-record:" + key);
    else
      for (const slot of slotsForTypes([enchant.type, ...(enchant.extraTypes ?? [])]))
        dirty.add(slot);
  }
  for (const id of changedSetIds) {
    const slots = memberSlots(id, before.catalog, after.catalog);
    if (!slots.length) reasons.push("changed-set-without-member-geometry:" + id);
    for (const slot of slots) dirty.add(slot);
  }
  if (before.mechanicsSha256 !== after.mechanicsSha256) reasons.push("mechanics-changed");
  if (before.requestContextSha256 !== after.requestContextSha256)
    reasons.push("request-context-changed");
  if (before.eligibilitySha256 !== after.eligibilitySha256)
    reasons.push("acquisition-or-eligibility-changed");
  if (!isDeepStrictEqual(before.incumbent, after.incumbent))
    reasons.push("equipped-incumbent-changed");
  const incumbentIds = new Set(after.incumbent.items.map((item) => item.id).filter(Boolean));
  if (affectedItemIds.some((id) => incumbentIds.has(id)))
    reasons.push("incumbent-item-record-changed");
  const equippedEnchantIds = new Set(
    after.incumbent.items.map((item) => item.enchant).filter(Boolean),
  );
  if (
    [...changedEnchantKeys, ...changedInspectionEnchantKeys].some((key) =>
      equippedEnchantIds.has((current.enchants.get(key) ?? old.enchants.get(key))?.effectId),
    )
  )
    reasons.push("incumbent-enchant-record-changed");
  for (const id of changedSetIds) {
    if (after.incumbent.items.some((item) => current.items.get(item.id)?.setId === id))
      reasons.push("incumbent-set-record-changed:" + id);
  }
  // Unknown catalog-wide data can affect more than the visibly changed items.
  for (const key of new Set([...Object.keys(before.catalog), ...Object.keys(after.catalog)])) {
    if (
      !["items", "enchants"].includes(key) &&
      !isDeepStrictEqual(before.catalog[key], after.catalog[key])
    )
      reasons.push("other-catalog-data-changed:" + key);
  }
  for (const key of new Set([
    ...Object.keys(before.inspection),
    ...Object.keys(after.inspection),
  ])) {
    if (
      !["items", "sets", "enchants"].includes(key) &&
      !isDeepStrictEqual(before.inspection[key], after.inspection[key])
    )
      reasons.push("other-inspection-data-changed:" + key);
  }
  if (!isDeepStrictEqual(before.backend, after.backend)) reasons.push("runtime-backend-changed");
  const fullReview = reasons.length > 0;
  if (fullReview) for (let slot = 0; slot < 17; slot++) dirty.add(slot);
  const slots = [...dirty].sort((a, b) => a - b),
    groups = [];
  const enchantSlots = new Set(
    [...old.enchants.values(), ...current.enchants.values()].flatMap((enchant) =>
      slotsForTypes([enchant.type, ...(enchant.extraTypes ?? [])]),
    ),
  );
  for (const slot of slots) {
    if (![10, 11, 12, 13, 14, 15].includes(slot))
      groups.push({ id: "slot-" + slot, kind: "slot", slots: [slot] });
    if (enchantSlots.has(slot))
      groups.push({ id: "enchant-" + slot, kind: "enchant", slots: [slot] });
  }
  for (const [id, pair] of [
    ["rings", [10, 11]],
    ["trinkets", [12, 13]],
    ["hands", [14, 15]],
  ]) {
    if (pair.some((slot) => dirty.has(slot)))
      groups.push({ id, kind: "ordered-pair", slots: pair });
  }
  // A new non-set item can break an old set threshold, so revisit every set
  // whose footprint intersects a changed slot, not just the new item's set.
  const affectedSetIds = setIds.filter((id) =>
    memberSlots(id, before.catalog, after.catalog).some((slot) => dirty.has(slot)),
  );
  for (const setId of affectedSetIds)
    groups.push({
      id: "set-" + setId,
      kind: "set",
      setId,
      slots: memberSlots(setId, before.catalog, after.catalog),
      retainFullSet: true,
    });
  const changed = slots.length > 0;
  const plan = {
    schema: "kfc-simulator-catalog-update-plan.v1",
    profile,
    mode: !changed
      ? "no-change"
      : fullReview
        ? "full-profile-review-required"
        : "affected-groups-review-required",
    beforeSha256: simulationHash(before),
    afterSha256: simulationHash(after),
    itemChanges: changedItemIds.map((id) => ({
      id,
      kind: !old.items.has(id) ? "added" : !current.items.has(id) ? "removed" : "changed",
    })),
    inspectionItemChanges: inspectionIds,
    changedEnchantKeys,
    changedInspectionEnchantKeys,
    changedSetIds,
    affectedSetIds,
    slots,
    groups,
    fullReviewReasons: [...new Set(reasons)].sort(),
    groupEnumeration: "complete-current-legal-domain-with-incumbent-and-mandatory-full-sets",
    orderedPartnersRetained: true,
    permanentItemBlacklistAllowed: false,
    topFiveOnlyPruningAllowed: false,
    invalidateAllGroupsAfterWinningGearChange: changed,
    gearedTalentRotationConsumeFeedbackRequired: changed,
    freshIndependentConfirmationRequired: changed,
    exactMeasurementLookupPossible:
      isDeepStrictEqual(before.backend, after.backend) &&
      before.mechanicsSha256 === after.mechanicsSha256 &&
      before.requestContextSha256 === after.requestContextSha256,
    measurementReuseAuthorized: false,
    crossCatalogReuseAllowed: false,
    inputSourceAdmissionVerified: false,
    nativeJobs: 0,
    browserJobs: 0,
    publicationAllowed: false,
  };
  return { ...plan, identity: simulationHash(plan) };
}
