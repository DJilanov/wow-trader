import { describe, expect, it } from "vitest";
import { combatQuestSchema } from "./combat-model.js";
import { importedStepSchema } from "./guide-archive.js";
import type { CombatQuestReference } from "./combat-model.js";
import type { ImportedDirective } from "./guide-archive.js";
import fixtureData from "./fixtures/diplomat-docket-ground-70205.json" with { type: "json" };

import { singleGroundPickupObjectName } from "./campaign-ground-pickup.js";
const actualReference = combatQuestSchema.parse(fixtureData.reference);
const actualStep = importedStepSchema.parse(fixtureData.source.step);

function fixture(): { quest: CombatQuestReference; directives: ImportedDirective[] } {
  return { quest: structuredClone(actualReference), directives: structuredClone(actualStep.directives) };
}

describe("unlabeled single-object counters with provider evidence", () => {
  it("recognizes the actual full Defias Docket pickup without inventing a counter label", () => {
    const input = fixture();
    const before = structuredClone(input);
    expect(singleGroundPickupObjectName(input.quest, 1, input.directives)).toBe("Defias Strongbox");
    expect(input).toEqual(before);
  });

  it("retains the labeled method when an explicit counter is present", () => {
    const input = fixture();
    input.directives.at(-1)!.text = "Defias Docket (1)";
    expect(singleGroundPickupObjectName(input.quest, 1, input.directives)).toBe("Defias Strongbox");
  });

  it.each([
    "missing-object", "empty-object", "missing-quantity", "two-items", "provided-item",
    "creature-source", "different-item", "wrong-counter", "duplicate-counter",
    "other-quest-counter", "unrelated-label", "wrong-label-count", "condition",
    "device", "hostile-access",
  ])("preserves an unresolved method when proof is incomplete or restricted: %s", (change) => {
    const { quest, directives } = fixture();
    const item = quest.itemObjectives![0]!;
    if (change === "missing-object") delete item.objectIds;
    if (change === "empty-object") item.objectIds = [];
    if (change === "missing-quantity") item.quantity = null;
    if (change === "two-items") item.quantity = 2;
    if (change === "provided-item") item.provided = true;
    if (change === "creature-source") item.npcIds = [4961];
    if (change === "different-item") item.itemName = "Unrelated Letter";
    if (change === "wrong-counter") directives.at(-1)!.arguments = "1244,2";
    if (change === "duplicate-counter") directives.push({ ...directives.at(-1)! });
    if (change === "other-quest-counter") directives.push({ ...directives.at(-1)!, questId: 1245, arguments: "1245,1" });
    if (change === "unrelated-label") directives.at(-1)!.text = "Unrelated Letter (1)";
    if (change === "wrong-label-count") directives.at(-1)!.text = "Defias Docket (2)";
    if (change === "condition") directives.at(-1)!.condition = "Mage";
    if (change === "device") directives.push({ ...directives[0]!, tag: ".use", arguments: "5947", questId: null });
    if (change === "hostile-access") directives.push({ ...directives[1]!, text: "Kill the guardian before opening the box." });
    expect(singleGroundPickupObjectName(quest, 1, directives)).toBeNull();
  });
});
