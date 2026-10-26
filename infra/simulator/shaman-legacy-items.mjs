import assert from "node:assert/strict";
import { extractShamanUtilityItemRules } from "./shaman-utility-items.mjs";

/** Keep current equip effects and provisional total-stat references separate.
 * @param {{evidence:object,common:string}} input @returns {object}
 */
export function extractShamanLegacyItemRules(input) {
  const rules = extractShamanUtilityItemRules(input.evidence);
  for (const text of [
    "core.NewItemEffect(13968,",
    "stats.SpellHit: 7 * core.SpellHitRatingPerHitChance",
    "20*time.Second",
    "Duration: 5 * time.Minute",
    "Duration: 20 * time.Second",
    "core.SpellFlagOffensiveEquipment | core.SpellFlagNoOnCastComplete",
  ])
    assert(input.common.includes(text), text);
  return {
    schema: "kfc-shaman-legacy-item-rules.v1",
    sourceBuild: 70532,
    briarwood: structuredClone(rules.briarwood),
    royalSeal: structuredClone(rules.royalSeal),
    eye: structuredClone(rules.eye),
    briarwoodReferences: [15, 29, 30],
    royalSealReferences: [18, 23],
    eyeScriptReference: "captured-passive-unmodeled-script-reference",
    sharedEyeHandlerUnchanged: true,
    legacyCurrentBaseStatsVerified: false,
    serverMechanicsVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Validate explicit owned references; absent properties make no stat claim.
 * @param {unknown} value @returns {void}
 */
export function assertShamanLegacyItemPolicy(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schema !== "kfc-shaman-legacy-item-policy.v1" ||
    typeof value.id !== "string" ||
    !value.id ||
    value.id.length > 100 ||
    Object.keys(value).some(
      (key) =>
        ![
          "schema",
          "id",
          "briarwoodSpellPower",
          "royalSealSpellPower",
          "eyeScriptReference",
        ].includes(key),
    ) ||
    (value.briarwoodSpellPower === undefined &&
      value.royalSealSpellPower === undefined &&
      value.eyeScriptReference === undefined) ||
    (value.briarwoodSpellPower !== undefined &&
      ![15, 29, 30].includes(value.briarwoodSpellPower)) ||
    (value.royalSealSpellPower !== undefined && ![18, 23].includes(value.royalSealSpellPower)) ||
    (value.eyeScriptReference !== undefined &&
      value.eyeScriptReference !== "captured-passive-unmodeled-script-reference")
  )
    throw new Error("Invalid Shaman legacy reference");
}

/** Generate the finite reference matrix for the legacy items actually equipped.
 * @param {ReadonlyArray<number>} itemIds @returns {ReadonlyArray<Readonly<object>>}
 */
export function shamanLegacyItemPolicies(itemIds) {
  assert(Array.isArray(itemIds) && itemIds.every((id) => Number.isSafeInteger(id) && id >= 0));
  const owned = new Set(itemIds);
  if (![12930, 18471, 13968].some((id) => owned.has(id))) return Object.freeze([]);
  const result = [];
  for (const power of owned.has(12930) ? [15, 29, 30] : [undefined]) {
    for (const seal of owned.has(18471) ? [18, 23] : [undefined]) {
      const policy = {
        schema: "kfc-shaman-legacy-item-policy.v1",
        id: `briar-${power ?? "absent"}-seal-${seal ?? "absent"}-eye-${owned.has(13968) ? "captured" : "absent"}`,
        ...(power === undefined ? {} : { briarwoodSpellPower: power }),
        ...(seal === undefined ? {} : { royalSealSpellPower: seal }),
        ...(owned.has(13968)
          ? { eyeScriptReference: "captured-passive-unmodeled-script-reference" }
          : {}),
      };
      assertShamanLegacyItemPolicy(policy);
      result.push(Object.freeze(policy));
    }
  }
  return Object.freeze(result);
}

/** Add owned policy/adjustment hooks without changing the shared item registry.
 * @param {{actor:string,implementation:string,evidence:object,common:string}} input
 * @returns {{actor:string,implementation:string,rules:object}}
 */
export function renderShamanLegacyItems(input) {
  const rules = extractShamanLegacyItemRules(input);
  const once = (text, before, after) => {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  };
  assert(!input.actor.includes("kfcLegacyItems"));
  const actor = once(
    once(
      input.actor,
      "type RestorationShaman struct {",
      "type RestorationShaman struct {\n kfcLegacyItems *kfcShamanLegacyItems",
    ),
    "\tresto.registerKFCShamanUtilityItems()",
    "\tresto.registerKFCShamanUtilityItems()\n resto.registerKFCShamanLegacyItems()",
  );
  return { actor, implementation: input.implementation, rules };
}
