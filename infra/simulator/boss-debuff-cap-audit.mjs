import assert from "node:assert/strict";

const observation = "TestKfcBossDebuffCapBaselineObservation",
  requirement = "TestKfcBossDebuffLimitRequirement",
  marker = "KFC_BOSS_DEBUFF_CAP_SNAPSHOT ";

/** Distinguish the expected missing-feature regression from build errors, panics or skipped tests.
 * @param {{stdout:string,stderr:string,exitCode:number}} result @returns {object}
 */
export function reviewBossDebuffCapAudit({ stdout, stderr, exitCode }) {
  assert.equal(typeof stdout, "string");
  assert.equal(typeof stderr, "string");
  assert.equal(exitCode, 1, "The preserved missing-cap requirement must fail explicitly");
  assert(
    !/panic:|build failed|undefined:|cannot find package/i.test(stdout + stderr),
    "A harness/compiler failure is not runtime debuff-cap evidence",
  );
  const events = stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert(events.length > 0);
  for (const event of events) assert.equal(event.Package, "github.com/wowsims/classic/sim/core");
  const outcomes = events.filter(
      (event) => event.Test && ["pass", "fail", "skip"].includes(event.Action),
    ),
    expected = new Map([
      [observation, "pass"],
      [observation + "/finite", "pass"],
      [observation + "/permanent", "pass"],
      [requirement, "fail"],
      [requirement + "/finite", "fail"],
      [requirement + "/permanent", "fail"],
    ]);
  assert.equal(outcomes.length, expected.size);
  for (const [name, action] of expected) {
    const rows = outcomes.filter((event) => event.Test === name);
    assert.equal(rows.length, 1, "Missing or duplicate probe outcome: " + name);
    assert.equal(rows[0].Action, action, "Unexpected probe outcome: " + name);
  }
  const snapshots = [];
  for (const event of events) {
    if (typeof event.Output !== "string" || !event.Output.includes(marker)) continue;
    assert(event.Test === observation + "/finite" || event.Test === observation + "/permanent");
    const value = JSON.parse(
      event.Output.slice(event.Output.indexOf(marker) + marker.length).trim(),
    );
    assert.equal(value.permanent, event.Test.endsWith("/permanent"));
    assert.equal(value.active, 17);
    assert.equal(value.timerTracked, value.permanent ? 0 : 17);
    assert.equal(value.currentTimeNanoseconds, 0);
    assert.equal(value.pendingActions, 0);
    assert.equal(value.spellIds.length, 17);
    assert.equal(value.labels.length, 17);
    assert.equal(new Set(value.spellIds).size, 17);
    assert.equal(new Set(value.labels).size, 17);
    assert(value.spellIds.every((id) => Number.isSafeInteger(id) && id > 0));
    assert(value.labels.every((label) => typeof label === "string" && label.length > 0));
    snapshots.push(value);
  }
  assert.deepEqual(snapshots.map((value) => value.permanent).sort(), [false, true]);
  for (const kind of ["finite", "permanent"]) {
    const text = events
      .filter((event) => event.Test === requirement + "/" + kind)
      .map((event) => event.Output ?? "")
      .join("");
    assert(
      text.includes(
        "required maximum of 16 boss debuffs is not enforced: active=17 permanent=" +
          (kind === "permanent"),
      ),
    );
  }
  return {
    schema: "kfc-boss-debuff-cap-runtime-audit.v1",
    status: "required-global-boss-debuff-cap-not-enforced",
    requiredMaximum: 16,
    observations: snapshots,
    directActivationRefreshAndDeactivationChecksPassed: true,
    maximumRequirementPassed: false,
    permanentAurasMissingFromExpiryTrackerConfirmed: true,
    combatStepsExecuted: 0,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}
