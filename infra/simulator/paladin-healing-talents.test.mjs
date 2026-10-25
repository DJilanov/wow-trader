import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinHealingTalentDomain,
  assertPaladinHealingTalentBuild,
  paladinHealingTalentSeeds,
  paladinHealingTalentNeighbors,
  renderPaladinHealingTalentDomain,
  integratePaladinHealingTalentDomain,
} from "./paladin-healing-talents.mjs";
import { talentsFromFields } from "./talent-search.mjs";
const fixture = JSON.parse(
  gunzipSync(
    await readFile(
      new URL("./fixtures/paladin-healing-talents-source.v1.json.gz", import.meta.url),
    ),
  ),
);

test("Paladin domain accounts for all current client talent nodes and the two exact layout offsets", () => {
  const domain = extractPaladinHealingTalentDomain(fixture);
  assert.equal(domain.fields.length, 50);
  assert.deepEqual(domain.layoutOffsetSpellIds, [1314103, 1310994]);
  assert.equal(domain.fields.filter((row) => row.classification === "modeled-healing").length, 10);
  assert.equal(domain.fields.filter((row) => row.classification === "scoped-utility").length, 13);
  assert.equal(
    domain.fields.filter((row) => row.classification === "outside-study-domain").length,
    27,
  );
  assert.equal(domain.classMechanicsAdmission, false);
});

test("Paladin layout refuses changed coordinates, prerequisite gates, rank maxima and protobuf contracts", () => {
  for (const change of [
    (f) => {
      f.clientTalents.find((row) => row.spellId === 1314103).rawPosition.x += 10;
    },
    (f) => {
      f.trees[0].talents.find((row) => row.fieldName === "illumination").prereqLocation = undefined;
    },
    (f) => {
      f.trees[0].talents[0].maxPoints = 4;
    },
    (f) => {
      f.proto = "";
    },
  ]) {
    const copy = structuredClone(fixture);
    change(copy);
    assert.throws(() => extractPaladinHealingTalentDomain(copy));
  }
});

test("Paladin seeds and neighboring proposals contain exactly 51 legal classified points", () => {
  const domain = extractPaladinHealingTalentDomain(fixture);
  const seeds = paladinHealingTalentSeeds(domain);
  assert.equal(seeds.length, 3);
  for (const seed of seeds) {
    assert.equal(seed.optimized, false);
    assert.equal(
      Object.values(seed.fields).reduce((sum, rank) => sum + rank, 0),
      51,
    );
    const neighbors = paladinHealingTalentNeighbors(domain, seed.talentsString);
    assert(neighbors.length > 0);
    for (const neighbor of neighbors) {
      assert.deepEqual(
        assertPaladinHealingTalentBuild(domain, neighbor.talentsString),
        neighbor.fields,
      );
      assert.equal(
        Object.values(neighbor.fields).reduce((sum, rank) => sum + rank, 0),
        51,
      );
    }
  }
  assert.equal(new Set(seeds.map((row) => row.talentsString)).size, 3);
});

test("Paladin study refuses partial builds and legal talents outside the declared healing domain", () => {
  const domain = extractPaladinHealingTalentDomain(fixture);
  assert.throws(() => assertPaladinHealingTalentBuild(domain, ""));
  assert.throws(() => assertPaladinHealingTalentBuild(domain, "05320013225101051-503230002-06"));
  const fields = {
    ...paladinHealingTalentSeeds(domain)[0].fields,
    precision: 2,
    improvedRighteousFury: 1,
  };
  const outside = talentsFromFields(domain.trees, fields);
  assert.throws(
    () => assertPaladinHealingTalentBuild(domain, outside),
    /Unsupported healing-study talent/,
  );
});

test("Paladin talent renderer rejects missing integration anchors", async () => {
  const domain = extractPaladinHealingTalentDomain(fixture);
  const implementation = String(
    await readFile(new URL("./paladin-healing-talents.go", import.meta.url)),
  );
  const rendered = renderPaladinHealingTalentDomain({ implementation, domain });
  assert(rendered.includes('"spiritual_focus":2'));
  assert(rendered.includes("[][]kfcPaladinTalentSlot"));
  assert.throws(() => renderPaladinHealingTalentDomain({ implementation: "", domain }));
  assert.throws(() => integratePaladinHealingTalentDomain({ baseline: "", workload: "" }));
});
