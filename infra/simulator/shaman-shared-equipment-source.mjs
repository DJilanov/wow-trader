import assert from "node:assert/strict";

const sorted = (values) => [...new Set(values)].sort((a, b) => a - b);

/** Resolve the captured equipment graph without admitting effects or acquisition.
 * @param {object} evidence @returns {object}
 */
export function reviewShamanSharedEquipmentSource(evidence) {
  assert.equal(evidence.schema, "kfc-shaman-shared-equipment-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.selectedRowsAreSourceSubsets, true);
  assert.equal(evidence.capturedTriggerClosureComplete, true);
  for (const key of [
    "serverMechanicsVerified",
    "fullItemEffectAdmission",
    "fullClassAdmission",
    "startsNewClassClock",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(evidence[key], false);
  const ids = new Set(evidence.candidateIds),
    { tables } = evidence;
  assert.equal(ids.size, 2017);
  assert.equal(evidence.candidateIds.length, 2017);
  assert.deepEqual(sorted(evidence.items.map((row) => row.id)), sorted(ids));
  assert.deepEqual(sorted(evidence.sources.map((row) => row.id)), sorted(ids));
  assert.equal(evidence.items.length, 2017);
  assert.equal(evidence.sources.length, 2017);
  for (const [name, rows] of Object.entries(tables))
    assert.equal(
      new Set(rows.map((row) => row.id)).size,
      rows.length,
      "Duplicate source row " + name,
    );
  assert.equal(tables.ItemSparse.length, 1460);
  const current = new Set(tables.ItemSparse.map((row) => row.id));
  assert(tables.ItemSparse.every((row) => ids.has(row.id)));
  assert.deepEqual(
    sorted([...ids].filter((id) => !current.has(id))),
    sorted(evidence.currentMissingIds),
  );
  assert.equal(evidence.currentMissingIds.length, 557);
  assert.equal(evidence.unsupportedModifiers.length, 20);
  const linked = sorted(tables.ItemXItemEffect.map((row) => row.ItemID));
  assert.equal(linked.length, 251);
  assert.deepEqual(linked, evidence.linkedIds);
  assert.equal(tables.ItemXItemEffect.length, 268);
  assert.equal(tables.ItemEffect.length, 268);
  assert(tables.ItemXItemEffect.every((row) => ids.has(row.ItemID)));
  const itemEffects = new Map(tables.ItemEffect.map((row) => [row.id, row])),
    wantedEffects = sorted(tables.ItemXItemEffect.map((row) => row.ItemEffectID));
  assert.deepEqual(sorted(itemEffects.keys()), wantedEffects);
  assert.equal(evidence.auditedCurrentLinkedItems.length, 149);
  const audited = new Set(evidence.auditedCurrentLinkedItems.map((row) => row.id));
  assert.equal(audited.size, 149);
  for (const row of evidence.auditedCurrentLinkedItems) {
    assert(current.has(row.id), "Audited current link has no current base");
    assert.deepEqual(
      sorted(
        tables.ItemXItemEffect.filter((link) => link.ItemID === row.id).map(
          (link) => link.ItemEffectID,
        ),
      ),
      sorted(row.effectIds),
    );
  }
  assert.deepEqual(
    linked.filter((id) => !audited.has(id)),
    evidence.additionalLinkedIds,
  );
  assert.deepEqual(
    linked.filter((id) => !current.has(id)),
    evidence.linkedWithoutCurrentBase,
  );
  assert.deepEqual(evidence.additionalLinkedIds, evidence.linkedWithoutCurrentBase);
  assert.equal(evidence.additionalLinkedIds.length, 102);
  const setIds = sorted(tables.ItemSet.map((row) => row.id));
  assert.equal(setIds.length, 33);
  assert.deepEqual(setIds, evidence.setIds);
  assert.equal(tables.ItemSetSpell.length, 104);
  assert(
    tables.ItemSetSpell.every(
      (row) => setIds.includes(row.ItemSetID) && row.Threshold > 0 && row.SpellID > 0,
    ),
  );
  const roots = sorted([
    ...tables.ItemEffect.map((row) => row.SpellID),
    ...tables.ItemSetSpell.map((row) => row.SpellID),
  ]);
  assert.equal(roots.length, 281);
  assert.deepEqual(roots, evidence.rootSpellIds);
  const spells = new Set(roots);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of tables.SpellEffect) {
      if (
        spells.has(row.SpellID) &&
        row.EffectTriggerSpell > 0 &&
        !spells.has(row.EffectTriggerSpell)
      ) {
        spells.add(row.EffectTriggerSpell);
        changed = true;
      }
    }
  }
  assert.equal(spells.size, 341);
  assert.deepEqual(sorted(spells), evidence.spellIds);
  assert.equal(tables.SpellEffect.length, 427);
  assert(tables.SpellEffect.every((row) => spells.has(row.SpellID)));
  for (const name of ["Spell", "SpellName", "SpellMisc"])
    assert.deepEqual(
      sorted(tables[name].map((row) => (name === "SpellMisc" ? row.SpellID : row.id))),
      sorted(spells),
      name + " incomplete",
    );
  for (const name of [
    "SpellAuraOptions",
    "SpellAuraRestrictions",
    "SpellCategories",
    "SpellClassOptions",
    "SpellCooldowns",
    "SpellEquippedItems",
    "SpellLevels",
    "SpellPower",
    "SpellXDescriptionVariables",
  ])
    assert(
      tables[name].every((row) => spells.has(row.SpellID)),
      "Unrelated source row " + name,
    );
  assert.deepEqual(evidence.unresolved, {
    missingSpells: [],
    missingNames: [],
    missingLookups: {},
    unavailablePPM: [],
  });
  assert(tables.SpellAuraOptions.every((row) => row.SpellProcsPerMinuteID === 0));
  const wantedLookups = {
    SpellDuration: tables.SpellMisc.flatMap((row) => [row.DurationIndex, row.PvPDurationIndex]),
    SpellCastTimes: tables.SpellMisc.map((row) => row.CastingTimeIndex),
    SpellRange: tables.SpellMisc.map((row) => row.RangeIndex),
    SpellRadius: tables.SpellEffect.flatMap((row) => row.EffectRadiusIndex),
    SpellDescriptionVariables: tables.SpellXDescriptionVariables.map(
      (row) => row.SpellDescriptionVariablesID,
    ),
  };
  assert.deepEqual(Object.keys(evidence.lookups), Object.keys(wantedLookups));
  for (const [name, values] of Object.entries(wantedLookups)) {
    assert(values.every((value) => Number.isInteger(value) && value >= 0));
    assert.deepEqual(
      sorted(evidence.lookups[name].map((row) => row.id)),
      sorted(values.filter((value) => value > 0)),
      "Missing/extra lookup " + name,
    );
  }
  assert.equal(evidence.ownedActions.length, 32);
  assert.equal(evidence.ownedClassOptions.length, 32);
  const owned = new Map(evidence.ownedClassOptions.map((row) => [row.SpellID, row]));
  assert.equal(owned.size, 32);
  const families = {
    "healing-wave": [9, [64, 0, 0, 0]],
    "lesser-healing-wave": [6, [128, 0, 0, 0]],
    "chain-heal": [3, [256, 0, 0, 0]],
    riptide: [3, [0, 0, 16, 0]],
    "healing-stream": [5, [524288, 0, 0, 0]],
    "mana-tide": [4, [536870912, 0, 0, 0]],
    "water-shield": [1, [0, 32, 0, 0]],
    "natures-swiftness": [1, [0, 0, 0, 0]],
  };
  for (const action of evidence.ownedActions) {
    assert(Object.hasOwn(families, action.family));
    const row = owned.get(action.id);
    assert(row);
    assert.equal(row.SpellClassSet, 11);
    assert.deepEqual(row.SpellClassMask, families[action.family][1]);
  }
  for (const [family, [count]] of Object.entries(families))
    assert.equal(evidence.ownedActions.filter((row) => row.family === family).length, count);
  const spellNames = new Map(tables.SpellName.map((row) => [row.id, row])),
    spellTexts = new Map(tables.Spell.map((row) => [row.id, row]));
  const graphs = sorted(spells).map((id) => {
    const effects = tables.SpellEffect.filter((row) => row.SpellID === id),
      classOptions = tables.SpellClassOptions.filter((row) => row.SpellID === id),
      directOwnedMatches = [];
    if (classOptions.some((row) => row.SpellClassSet === 11))
      for (const action of evidence.ownedActions) {
        if (
          effects.some((effect) =>
            effect.EffectSpellClassMask.some(
              (mask, index) => (mask & owned.get(action.id).SpellClassMask[index]) !== 0,
            ),
          )
        )
          directOwnedMatches.push(action.id);
      }
    return {
      id,
      name: spellNames.get(id).Name_lang,
      description: spellTexts.get(id).Description_lang,
      triggerSpellIds: sorted(effects.map((row) => row.EffectTriggerSpell).filter((id) => id > 0)),
      directOwnedFamilyMaskMatches: sorted(directOwnedMatches),
      effects: structuredClone(effects),
      classOptions: structuredClone(classOptions),
    };
  });
  const itemRows = evidence.items.map((item) => ({
    itemId: item.id,
    name: item.name,
    currentBaseRecordPresent: current.has(item.id),
    effects: tables.ItemXItemEffect.filter((row) => row.ItemID === item.id).map((link) => ({
      link: structuredClone(link),
      effect: structuredClone(itemEffects.get(link.ItemEffectID)),
    })),
    runtimeAdmission: false,
  }));
  const sets = tables.ItemSet.map((set) => ({
    id: set.id,
    name: set.Name_lang,
    requiredSkill: set.RequiredSkill,
    requiredSkillRank: set.RequiredSkillRank,
    candidateMemberIds: sorted(set.ItemID.filter((id) => ids.has(id))),
    thresholds: structuredClone(tables.ItemSetSpell.filter((row) => row.ItemSetID === set.id)),
    runtimeAdmission: false,
  }));
  return {
    schema: "kfc-shaman-shared-equipment-source-review.v1",
    sourceBuild: 70532,
    candidateItems: 2017,
    currentBaseRecords: 1460,
    currentMissingItems: 557,
    linkedItems: 251,
    currentBaseLinkedItems: 149,
    historicalBaseLinkedItems: 102,
    itemEffectLinks: 268,
    sets: 33,
    setThresholds: 104,
    rootSpells: 281,
    triggerClosureSpells: 341,
    effectRows: 427,
    items: itemRows,
    setsInventory: sets,
    spellGraph: graphs,
    unsupportedModifiers: structuredClone(evidence.unsupportedModifiers),
    currentMissingIds: [...evidence.currentMissingIds],
    allCandidatesRetained: true,
    missingCapturedGraphReferences: 0,
    encryptedSourceRecordsMayBeAbsent: true,
    directFamilyMaskMatchesAreRuntimeAdmission: false,
    serverMechanicsVerified: false,
    fullItemEffectAdmission: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
