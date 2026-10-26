import assert from "node:assert/strict";
import { prepareShamanFiveThundersDrafts } from "./shaman-five-thunders-drafts.mjs";

/** Preserve the parent catalog and append current rows for isolated mechanics tests.
 * Acquisition remains unavailable to the optimizer until separately reviewed.
 * @param {object} parent @param {object[]} parentSources @param {object} evidence
 * @returns {object}
 */
export function prepareShamanFiveThundersCatalog(parent, parentSources, evidence) {
  const prepared = prepareShamanFiveThundersDrafts(evidence);
  const db = structuredClone(parent),
    sources = structuredClone(parentSources);
  const existing = new Set(db.items.map((item) => item.id));
  assert.equal(existing.size, db.items.length);
  assert.equal(new Set(sources.map((item) => item.id)).size, sources.length);
  for (const draft of prepared.drafts) {
    assert(!existing.has(draft.itemId), "Base Five Thunders already present");
    assert(!sources.some((item) => item.id === draft.itemId));
    assert.equal(draft.statDraft.setId, 519);
    db.items.push(structuredClone(draft.statDraft));
    sources.push({
      id: draft.itemId,
      requiredLevel: evidence.normalized.items.find((item) => item.itemId === draft.itemId)
        .requiredLevel,
      sources: [],
      status: "current-source-mechanics-component-only",
      currentStatsReviewed: true,
      rawWearClassMask: draft.rawWearClassMask,
      referenceAcquisition: {
        classMask: draft.referenceAcquisitionClassMask,
        faction: draft.referenceAcquisitionFaction,
        rewardRelations: structuredClone(draft.rewardRelations),
      },
      acquisitionAdmitted: false,
      serverAccessVerified: false,
    });
  }
  return {
    schema: "kfc-shaman-five-thunders-component-catalog.v1",
    db,
    sources,
    addedIds: prepared.drafts.map((draft) => draft.itemId),
    review: prepared.review,
    acquisitionAdmitted: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, "Missing or duplicate Five Thunders integration");
  return source.replace(before, after);
}

/** Add an exact-ID Restoration-only provider; every other class/set retains its dispatch.
 * @param {{implementation:string,actor:string,coreSets:string,evidence:object}} input
 * @returns {{implementation:string,actor:string,coreSets:string,review:object}}
 */
export function renderShamanFiveThunders({ implementation, actor, coreSets, evidence }) {
  const { review } = prepareShamanFiveThundersDrafts(evidence);
  assert(!actor.includes("kfcFiveThunders *"));
  assert(!coreSets.includes("KFCOwnedShamanHealingSet"));
  implementation = replaceOnce(
    implementation,
    "// KFC_SHAMAN_FIVE_THUNDERS_VALUES",
    [
      `const kfcShamanFiveSetID int32 = ${review.baseSetId}`,
      `const kfcShamanFiveProcID int32 = ${review.baseProc.parentSpellId}`,
      `const kfcShamanFiveBuffID int32 = ${review.baseProc.childSpellId}`,
      `const kfcShamanFiveProcChance = ${review.baseProc.chancePercent / 100}`,
      `const kfcShamanFiveDurationMs = ${review.baseProc.durationMs}`,
      `const kfcShamanFiveProcPower = ${review.baseProc.damageAndHealing}`,
      "const kfcShamanFiveResistance = 8",
      "const kfcShamanFiveStaticPower = 23",
      "const kfcShamanFiveBonusArmor = 200",
    ].join("\n"),
  );
  actor = replaceOnce(
    actor,
    "type RestorationShaman struct {",
    "type RestorationShaman struct {\n\tkfcFiveThunders *kfcShamanFiveThundersState",
  );
  coreSets = replaceOnce(
    coreSets,
    "\tsetItemCount := make(map[*ItemSet]int32)",
    `
  var owned interface {
    KFCOwnedShamanHealingSetID(int32) bool
    KFCOwnedShamanHealingSetBonuses() []ActiveSetBonus
  }
  if forever {
    owned,_ = character.Env.Raid.GetPlayerFromUnit(&character.Unit).(interface {
      KFCOwnedShamanHealingSetID(int32) bool
      KFCOwnedShamanHealingSetBonuses() []ActiveSetBonus
    })
  }
  if owned != nil { activeBonuses = append(activeBonuses,owned.KFCOwnedShamanHealingSetBonuses()...) }
  setItemCount := make(map[*ItemSet]int32)`,
  );
  coreSets = replaceOnce(
    coreSets,
    "\t\tif forever && overridesForeverEquipmentSet(item.SetID) {",
    "\t\tif owned != nil && owned.KFCOwnedShamanHealingSetID(item.SetID) { continue }\n\t\tif forever && overridesForeverEquipmentSet(item.SetID) {",
  );
  return { implementation, actor, coreSets, review };
}
