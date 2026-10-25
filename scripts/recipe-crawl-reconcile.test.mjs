import assert from "node:assert/strict";
import { test } from "node:test";

import { reconcileProfessionCrawl, runReconciliation } from "./recipe-crawl-reconcile.mjs";

function fixture() {
  return {
    catalog: {
      manifest: {
        product: "wow_classic_beta",
        buildNumber: 70450,
        clientVersion: "1.60.1.70450",
        locale: "enUS",
      },
      professions: [{ skillLineId: 164, name: "Blacksmithing" }],
      recipes: [
        {
          recipeSpellId: 100,
          professionSkillLineId: 164,
          rawRecord: { skillLineAbility: { AcquireMethod: 0 } },
        },
      ],
      spells: [{ spellId: 100, name: "Copper Belt" }],
      items: [
        {
          itemId: 200,
          name: "Plans: Copper Belt",
          description: "Teaches you how to make a Copper Belt.",
        },
      ],
      recipeTeachingItems: [],
      recipeOutputs: [],
    },
    community: {
      sourceKind: "questiedb_forever",
      sourceVersion: "1.0.6",
      sourceRevision: "pinned",
      checksum: "a".repeat(64),
      includedAuthored: false,
      licenseRef: "review_required",
      entities: [],
      relations: [],
    },
    tasks: [
      { game: "forever", kind: "spell", id: 100 },
      { game: "forever", kind: "item", id: 200 },
    ],
    records: [page("spell", 100, "Copper Belt"), page("item", 200, "Plans: Copper Belt")],
    listings: [
      listing([
        { id: 200, name: "Plans: Copper Belt", sourceTypes: [], teaches: [], relations: [] },
      ]),
    ],
  };
}

function page(kind, id, name, relations = []) {
  return {
    kind,
    id,
    name,
    game: "forever",
    schema: "wowhead-reference.v1",
    relations,
    sourceUrl: `https://www.wowhead.com/forever/${kind}=${id}`,
    sourceSha256: "b".repeat(64),
    capturedAt: "2026-10-23T00:00:00.000Z",
  };
}

function listing(entries) {
  return {
    schema: "wowhead-listing.v1",
    kind: "item-list",
    profession: "blacksmithing",
    entries,
    sourceUrl: "https://www.wowhead.com/forever/items/recipes/blacksmithing",
    sourceSha256: "c".repeat(64),
    capturedAt: "2026-10-23T00:00:00.000Z",
  };
}

test("scopes source gaps to the profession queue, excluding unrelated staged items", () => {
  const input = fixture();
  input.records.push(page("item", 999, "Unrelated"));
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.summary.itemGaps, 1);
  assert.equal(result.summary.unscopedSourceLessItems, 1);
  assert.deepEqual(result.unscopedSourceLessItemIds, [999]);
});

test("retains raw AcquireMethod without claiming its numeric meaning", () => {
  const input = fixture();
  input.listings = [];
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.spellGaps[0].clientAcquireMethod, 0);
  assert.equal(result.spellGaps[0].classification, "unknown");
  assert.equal(result.proposedRelations.length, 0);
});

test("resolves duplicate recipe-item names only with matching client teaching descriptions", () => {
  const input = fixture();
  const second = { ...input.catalog.items[0], itemId: 201 };
  input.catalog.items.push(second);
  input.listings[0].entries.push({ ...input.listings[0].entries[0], id: 201 });
  let result = reconcileProfessionCrawl(input);
  assert.equal(result.summary.previouslyAmbiguousResolved, 2);
  assert.equal(result.summary.newlyLinkedSpellGaps, 1);
  assert.equal(result.proposedRelations[0].confidence, "client_description_name_match");
  second.description = "";
  result = reconcileProfessionCrawl(input);
  assert.equal(result.identities.find((row) => row.itemId === 201).status, "ambiguous");
});

test("does not choose between two same-name recipe spells", () => {
  const input = fixture();
  input.catalog.recipes.push({ ...input.catalog.recipes[0], recipeSpellId: 101 });
  input.catalog.spells.push({ spellId: 101, name: "Copper Belt" });
  input.tasks.push({ game: "forever", kind: "spell", id: 101 });
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.identities[0].status, "ambiguous");
  assert.equal(result.proposedRelations.length, 0);
});

