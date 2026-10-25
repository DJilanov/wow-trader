/** Validate only declared item-owned references; omitted fields retain the catalog.
 * @param {unknown} value @returns {void}
 */
export function assertPaladinLegacyItemPolicy(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schema !== "kfc-paladin-legacy-item-policy.v1" ||
    typeof value.id !== "string" ||
    !value.id ||
    value.id.length > 100 ||
    Object.keys(value).some(
      (key) => !["schema", "id", "briarwoodSpellPower", "royalSealHealingPower"].includes(key),
    ) ||
    (value.briarwoodSpellPower === undefined && value.royalSealHealingPower === undefined) ||
    (value.briarwoodSpellPower !== undefined &&
      ![15, 29, 30].includes(value.briarwoodSpellPower)) ||
    (value.royalSealHealingPower !== undefined && ![0, 22].includes(value.royalSealHealingPower))
  )
    throw new Error("Invalid Paladin legacy item policy");
}
