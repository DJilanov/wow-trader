import type { CombatDataset } from "./combat-model.js";
import type { CombatNpcMetadataReference } from "./combat-npc-metadata.js";
import { combatNpcMetadataReferenceSchema } from "./combat-npc-metadata.js";
import { supplementCombatNpcMetadata } from "./combat-reference-enrichment.js";
import ownerLevels from "./combat-owner-confirmed-levels.json" with { type: "json" };

const baron: CombatNpcMetadataReference = {
  npcId: 250660,
  name: "The Baron",
  minimumLevel: 17,
  maximumLevel: 17,
  rank: null,
  levelSource: {
    kind: "owner-confirmed-creature-level",
    statement: "Baron is level 17",
    confirmedOn: "2026-11-03",
  },
  rankSource: null,
  attribution: "Owner confirmation for The Baron in Ruins of Lordaeron.",
  limitation:
    "Unversioned planning reference. Confirms level only; no rank, boss exemption, observed kill XP, drop rate or clear population is established.",
};

const reviewed = [
  { reference: baron, expectedZoneIds: [16611] },
  ...ownerLevels.map(({ expectedZoneIds, ...reference }) => ({
    expectedZoneIds,
    reference: combatNpcMetadataReferenceSchema.parse(reference),
  })),
];

/** Fill reviewed provider stubs without replacing subsequently sourced creature facts. */
export function applyReviewedCombatNpcLevels(dataset: CombatDataset): CombatDataset {
  const references = reviewed.flatMap(({ reference, expectedZoneIds }) => {
    const npc = dataset.npcs.find((entry) => entry.id === reference.npcId);
    return npc &&
      npc.name.normalize("NFKC").trim().toLowerCase() === reference.name.toLowerCase() &&
      npc.zoneIds.length === expectedZoneIds.length &&
      expectedZoneIds.every((zoneId) => npc.zoneIds.includes(zoneId)) &&
      npc.minimumLevel === null && npc.maximumLevel === null &&
      (npc.rank === 0 || npc.rank === null) && npc.xpEligibility === "assumed" &&
      !dataset.npcMetadataReferences?.some((entry) => entry.npcId === npc.id)
      ? [reference] : [];
  });
  // Provider rank-zero stubs are not measured normal-creature classifications.
  return references.length ? supplementCombatNpcMetadata(dataset, references) : dataset;
}
