import type { ShamanHealingEffects } from "./shaman-healing-effects.js";

export interface ShamanHealingEquipmentItem {
  readonly id: number;
  readonly setId: number;
}
export interface ShamanHealingEquippedItem {
  readonly id: number;
  readonly enchant?: number | undefined;
}

const flatRegeneration = new Set([2816, 6320, 6459, 6461, 6910, 7684, 14149, 17743]);
const utilities = new Set([4262, 8346, 11808, 13937, 4381, 13143, 18637, 6323, 11923]);
const protective = new Set([8367, 10030, 10543, 10721, 13164, 18340, 18638, 18639, 272437]);

/** Match the admitted Go codec's explicit references after equipment or talents change. */
export function shamanHealingEquipmentEffects(
  catalog: ReadonlyMap<number, ShamanHealingEquipmentItem>,
  equipment: readonly ShamanHealingEquippedItem[],
  talentsString: string,
): ShamanHealingEffects {
  if (equipment.length !== 17 || !/^[0-5]*-[0-5]*-[0-5]*$/.test(talentsString))
    throw new Error("Invalid Shaman equipment or talent encoding");
  const ids = new Set<number>();
  const sets = new Map<number, number>();
  for (const equipped of equipment) {
    if (equipped.id === 0) continue;
    const item = catalog.get(equipped.id);
    if (!item || item.id !== equipped.id)
      throw new Error("Unknown Shaman equipment item " + equipped.id);
    ids.add(item.id);
    if (item.setId) sets.set(item.setId, (sets.get(item.setId) ?? 0) + 1);
  }
  const pieces = (setId: number): number => sets.get(setId) ?? 0;
  const ownsAny = (choices: ReadonlySet<number>): boolean =>
    [...ids].some((itemId) => choices.has(itemId));
  const effects: ShamanHealingEffects = {};
  if (pieces(122) >= 3 || pieces(81) >= 4) {
    effects.passiveDamage = {
      schema: "kfc-shaman-passive-damage-policy.v1",
      id: "controlled-cast-only-reference",
      timing: "captured-proc-recovery-ms-reference",
      ...(pieces(122) >= 3 ? { necropileTrigger: "cast-only-reference" } : {}),
      ...(pieces(81) >= 4
        ? { postmaster: "self-ineligible-after-hit-strict-below-reference" }
        : {}),
    };
  }
  const riptide = Number(talentsString.split("-")[2]?.[15] ?? 0) > 0;
  if (ids.has(272431) || (ids.has(22345) && riptide))
    effects.relic = { costStacking: "additive-percent-reference" };
  if (pieces(187) >= 5)
    effects.elements = {
      procChance: "client-proc-record-reference",
      procRouting: "completed-class-healing-casts-reference",
    };
  if (pieces(519) >= 4)
    effects.fiveThunders = { procRouting: "completed-class-healing-casts-reference" };
  for (const setId of [181, 182, 183, 185])
    if (pieces(setId) >= 5)
      effects.castSets = {
        procRouting: "completed-class-healing-casts-reference",
        wildheartChance: setId === 185 ? "two-percent-reference" : "",
        dreadmistCriticals: setId === 183 ? "noncritical-reference" : "",
      };
  if (pieces(184) >= 6) effects.healthRegen = { tickTiming: "two-second-ticks-reference" };
  if (ownsAny(flatRegeneration)) effects.flatRegen = { tickTiming: "two-second-ticks-reference" };
  if (ids.has(249473))
    effects.heart = {
      schema: "kfc-shaman-item-effects-policy.v1",
      id: "controlled-one-proc-reference",
      dormantHeartProcChance: 1,
      dormantHeartHealingEvents: "completed-casts",
    };
  if (pieces(162) >= 4 || pieces(163) >= 6 || pieces(182) >= 4)
    effects.reactive = {
      schema: "kfc-shaman-reactive-set-policy.v1",
      id: "controlled-reactive-reference",
      thresholdTiming: "after-hit",
      selfDamageTriggers: true,
      devoutChance: 0.02,
    };
  if (ownsAny(utilities))
    effects.utility = {
      schema: "kfc-shaman-utility-policy.v1",
      id: "controlled-utility-reference",
      healingCanCrit: false,
      recombobulatorCanCrit: false,
      channelScalesWithHaste: false,
      resourceRolls: "independent-reference",
      headmasterIntellect: "disabled-reference",
      baronTickPeriodMs: 2000,
    };
  if (ids.has(12930) || ids.has(18471) || ids.has(13968))
    effects.legacy = {
      schema: "kfc-shaman-legacy-item-policy.v1",
      id: "controlled-legacy-reference",
      ...(ids.has(12930) ? { briarwoodSpellPower: 15 } : {}),
      ...(ids.has(18471) ? { royalSealSpellPower: 18 } : {}),
      ...(ids.has(13968)
        ? { eyeScriptReference: "captured-passive-unmodeled-script-reference" }
        : {}),
    };
  if (ownsAny(protective))
    effects.protective = {
      schema: "kfc-shaman-protective-policy.v1",
      id: "controlled-protective-reference",
      cooldowns: "item-override-inherits-negative-reference",
      ...(ids.has(10030) ? { admiralStamina: "disabled-reference" } : {}),
      ...(ids.has(10721) ? { harmBelt: "no-overload-reference" } : {}),
      ...(ids.has(18638) || ids.has(18639) ? { selfReflection: "self-ineligible-reference" } : {}),
      ...(ids.has(272437)
        ? { adaptiveEnemyInMelee: false, adaptiveOutcome: "noncritical-hit-reference" }
        : {}),
    };
  return effects;
}
