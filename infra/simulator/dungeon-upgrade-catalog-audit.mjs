import assert from "node:assert/strict";

export const dungeonUpgradeBaseSetIds = Object.freeze(
  Array.from({ length: 9 }, (_, index) => 511 + index),
);

/** Audit identity coverage only; presence does not establish acquisition, correct effects or measured comparisons.
 * @param {{snapshot: object, catalogs: object[]}} input @returns {object}
 */
export function auditDungeonUpgradeCatalogs({ snapshot, catalogs }) {
  assert.equal(snapshot.schema, "forever-client-mechanics.v1");
  assert(typeof snapshot.clientVersion === "string" && snapshot.clientVersion.length > 0);
  assert(
    Array.isArray(snapshot.items) &&
      Array.isArray(snapshot.sets) &&
      Array.isArray(snapshot.setEffects),
  );
  const currentItems = new Map(snapshot.items.map((row) => [row.itemId, row])),
    currentSets = new Map(snapshot.sets.map((row) => [row.id, row]));
  assert.equal(currentItems.size, snapshot.items.length, "Duplicate client item identity");
  assert.equal(currentSets.size, snapshot.sets.length, "Duplicate client set identity");
  assert(Array.isArray(catalogs) && catalogs.length > 0);
  assert.equal(
    new Set(catalogs.map((row) => row.id)).size,
    catalogs.length,
    "Duplicate catalog audit identity",
  );
  const indexed = catalogs.map((catalog) => {
    assert(typeof catalog.id === "string" && catalog.id.length > 0);
    assert(/^[a-f0-9]{24}$/.test(catalog.release));
    assert(Array.isArray(catalog.profiles) && catalog.profiles.length > 0);
    assert(catalog.profiles.every((value) => typeof value === "string" && value.length > 0));
    const items = new Map(catalog.items.map((row) => [row.id, row]));
    assert.equal(items.size, catalog.items.length, "Duplicate runtime item identity");
    for (const row of catalog.items) assert(Number.isSafeInteger(row.id) && row.id > 0);
    return { catalog, items };
  });
  const used = new Set(),
    sets = dungeonUpgradeBaseSetIds.map((setId) => {
      const set = currentSets.get(setId);
      assert(
        set && typeof set.Name_lang === "string" && set.Name_lang.length > 0,
        "Missing required base dungeon set " + setId,
      );
      const ids = set.ItemID.filter(Boolean).sort((a, b) => a - b);
      assert(
        ids.every((id) => Number.isSafeInteger(id) && id > 0),
        "Invalid base set member identity",
      );
      assert.equal(ids.length, 8, "Expected eight base dungeon-set members");
      assert.equal(new Set(ids).size, ids.length, "Duplicate base set member");
      for (const id of ids) {
        assert(!used.has(id), "Base item belongs to multiple audited sets");
        used.add(id);
      }
      const definitions = ids.map((id) => {
          const item = currentItems.get(id);
          if (item) assert(Array.isArray(item.issues), "Missing client issue evidence");
          const issues = item ? [...item.issues] : ["missing-client-definition"];
          if (item && item.setId !== setId) issues.push("client-set-membership-mismatch");
          return { id, present: Boolean(item), name: item?.name, issues };
        }),
        alternateSets = snapshot.sets.filter(
          (row) => row.Name_lang === set.Name_lang && row.id !== setId,
        ),
        alternateIds = new Set(alternateSets.map((row) => row.id)),
        alternateClientItemIds = snapshot.items
          .filter((row) => alternateIds.has(row.setId))
          .map((row) => row.itemId)
          .sort((a, b) => a - b),
        effects = snapshot.setEffects
          .filter((row) => row.ItemSetID === setId)
          .map((row) => ({ threshold: row.Threshold, spellId: row.SpellID }))
          .sort((a, b) => a.threshold - b.threshold || a.spellId - b.spellId);
      assert(effects.length > 0, "Missing base set effects");
      const clientDefinitionsComplete = definitions.every(
          (row) => row.present && row.issues.length === 0,
        ),
        coverage = indexed.map(({ catalog, items }) => {
          const presentItemIds = ids.filter((id) => items.has(id)),
            missingItemIds = ids.filter((id) => !items.has(id)),
            mismatchedSetItems = presentItemIds
              .filter((id) => items.get(id).setId !== setId)
              .map((id) => ({ id, runtimeSetId: items.get(id).setId ?? null })),
            relatedCatalogItems = catalog.items
              .filter(
                (row) =>
                  !ids.includes(row.id) &&
                  (row.setId === setId ||
                    alternateIds.has(row.setId) ||
                    row.setName === set.Name_lang),
              )
              .map((row) => ({ id: row.id, setId: row.setId ?? null, name: row.name }));
          return {
            catalogId: catalog.id,
            release: catalog.release,
            profiles: [...catalog.profiles],
            presentItemIds,
            missingItemIds,
            mismatchedSetItems,
            relatedCatalogItems,
            identityCoverageComplete:
              clientDefinitionsComplete &&
              missingItemIds.length === 0 &&
              mismatchedSetItems.length === 0,
          };
        });
      return {
        setId,
        name: set.Name_lang,
        itemIds: ids,
        definitions,
        clientDefinitionsComplete,
        effects,
        alternateSetIds: [...alternateIds].sort((a, b) => a - b),
        alternateClientItemIds,
        coverage,
      };
    });
  return {
    schema: "kfc-dungeon-upgrade-catalog-identity-audit.v1",
    clientVersion: snapshot.clientVersion,
    baseSetCount: sets.length,
    baseItemCount: used.size,
    catalogCount: catalogs.length,
    sets,
    identityCoverageComplete: sets.every((set) =>
      set.coverage.every((row) => row.identityCoverageComplete),
    ),
    statsCompared: false,
    effectsCompared: false,
    acquisitionVerified: false,
    optimizationCompared: false,
    publicationAllowed: false,
    scope:
      "Exact base-set item identities in the requested catalogs, compared with current client definitions. Identically named alternate sets are listed separately and cannot satisfy base membership. Missing catalog definitions do not prove server unavailability; present definitions do not prove stats/effects/acquisition or an optimization result.",
  };
}
