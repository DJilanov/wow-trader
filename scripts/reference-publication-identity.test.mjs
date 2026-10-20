import assert from "node:assert/strict";
import { test } from "node:test";

import {
  referenceNonItemClientConflicts,
  referenceQuestXpClientConflicts,
} from "./reference-publication-identity.mjs";

const quests = new Map([[581, "Hunt for Yenniku"]]);
const recipes = new Map([["forever-spell-100", "Test Recipe"]]);

test("validates spell references against exact-game client recipes", () => {
  assert.deepEqual(
    referenceNonItemClientConflicts(
      { game: "forever", kind: "spell", id: 100, name: "Test Recipe" },
      recipes,
      quests,
    ),
    [],
  );
  assert.deepEqual(
    referenceNonItemClientConflicts(
      { game: "forever", kind: "spell", id: 100, name: "Wrong Recipe" },
      recipes,
      quests,
    ),
    ["client_recipe_name_conflict"],
  );
  assert.deepEqual(
    referenceNonItemClientConflicts(
      { game: "tbc", kind: "spell", id: 100, name: "Test Recipe" },
      recipes,
      quests,
    ),
    ["missing_current_client_recipe"],
  );
});

test("preserves quest validation and rejects unsupported kinds", () => {
  assert.deepEqual(
    referenceNonItemClientConflicts(
      { game: "forever", kind: "quest", id: 581, name: "Hunt for Yenniku" },
      recipes,
      quests,
    ),
    [],
  );
  assert.deepEqual(
    referenceNonItemClientConflicts(
      { game: "tbc", kind: "quest", id: 581, name: "Hunt for Yenniku" },
      recipes,
      quests,
    ),
    ["missing_current_client_quest"],
  );
  assert.throws(
    () =>
      referenceNonItemClientConflicts(
        { game: "forever", kind: "npc", id: 1, name: "Trainer" },
        recipes,
        quests,
      ),
    /Unsupported non-item reference kind/,
  );
});

test("allows missing static quest identity only for allowlisted Forever leveling XP", () => {
  const record = { game: "forever", kind: "quest", id: 308, name: "Distracting Jarven" };
  const allowlist = new Set([308]);

  assert.deepEqual(
    referenceQuestXpClientConflicts(record, ["missing_current_client_quest"], allowlist),
    [],
  );
  assert.deepEqual(
    referenceQuestXpClientConflicts(record, ["client_quest_title_conflict"], allowlist),
    ["client_quest_title_conflict"],
  );
  assert.deepEqual(
    referenceQuestXpClientConflicts(
      { ...record, id: 309 },
      ["missing_current_client_quest"],
      allowlist,
    ),
    ["missing_current_client_quest"],
  );
});
