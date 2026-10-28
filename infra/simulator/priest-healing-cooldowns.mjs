/** @typedef {{spellId?:number,itemId?:number,minimumMissingMana?:number,requireHealingDemand:boolean}} PriestHealingCooldown */

const berserking = { spellId: 20554, requireHealingDemand: true };
const manaPotion = { itemId: 13444, minimumMissingMana: 3000, requireHealingDemand: true };
const rune = { itemId: 12662, minimumMissingMana: 1500, requireHealingDemand: true };
const itemPolicies = [
  { owner: 11819, policy: { spellId: 15604, minimumMissingMana: 630, requireHealingDemand: true } },
  {
    owner: 18371,
    policy: { spellId: 1302205, minimumMissingMana: 1500, requireHealingDemand: true },
  },
  { owner: 272439, policy: { itemId: 272439, requireHealingDemand: true } },
  { owner: 13143, policy: { spellId: 17252, minimumMissingMana: 22, requireHealingDemand: true } },
];

/** @param {PriestHealingCooldown} policy @returns {string} */
function identity(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy))
    throw new Error("Invalid Priest healing cooldown.");
  const spell =
    typeof policy.spellId === "number" &&
    Number.isSafeInteger(policy.spellId) &&
    policy.spellId > 0;
  const item =
    typeof policy.itemId === "number" && Number.isSafeInteger(policy.itemId) && policy.itemId > 0;
  if (spell === item) throw new Error("Choose one Priest healing cooldown identity.");
  return spell ? `spell:${policy.spellId}` : `item:${policy.itemId}`;
}

/** Preserve admitted activation order while making ownership follow the edited character.
 * @param {{baseline:PriestHealingCooldown[],gear:Array<{id?:number}>,defaultConjured:number,troll:boolean}} input
 * @returns {PriestHealingCooldown[]}
 */
export function updatePriestHealingCooldowns({ baseline, gear, defaultConjured, troll }) {
  if (
    !Array.isArray(baseline) ||
    !Array.isArray(gear) ||
    gear.length !== 17 ||
    gear.some((item) => !item || !Number.isSafeInteger(item.id ?? 0) || (item.id ?? 0) < 0) ||
    ![0, 2].includes(defaultConjured) ||
    typeof troll !== "boolean"
  )
    throw new Error("Choose a valid Priest healing cooldown context.");
  const owned = new Set(gear.map((item) => item.id ?? 0));
  /** @type {Map<string,PriestHealingCooldown>} */
  const known = new Map();
  for (const policy of [berserking, manaPotion, rune, ...itemPolicies.map((row) => row.policy)])
    known.set(identity(policy), policy);
  /** @type {PriestHealingCooldown[]} */
  const result = [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Array<keyof PriestHealingCooldown>} */
  const fields = ["spellId", "itemId", "minimumMissingMana", "requireHealingDemand"];
  for (const policy of baseline) {
    const key = identity(policy);
    const expected = known.get(key);
    if (
      !expected ||
      seen.has(key) ||
      Object.keys(policy).sort().join(",") !== Object.keys(expected).sort().join(",") ||
      fields.some((field) => policy[field] !== expected[field])
    )
      throw new Error(
        "This saved healing setup has unsupported cooldowns. Choose a current preset.",
      );
    seen.add(key);
    const item = itemPolicies.find((row) => identity(row.policy) === key);
    if (
      (item && !owned.has(item.owner)) ||
      (key === identity(rune) && defaultConjured !== 2) ||
      (key === identity(berserking) && !troll)
    )
      continue;
    result.push(structuredClone(policy));
  }
  if (!seen.has(identity(manaPotion)))
    throw new Error(
      "This saved healing setup is missing its mana-potion settings. Choose a current preset.",
    );
  if (troll && !result.some((policy) => identity(policy) === identity(berserking)))
    result.unshift(structuredClone(berserking));
  for (const row of itemPolicies)
    if (owned.has(row.owner) && !result.some((policy) => identity(policy) === identity(row.policy)))
      result.push(structuredClone(row.policy));
  if (defaultConjured === 2 && !result.some((policy) => identity(policy) === identity(rune)))
    result.push(structuredClone(rune));
  return result;
}
