import { describe, expect, it } from "vitest";
import type { CombatNpc } from "./combat-model.js";
import { indexCombatReferences, resolveCombatObjectives } from "./campaign-combat.js";
import { nonKillCollectionMethod } from "./combat-nonkill.js";
import { objectiveDirectiveContext } from "./combat-objective-context.js";
import { parseGuideChapter, type ImportedDirective } from "./guide-archive.js";
import { questRewardItemEvidenceSchema, type QuestRewardItemEvidence } from "./quest-loot.js";

const provenance = {
  sourceUrl: "https://example.test/item=750",
  sourceSha256: "a".repeat(64),
  capturedAt: "2026-10-21T00:00:00.000Z",
};
const rewardEvidence: QuestRewardItemEvidence = {
  ...provenance,
  quests: [{ ...provenance, sourceUrl: "https://example.test/quest=4041", questId: 4041 }],
};
const npc: CombatNpc = {
  id: 6909,
  name: "Sethir the Ancient",
  minimumLevel: 12,
  maximumLevel: 12,
  rank: 0,
  zoneIds: [141],
  xpEligibility: "assumed",
};
const npcs = new Map([[npc.id, npc]]);
const pickpocket =
  "* Cast [Pick Pocket] on Sethir the Ancient\n* Avoid fighting Sethir the Ancient. Stay behind him";

function source(body: string): readonly ImportedDirective[] {
  return parseGuideChapter(`step\n${body}`, "chapter-test", "b".repeat(64), 70205).steps[0]!
    .directives;
}
function method(
  body: string,
  overrides: Partial<Parameters<typeof nonKillCollectionMethod>[0]> = {},
): ReturnType<typeof nonKillCollectionMethod> {
  const directives = source(body);
  return nonKillCollectionMethod({
    directives,
    offset: directives.findIndex((entry) => entry.tag === ".complete"),
    questId: 2242,
    item: { quantity: 1, npcIds: [6909] },
    sourceQuantity: null,
    npcs,
    ...overrides,
  });
}

