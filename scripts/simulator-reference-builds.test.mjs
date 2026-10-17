import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import {
  referenceTalentSeeds,
  referenceTreeHash,
  importReferenceBuild,
  referenceTargets,
  referenceEngineRevision,
} from "../infra/simulator/reference-builds.mjs";
import { decodeTalents, talentProblem } from "../infra/simulator/talent-search.mjs";

const archive = JSON.parse(
  await readFile(new URL("../infra/simulator/reference-builds.json", import.meta.url), "utf8"),
);
const tree = [
  {
    name: "Example",
    talents: [{ fieldName: "foundation", maxPoints: 5, location: { rowIdx: 0, colIdx: 0 } }],
  },
];

test("references are seeds only and never install source equipment, enchants or foreign APLs", () => {
  assert.equal(archive.builds.length, 4);
  for (const build of archive.builds) {
    assert.equal(build.sourceEngineRevision, referenceEngineRevision);
    assert.equal(
      Object.values(build.fields).reduce((total, value) => total + value, 0),
      51,
    );
    assert.equal(build.gearImport, "reference-only-not-admitted");
    assert.equal(build.rotationImport, "not-ported");
    assert(build.unavailableGearIds.length > 0);
    assert.equal(build.status, "talent-search-seed-not-a-recommendation");
    assert(!Object.hasOwn(build, "dps"));
    for (const item of build.gearReference)
      assert(![17182, 19019, 19364, 18832, 16963, 21329].includes(item.id));
  }
  assert.deepEqual(
    archive.builds.map((build) => build.treePoints),
    [
      [18, 31, 2],
      [39, 10, 2],
      [23, 0, 28],
      [0, 20, 31],
    ],
  );
});

test("stale engine, talent layout and malformed archives fail closed", () => {
  assert.throws(() => referenceTalentSeeds(archive, "warrior", "fury", tree, "other"), /version/);
  assert.throws(
    () => referenceTalentSeeds(archive, "warrior", "fury", tree, archive.targetRevision),
    /Stale/,
  );
  assert.deepEqual(
    referenceTalentSeeds(archive, "unknown", "unknown", tree, archive.targetRevision),
    [],
  );
  assert.equal(referenceTreeHash(tree).length, 64);
  assert.throws(
    () => importReferenceBuild({}, referenceTargets[0], tree, new Set(), "a".repeat(64)),
    /identity/,
  );
});

test("snapshot identity, semantic talents and declared source encoding are all checked", () => {
  const target = referenceTargets[0];
  const snapshot = {
    id: target.id,
    specSlug: target.sourceSpec,
    engineSha: referenceEngineRevision,
    gear: [],
    detail: {
      forever_talents: {
        loadout_string: "5",
        trees: [
          { name: "Example", points: 5, nodes: [{ key: "foundation", rank: 5, max_rank: 5 }] },
        ],
      },
    },
  };
  assert.throws(
    () => importReferenceBuild(snapshot, target, tree, new Set(), "a".repeat(64)),
    /Expected 51/,
  );
  snapshot.detail.forever_talents.trees[0].nodes[0].key = "unknown";
  assert.throws(
    () => importReferenceBuild(snapshot, target, tree, new Set(), "a".repeat(64)),
    /talent mismatch/,
  );
  snapshot.detail.forever_talents.trees[0].nodes[0].key = "foundation";
  snapshot.detail.forever_talents.trees[0].points = 51;
  assert.throws(
    () => importReferenceBuild(snapshot, target, tree, new Set(), "a".repeat(64)),
    /tree total/,
  );
  assert.notEqual(talentProblem(tree, decodeTalents(tree, "5")), "");
});

test("a complete semantic reference becomes a checked seed without importing its gear", () => {
  const trees = Array.from({ length: 3 }, (_, ti) => ({
    name: `Tree ${ti}`,
    talents: [5, 5, 5, 2].map((maxPoints, index) => ({
      fieldName: `field${ti}_${index}`,
      maxPoints,
      location: { rowIdx: index < 2 ? 0 : index - 1, colIdx: index < 2 ? index : 0 },
    })),
  }));
  const sourceTrees = trees.map((tree) => ({
    name: tree.name,
    points: 17,
    nodes: tree.talents.map((talent) => ({
      key: talent.fieldName,
      rank: talent.maxPoints,
      max_rank: talent.maxPoints,
    })),
  }));
  const target = referenceTargets[0];
  const snapshot = {
    id: target.id,
    specSlug: target.sourceSpec,
    engineSha: referenceEngineRevision,
    generatedAt: "2026-10-16T00:00:00Z",
    gear: [{ id: 123, enchant: 0 }],
    detail: {
      forever_talents: { loadout_string: "5552-5552-5552", trees: sourceTrees },
      forever_advanced: {
        settings: { duration: 120, target_level: 63, target_count: 1, rotation_id: "example" },
      },
    },
  };
  const build = importReferenceBuild(snapshot, target, trees, new Set(), "a".repeat(64));
  assert.deepEqual(build.unavailableGearIds, [123]);
  const imported = {
    schema: archive.schema,
    targetRevision: archive.targetRevision,
    builds: [build],
  };
  assert.deepEqual(
    referenceTalentSeeds(imported, "warrior", "fury", trees, archive.targetRevision),
    [build],
  );
  const changed = globalThis.structuredClone(snapshot);
  changed.detail.forever_talents.loadout_string = "5551-5552-5552";
  assert.throws(
    () => importReferenceBuild(changed, target, trees, new Set(), "a".repeat(64)),
    /encoding/,
  );
});
