import type { ItemEnchantmentDetail, ItemSpellEffect } from "./data";

export interface ItemTooltipRecord {
  readonly itemId: number;
  readonly name: string;
  readonly description: string;
  readonly quality: number;
  readonly itemLevel: number;
  readonly maxCount: number;
  readonly limitCategory: {
    readonly name: string;
    readonly quantity: number;
  } | null;
  readonly binding: number;
  readonly inventoryType: number;
  readonly className: string | null;
  readonly subclassName: string | null;
  readonly damages: readonly {
    readonly slot: number;
    readonly damageType: number;
    readonly minimum: number;
    readonly maximum: number;
  }[];
  readonly delayMs: number;
  readonly resistances: readonly { readonly school: number; readonly value: number }[];
  readonly stats: readonly {
    readonly slot: number;
    readonly statType: number;
    readonly value: number;
  }[];
  readonly sockets: readonly { readonly slot: number; readonly socketType: number }[];
  readonly socketBonus: ItemEnchantmentDetail | null;
  readonly gem: {
    readonly socketType: number;
    readonly minimumItemLevel: number;
    readonly enchantment: ItemEnchantmentDetail;
  } | null;
  readonly maxDurability: number;
  readonly allowableClassMask: number;
  readonly allowedClasses: readonly { readonly classId: number; readonly name: string }[];
  readonly allowableRaceMask: readonly number[];
  readonly allowedRaces: readonly { readonly raceId: number; readonly name: string }[];
  readonly requiredLevel: number;
  readonly requiredSkillId: number | null;
  readonly requiredSkillRank: number;
  readonly requiredAbilityId: number | null;
  readonly requiredAbilityName: string | null;
  readonly minimumFactionId: number | null;
  readonly minimumReputation: number;
  readonly effects: readonly ItemSpellEffect[];
  readonly itemSet: {
    readonly itemSetId: number;
    readonly name: string;
    readonly members: readonly {
      readonly itemId: number;
      readonly name: string;
      readonly quality: number;
    }[];
    readonly effects: readonly (ItemSpellEffect & { readonly threshold: number })[];
  } | null;
}

const inventoryTypes: Readonly<Record<number, string>> = {
  0: "Non-equippable",
  1: "Head",
  2: "Neck",
  3: "Shoulder",
  4: "Shirt",
  5: "Chest",
  6: "Waist",
  7: "Legs",
  8: "Feet",
  9: "Wrist",
  10: "Hands",
  11: "Finger",
  12: "Trinket",
  13: "One-Hand",
  14: "Off Hand",
  15: "Ranged",
  16: "Back",
  17: "Two-Hand",
  18: "Bag",
  19: "Tabard",
  20: "Chest",
  21: "Main Hand",
  22: "Off Hand",
  23: "Held In Off-hand",
  24: "Projectile",
  25: "Thrown",
  26: "Ranged",
  28: "Relic",
};

const statNames: Readonly<Record<number, string>> = {
  0: "Mana",
  1: "Health",
  3: "Agility",
  4: "Strength",
  5: "Intellect",
  6: "Spirit",
  7: "Stamina",
  12: "Defense Rating",
  13: "Dodge Rating",
  14: "Parry Rating",
  15: "Block Rating",
  16: "Melee Hit Rating",
  17: "Ranged Hit Rating",
  18: "Spell Hit Rating",
  19: "Melee Critical Strike Rating",
  20: "Ranged Critical Strike Rating",
  21: "Spell Critical Strike Rating",
  28: "Melee Haste Rating",
  29: "Ranged Haste Rating",
  30: "Spell Haste Rating",
  31: "Hit Rating",
  32: "Critical Strike Rating",
  35: "Resilience Rating",
  36: "Haste Rating",
  37: "Expertise Rating",
  38: "Attack Power",
  39: "Ranged Attack Power",
  43: "Mana per 5 sec",
  44: "Armor Penetration Rating",
  45: "Spell Power",
  46: "Health per 5 sec",
  47: "Spell Penetration",
  48: "Block Value",
};

const resistanceNames: Readonly<Record<number, string>> = {
  0: "Armor",
  1: "Holy Resistance",
  2: "Fire Resistance",
  3: "Nature Resistance",
  4: "Frost Resistance",
  5: "Shadow Resistance",
  6: "Arcane Resistance",
};

const socketNames: Readonly<Record<number, string>> = {
  1: "Meta Socket",
  2: "Red Socket",
  4: "Yellow Socket",
  8: "Blue Socket",
  14: "Prismatic Socket",
};

export interface FormattedItemEffect {
  readonly prefix: string;
  readonly text: string;
  readonly exact: boolean;
}

export function inventoryTypeName(inventoryType: number): string {
  return inventoryTypes[inventoryType] ?? `Inventory type ${inventoryType}`;
}

export function statName(statType: number): string {
  return statNames[statType] ?? `Stat ${statType}`;
}

