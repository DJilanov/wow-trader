import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { auditCraftInputs } from "../infra/simulator/craft-acquisition.mjs";
import { eligiblePrebis } from "../infra/simulator/prebis-pool.mjs";

test("known raid materials and Elementium intermediates are not pre-raid crafting", () => {
  const catalog = [
    { id: 1, name: "Raid-dependent", sources: [{ kind: "crafted", spellId: 100 }] },
    { id: 2, name: "Ordinary", sources: [{ kind: "crafted", spellId: 200 }] },
    { id: 3, name: "Unknown", sources: [{ kind: "crafted", spellId: 300 }] },
    { id: 4, name: "Intermediate", sources: [{ kind: "crafted", spellId: 400 }] },
  ];
  const inputs = [
    { recipeSpellId: 100, reagentItemId: 17010, quantity: 1 },
    { recipeSpellId: 200, reagentItemId: 12360, quantity: 1 },
    { recipeSpellId: 400, reagentItemId: 17771, quantity: 1 },
  ];
  const result = auditCraftInputs(catalog, inputs, new Set([100, 200, 400]));
  assert.deepEqual(
    result.map((item) => item.status),
    ["raid-dependent", "recipe-inputs-reviewed", "unresolved", "raid-dependent"],
  );
  const item = { id: 1, type: 12, stats: Array(44).fill(0) };
  const source = { requiredLevel: 60, sources: [{ kind: "crafted" }] };
  const context = {
    requireCraftAudit: true,
    profile: "warrior",
    playerClass: 9,
    faction: 2,
    factionName: "Horde",
    professions: [],
    originalItems: [],
    currentIds: new Set(),
  };
  assert(!eligiblePrebis(item, source, context, 12));
  assert(!eligiblePrebis(item, { ...source, craftAudit: result[0] }, context, 12));
  assert(eligiblePrebis(item, { ...source, craftAudit: result[1] }, context, 12));
  assert(
    eligiblePrebis(
      item,
      { ...source, sources: [{ kind: "crafted" }, { kind: "dungeon", zoneId: 1584 }] },
      context,
      12,
    ),
  );
});

test("alternative reviewed recipes can establish a non-raid crafting path", () => {
  const result = auditCraftInputs(
    [
      {
        id: 1,
        name: "Alternative",
        sources: [
          { kind: "crafted", spellId: 100 },
          { kind: "crafted", spellId: 200 },
        ],
      },
    ],
    [
      { recipeSpellId: 100, reagentItemId: 19726, quantity: 1 },
      { recipeSpellId: 200, reagentItemId: 12360, quantity: 1 },
    ],
    new Set([100, 200]),
  );
  assert.equal(result[0].status, "recipe-inputs-reviewed");
});

test("a new recipe snapshot must be staged without replacing the active audit", () => {
  for (const [args, message] of [
    [["--snapshot=missing"], /requires an explicit staged/],
    [
      ["--snapshot=missing", "--output=artifacts/forever-simulator/craft-acquisition.json"],
      /Stage the new snapshot separately/,
    ],
    [["--snapshot=a", "--snapshot=b"], /Use --snapshot=/],
    [["--unknown=a"], /Use --snapshot=/],
    [["--output="], /Use --snapshot=/],
  ]) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./audit-simulator-craft-acquisition.mjs", import.meta.url)), ...args],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});
