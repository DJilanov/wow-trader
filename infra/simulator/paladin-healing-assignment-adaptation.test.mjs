import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import {
  applyPaladinHealingAssignmentLayout,
  paladinHealingAdaptedResourceSettings,
  paladinHealingAssignmentVariants,
} from "./paladin-healing-assignment-adaptation.mjs";
import { createPaladinHealingAssignment } from "./paladin-healing-study.mjs";
import { paladinHealingSurvivalPolicyIds } from "./paladin-healing-survival-policies.mjs";
import { paladinHealingSurvivalTimingSettings } from "./paladin-healing-survival-timings.mjs";

const fixture = JSON.parse(
  gunzipSync(
    await readFile(
      new URL("fixtures/paladin-tank-reserve-policy-source.v1.json.gz", import.meta.url),
    ),
  ),
);

test("three- and five-minute variants preserve the original baseline and avoid redundant tank spread", () => {
  assert.equal(paladinHealingAssignmentVariants("tank").length, 2);
  for (const kind of ["group", "burst"])
    assert.deepEqual(paladinHealingAssignmentVariants(kind), [
      { kind, layout: "stacked", durationSeconds: 180 },
      { kind, layout: "stacked", durationSeconds: 300 },
      { kind, layout: "spread", durationSeconds: 180 },
      { kind, layout: "spread", durationSeconds: 300 },
    ]);
  assert.throws(() => paladinHealingAssignmentVariants("raid"));
});

test("the actual saved stacked workload remains unchanged", () => {
  const before = structuredClone(fixture.job.workload);
  assert.deepEqual(
    applyPaladinHealingAssignmentLayout({ frame: before, layout: "stacked" }),
    before,
  );
  assert.deepEqual(fixture.job.workload, before);
});

test("spread changes only recipient positions and the scenario name", () => {
  for (const kind of ["group", "burst"])
    for (const durationSeconds of [180, 300]) {
      const frame = createPaladinHealingAssignment({ kind, durationSeconds, damagePerSecond: 800 });
      const before = structuredClone(frame);
      const result = applyPaladinHealingAssignmentLayout({ frame, layout: "spread" });
      assert.deepEqual(
        result.targets.map((t) => [t.raidIndex, t.x, t.y]),
        [
          [0, 0, 0],
          [1, -30, 0],
          [2, -12, 0],
          [3, 12, 0],
          [4, 30, 0],
        ],
      );
      result.name = before.name;
      result.targets = before.targets;
      assert.deepEqual(result, before);
      assert.deepEqual(frame, before);
    }
});

test("spread remains directly healable but crosses the actual forty-yard Vigil radius", () => {
  const frame = applyPaladinHealingAssignmentLayout({
    frame: createPaladinHealingAssignment({
      kind: "group",
      durationSeconds: 180,
      damagePerSecond: 800,
    }),
    layout: "spread",
  });
  assert(frame.targets.every((target) => Math.hypot(target.x, target.y) <= 40));
  const recipients = frame.targets.filter((target) => target.raidIndex > 0);
  const withinVigil = (anchor) =>
    recipients.filter((target) => Math.hypot(target.x - anchor.x, target.y - anchor.y) <= 40)
      .length;
  assert.deepEqual(recipients.map(withinVigil), [2, 3, 3, 2]);
});

test("unknown layouts, changed input positions and repeated layouts fail closed", () => {
  const frame = createPaladinHealingAssignment({
    kind: "group",
    durationSeconds: 180,
    damagePerSecond: 800,
  });
  assert.throws(() => applyPaladinHealingAssignmentLayout({ frame, layout: "moving" }));
  const once = applyPaladinHealingAssignmentLayout({ frame, layout: "spread" });
  assert.throws(() => applyPaladinHealingAssignmentLayout({ frame: once, layout: "spread" }));
  frame.targets[1].x = 99;
  assert.throws(() => applyPaladinHealingAssignmentLayout({ frame, layout: "stacked" }));
  assert.throws(() =>
    applyPaladinHealingAssignmentLayout({ frame: fixture.job.workload, layout: "spread" }),
  );
});

test("every original resource policy retains its exact three-minute timing packet", () => {
  for (const kind of ["tank", "group"])
    for (const policyId of paladinHealingSurvivalPolicyIds(kind))
      assert.deepEqual(
        paladinHealingAdaptedResourceSettings({
          option: { survivalPolicyId: policyId },
          kind,
          durationSeconds: 180,
        }),
        paladinHealingSurvivalTimingSettings({ kind, policyId, durationSeconds: 180 }),
      );
});

test("five-minute schedules repeat real cycles without adding free activations", () => {
  for (const [kind, option] of [
    ["tank", { tankReservePolicyId: "fixed-cycle-resource-window" }],
    ["group", { survivalPolicyId: "earlier-resources" }],
  ]) {
    const input = { kind, option, durationSeconds: 300 };
    assert.deepEqual(paladinHealingAdaptedResourceSettings(input), {
      cooldowns: [
        { id: { itemId: 12662 }, timings: [15, 135, 255] },
        { id: { itemId: 13444 }, timings: [30, 150, 270] },
      ],
    });
    const changed = paladinHealingAdaptedResourceSettings(input);
    changed.cooldowns[0].timings.push(999);
    assert.equal(paladinHealingAdaptedResourceSettings(input).cooldowns[0].timings.length, 3);
  }
  for (const durationSeconds of [180, 300])
    for (const kind of ["tank", "group", "burst"])
      assert.equal(
        paladinHealingAdaptedResourceSettings({ option: {}, kind, durationSeconds }),
        null,
      );
});

test("undeclared durations, policy families and incompatible role policies are rejected", () => {
  for (const durationSeconds of [0, 120, 240, 301, NaN])
    assert.throws(() =>
      paladinHealingAdaptedResourceSettings({ option: {}, kind: "tank", durationSeconds }),
    );
  for (const option of [
    { survivalPolicyId: "invented" },
    { tankReservePolicyId: "invented" },
    { survivalPolicyId: "earlier-resources", tankReservePolicyId: "fixed-cycle-resource-window" },
  ])
    assert.throws(() =>
      paladinHealingAdaptedResourceSettings({ option, kind: "tank", durationSeconds: 300 }),
    );
  assert.throws(() =>
    paladinHealingAdaptedResourceSettings({
      option: { tankReservePolicyId: "resource-window" },
      kind: "group",
      durationSeconds: 300,
    }),
  );
});