describe("local acquisition evidence", () => {
  it("validates item and corroborating quest provenance without duplicate reward identities", () => {
    expect(questRewardItemEvidenceSchema.parse(rewardEvidence)).toEqual(rewardEvidence);
    for (const invalid of [
      { ...rewardEvidence, sourceSha256: "unknown" },
      { ...rewardEvidence, quests: [] },
      { ...rewardEvidence, quests: [...rewardEvidence.quests, ...rewardEvidence.quests] },
      { ...rewardEvidence, quests: [{ ...rewardEvidence.quests[0]!, capturedAt: "unknown" }] },
      { ...rewardEvidence, quests: [{ ...rewardEvidence.quests[0]!, questId: 0 }] },
    ])
      expect(questRewardItemEvidenceSchema.safeParse(invalid).success).toBe(false);
  });
  it("only extracts an actual complete marker's local context", () => {
    const directives = source(".turnin 4041\n.complete 3909,1\n.target Gregan\n.complete 999,1");
    expect(objectiveDirectiveContext(directives, -1)).toBeNull();
    expect(objectiveDirectiveContext(directives, directives.length)).toBeNull();
    expect(objectiveDirectiveContext(directives, 0)).toBeNull();
    const offset = directives.findIndex((entry) => entry.tag === ".complete");
    expect(objectiveDirectiveContext(directives, offset)?.before.map((entry) => entry.tag)).toEqual(
      [".turnin"],
    );
    expect(objectiveDirectiveContext(directives, offset)?.all.map((entry) => entry.tag)).toEqual([
      ".turnin",
      ".complete",
      ".target",
    ]);
  });
  it("recognizes one prescribed successful pickpocket with explicit combat avoidance", () => {
    const body = `${pickpocket}\n.complete 2242,1\n.mob Sethir the Ancient`;
    expect(method(body)).toBe("pickpocket");
    expect(method(body, { sourceQuantity: 1 })).toBe("pickpocket");
    expect(method(body, { item: { quantity: null, npcIds: [6909] } })).toBeNull();
    expect(method(body, { item: { quantity: 2, npcIds: [6909] } })).toBeNull();
    expect(method(body, { sourceQuantity: 2 })).toBeNull();
    expect(method(body, { npcs: new Map() })).toBeNull();
    expect(method(body, { item: { quantity: 1, npcIds: [123] } })).toBeNull();
  });
  it.each([
    "* Cast [Pick Pocket] on Sethir the Ancient\n.complete 2242,1\n.mob Sethir the Ancient",
    "* Avoid fighting Sethir the Ancient\n.complete 2242,1\n.mob Sethir the Ancient",
    `${pickpocket}\n.complete 2242,1\n.mob Other NPC`,
    `${pickpocket}\n* Kill him if needed\n.complete 2242,1\n.mob Sethir the Ancient`,
    `${pickpocket}\n.complete 2242,1\n.mob Sethir the Ancient\n.use 1`,
    `${pickpocket}\n.complete 2242,1\n.mob Sethir the Ancient\n.cast 1`,
    "* Cast [Pick Pocket] on Sethir the Ancient's Guard\n* Avoid fighting Sethir the Ancient\n.complete 2242,1\n.mob Sethir the Ancient",
    "* If safe, cast [Pick Pocket] on Sethir the Ancient\n* Avoid fighting Sethir the Ancient\n.complete 2242,1\n.mob Sethir the Ancient",
    "* Cast [Pick Pocket] on Sethir the Ancient\n* Do not avoid fighting Sethir the Ancient\n.complete 2242,1\n.mob Sethir the Ancient",
  ])("holds ambiguous or combat-bearing pickpocket instructions: %s", (body) => {
    expect(method(body)).toBeNull();
  });
  it("does not borrow a pickpocket instruction from an earlier objective", () => {
    const directives = source(
      `${pickpocket}\n.complete 999,1\n.complete 2242,1\n.mob Sethir the Ancient`,
    );
    expect(
      method("", { directives, offset: directives.findIndex((entry) => entry.questId === 2242) }),
    ).toBeNull();
  });
  it("recognizes a corroborated different quest's earlier hand-in without erasing its own combat", () => {
    expect(
      method(
        "* This will no longer kill you\n.accept 4041\n.turnin 4041\n.complete 3909,1\n.target Gregan",
        {
          questId: 3909,
          item: { quantity: 1, npcIds: [7775], rewardEvidence },
        },
      ),
    ).toBe("quest-reward");
  });
  it.each([
    ".accept 4041\n.complete 3909,1",
    ".complete 3909,1\n.turnin 4041",
    ".turnin 999\n.complete 3909,1",
    ".turnin 4041\n.complete 999,1\n.complete 3909,1",
    ".turnin 4041\n.complete 3909,1\n.mob Gregan",
    ".turnin 4041\n.complete 3909,1\n.use 1",
    ".turnin 4041\n.complete 3909,1\n.cast 1",
    "* Kill Gregan\n.turnin 4041\n.complete 3909,1",
  ])("does not assume a reward from missing, later or unrelated hand-ins: %s", (body) => {
    const directives = source(body);
    expect(
      method(body, {
        directives,
        offset: directives.findIndex((entry) => entry.questId === 3909),
        questId: 3909,
        item: { quantity: 1, npcIds: [7775], rewardEvidence },
      }),
    ).toBeNull();
  });
  it("holds self-reward cycles and unknown or multi-item quotas", () => {
    const body = ".turnin 4041\n.complete 3909,1";
    expect(
      method(body, { questId: 4041, item: { quantity: 1, npcIds: [], rewardEvidence } }),
    ).toBeNull();
    for (const quantity of [null, 2])
      expect(
        method(body, { questId: 3909, item: { quantity, npcIds: [], rewardEvidence } }),
      ).toBeNull();
    expect(method(body, { questId: 3909, item: { quantity: 1, npcIds: [] } })).toBeNull();
  });
  it("binds empty source counters without attaching invented loot work", () => {
    const references = indexCombatReferences({
      npcs: [npc],
      quests: [
        {
          questId: 2242,
          creatureIds: [],
          itemCreatureIds: [6909],
          onlyCreatureObjectives: false,
          objectiveText: ["Find Sethir's Journal"],
          itemObjectives: [
            { itemId: 7737, quantity: 1, objectiveIndex: 1, npcIds: [6909], sharing: "unknown" },
          ],
        },
      ],
    });
    const result = resolveCombatObjectives(
      source(`${pickpocket}\n.complete 2242,1\n.mob Sethir the Ancient`),
      references,
      "test-source",
    );
    expect(result).toMatchObject([
      { credit: "non-combat", npcIds: [], requiredKills: null, source: "test-source" },
    ]);
    expect(result[0]!.loot).toBeUndefined();
    expect(result[0]!.reason).toContain("successful pickpocket");
  });
  it("keeps conflicting provider kill requirements unresolved instead of assuming a free item", () => {
    const references = indexCombatReferences({
      npcs: [npc],
      quests: [
        {
          questId: 2242,
          creatureIds: [],
          itemCreatureIds: [6909],
          onlyCreatureObjectives: false,
          objectiveText: ["Kill Sethir the Ancient"],
          itemObjectives: [
            { itemId: 7737, quantity: 1, objectiveIndex: 1, npcIds: [6909], sharing: "unknown" },
          ],
        },
      ],
    });
    expect(
      resolveCombatObjectives(
        source(`${pickpocket}\n.complete 2242,1\n.mob Sethir the Ancient`),
        references,
        "test",
      )[0],
    ).toMatchObject({ credit: "personal-loot", loot: { quantity: 1 } });
  });
  it("binds a guaranteed hand-in item but never overrides an explicit numeric kill objective", () => {
    const references = indexCombatReferences({
      npcs: [npc],
      quests: [
        {
          questId: 3909,
          creatureIds: [6909],
          itemCreatureIds: [6909],
          onlyCreatureObjectives: false,
          objectiveText: [],
          itemObjectives: [
            {
              itemId: 11243,
              quantity: 1,
              objectiveIndex: 1,
              npcIds: [6909],
              sharing: "unknown",
              rewardEvidence,
            },
          ],
        },
      ],
    });
    const reward = resolveCombatObjectives(
      source(".turnin 4041\n.complete 3909,1\n.target Gregan"),
      references,
      "test",
    )[0]!;
    expect(reward).toMatchObject({ credit: "non-combat", npcIds: [], requiredKills: null });
    expect(reward.loot).toBeUndefined();
    const kills = resolveCombatObjectives(
      source(
        ".turnin 4041\n.complete 3909,1 --Kill Sethir the Ancient (10)\n.mob Sethir the Ancient",
      ),
      references,
      "test",
    )[0]!;
    expect(kills).toMatchObject({ credit: "shared-kills", npcIds: [6909], requiredKills: 10 });
  });
});