test("accepts an explicit teaching ID despite name ambiguity but rejects a client identity conflict", () => {
  const input = fixture();
  input.catalog.recipes.push({ ...input.catalog.recipes[0], recipeSpellId: 101 });
  input.catalog.spells.push({ spellId: 101, name: "Copper Belt" });
  input.tasks.push({ game: "forever", kind: "spell", id: 101 });
  input.listings[0].entries[0].teaches = [101];
  assert.deepEqual(reconcileProfessionCrawl(input).identities[0].selectedSpellIds, [101]);
  input.catalog.items[0].name = "Different Item";
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.identities[0].status, "client_identity_conflict");
  assert.equal(result.proposedRelations.length, 0);
});

test("an explicit UNUSED label is excluded, not every source-less item", () => {
  const input = fixture();
  input.catalog.items[0].name = "UNUSED";
  input.records[1].name = "UNUSED";
  input.listings[0].entries[0].name = "UNUSED";
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.itemGaps[0].classification, "marked_unused");
  assert.equal(result.proposedRelations.length, 0);
});

test("listing source labels remain hints, not invented vendors or world-drop assertions", () => {
  const input = fixture();
  input.listings[0].entries[0].sourceTypes = ["drop", "vendor"];
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.itemGaps[0].classification, "listing_source_hint_only");
  assert.deepEqual(result.itemGaps[0].baselineSources, []);
  assert.ok(result.proposedRelations.every((row) => row.relation === "taught-by-item"));
});

test("joins baseline item sources only when item names agree", () => {
  const input = fixture();
  input.community.entities.push({ kind: "item", id: 200, name: "Plans: Copper Belt", data: {} });
  input.community.relations.push({
    sourceKind: "item",
    sourceId: 200,
    relationKind: "sold_by_npc",
    targetKind: "npc",
    targetId: 500,
    evidence: { field: "vendors" },
  });
  assert.equal(
    reconcileProfessionCrawl(input).itemGaps[0].classification,
    "baseline_source_pending_review",
  );
  input.community.entities[0].name = "Reused ID";
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.itemGaps[0].classification, "unknown");
  assert.equal(result.npcQueue.length, 0);
});

test("joins coordinates by NPC identity, strips visible title, rejects malformed coordinates", () => {
  const input = fixture();
  input.records.push(page("npc", 500, "Trainer <Blacksmithing Trainer>"));
  input.community.entities.push({
    kind: "npc",
    id: 500,
    name: "Trainer",
    data: {
      zoneID: 12,
      spawns: {
        12: [
          [10, 20],
          [110, 20],
        ],
      },
    },
  });
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.npcLocations[0].status, "joined");
  assert.deepEqual(result.npcLocations[0].locations, [{ areaId: 12, xPercent: 10, yPercent: 20 }]);
  assert.equal(result.npcLocations[0].rejectedCoordinates, 1);
  input.community.entities[0].name = "Other NPC";
  assert.equal(reconcileProfessionCrawl(input).npcLocations[0].status, "name_conflict");
  assert.deepEqual(reconcileProfessionCrawl(input).npcLocations[0].locations, []);
});

test("the new catalog queue excludes fetched NPCs and deduplicates trainer/vendor candidates", () => {
  const input = fixture();
  input.records.push(page("npc", 500, "Fetched Trainer"));
  input.community.entities.push(
    { kind: "npc", id: 500, name: "Fetched Trainer", data: { subName: "Blacksmithing Trainer" } },
    { kind: "npc", id: 501, name: "New Trainer", data: { subName: "Blacksmithing Trainer" } },
    { kind: "item", id: 200, name: "Plans: Copper Belt", data: {} },
  );
  input.community.relations.push({
    sourceKind: "item",
    sourceId: 200,
    relationKind: "sold_by_npc",
    targetKind: "npc",
    targetId: 501,
    evidence: {},
  });
  const result = reconcileProfessionCrawl(input);
  assert.deepEqual(result.npcQueue, [{ game: "forever", kind: "npc", id: 501 }]);
  assert.equal(result.npcCandidates[0].reasons.length, 2);
  assert.equal(
    result.proposedRelations.some((row) => row.relation === "taught-by-npc"),
    false,
  );
});

