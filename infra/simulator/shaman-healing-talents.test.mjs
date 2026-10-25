import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  assertShamanHealingTalentBuild,
  createShamanHealingTalentDomain,
  shamanHealingTalentNeighbors,
  shamanHealingTalentSeeds,
} from "./shaman-healing-talents.mjs";
import { decodeTalents, talentProblem, talentsFromFields } from "./talent-search.mjs";

function fixture(name, expected) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
  return JSON.parse(gunzipSync(bytes));
}

const evidence = fixture(
    "shaman-client-healing-source.v1.json.gz",
    "3253264da0af56c7abeb9541e463751766140df618134508068d459fb6c2be13",
  ),
  adapter = fixture(
    "shaman-healing-talents-source.v1.json.gz",
    "f06edc8c502a76a731493c11adabfef36c6941060248092a5d94263c5a68a1b7",
  ),
  domain = createShamanHealingTalentDomain({ evidence, adapter });

test("Shaman study domain retains all source fields and separates healing from scoped utility", () => {
  assert.equal(domain.fields.length, 50);
  assert.equal(domain.fields.filter((row) => row.classification === "healing-source").length, 15);
  assert.equal(domain.fields.filter((row) => row.classification === "scoped-utility").length, 10);
  assert.equal(
    domain.fields.filter((row) => row.classification === "outside-study-domain").length,
    25,
  );
  assert(domain.fields.every((row) => row.engineEffectAdmitted === false));
  assert.equal(domain.fullClassAdmission, false);
  assert.equal(domain.startsNewClassClock, false);
  assert.equal(domain.publicationAllowed, false);
  assert.match(
    domain.fields.find((row) => row.field === "ancestralHealing").scopeReason,
    /after mitigation/,
  );
  const riptide = domain.fields.find((row) => row.field === "riptide");
  assert.equal(
    domain.trees[riptide.treeIndex].talents[riptide.prerequisiteIndex].fieldName,
    "healingWay",
  );
});

test("source-bound Shaman seeds use complete legal builds without claiming optimization", () => {
  const before = structuredClone(domain),
    seeds = shamanHealingTalentSeeds(domain);
  assert.equal(seeds.length, 3);
  for (const seed of seeds) {
    assert.equal(talentProblem(domain.trees, decodeTalents(domain.trees, seed.talentsString)), "");
    assert.equal(
      Object.values(seed.fields).reduce((sum, rank) => sum + rank, 0),
      51,
    );
    assert.deepEqual(assertShamanHealingTalentBuild(domain, seed.talentsString), seed.fields);
    assert.equal(seed.optimized, false);
    assert.equal(seed.engineEffectsAdmitted, false);
  }
  const support = seeds.find((row) => row.id === "riptide-support"),
    mobility = seeds.find((row) => row.id === "riptide-mobility"),
    hybrid = seeds.find((row) => row.id === "mental-quickness-wave");
  assert.equal(support.fields.riptide, 1);
  assert.equal(mobility.fields.riptide, 1);
  assert.equal(mobility.fields.improvedGhostWolf, 2);
  assert.equal(hybrid.fields.mentalQuickness, 2);
  assert.equal(hybrid.fields.healingWay, 3);
  assert.equal(hybrid.fields.riptide, undefined);
  assert.deepEqual(domain, before);
});

test("Shaman neighbor feedback obeys the full budget, study scope and required anchors", () => {
  for (const seed of shamanHealingTalentSeeds(domain)) {
    const required = seed.fields.riptide ? { riptide: 1 } : { mentalQuickness: 2 },
      neighbors = shamanHealingTalentNeighbors(domain, seed.talentsString, required);
    assert(neighbors.length > 20);
    assert.equal(new Set(neighbors.map((row) => row.talentsString)).size, neighbors.length);
    assert(!neighbors.some((row) => row.talentsString === seed.talentsString));
    for (const neighbor of neighbors) {
      assert.deepEqual(
        assertShamanHealingTalentBuild(domain, neighbor.talentsString),
        neighbor.fields,
      );
      assert.equal(
        Object.values(neighbor.fields).reduce((sum, rank) => sum + rank, 0),
        51,
      );
      for (const [field, minimum] of Object.entries(required))
        assert(neighbor.fields[field] >= minimum);
    }
  }
});

test("Shaman study rejects malformed, incomplete, outside-scope and locked talent builds", () => {
  for (const value of ["", "-----", "abc", "9", "-" + "1".repeat(19)])
    assert.throws(() => assertShamanHealingTalentBuild(domain, value));
  const seed = shamanHealingTalentSeeds(domain)[0],
    outside = { ...seed.fields, naturalGrace: 0, convection: 1 },
    outsideString = talentsFromFields(domain.trees, outside);
  assert.throws(() => assertShamanHealingTalentBuild(domain, outsideString), /Unsupported/);
  const points = decodeTalents(domain.trees, seed.talentsString),
    prerequisite = domain.fields.find((row) => row.field === "healingWay"),
    replacement = domain.fields.find((row) => row.field === "naturalGrace");
  points[prerequisite.treeIndex][prerequisite.index]--;
  points[replacement.treeIndex][replacement.index]++;
  assert.match(talentProblem(domain.trees, points), /Missing prerequisite/);
});

test("Shaman talent preparation rejects client/adapter drift rather than guessing field positions", () => {
  const changed = structuredClone(adapter);
  changed.trees[2].talents[15].maxPoints = 2;
  assert.throws(() => createShamanHealingTalentDomain({ evidence, adapter: changed }));
});
