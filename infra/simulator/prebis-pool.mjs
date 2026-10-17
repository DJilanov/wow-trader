import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { equipmentOwnership } from "./equipment-ownership.mjs";
import {
  classicPreRaidEvidence,
  classicReferenceRevision,
  classicReferenceSha256,
} from "./classic-acquisition.mjs";

export const prebisNotice =
  "Sim-tested pre-raid candidates, not proven global BiS. Historical Classic items are provisional; current Forever stats take precedence. Current-client stats and historical acquisition assumptions are tracked separately. Results use a 300-second single-target encounter, existing class buffs/consumes and fixed talents/rotation. Availability and unverified effects still need in-game confirmation. Saved builds are never overwritten.";
export const prebisSlotTypes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 13, 14];
const raids = new Set([1977, 2159, 2677, 2717, 3428, 3429, 3456]);
const sourceKinds = new Set([
  "crafted",
  "dungeon",
  "dungeon-quest",
  "pvp",
  "vendor",
  "ticket-exchange",
  "classic-pre-raid",
]);
const maxArmor = { 1: 2, 2: 3, 3: 1, 4: 4, 5: 1, 6: 2, 7: 3, 8: 1, 9: 4 };
const weapons = {
  1: [2, 3, 4, 5, 8],
  2: [1, 2, 3, 5, 6, 8, 9],
  3: [2, 5, 8, 9],
  4: [1, 4, 5, 6, 7, 9],
  5: [2, 4, 5, 8],
  6: [1, 2, 3, 4, 5, 9],
  7: [1, 2, 3, 4, 5, 7, 8],
  8: [2, 5, 8, 9],
  9: [1, 2, 3, 4, 5, 6, 7, 8, 9],
};
const ranged = {
  1: [4],
  2: [1, 2, 3, 6],
  3: [8],
  4: [5],
  5: [8],
  6: [1, 2, 3, 6],
  7: [7],
  8: [8],
  9: [1, 2, 3, 6],
};
const professionSkills = { 1: 171, 2: 164, 3: 333, 4: 202, 8: 165, 11: 197 };
const professionIds = {
  Alchemy: 1,
  Blacksmithing: 2,
  Enchanting: 3,
  Engineering: 4,
  Herbalism: 5,
  Leatherworking: 8,
  Mining: 9,
  Skinning: 10,
  Tailoring: 11,
};

export function prebisSources(catalog, imports, craftAudit, items) {
  if (craftAudit.schema !== "kfc-prebis-craft-acquisition.v1")
    throw new Error("Unreviewed crafting acquisition audit");
  const craft = new Map(craftAudit.items.map((item) => [item.id, item]));
  const sources = new Map(
    [...catalog.items, ...imports.items, ...(imports.currentItems ?? [])].map((item) => [
      item.id,
      {
        ...item,
        craftAudit: craft.get(item.id),
      },
    ]),
  );
  // Stats are checked by verified-accessories.mjs; acquisition is separate.
  for (const [id, faction] of [
    [19325, null],
    [271908, "Alliance"],
    [272064, "Horde"],
  ])
    if (items.has(id))
      sources.set(id, {
        id,
        requiredLevel: 60,
        sources: [{ kind: "pvp", ...(faction ? { faction } : {}) }],
      });
  if (items.has(13001))
    sources.set(13001, {
      id: 13001,
      requiredLevel: 60,
      sources: [{ kind: "classic-pre-raid" }],
      acquisition:
        "Pinned Classic p0/prebis presets; Forever acquisition remains unverified. This is not a PvP ring.",
    });
  return sources;
}

export function prebisContext(baseline, items) {
  const player = baseline.settings.player;
  const alliance = ["RaceDwarf", "RaceGnome", "RaceHuman", "RaceNightElf", "RaceSkyborneHighOrder"];
  const horde = ["RaceOrc", "RaceTauren", "RaceTroll", "RaceUndead", "RaceSkyborneWindshaper"];
  if (![...alliance, ...horde].includes(player.race)) throw new Error("Unknown baseline race");
  const factionName = alliance.includes(player.race) ? "Alliance" : "Horde";
  if (baseline.settings.settings.faction !== factionName)
    throw new Error("Baseline race and faction disagree");
  const professions = [player.profession1, player.profession2].map((name) => {
    if (!professionIds[name]) throw new Error("Unreviewed wearer profession");
    return professionIds[name];
  });
  if (new Set(professions).size !== 2) throw new Error("Choose two distinct professions");
  return {
    profile: baseline.profile,
    playerClass: baseline.playerClass,
    faction: factionName === "Alliance" ? 1 : 2,
    factionName,
    professions,
    originalItems: player.equipment.items.map((spec) => items.get(spec.id)),
    currentIds: new Set(player.equipment.items.map((spec) => spec.id)),
    requireCraftAudit: true,
  };
}

