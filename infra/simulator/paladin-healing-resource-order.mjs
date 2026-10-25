import assert from "node:assert/strict";

export const paladinHealingResourceOrders = Object.freeze([
  "as-declared",
  "recomb-first",
  "major-recomb-first",
  "rune-last",
]);

/** Compare owned shared-cooldown choices without inventing extra actions or charges.
 * @param {object[]} cooldowns @param {'as-declared'|'recomb-first'|'major-recomb-first'|'rune-last'} policy
 * @returns {object[]}
 */
export function orderPaladinHealingResources(cooldowns, policy) {
  assert(Array.isArray(cooldowns));
  assert(paladinHealingResourceOrders.includes(policy));
  const rows = structuredClone(cooldowns);
  if (policy === "as-declared") return rows;
  const recomb = (row) => [4381, 18637].includes(row.itemId);
  if (policy === "recomb-first")
    return [...rows.filter(recomb), ...rows.filter((row) => !recomb(row))];
  if (policy === "major-recomb-first")
    return [
      ...rows.filter((row) => row.itemId === 18637),
      ...rows.filter((row) => row.itemId === 4381),
      ...rows.filter((row) => !recomb(row)),
    ];
  return [
    ...rows.filter((row) => row.itemId !== 12662),
    ...rows.filter((row) => row.itemId === 12662),
  ];
}
