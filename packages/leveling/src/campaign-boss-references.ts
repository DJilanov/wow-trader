import { combatBossReferenceSchema, matchesCombatBossIdentity } from "./combat-boss-reference.js";
import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import reviewed from "./reviewed-client-bosses.json" with { type: "json" };

const references = combatBossReferenceSchema.array().parse(reviewed.references);

/** Apply reviewed client identities only to the same build and exact existing NPC. */
export function attachReviewedCampaignBossReferences(data: CombatDataset): CombatDataset {
  const additions = references.filter((reference) => {
    const npc = data.npcs.find((entry) => entry.id === reference.npcId);
    if (!matchesCombatBossIdentity(npc, reference, data.targetBuild)) return false;
    const existing = data.bossReferences?.find((entry) => entry.npcId === reference.npcId);
    if (!existing) return true;
    if (existing.instanceMapId !== reference.instanceMapId ||
      !reference.dungeonVisitIds.every((visit) => existing.dungeonVisitIds.includes(visit)))
      throw new Error(`Existing boss context conflicts with reviewed client identity: ${reference.npcId}`);
    return false;
  });
  return additions.length ? combatDatasetSchema.parse({ ...data,
    bossReferences: [...(data.bossReferences ?? []), ...additions],
  }) : data;
}
