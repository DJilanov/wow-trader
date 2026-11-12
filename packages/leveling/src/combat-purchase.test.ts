import { describe, expect, it } from "vitest";
import { isExplicitVendorPurchase, isGeneratedVendorPurchase } from "./combat-purchase.js";
import { parseGuideChapter } from "./guide-archive.js";
import type { CombatNpc, CombatQuestReference } from "./combat-model.js";
import { questVendorEvidenceSchema, type QuestVendorEvidence } from "./quest-loot.js";

const evidence: QuestVendorEvidence = {
  npcIds: [1247],
  sourceUrl: "https://www.wowhead.com/forever/item=2894",
  sourceSha256: "a".repeat(64),
  capturedAt: "2026-10-21T00:00:00.000Z",
};
const vendor: CombatNpc = {
  id: 1247,
  name: "Innkeeper Belm",
  minimumLevel: 30,
  maximumLevel: 30,
  rank: 0,
  zoneIds: [1],
  xpEligibility: "assumed",
};
const npcs = new Map([[vendor.id, vendor]]);
function source(body: string): ReturnType<typeof parseGuideChapter>["steps"][number]["directives"] {
  return parseGuideChapter(`step\n${body}`, "chapter-test", "a".repeat(64), 70205).steps[0]!
    .directives;
}