export function formatStat(statType: number, value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} ${statName(statType)}`;
}

export function resistanceName(school: number): string {
  return resistanceNames[school] ?? `Resistance school ${school}`;
}

export function damageTypeName(damageType: number): string {
  return damageType === 0
    ? "Damage"
    : `${resistanceNames[damageType]?.replace(" Resistance", "") ?? `School ${damageType}`} Damage`;
}

export function reputationStandingName(standing: number): string {
  return (
    {
      0: "Hated",
      1: "Hostile",
      2: "Unfriendly",
      3: "Neutral",
      4: "Friendly",
      5: "Honored",
      6: "Revered",
      7: "Exalted",
    }[standing] ?? `standing ${standing}`
  );
}

export function socketName(socketType: number): string {
  return socketNames[socketType] ?? `Socket type ${socketType}`;
}

export function bindingText(binding: number): string | null {
  return (
    {
      1: "Binds when picked up",
      2: "Binds when equipped",
      3: "Binds when used",
      4: "Quest Item",
    }[binding] ?? null
  );
}

export function formatWeaponSpeed(delayMs: number): string {
  return (delayMs / 1_000).toFixed(2);
}

export function calculateWeaponDps(
  minimumDamage: number,
  maximumDamage: number,
  delayMs: number,
): number | null {
  if (delayMs <= 0) return null;
  return ((minimumDamage + maximumDamage) / 2 / delayMs) * 1_000;
}

export function formatItemEffect(effect: ItemSpellEffect): FormattedItemEffect {
  const prefix = effectPrefix(effect.triggerType);
  const clientText = resolveClientText(effect);
  if (clientText.length > 0 && !hasUnresolvedTokens(clientText)) {
    return { prefix, text: clientText, exact: true };
  }

  const attackPower = /^Attack Power\s+(\d+)$/i.exec(effect.name.trim());
  if (attackPower?.[1]) {
    return {
      prefix,
      text: `Increases attack power by ${attackPower[1]}.`,
      exact: true,
    };
  }

  return { prefix, text: effect.name, exact: false };
}

function resolveClientText(effect: ItemSpellEffect): string {
  let value = cleanClientText(effect.description || effect.auraDescription);
  const variables = parseDescriptionVariables(effect.descriptionVariables);
  for (let pass = 0; pass < 3; pass += 1) {
    value = value.replace(
      /\$<([A-Za-z0-9_]+)>/g,
      (token, name: string) => variables[name] ?? token,
    );
  }

  value = value.replace(/\$[sSmM](\d+)/g, (token, oneBasedIndex: string) => {
    const basePoints = spellEffectBasePoints(effect.rawRecord, Number(oneBasedIndex) - 1);
    return basePoints === null ? token : String(basePoints);
  });
  value = value.replace(
    /\$d\b/gi,
    effect.durationMs > 0 ? formatDuration(effect.durationMs) : "$d",
  );
  value = value.replace(/\$h\b/gi, effect.procChance !== null ? String(effect.procChance) : "$h");
  value = value.replace(
    /\$n\b/gi,
    effect.procCharges !== null ? String(Math.abs(effect.procCharges)) : "$n",
  );
  return cleanClientText(value);
}

function parseDescriptionVariables(value: string): Readonly<Record<string, string>> {
  const variables: Record<string, string> = {};
  for (const match of value.matchAll(/\$([A-Za-z0-9_]+)\s*=\s*([^;\n]+)/g)) {
    if (match[1] && match[2]) variables[match[1]] = match[2].trim();
  }
  return variables;
}

function spellEffectBasePoints(rawRecord: unknown, effectIndex: number): number | null {
  if (!isRecord(rawRecord)) return null;
  const effects = rawRecord.effects;
  if (!Array.isArray(effects)) return null;
  const row = effects.find(
    (candidate): candidate is Record<string, unknown> =>
      isRecord(candidate) && candidate.EffectIndex === effectIndex,
  );
  const basePoints = row?.EffectBasePoints;
  return typeof basePoints === "number" && Number.isFinite(basePoints)
    ? Math.trunc(basePoints) + 1
    : null;
}

function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1_000;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)} sec`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatEnchantment(enchantment: ItemEnchantmentDetail): string {
  const name = cleanClientText(enchantment.name);
  if (name.length > 0 && !hasUnresolvedTokens(name)) return name;

  const statEffect = enchantment.effects.find((effect) => effect.effectType === 5);
  if (statEffect) {
    return formatStat(statEffect.argument, statEffect.minimumPoints);
  }
  return name || `Enchantment ${enchantment.enchantmentId}`;
}

export function cleanClientText(value: string): string {
  return value
    .replace(/\|c[0-9a-f]{8}/gi, "")
    .replace(/\|r/gi, "")
    .replace(/\|T[^|]+\|t/gi, "")
    .replace(/\|n/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasUnresolvedTokens(value: string): boolean {
  return /\$(?:\{[^}]+\}|[A-Za-z0-9?@*]+)/.test(value);
}

function effectPrefix(triggerType: number): string {
  switch (triggerType) {
    case 0:
      return "Use:";
    case 1:
      return "Equip:";
    case 2:
      return "Chance on hit:";
    case 6:
      return "Use:";
    default:
      return "Effect:";
  }
}