export function mergeClassicPrebis(equipment, reference, currentIds, fullReference) {
  if (
    reference.schema !== "kfc-classic-reference.v1" ||
    reference.revision !== "7779ebbf79dc7f1341e6ab939b28a3402c9a730a" ||
    reference.sourceSha256 !== "07a0691b49e618794e480bc68ca25a35011a5d6a9b5f2da0cee94740d49c55ce"
  )
    throw new Error("Unreviewed Classic reference");
  const result = globalThis.structuredClone(equipment);
  const existing = new Set(result.items.map((item) => item.id));
  const items = [],
    excluded = [];
  if (
    fullReference &&
    (fullReference.schema !== "kfc-classic-pre-raid-equipment.v1" ||
      fullReference.revision !== classicReferenceRevision ||
      fullReference.sourceSha256 !== classicReferenceSha256)
  )
    throw new Error("Unreviewed Classic equipment reference");
  const entries = [...reference.items, ...(fullReference?.items ?? [])];
  for (const entry of entries) {
    const item = entry.item;
    if (existing.has(item.id)) continue;
    if (currentIds.has(item.id)) {
      excluded.push({
        id: item.id,
        reason: "Current Forever record exists; historical stats must not override it.",
      });
      continue;
    }
    if (item.id === 11832) {
      excluded.push({
        id: item.id,
        reason: "Burst of Knowledge use effect not reviewed for this search.",
      });
      continue;
    }
    if (
      !Number.isInteger(item.type) ||
      item.type < 1 ||
      item.type > 14 ||
      item.id > 40000 ||
      item.effectItemId ||
      item.randomSuffixOptions?.length ||
      item.stats?.length !== 44 ||
      item.stats.some((value) => !Number.isFinite(value)) ||
      item.sources?.some((source) => raids.has(source.drop?.zoneId))
    )
      throw new Error(`Invalid Classic pre-raid candidate ${item.id}`);
    if (entry.evidence) {
      const presetPaths = (fullReference.presets ?? [])
        .filter((preset) => preset.ids.includes(item.id))
        .map((preset) => preset.resource);
      const evidence = classicPreRaidEvidence(item, presetPaths);
      if (!evidence.allowed || JSON.stringify(evidence) !== JSON.stringify(entry.evidence))
        throw new Error(`Unreviewed acquisition for Classic item ${item.id}`);
    } else if (![11, 12].includes(item.type)) {
      throw new Error(`Missing acquisition for Classic item ${item.id}`);
    }
    result.items.push(globalThis.structuredClone(item));
    existing.add(item.id);
    items.push({
      id: item.id,
      name: item.name,
      requiredLevel: entry.requiredLevel ?? 60,
      limitCategory: 0,
      sources: entry.evidence?.zoneIds?.map((zoneId) => ({ kind: "dungeon", zoneId })) ?? [
        { kind: "classic-pre-raid" },
      ],
      status: "classic-provisional",
      note:
        item.id === 11815
          ? "Classic +20 AP; existing Forever engine model: 1% landed melee proc, 2-second ICD. Proc cadence requires in-game verification."
          : "Historical Classic stats and acquisition; Forever availability, values, procs and set effects unverified.",
      acquisition: entry.evidence ?? {
        allowed: true,
        kind: "classic-pre-raid",
        evidence: "Reviewed historical pre-raid accessory.",
      },
      questChoice: [13965, 13968, 13966].includes(item.id)
        ? "drakkisath-reward"
        : [12543, 12548].includes(item.id)
          ? "princess-surprise"
          : null,
    });
  }
  return {
    equipment: result,
    manifest: {
      schema: "kfc-prebis-import.v1",
      source: reference.source,
      sourceSha256: reference.sourceSha256,
      revision: reference.revision,
      items,
      excluded,
    },
  };
}

export async function loadClassicPrebis(repo, equipment) {
  const reference = JSON.parse(
    await readFile(join(repo, "infra/simulator/classic-prebis-reference.json"), "utf8"),
  );
  const fullReference = JSON.parse(
    await readFile(join(repo, "infra/simulator/classic-prebis-equipment.json"), "utf8"),
  );
  const snapshot = JSON.parse(
    await readFile(
      join(
        repo,
        "artifacts/forever-client-data/b52b73d2765c00a0569a86f2923843ea1c264fafd5af9d5eec3874db4d7a23aa.json",
      ),
      "utf8",
    ),
  );
  return mergeClassicPrebis(
    equipment,
    reference,
    new Set(snapshot.items.map((item) => item.itemId)),
    fullReference,
  );
}

