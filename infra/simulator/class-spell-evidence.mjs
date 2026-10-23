import assert from "node:assert/strict";

/** Find numeric spell references in client tooltip expressions; unresolved expressions stay unchanged.
 * @param {string} text
 * @returns {number[]}
 */
export function tooltipSpellReferences(text) {
  const ids = new Set();
  for (const pattern of [/\$(\d+)[a-zA-Z]/g, /\$@(?:spellname|spelldesc|spelltooltip)(\d+)/g])
    for (const match of text.matchAll(pattern)) {
      const id = Number(match[1]);
      if (Number.isSafeInteger(id) && id > 0) ids.add(id);
    }
  return [...ids].sort((a, b) => a - b);
}

/** Collect one class's ability/talent candidates and referenced raw mechanics without claiming trained ranks or live server behavior.
 * @param {{className: string, classMask: number, tables: Map<string, object[]>, talents: object[]}} input
 * @returns {object}
 */
export function collectClassSpellEvidence(input) {
  const { className, classMask, tables, talents } = input;
  assert(typeof className === "string" && className.length > 0);
  assert(
    Number.isSafeInteger(classMask) && classMask > 0 && Number.isInteger(Math.log2(classMask)),
  );
  const rows = (name) => {
      assert(tables.has(name), "Missing class source table: " + name);
      return tables.get(name);
    },
    ability = rows("SkillLineAbility").filter((row) => (row.ClassMask & classMask) !== 0),
    classTalents = talents.filter((row) => row.className === className),
    spells = new Map(rows("Spell").map((row) => [row.id, row])),
    effects = new Map(),
    variables = new Map(rows("SpellDescriptionVariables").map((row) => [row.id, row])),
    variableLinks = new Map(),
    spellLinks = new Map(),
    learnParents = new Map();
  for (const [table, fields] of [
    [
      "SpellAuraRestrictions",
      ["CasterAuraSpell", "TargetAuraSpell", "ExcludeCasterAuraSpell", "ExcludeTargetAuraSpell"],
    ],
    ["SpellCooldowns", ["AuraSpellID"]],
    ["SpellPower", ["RequiredAuraSpellID"]],
    ["SpellClassOptions", ["ModalNextSpell"]],
  ])
    for (const row of rows(table))
      for (const field of fields) {
        assert(Object.hasOwn(row, field), `Missing spell reference field: ${table}.${field}`);
        if (row[field] > 0) {
          const current = spellLinks.get(row.SpellID) ?? [];
          current.push({ id: row[field], origin: `${table}:${row.id}:${field}` });
          spellLinks.set(row.SpellID, current);
        }
      }
  for (const row of rows("SpellXDescriptionVariables")) {
    const current = variableLinks.get(row.SpellID) ?? [];
    current.push(row.SpellDescriptionVariablesID);
    variableLinks.set(row.SpellID, current);
  }
  for (const row of rows("SpellEffect")) {
    const current = effects.get(row.SpellID) ?? [];
    current.push(row);
    effects.set(row.SpellID, current);
    if (row.Effect === 36 && row.EffectTriggerSpell > 0) {
      const parents = learnParents.get(row.EffectTriggerSpell) ?? [];
      parents.push(row);
      learnParents.set(row.EffectTriggerSpell, parents);
    }
  }
  const roots = new Set([
      ...ability.map((row) => row.Spell),
      ...classTalents.map((row) => row.spellId),
    ]),
    ids = new Set(roots),
    edges = [],
    seenEdges = new Set();
  assert(roots.size > 0 && [...roots].every((id) => Number.isSafeInteger(id) && id > 0));
  let next = [...roots];
  function reference(from, to, kind, origin) {
    assert(Number.isSafeInteger(to) && to > 0);
    const key = JSON.stringify([from, to, kind, origin]);
    if (!seenEdges.has(key)) {
      edges.push({ from, to, kind, origin });
      seenEdges.add(key);
    }
    if (!ids.has(to)) {
      ids.add(to);
      next.push(to);
    }
  }
  for (const talent of classTalents)
    for (const rank of talent.ranks)
      for (const id of tooltipSpellReferences(rank.text))
        reference(talent.spellId, id, "talent-text", `node:${talent.nodeId}:rank:${rank.rank}`);
  for (let depth = 0; next.length; depth++) {
    assert(depth < 24 && ids.size <= 5000, "Class spell closure exceeds its declared bounds");
    const current = next;
    next = [];
    for (const id of current) {
      for (const link of spellLinks.get(id) ?? [])
        reference(id, link.id, "spell-restriction", link.origin);
      for (const effect of effects.get(id) ?? [])
        if (effect.EffectTriggerSpell > 0)
          reference(id, effect.EffectTriggerSpell, "trigger", `effect:${effect.id}`);
      for (const [field, value] of Object.entries(spells.get(id) ?? {}))
        if (typeof value === "string")
          for (const linked of tooltipSpellReferences(value))
            reference(id, linked, "spell-text", field);
      for (const variableId of variableLinks.get(id) ?? [])
        for (const [field, value] of Object.entries(variables.get(variableId) ?? {}))
          if (typeof value === "string")
            for (const linked of tooltipSpellReferences(value))
              reference(id, linked, "description-variable", `${variableId}:${field}`);
      for (const parent of learnParents.get(id) ?? [])
        reference(id, parent.SpellID, "teaching-parent", `effect:${parent.id}`);
    }
  }
  edges.sort(
    (a, b) =>
      a.from - b.from ||
      a.to - b.to ||
      a.kind.localeCompare(b.kind) ||
      a.origin.localeCompare(b.origin),
  );
  const rawTables = {};
  for (const name of [
    "Spell",
    "SpellName",
    "SpellEffect",
    "SpellPower",
    "SpellMisc",
    "SpellLevels",
    "SpellClassOptions",
    "SpellAuraOptions",
    "SpellAuraRestrictions",
    "SpellCategories",
    "SpellCooldowns",
    "SpellScaling",
    "SpellXDescriptionVariables",
  ])
    rawTables[name] = rows(name).filter((row) =>
      ids.has(["Spell", "SpellName"].includes(name) ? row.id : row.SpellID),
    );
  rawTables.SkillLineAbility = ability;
  const lookupTables = {};
  for (const [name, field] of [
    ["SpellCastTimes", "CastingTimeIndex"],
    ["SpellDuration", "DurationIndex"],
    ["SpellRange", "RangeIndex"],
  ]) {
    const required = new Set(rawTables.SpellMisc.map((row) => row[field]));
    lookupTables[name] = rows(name).filter((row) => required.has(row.id));
  }
  const radiusIds = new Set(
      rawTables.SpellEffect.flatMap((row) => row.EffectRadiusIndex).filter((id) => id > 0),
    ),
    variableIds = new Set(
      rawTables.SpellXDescriptionVariables.map((row) => row.SpellDescriptionVariablesID),
    ),
    definitionIds = new Set(classTalents.map((row) => row.definitionId));
  lookupTables.SpellRadius = rows("SpellRadius").filter((row) => radiusIds.has(row.id));
  lookupTables.SpellDescriptionVariables = rows("SpellDescriptionVariables").filter((row) =>
    variableIds.has(row.id),
  );
  lookupTables.TraitDefinitionEffectPoints = rows("TraitDefinitionEffectPoints").filter((row) =>
    definitionIds.has(row.TraitDefinitionID),
  );
  const curveIds = new Set(lookupTables.TraitDefinitionEffectPoints.map((row) => row.CurveID));
  lookupTables.Curve = rows("Curve").filter((row) => curveIds.has(row.id));
  lookupTables.CurvePoint = rows("CurvePoint").filter((row) => curveIds.has(row.CurveID));
  const names = new Set(rawTables.SpellName.map((row) => row.id)),
    foundRadii = new Set(lookupTables.SpellRadius.map((row) => row.id)),
    itemEffects = rows("ItemEffect").filter((row) => ids.has(row.SpellID)),
    effectIds = new Set(itemEffects.map((row) => row.id)),
    itemLinks = rows("ItemXItemEffect").filter((row) => effectIds.has(row.ItemEffectID)),
    itemIds = new Set(itemLinks.map((row) => row.ItemID));
  rawTables.ItemEffect = itemEffects;
  rawTables.ItemXItemEffect = itemLinks;
  rawTables.ItemSparse = rows("ItemSparse").filter((row) => itemIds.has(row.id));
  return {
    schema: "kfc-class-spell-evidence.v1",
    className,
    classMask,
    rootSpellIds: [...roots].sort((a, b) => a - b),
    spellIds: [...ids].sort((a, b) => a - b),
    rootAbilityRows: ability,
    classTalents,
    references: edges,
    rawTables,
    lookupTables,
    gaps: {
      missingSpellNames: [...ids].filter((id) => !names.has(id)).sort((a, b) => a - b),
      missingRadii: [...radiusIds].filter((id) => !foundRadii.has(id)).sort((a, b) => a - b),
      unresolvedTalentLayoutNodes: classTalents
        .filter((row) => !row.layoutResolved)
        .map((row) => row.nodeId),
      unresolvedTalentTextNodes: classTalents
        .filter((row) => row.ranks.some((rank) => !rank.resolved))
        .map((row) => row.nodeId),
    },
    trainingVerified: false,
    serverMechanicsVerified: false,
    modelAdmission: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
