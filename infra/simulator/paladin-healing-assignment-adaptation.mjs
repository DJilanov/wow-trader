import assert from "node:assert/strict";
import { paladinHealingSurvivalTimingSettings } from "./paladin-healing-survival-timings.mjs";
import { paladinHealingSurvivalPolicyIds } from "./paladin-healing-survival-policies.mjs";
import { paladinHealingTankReservePolicyIds } from "./paladin-healing-tank-reserve-policy-v2.mjs";

/** Stationary assignment variants; the original stacked three-minute case stays explicit.
 * @param {'tank'|'group'|'burst'} kind @returns {object[]}
 */
export function paladinHealingAssignmentVariants(kind) {
  assert(["tank", "group", "burst"].includes(kind));
  return [
    { kind, layout: "stacked", durationSeconds: 180 },
    { kind, layout: "stacked", durationSeconds: 300 },
    ...(kind === "tank"
      ? []
      : [180, 300].map((durationSeconds) => ({ kind, layout: "spread", durationSeconds }))),
  ];
}

/** Keep the exact damage/health/priority inputs while applying a declared stationary layout.
 * @param {{frame:object,layout:'stacked'|'spread'}} input @returns {object}
 */
export function applyPaladinHealingAssignmentLayout({ frame, layout }) {
  assert(["stacked", "spread"].includes(layout));
  assert.equal(frame.schema, "kfc-paladin-healing-workload.v1");
  assert.equal(frame.assignmentScoring, "external-demand-v1");
  assert.equal(frame.requireFullTalentBuild, true);
  assert(/^synthetic-(tank|group|burst)-(180|300)s-/.test(frame.name));
  assert(!frame.name.endsWith("-spread"), "Do not apply a layout twice");
  assert.equal(frame.targets.length, 5);
  assert.equal(new Set(frame.targets.map((row) => row.raidIndex)).size, 5);
  for (let raidIndex = 0; raidIndex < 5; raidIndex++) {
    const target = frame.targets.find((row) => row.raidIndex === raidIndex);
    assert(target);
    assert.equal(target.x, raidIndex * 2);
    assert.equal(target.y, 0);
  }
  const result = structuredClone(frame);
  if (layout === "spread") {
    assert(!frame.name.startsWith("synthetic-tank-"), "Tank spread is not a separate assignment");
    result.name += "-spread";
    for (const target of result.targets)
      if (target.raidIndex > 0) target.x = [-30, -12, 12, 30][target.raidIndex - 1];
  }
  return result;
}

/** Repeat the already modeled two-minute resource cycle in a declared five-minute fight.
 * This proposes activation times; real ownership, mana, GCD and cooldown checks still apply.
 * @param {{option:object,kind:'tank'|'group'|'burst',durationSeconds:180|300}} input
 * @returns {object|null}
 */
export function paladinHealingAdaptedResourceSettings({ option, kind, durationSeconds }) {
  assert([180, 300].includes(durationSeconds));
  assert(["tank", "group", "burst"].includes(kind));
  const survival = option.survivalPolicyId;
  const tank = option.tankReservePolicyId;
  assert(!(survival && tank), "Do not combine independent resource-policy families");
  let settings = null;
  if (survival !== undefined) {
    assert(paladinHealingSurvivalPolicyIds(kind).includes(survival));
    settings = paladinHealingSurvivalTimingSettings({
      kind,
      policyId: survival,
      durationSeconds: 180,
    });
  }
  if (tank !== undefined) {
    assert.equal(kind, "tank");
    assert(
      [
        ...paladinHealingTankReservePolicyIds(),
        "fixed-cycle-resource-window",
        "fixed-cycle-potion-window-1500",
      ].includes(tank),
    );
    if (tank.startsWith("fixed-cycle-"))
      settings = paladinHealingSurvivalTimingSettings({
        kind,
        policyId: "earlier-resources",
        durationSeconds: 180,
      });
  }
  if (!settings || durationSeconds === 180) return settings;
  const result = structuredClone(settings);
  for (const row of result.cooldowns) {
    assert.equal(row.timings.length, 2);
    const interval = row.timings[1] - row.timings[0];
    assert.equal(interval, 120);
    for (let next = row.timings.at(-1) + interval; next < durationSeconds; next += interval)
      row.timings.push(next);
  }
  return result;
}