export function eligiblePrebis(item, source, context, slot) {
  if (
    context.requireCraftAudit &&
    source?.sources?.some((entry) => entry.kind === "crafted") &&
    !source.sources.some((entry) => entry.kind !== "crafted") &&
    source.craftAudit?.status !== "recipe-inputs-reviewed"
  )
    return false;
  if (
    !item ||
    !source ||
    prebisSlotTypes[slot] !== item.type ||
    source.requiredLevel > 60 ||
    item.effectItemId ||
    item.randomSuffixOptions?.length ||
    !source.sources?.length ||
    source.sources.some(
      (entry) =>
        !sourceKinds.has(entry.kind) ||
        raids.has(entry.zoneId) ||
        (entry.faction && entry.faction !== context.factionName),
    )
  )
    return false;
  if (item.stats?.length !== 44 || item.stats.some((value) => !Number.isFinite(value)))
    return false;
  if (item.classAllowlist?.length && !item.classAllowlist.includes(context.playerClass))
    return false;
  if (item.factionRestriction && item.factionRestriction !== context.faction) return false;
  if (item.requiredProfession && !context.professions.includes(item.requiredProfession))
    return false;
  if (
    source.requiredSkill &&
    !context.professions.some((profession) => professionSkills[profession] === source.requiredSkill)
  )
    return false;
  if (source.requiredAbility) return false;
  if (
    source.raceMasks?.some((mask) => mask !== 0 && mask !== -1) &&
    !context.currentIds.has(item.id)
  )
    return false;
  if (item.type === 13) {
    if (!weapons[context.playerClass]?.includes(item.weaponType)) return false;
    const original = context.originalItems[slot];
    // Keep the APL's weapon style: dagger rogue, dual wield and two-hand rotations are different searches.
    if (!original || (item.handType === 4) !== (original.handType === 4)) return false;
    if ([5, 7].includes(original.weaponType) && item.weaponType !== original.weaponType)
      return false;
    if (![5, 7].includes(original.weaponType) && [5, 7].includes(item.weaponType)) return false;
    if (context.profile === "rogue" && (item.weaponType === 2) !== (original.weaponType === 2))
      return false;
    if ((slot === 14 && item.handType === 3) || (slot === 15 && [1, 4].includes(item.handType)))
      return false;
  } else if (item.type === 14) {
    if (!ranged[context.playerClass]?.includes(item.rangedWeaponType)) return false;
  } else if ((item.armorType || 0) > maxArmor[context.playerClass]) return false;
  return true;
}

export function legalPrebisGear(gear, items, sources, context) {
  if (gear.items?.length !== 17) return false;
  const unique = new Set(),
    categories = new Set(),
    quests = new Set();
  for (const [slot, spec] of gear.items.entries()) {
    if (!spec.id) {
      if (context.originalItems[slot]) return false;
      continue;
    }
    const item = items.get(spec.id),
      source = sources.get(spec.id);
    if (!eligiblePrebis(item, source, context, slot)) return false;
    if ((item.unique || source.uniqueEquipped || source.maxCount === 1) && unique.has(item.id))
      return false;
    if (source.limitCategory && categories.has(source.limitCategory)) return false;
    const ownership = equipmentOwnership(item, source);
    if (ownership.questRewardOnce && unique.has(item.id)) return false;
    if (ownership.questChoices.some((quest) => quests.has(quest))) return false;
    unique.add(item.id);
    if (source.limitCategory) categories.add(source.limitCategory);
    for (const quest of ownership.questChoices) quests.add(quest);
  }
  return true;
}

export function statisticallyBetter(candidate, baseline, minimum = 0.001) {
  const margin95 =
    1.96 *
    Math.sqrt(
      candidate.stdev ** 2 / candidate.iterations + baseline.stdev ** 2 / baseline.iterations,
    );
  return candidate.dps - baseline.dps > Math.max(minimum, margin95);
}

export function* prebisSetSubsets(entries) {
  if (entries.length > 17) throw new Error("A set cannot occupy more than 17 equipment slots");
  for (let mask = 1; mask < 2 ** entries.length; mask++) {
    const selected = entries.filter((_, index) => mask & (1 << index));
    if (selected.length >= 2) yield selected;
  }
}
