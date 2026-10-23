import assert from "node:assert/strict";

export const tankTierProfiles = Object.freeze(["tank_warrior", "feral_tank_druid"]);
export const tankTierUnranked = Object.freeze([
  {
    profile: "protection_paladin",
    name: "Protection Paladin",
    reason:
      "The published tank engine predates Forever's Seal of Fury changes. Threat, absorbs and mana recovery need validation before this build can receive a tier.",
    source:
      "https://worldofwarcraft.blizzard.com/en-gb/news/24302099/world-of-warcraft-forever-class-deep-dives-paladin",
  },
]);

/** Solo means a dungeon comparison without outside raid buffs, not an unhealed character. */
export function tankTierPolicy(scenario) {
  assert(["solo", "raid"].includes(scenario), "Unknown tank scenario");
  return {
    version: "blue-pvp-tank-comparison-v1",
    scenario,
    iterations: 5000,
    seed: 61723001,
    durationSeconds: scenario === "raid" ? 300 : 60,
    targetCount: scenario === "raid" ? 1 : 3,
    targetLevel: scenario === "raid" ? 63 : 62,
    minBaseDamage: scenario === "raid" ? 3000 : 1200,
    swingSpeed: 2,
    damageSpread: 0.3333,
    armor: 3731,
    healing: { hps: 2000, cadenceSeconds: 2, burstWindow: 6 },
    equipment:
      "published blue PvP starter, enchants, talents and rotation; existing consumes with the main-hand coating removed for raid Windfury",
    incomingDamage: "synthetic physical melee only; no boss spells, movement or taunt swaps",
    support:
      scenario === "raid"
        ? "full-v2; no Salvation, world buffs or external resource grants"
        : "own maintained buffs only; no outside raid support",
  };
}

/** Preserve the starter character while making all incoming damage and support explicit. */
export function createTankTierSettings(settings, scenario, profile, support, debuffs) {
  assert(tankTierProfiles.includes(profile), "Tank profile is not qualified for comparison");
  const policy = tankTierPolicy(scenario);
  assert.equal(support.version, "full-v2");
  assert.equal(settings.player?.equipment?.items.length, 17, "A complete starter is required");
  assert(settings.player.rotation?.priorityList?.length, "An explicit tank rotation is required");
  assert(!settings.player.foreverTier1Bonuses && !settings.player.enableItemSwap);
  assert([undefined, 0, 60].includes(settings.player.level), "Only level-60 starters are eligible");
  assert(settings.encounter?.targets?.[0], "Missing reference target");
  const next = globalThis.structuredClone(settings);
  const warrior = profile === "tank_warrior";
  next.player.level = 60;
  next.player.inFrontOfTarget = true;
  next.player.healingModel = globalThis.structuredClone(policy.healing);
  next.raidBuffs =
    scenario === "raid"
      ? { ...globalThis.structuredClone(support.raid), ...(warrior ? { battleShout: 0 } : {}) }
      : warrior
        ? {}
        : { giftOfTheWild: 1, thorns: 1 };
  next.partyBuffs = scenario === "raid" ? globalThis.structuredClone(support.party) : {};
  next.player.buffs = scenario === "raid" ? globalThis.structuredClone(support.individual) : {};
  next.debuffs =
    scenario === "raid"
      ? {
          ...globalThis.structuredClone(debuffs),
          ...(warrior ? { exposeArmor: 0 } : { faerieFire: false }),
        }
      : {};
  // A single air totem/weapon effect is modeled. No coating is counted alongside Windfury.
  if (scenario === "raid" && next.partyBuffs.windfuryTotem && warrior)
    delete next.player.consumes.mainHandImbue;
  const target = globalThis.structuredClone(settings.encounter.targets[0]);
  target.id = 0;
  target.name = "Physical tank comparison";
  target.level = policy.targetLevel;
  target.minBaseDamage = policy.minBaseDamage;
  target.damageSpread = policy.damageSpread;
  target.swingSpeed = policy.swingSpeed;
  target.tankIndex = 0;
  target.parryHaste = false;
  target.dualWield = false;
  target.dualWieldPenalty = false;
  target.spellSchool = "SpellSchoolPhysical";
  target.mobType = "MobTypeHumanoid";
  target.targetInputs = [];
  // StatArmor is index26 in the pinned engine's common.proto. No target AP is added.
  assert(target.stats.length >= 27, "Reference target stat layout changed");
  target.stats = Array.from({ length: target.stats.length }, (_, index) =>
    index === 26 ? policy.armor : 0,
  );
  next.encounter = {
    duration: policy.durationSeconds,
    durationVariation: 0,
    executeProportion20: 0,
    executeProportion25: 0,
    executeProportion35: 0,
    useHealth: false,
    targets: Array.from({ length: policy.targetCount }, () => globalThis.structuredClone(target)),
  };
  next.tanks = [{ type: "Player", index: 0 }];
  next.targetDummies = 0;
  next.settings = {
    ...next.settings,
    iterations: policy.iterations,
    fixedRngSeed: String(policy.seed),
  };
  return next;
}