describe("explicit vendor purchase attribution", () => {
  it("recognizes an authored purchase only with exact item, quantity and qualified vendor", () => {
    const item: NonNullable<CombatQuestReference["itemObjectives"]>[number] = {
      objectiveIndex: 1,
      itemId: 2894,
      itemName: "Rhapsody Malt",
      quantity: 1,
      npcIds: [],
      sharing: "pooled",
      vendorEvidence: evidence,
    };
    expect(
      isGeneratedVendorPurchase(item, ["Buy 1 [Rhapsody Malt] from Innkeeper Belm."], npcs),
    ).toBe(true);
    expect(
      isGeneratedVendorPurchase(item, ["Purchase 1 [Rhapsody Malt] from Innkeeper Belm."], npcs),
    ).toBe(true);
    for (const line of [
      "Buy 2 [Rhapsody Malt] from Innkeeper Belm.",
      "Buy 1 [Rhapsody] from Innkeeper Belm.",
      "Buy 1 [Rhapsody Malt] from Another Vendor.",
      "Buy 1 [Rhapsody Malt] from Innkeeper Belm if needed.",
      "Do not buy 1 [Rhapsody Malt] from Innkeeper Belm.",
    ])
      expect(isGeneratedVendorPurchase(item, [line], npcs)).toBe(false);
    for (const changed of [
      { ...item, vendorEvidence: undefined },
      { ...item, quantity: null },
      { ...item, provided: true },
      { ...item, npcIds: [12] },
      { ...item, objectIds: [99] },
    ])
      expect(
        isGeneratedVendorPurchase(changed, ["Buy 1 [Rhapsody Malt] from Innkeeper Belm."], npcs),
      ).toBe(false);
    expect(
      isGeneratedVendorPurchase(item, ["Buy 1 [Rhapsody Malt] from Innkeeper Belm."], new Map()),
    ).toBe(false);
  });
  it("validates vendor identities and provenance at the data boundary", () => {
    expect(questVendorEvidenceSchema.parse(evidence)).toEqual(evidence);
    for (const invalid of [
      { ...evidence, npcIds: [] },
      { ...evidence, npcIds: [1247, 1247] },
      { ...evidence, npcIds: [0] },
      { ...evidence, sourceSha256: "unverified" },
      { ...evidence, capturedAt: "unknown" },
    ])
      expect(questVendorEvidenceSchema.safeParse(invalid).success).toBe(false);
  });
  it("matches an exact bracketed item and targeted vendor before or after its objective marker", () => {
    const directives = source(
      "* Buy a [Rhapsody Malt] from him\n.complete 384,2 --Collect Rhapsody Malt (x1)\n.target Innkeeper Belm",
    );
    const offset = directives.findIndex((entry) => entry.tag === ".complete");
    expect(
      isExplicitVendorPurchase(directives, offset, "Collect Rhapsody Malt", evidence, npcs),
    ).toBe(true);
    const before = JSON.stringify(directives);
    expect(isExplicitVendorPurchase(directives, offset, "Collect Rhapsody", evidence, npcs)).toBe(
      false,
    );
    expect(isExplicitVendorPurchase(directives, offset, "Loot Rhapsody Malt", evidence, npcs)).toBe(
      false,
    );
    expect(
      isExplicitVendorPurchase(directives, offset, "Collect Rhapsody Malt", undefined, npcs),
    ).toBe(false);
    expect(
      isExplicitVendorPurchase(directives, offset, "Collect Rhapsody Malt", evidence, new Map()),
    ).toBe(false);
    expect(JSON.stringify(directives)).toBe(before);
  });
  it.each([
    "Buy [Rhapsody Malt] or loot it",
    "Buy [Rhapsody Malt] if needed",
    "Buy no [Rhapsody Malt]",
    "Do not buy [Rhapsody Malt]",
    "Buy [Rhapsody Malt], don’t farm it instead",
    "Buy anything except [Rhapsody Malt]",
    "Buy from [Rhapsody Malt] some supplies",
  ])("keeps optional, alternative or negative instructions unresolved: %s", (instruction) => {
    const directives = source(
      `* ${instruction}\n.complete 384,2 --Collect Rhapsody Malt (x1)\n.target Innkeeper Belm`,
    );
    expect(
      isExplicitVendorPurchase(
        directives,
        directives.findIndex((entry) => entry.tag === ".complete"),
        "Collect Rhapsody Malt",
        evidence,
        npcs,
      ),
    ).toBe(false);
  });
  it("does not borrow a purchase or target from a different objective segment", () => {
    const directives = source(
      "* Buy [Rhapsody Malt]\n.complete 384,2 --Collect Rhapsody Malt (x1)\n.target Innkeeper Belm\n.complete 999,1 --Collect Rhapsody Malt (x1)",
    );
    const offsets = directives.flatMap((entry, index) =>
      entry.tag === ".complete" ? [index] : [],
    );
    expect(
      isExplicitVendorPurchase(directives, offsets[0]!, "Collect Rhapsody Malt", evidence, npcs),
    ).toBe(true);
    expect(
      isExplicitVendorPurchase(directives, offsets[1]!, "Collect Rhapsody Malt", evidence, npcs),
    ).toBe(false);
    const lateTarget = source(
      "* Buy [Rhapsody Malt]\n.complete 384,2 --Collect Rhapsody Malt (x1)\n.complete 999,1 --Other (1)\n.target Innkeeper Belm",
    );
    expect(
      isExplicitVendorPurchase(
        lateTarget,
        lateTarget.findIndex((entry) => entry.tag === ".complete"),
        "Collect Rhapsody Malt",
        evidence,
        npcs,
      ),
    ).toBe(false);
  });
  it("requires matching vendor evidence and keeps literal punctuation safe", () => {
    const directives = source(
      "* Purchase [Item [A]+] from him\n.complete 384,2 --Collect Item [A]+ (x1)\n.target Innkeeper Belm",
    );
    expect(
      isExplicitVendorPurchase(
        directives,
        directives.findIndex((entry) => entry.tag === ".complete"),
        "Collect Item [A]+",
        evidence,
        npcs,
      ),
    ).toBe(false);
    const literal = source(
      "* Purchase [Item (A)+] and 2 [Other Item] from him\n.complete 384,2 --Collect Item (A)+ (x1)\n.target Innkeeper Belm",
    );
    const offset = literal.findIndex((entry) => entry.tag === ".complete");
    expect(isExplicitVendorPurchase(literal, offset, "Collect Item (A)+", evidence, npcs)).toBe(
      true,
    );
    expect(isExplicitVendorPurchase(literal, offset, "Collect Other Item", evidence, npcs)).toBe(
      true,
    );
    const missing = source(
      "* Buy [Rhapsody Malt]\n.complete 384,2 --Collect Rhapsody Malt (x1)\n.target Different Vendor",
    );
    expect(
      isExplicitVendorPurchase(
        missing,
        missing.findIndex((entry) => entry.tag === ".complete"),
        "Collect Rhapsody Malt",
        evidence,
        npcs,
      ),
    ).toBe(false);
  });
});
