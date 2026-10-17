import assert from "node:assert/strict";
import { test } from "node:test";
import { equipmentOwnership } from "../infra/simulator/equipment-ownership.mjs";

test("quest-only sources impose an acquisition limit, not an in-game Unique flag", () => {
  const item = { id: 15806, sources: [{ quest: { id: 5384 } }] };
  assert.deepEqual(equipmentOwnership(item, { sources: [{ kind: "dungeon-quest" }] }), {
    questRewardOnce: true,
    questChoices: ["quest:5384"],
  });
  assert.equal(item.unique, undefined);
  assert.deepEqual(equipmentOwnership({ id: 18500, sources: [{ drop: { zoneId: 2557 } }] }), {
    questRewardOnce: false,
    questChoices: [],
  });
});

test("an independent verified acquisition path avoids a historical quest-only restriction", () => {
  const item = { id: 17705, sources: [{ quest: { id: 7066 } }, { drop: { zoneId: 2100 } }] };
  assert.deepEqual(equipmentOwnership(item, { questChoice: "historical-quest" }), {
    questRewardOnce: false,
    questChoices: [],
  });
  assert.equal(
    equipmentOwnership(
      { id: 1, sources: [{ quest: { id: 1 } }] },
      {
        sources: [{ kind: "crafted" }],
      },
    ).questRewardOnce,
    false,
  );
});

test("catalog quest sources also apply when the UI source list is absent", () => {
  assert.deepEqual(
    equipmentOwnership(
      { id: 15806 },
      {
        sources: [{ kind: "dungeon-quest", questId: 5384 }],
      },
    ),
    { questRewardOnce: true, questChoices: ["quest:5384"] },
  );
  assert.deepEqual(
    equipmentOwnership(
      { id: 15806, sources: [{ quest: { id: 5384 } }] },
      {
        sources: [{ kind: "dungeon-quest", questId: 5384 }],
      },
    ).questChoices,
    ["quest:5384"],
  );
});
