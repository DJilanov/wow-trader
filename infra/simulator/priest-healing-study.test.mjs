import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { decodeTalents, summarizeTalents } from "./talent-search.mjs";
import {
  assertPriestHealingTalentLayout,
  priestHealingTalentSeeds,
  createPriestHealingAssignment,
  createPriestHealingPriorities,
  summarizePriestHealingAssignment,
} from "./priest-healing-study.mjs";
const bytes = readFileSync(
  new URL("./fixtures/priest-healing-study-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "649d67d273eb68d308282e34b146d25c26a9db5b491fd0e05718dd0b2d1ff2ea",
);
const evidence = JSON.parse(gunzipSync(bytes));
test("both actual healer talent seeds use51legal points on the current client layout", () => {
  assertPriestHealingTalentLayout(evidence.trees, evidence.clientTalents);
  const seeds = priestHealingTalentSeeds(evidence.trees);
  assert.equal(seeds.length, 2);
  for (const seed of seeds) {
    assert.equal(
      decodeTalents(evidence.trees, seed.talentsString)
        .flat()
        .reduce((a, b) => a + b, 0),
      51,
    );
    const counts = summarizeTalents(evidence.trees, seed.talentsString).map((t) => t.points);
    assert.deepEqual(counts, seed.spec === "holy" ? [20, 31, 0] : [31, 20, 0]);
  }
  assert(seeds.find((s) => s.spec === "holy").fields.prayerOfMending);
  assert(seeds.find((s) => s.spec === "discipline").fields.penance);
});
test("changed talent positions, ranks and prerequisites cannot silently use an old encoding", () => {
  for (const change of [
    (e) => {
      e.trees[0].talents[0].maxPoints++;
    },
    (e) => {
      e.trees[1].talents.at(-1).prereqLocation = { rowIdx: 0, colIdx: 0 };
    },
    (e) => {
      e.clientTalents = e.clientTalents.filter((t) => t.name !== "Penance");
    },
  ]) {
    const next = globalThis.structuredClone(evidence);
    change(next);
    assert.throws(() => assertPriestHealingTalentLayout(next.trees, next.clientTalents));
  }
});
test("tank/group/burst assignments declare actual schedules without caster damage or external heals", () => {
  for (const kind of ["tank", "group", "burst"]) {
    const frame = createPriestHealingAssignment({
      kind,
      durationSeconds: 180,
      damagePerSecond: 400,
    });
    assert.equal(frame.targets.length, 5);
    assert(frame.damage.length > 0);
    assert(frame.name.startsWith("synthetic-"));
    assert(frame.damage.every((e) => e.atMs < 180000 && e.raidIndex > 0));
    assert(frame.targets.every((t) => Number.isFinite(t.x) && Number.isFinite(t.y)));
  }
  assert.equal(
    createPriestHealingAssignment({
      kind: "tank",
      durationSeconds: 180,
      damagePerSecond: 400,
    }).damage.reduce((a, b) => a + b.amount, 0),
    179 * 400,
  );
  assert.throws(() =>
    createPriestHealingAssignment({
      kind: "group",
      durationSeconds: Infinity,
      damagePerSecond: 400,
    }),
  );
});
test("priorities require owned talents and preserve the independent assignment", () => {
  const assignment = createPriestHealingAssignment({
      kind: "tank",
      durationSeconds: 180,
      damagePerSecond: 400,
    }),
    before = globalThis.structuredClone(assignment);
  for (const seed of priestHealingTalentSeeds(evidence.trees)) {
    const frame = createPriestHealingPriorities(assignment, seed.fields, {
      shield: true,
      renew: true,
    });
    assert(frame.priorities.every((p) => p.raidIndex === 1));
    assert.equal(
      frame.priorities.some((p) => p.spellId === 1240827),
      seed.spec === "holy",
    );
    assert.equal(
      frame.priorities.some((p) => p.spellId === 1316995),
      seed.spec === "discipline",
    );
    assert.equal(frame.usePowerInfusion, seed.spec === "discipline");
  }
  assert.deepEqual(assignment, before);
});
test("failed assignments and lost incoming damage never qualify even with high raw HPS", () => {
  const result = {
    schema: "kfc-healing-workload-result.v1",
    name: "synthetic-tank-180s-400dps",
    survivalRate: 1,
    missingHealthSecondsMean: 18000,
    manaRemainingMean: 2000,
    plannedIncomingPostMitigationDamage: 71600,
    deliveredIncomingDamageMean: 71600,
    classQualified: false,
    publicationAllowed: false,
  };
  assert.deepEqual(summarizePriestHealingAssignment(result), {
    feasible: true,
    meanMissingHealth: 100,
    manaRemainingMean: 2000,
  });
  assert.equal(
    summarizePriestHealingAssignment({ ...result, survivalRate: 0, rawHps: 999999 }).feasible,
    false,
  );
  assert.equal(
    summarizePriestHealingAssignment({ ...result, deliveredIncomingDamageMean: 70000 }).feasible,
    false,
  );
  assert.throws(() => summarizePriestHealingAssignment({ ...result, survivalRate: 1.1 }));
  assert.throws(() =>
    summarizePriestHealingAssignment({ ...result, missingHealthSecondsMean: NaN }),
  );
  assert.throws(() => summarizePriestHealingAssignment({ ...result, classQualified: true }));
});
