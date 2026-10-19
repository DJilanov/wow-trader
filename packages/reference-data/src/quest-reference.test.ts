import { describe, expect, it } from "vitest";

import type { ReferenceRecord } from "./contracts.js";
import { extractQuestReferenceFacts } from "./quest-reference.js";

describe("quest reference facts", () => {
  it("normalizes route-relevant quick facts and relations", () => {
    const record: ReferenceRecord = {
      schema: "wowhead-reference.v1",
      game: "forever",
      kind: "quest",
      id: 1053,
      name: "In the Name of the Light",
      sourceUrl: "https://www.wowhead.com/forever/quest=1053/in-the-name-of-the-light",
      capturedAt: "2026-10-19T06:00:00.000Z",
      permissionRef: "test",
      sourceSha256: "a".repeat(64),
      tooltipLines: [],
      numericFacts: {},
      quickFacts: [
        "Level: 40",
        "Requires level 34",
        "Type: Dungeon",
        "Side: Alliance",
        "Races: race ID 7, race ID 3",
        "Classes: class ID 5",
        "Not sharable",
      ],
      objectives: ["Defeat the Scarlet leaders."],
      description: "",
      rewards: ["You will receive a reward."],
      questContent: { objectives: "present", rewards: "present" },
      relations: [
        { relation: "start", kind: "npc", id: 3980, name: "Raleigh the Devout" },
        { relation: "end", kind: "npc", id: 1449, name: "Witch Doctor Unbagwa" },
        { relation: "series", kind: "quest", id: 1052, name: "Down the Scarlet Path" },
      ],
    };
    expect(extractQuestReferenceFacts(record)).toMatchObject({
      questId: 1053,
      questLevel: 40,
      minimumLevel: 34,
      type: "Dungeon",
      side: "alliance",
      raceIds: [3, 7],
      classIds: [5],
      shareable: false,
      objectiveState: "present",
      rewardState: "present",
    });
  });

  it("keeps absent requirements unknown", () => {
    const facts = extractQuestReferenceFacts({
      schema: "wowhead-reference.v1",
      game: "forever",
      kind: "quest",
      id: 1,
      name: "Unknown",
      sourceUrl: "https://www.wowhead.com/forever/quest=1",
      capturedAt: "2026-10-19T06:00:00.000Z",
      permissionRef: "test",
      sourceSha256: "a".repeat(64),
      tooltipLines: [],
      numericFacts: {},
      quickFacts: [],
      objectives: [],
      description: "",
      rewards: [],
      relations: [],
    });
    expect(facts).toMatchObject({
      questLevel: null,
      minimumLevel: null,
      side: null,
      shareable: null,
      objectiveState: "unknown",
      rewardState: "unknown",
    });
  });
});
