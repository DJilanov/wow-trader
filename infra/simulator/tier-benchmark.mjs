import assert from "node:assert/strict";

export const tierBenchmarkPolicy = Object.freeze({
  version: "pre-raid-full-support-no-external-debuffs-v1",
  iterations: 5000,
  seed: 58723001,
  durationSeconds: 300,
});

/** Preserve each reviewed character, but measure it under one common encounter and support policy. */
export function createTierBenchmarkSettings(settings, encounter, support) {
  assert(settings.player?.equipment?.items.length === 17, "Expected a complete reviewed character");
  assert(
    [undefined, 0, 60].includes(settings.player.level),
    "Only level-60 references are eligible",
  );
  assert(!settings.player.enableItemSwap && !settings.player.foreverTier1Bonuses);
  assert(
    settings.player.rotation?.priorityList?.length,
    "A reviewed explicit rotation is required",
  );
  assert(encounter.targets?.length === 1 && encounter.targets[0].level === 63);
  assert(support.version === "full-v2");
  const next = structuredClone(settings);
  next.raidBuffs = structuredClone(support.raid);
  next.partyBuffs = structuredClone(support.party);
  next.player.buffs = structuredClone(support.individual);
  next.player.level = 60;
  // Self-applied class effects remain in the engine; no external debuff allocation favours a class.
  next.debuffs = {};
  next.encounter = {
    ...structuredClone(encounter),
    duration: tierBenchmarkPolicy.durationSeconds,
    durationVariation: 0,
    useHealth: false,
  };
  next.tanks = [];
  next.targetDummies = 0;
  return next;
}
