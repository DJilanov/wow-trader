import assert from "node:assert/strict";
import { eligiblePrebis, legalPrebisGear, prebisContext } from "./prebis-pool.mjs";
import { carryCompatibleEnchants, describePrebisGear } from "./prebis-enchants.mjs";
import { simulationHash } from "./simulation-cache.mjs";

export const itemSkillSearchPolicy = Object.freeze({
  schema: "kfc-item-skill-correction-search.v1",
  screeningIterations: 100,
  shortlistIterations: 1000,
  confirmationIterations: 20000,
  confirmationSeeds: [819410001, 819450001],
  shortlistCount: 5,
  weaponShortlistCount: 8,
  maximumSweeps: 2,
  retainedMargin: 0.02,
  scope:
    "bounded all-slot and retained weapon-pair correction; not global BiS or exhaustive talents/rotation optimization",
});

export function itemSkillSearchContext(entry, db, sources, inspection) {
  const items = new Map(db.items.map((item) => [item.id, item]));
  const baseline = {
    profile: entry.profile,
    playerClass: { warrior: 9, rogue: 6, hunter: 2 }[entry.profile],
    settings: {
      ...entry.settings,
      settings: {
        ...entry.settings.settings,
        faction: entry.build.faction.toLowerCase() === "alliance" ? "Alliance" : "Horde",
      },
    },
  };
  assert(baseline.playerClass, "Unsupported correction profile");
  const wearer = prebisContext(baseline, items);
  const enchantPolicy = {
    schema: "kfc-enchant-model-policy.v1",
    provisionalEffectIds: entry.build.requiresProvisionalEnchantOptIn ? [1900] : [],
  };
  const legal = (gear) => {
    if (!legalPrebisGear(gear, items, sources, wearer)) return false;
    try {
      describePrebisGear(
        gear,
        entry.profile,
        entry.build.id,
        baseline.playerClass,
        db,
        inspection,
        enchantPolicy,
      );
      return true;
    } catch {
      return false;
    }
  };
  assert(legal(entry.settings.player.equipment), `Illegal correction incumbent ${entry.build.id}`);
  const candidates = (gear, slot) => {
    const pool = [];
    for (const item of db.items) {
      if (!eligiblePrebis(item, sources.get(item.id), wearer, slot)) continue;
      const proposal = globalThis.structuredClone(gear);
      proposal.items[slot] = { id: item.id };
      const equipped = carryCompatibleEnchants(
        proposal,
        gear,
        baseline.playerClass,
        db,
        inspection,
        enchantPolicy,
      );
      if (legal(equipped)) pool.push({ gear: equipped, label: `${slot}:${item.id}` });
    }
    pool.push({ gear: globalThis.structuredClone(gear), label: `${slot}:incumbent` });
    return uniqueItemSkillCandidates(pool);
  };
  return { wearer, legal, candidates };
}

export function uniqueItemSkillCandidates(candidates) {
  const values = new Map();
  for (const candidate of candidates) {
    assert(candidate.gear?.items?.length === 17, "Incomplete correction candidate");
    const id = simulationHash({
      gear: candidate.gear,
      talents: candidate.talents ?? null,
      rotation: candidate.rotation ?? null,
    });
    if (!values.has(id)) values.set(id, { ...candidate, id });
  }
  return [...values.values()];
}

export function itemSkillConfirmationVerdict(incumbent, candidate) {
  assert.equal(incumbent.length, 2);
  assert.equal(candidate.length, 2);
  const metric = (rows) =>
    rows.reduce((sum, row) => {
      assert(
        Number.isFinite(row.dps) && row.dps > 0 && Number.isFinite(row.stdev) && row.stdev >= 0,
      );
      assert.equal(row.iterations, itemSkillSearchPolicy.confirmationIterations);
      return sum + row.dps;
    }, 0) / rows.length;
  const oldDps = metric(incumbent),
    newDps = metric(candidate);
  const significant = candidate.every((row, index) => {
    const old = incumbent[index];
    const margin = 1.96 * Math.sqrt((row.stdev ** 2 + old.stdev ** 2) / row.iterations);
    return row.dps - old.dps > margin;
  });
  return {
    oldDps,
    newDps,
    relativeChange: newDps / oldDps - 1,
    significant,
    selected: significant ? "candidate" : "incumbent",
  };
}
