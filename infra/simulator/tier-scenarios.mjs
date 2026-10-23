import assert from "node:assert/strict";
import { createTierBenchmarkSettings, tierBenchmarkPolicy } from "./tier-benchmark.mjs";

export const raidBenchmarkDebuffs = Object.freeze({
  judgementOfWisdom: true,
  judgementOfTheCrusader: 2,
  faerieFire: true,
  curseOfElements: true,
  curseOfShadow: true,
  wintersChill: true,
  improvedShadowBolt: true,
  improvedScorch: true,
  shadowWeaving: true,
  stormstrike: true,
  exposeArmor: 2,
  sunderArmor: true,
  curseOfRecklessness: true,
  huntersMark: 2,
  giftOfArthas: true,
});

// Maintained, baseline self-support. Talent/form/pet effects still come from the
// selected engine; no external Kings, Might, Wisdom, auras or resource grants.
// A solo Shaman gets one air totem (Windfury), never Windfury plus Grace of Air.
export const soloBenchmarkSupport = Object.freeze({
  warrior: { raid: { battleShout: 1 }, party: {}, individual: {} },
  rogue: { raid: {}, party: {}, individual: {} },
  hunter: { raid: {}, party: {}, individual: {} },
  mage: { raid: { arcaneBrilliance: true }, party: {}, individual: {} },
  warlock: { raid: {}, party: {}, individual: {} },
  balance_druid: { raid: { giftOfTheWild: 1, thorns: 1 }, party: {}, individual: {} },
  feral_druid: { raid: { giftOfTheWild: 1, thorns: 1 }, party: {}, individual: {} },
  shadow_priest: {
    raid: { powerWordFortitude: 1, divineSpirit: true, shadowProtection: true },
    party: {},
    individual: {},
  },
  smite_priest: {
    raid: { powerWordFortitude: 1, divineSpirit: true, shadowProtection: true },
    party: {},
    individual: {},
  },
  elemental_shaman: {
    raid: { strengthOfEarthTotem: 1, manaSpringTotem: 1 },
    party: { windfuryTotem: true },
    individual: {},
  },
  enhancement_shaman: {
    raid: { strengthOfEarthTotem: 1, manaSpringTotem: 1 },
    party: { windfuryTotem: true },
    individual: {},
  },
});

/** @param {"solo" | "raid"} scenario @param {{version: string, raid: object, party: object, individual: object}} support */
export function tierScenarioPolicy(scenario, support) {
  assert(["solo", "raid"].includes(scenario), "Unknown tier scenario");
  assert.equal(support.version, "full-v2");
  return {
    ...tierBenchmarkPolicy,
    version: scenario === "solo" ? "pre-raid-solo-support-v1" : "pre-raid-raid-support-v1",
    scenario,
    support:
      scenario === "raid"
        ? globalThis.structuredClone(support)
        : {
            version: "solo-v1",
            raid: {},
            party: {},
            individual: {},
          },
    selfSupport: scenario === "solo" ? globalThis.structuredClone(soloBenchmarkSupport) : {},
    debuffs: scenario === "raid" ? { ...raidBenchmarkDebuffs } : {},
    externalDebuffs:
      scenario === "raid"
        ? "documented full raid debuffs; modeled uptime and stacking follow the pinned engine"
        : "none; only the character's own modeled actions apply effects",
    maintenance:
      "configured self and raid support is assumed maintained; rotations are not reoptimized",
  };
}

/** Keep the character and fight fixed while changing only documented support. */
export function createTierScenarioSettings(settings, encounter, support, scenario, profile) {
  const policy = tierScenarioPolicy(scenario, support);
  assert(Object.hasOwn(soloBenchmarkSupport, profile), "Profile is outside the 21-build release");
  const next = createTierBenchmarkSettings(settings, encounter, support);
  const selected = scenario === "solo" ? policy.selfSupport[profile] : policy.support;
  next.raidBuffs = globalThis.structuredClone(selected.raid);
  next.partyBuffs = globalThis.structuredClone(selected.party);
  next.player.buffs = globalThis.structuredClone(selected.individual);
  next.debuffs = globalThis.structuredClone(policy.debuffs);
  return next;
}
