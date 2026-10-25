import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewProfessionPublication } from "./review-profession-publication.mjs";

function fixture() {
  const source = {
    schema: "wowhead-reference.v1",
    game: "forever",
    capturedAt: "2026-10-24T00:00:00.000Z",
    permissionRef: "owner-confirmed",
    sourceSha256: "a".repeat(64),
    numericFacts: {},
    relations: [],
  };
  return {
    now: new Date("2026-10-25T00:00:00.000Z"),
    client: {
      build: {
        id: "80be9e27-0027-4239-a74f-4815cea12c33",
        product: "wow_classic_beta",
        buildNumber: 70532,
        clientVersion: "1.60.1.70532",
        locale: "enUS",
      },
      items: [
        {
          itemId: 200,
          name: "Plans: Copper Belt",
          classId: 9,
          subclassId: 4,
          requiredLevel: 0,
          description: "Teaches you how to make a Copper Belt.",
        },
      ],
      spells: [{ spellId: 100, name: "Copper Belt" }],
      recipes: [{ recipeSpellId: 100, professionSkillLineId: 164 }],
      recipeOutputs: [{ recipeSpellId: 100, outputItemId: 300 }],
    },
    records: [
      {
        ...source,
        kind: "item",
        id: 200,
        name: "Plans: Copper Belt",
        sourceUrl: "https://www.wowhead.com/forever/item=200",
        relations: [{ relation: "sold-by", kind: "npc", id: 500, name: "Trainer" }],
      },
      {
        ...source,
        kind: "spell",
        id: 100,
        name: "Copper Belt",
        sourceUrl: "https://www.wowhead.com/forever/spell=100",
        relations: [
          { relation: "taught-by-item", kind: "item", id: 200, name: "Plans: Copper Belt" },
        ],
      },
      {
        ...source,
        kind: "npc",
        id: 500,
        name: "Trainer <Blacksmithing Trainer>",
        sourceUrl: "https://www.wowhead.com/forever/npc=500",
        relations: [{ relation: "teaches", kind: "spell", id: 100, name: "Copper Belt" }],
      },
    ],
    reconciliation: { identities: [], proposedRelations: [], npcLocations: [] },
  };
}

test("publishes a source-attributed graph against the current build, never as live observations", () => {
  const result = reviewProfessionPublication(fixture());
  assert.equal(result.bundle.sourceKind, "profession_reference_review");
  assert.equal(result.review.build.buildNumber, 70532);
  assert.equal(result.review.taughtRecipes, 1);
  assert.equal(
    result.bundle.entities.find((row) => row.kind === "spell" && row.id === 100).name,
    "Copper Belt",
  );
  assert.ok(
    result.bundle.relations.every((row) => row.evidence.currentRealmAvailability === "unverified"),
  );
  assert.deepEqual(
    result.bundle.entities.find((row) => row.kind === "npc"),
    { kind: "npc", id: 500, name: "Trainer", data: { subName: "Blacksmithing Trainer" } },
  );
  assert.equal(result.bundle.validUntil, "2026-11-07T00:00:00.000Z");
});

test("does not silently promote name matching to an explicit learning relation", () => {
  const input = fixture();
  input.records[1].sourceKind = "listing-name-join";
  const result = reviewProfessionPublication(input);
  const teaching = result.bundle.relations.find(
    (row) => row.sourceKind === "item" && row.relationKind === "teaches_spell",
  );
  assert.equal(teaching.evidence.matchMethod, "unique_profession_name_match");
});

test("holds missing/currently renamed items instead of reusing an older client identity", () => {
  const input = fixture();
  input.client.items[0].name = "Changed Plan";
  const result = reviewProfessionPublication(input);
  assert.ok(
    result.review.held.some((row) => row.id === 200 && row.reason.includes("client_name_conflict")),
  );
  assert.equal(
    result.bundle.relations.some((row) => row.sourceKind === "item"),
    false,
  );
});

test("holds Questie-only proposals without changing their provenance or republishing coordinates", () => {
  const input = fixture();
  input.reconciliation.proposedRelations.push({
    sourceKind: "item",
    sourceId: 200,
    id: 501,
    confidence: "pinned_community_baseline",
  });
  input.reconciliation.npcLocations.push({
    npcId: 500,
    status: "joined",
    locations: [{ areaId: 12, xPercent: 10, yPercent: 20 }],
  });
  const result = reviewProfessionPublication(input);
  assert.ok(
    result.review.held.some((row) => row.reason === "questie_republication_permission_pending"),
  );
  assert.equal(result.bundle.entities.find((row) => row.kind === "npc").data.spawns, undefined);
});

test("rechecks proposed teaching descriptions and crafted-item identity against the new build", () => {
  const input = fixture();
  input.reconciliation.identities.push({
    itemId: 200,
    status: "output_identity_name_match",
    selectedSpellIds: [100],
    clientDescription: input.client.items[0].description,
    outputAliases: [{ outputItemId: 301 }],
  });
  input.reconciliation.proposedRelations.push({
    sourceKind: "spell",
    sourceId: 100,
    relation: "taught-by-item",
    id: 200,
    confidence: "output_identity_name_match",
  });
  const result = reviewProfessionPublication(input);
  assert.ok(
    result.review.held.some(
      (row) => row.reason === "crafted_item_identity_changed_in_current_build",
    ),
  );
  assert.equal(result.review.acceptedProposals, 0);
});

test("is deterministic, deduplicated and does not mutate input evidence", () => {
  const input = fixture();
  input.records[2].relations.push({ ...input.records[2].relations[0] });
  const before = JSON.stringify(input);
  const one = reviewProfessionPublication(input);
  const two = reviewProfessionPublication(input);
  assert.equal(one.bundle.checksum, two.bundle.checksum);
  assert.equal(one.bundle.relations.length, 3);
  assert.equal(JSON.stringify(input), before);
});

test("all-stale evidence cannot generate a fresh-looking publication", () => {
  const input = fixture();
  input.now = new Date("2026-12-01T00:00:00.000Z");
  assert.throws(() => reviewProfessionPublication(input), /No current/);
});

test("authorized Questie sources retain their own provenance and exclude invalid coordinates", () => {
  const input = fixture();
  input.reconciliation.proposedRelations.push({
    sourceKind: "item",
    sourceId: 200,
    relation: "sold-by",
    kind: "npc",
    id: 501,
    confidence: "pinned_community_baseline",
  });
  input.reconciliation.npcLocations.push({ npcId: 500, status: "joined" });
  input.questie = {
    sourceRevision: "pinned-revision",
    checksum: "c".repeat(64),
    entities: [
      {
        kind: "npc",
        id: 500,
        name: "Trainer",
        data: {
          spawns: {
            12: [
              [20, 30],
              [200, 30],
            ],
          },
          zoneID: 12,
        },
      },
      { kind: "npc", id: 501, name: "Vendor", data: {} },
      { kind: "item", id: 200, name: "Plans: Copper Belt", data: {} },
    ],
  };
  const result = reviewProfessionPublication(input);
  assert.equal(result.review.acceptedBaselineRelations, 1);
  assert.equal(result.review.publishedCoordinateJoins, 1);
  assert.deepEqual(
    result.bundle.entities.find((row) => row.kind === "npc" && row.id === 500).data.spawns,
    { 12: [[20, 30]] },
  );
  assert.ok(result.bundle.relations.some((row) => row.evidence.source === "questiedb_forever"));
  assert.ok(result.bundle.relations.some((row) => row.evidence.source === "wowhead"));
});