test("a renamed output can bridge an unmatched teaching name using the same client output ID", () => {
  const input = fixture();
  input.catalog.spells[0].name = "New Copper Belt";
  input.catalog.recipeOutputs.push({ recipeSpellId: 100, outputItemId: 300 });
  input.catalog.items.push({ itemId: 300, name: "New Copper Belt" });
  input.community.entities.push({ kind: "item", id: 300, name: "Copper Belt", data: {} });
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.identities[0].status, "output_identity_name_match");
  assert.deepEqual(result.identities[0].selectedSpellIds, [100]);
  assert.equal(result.summary.previouslyUnmatchedResolved, 1);
  input.catalog.items[0].description = "Teaches a different recipe.";
  assert.equal(reconcileProfessionCrawl(input).identities[0].status, "unmatched");
});

test("does not duplicate existing teaching relations or mutate captures", () => {
  const input = fixture();
  input.records[0].relations.push({
    relation: "taught-by-item",
    kind: "item",
    id: 200,
    name: "Plans: Copper Belt",
  });
  const before = JSON.stringify(input);
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.proposedRelations.length, 0);
  assert.equal(result.summary.spellGaps, 0);
  assert.equal(JSON.stringify(input), before);
});

test("preserves The when it is part of the recipe name", () => {
  const input = fixture();
  input.catalog.spells[0].name = "The Shatterer";
  input.catalog.items[0] = {
    itemId: 200,
    name: "Plans: The Shatterer",
    description: "Teaches you how to make The Shatterer.",
  };
  input.listings[0].entries = [
    { id: 200, name: "Plans: The Shatterer", teaches: [], sourceTypes: [], relations: [] },
    { id: 201, name: "Plans: The Shatterer", teaches: [], sourceTypes: [], relations: [] },
  ];
  input.records[1].name = "Plans: The Shatterer";
  assert.deepEqual(reconcileProfessionCrawl(input).identities[0].selectedSpellIds, [100]);
});

test("rejects same-name items whose client profession disagrees with the listing", () => {
  const input = fixture();
  input.catalog.items[0].requiredSkillId = 197;
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.identities[0].status, "client_identity_conflict");
  assert.equal(result.proposedRelations.length, 0);
});

test("accepts an exact client SkillupSkillLineID alias rather than rejecting the item profession", () => {
  const input = fixture();
  input.catalog.recipes[0].rawRecord.skillLineAbility.SkillLine = 164;
  input.catalog.recipes[0].rawRecord.skillLineAbility.SkillupSkillLineID = 2938;
  input.catalog.items[0].requiredSkillId = 2938;
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.identities[0].clientProfession, "blacksmithing");
  assert.deepEqual(result.identities[0].selectedSpellIds, [100]);
});

test("CLI refuses output inside staging or over source inputs before reading files", async () => {
  const base = [
    "--manifest",
    "/missing/manifest.json",
    "--queue",
    "/missing/queue.json",
    "--source-report",
    "/missing/report.json",
    "--community",
    "/missing/community",
    "--staging",
    "/captures",
  ];
  await assert.rejects(
    runReconciliation([...base, "--output", "/captures/forever-item-100.json"]),
    /must not overwrite/,
  );
  await assert.rejects(
    runReconciliation([...base, "--output", "/missing/queue.json"]),
    /must not overwrite/,
  );
});

test("new inverse NPC evidence becomes a review proposal without rewriting captures", () => {
  const input = fixture();
  input.listings = [];
  input.records.push(
    page("npc", 500, "Trainer and vendor", [
      { relation: "teaches", kind: "spell", id: 100, name: "Copper Belt" },
      { relation: "sells", kind: "item", id: 200, name: "Plans: Copper Belt" },
      { relation: "teaches", kind: "spell", id: 100, name: "Copper Belt" },
      { relation: "sells", kind: "item", id: 200, name: "Plans: Copper Belt" },
    ]),
  );
  const before = JSON.stringify(input);
  const result = reconcileProfessionCrawl(input);
  assert.equal(result.spellGaps[0].classification, "npc_teaching_evidence_pending_review");
  assert.equal(result.itemGaps[0].classification, "npc_vendor_evidence_pending_review");
  assert.equal(result.summary.sourceRelationProposals, 2);
  assert.ok(result.proposedRelations.every((row) => row.publication === "review_required"));
  assert.equal(JSON.stringify(input), before);
});
