import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewBossDebuffCapAudit } from "./boss-debuff-cap-audit.mjs";

function fixture() {
  // JSON protocol fixtures only, never evidence that the Go engine was executed.
  const pkg = "github.com/wowsims/classic/sim/core",
    events = [];
  for (const permanent of [false, true]) {
    const kind = permanent ? "permanent" : "finite",
      observation = "TestKfcBossDebuffCapBaselineObservation/" + kind,
      requirement = "TestKfcBossDebuffLimitRequirement/" + kind;
    events.push({
      Package: pkg,
      Test: observation,
      Action: "output",
      Output:
        "KFC_BOSS_DEBUFF_CAP_SNAPSHOT " +
        JSON.stringify({
          permanent,
          active: 17,
          timerTracked: permanent ? 0 : 17,
          spellIds: Array.from({ length: 17 }, (_, i) => i + 1),
          labels: Array.from({ length: 17 }, (_, i) => "fixture-aura-" + i),
          currentTimeNanoseconds: 0,
          pendingActions: 0,
        }) +
        "\n",
    });
    events.push({ Package: pkg, Test: observation, Action: "pass" });
    events.push({
      Package: pkg,
      Test: requirement,
      Action: "output",
      Output:
        "required maximum of 16 boss debuffs is not enforced: active=17 permanent=" +
        permanent +
        "\n",
    });
    events.push({ Package: pkg, Test: requirement, Action: "fail" });
  }
  events.push({ Package: pkg, Test: "TestKfcBossDebuffCapBaselineObservation", Action: "pass" });
  events.push({ Package: pkg, Test: "TestKfcBossDebuffLimitRequirement", Action: "fail" });
  const result = () => ({
    stdout: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    stderr: "",
    exitCode: 1,
  });
  return { events, result };
}

test("a missing-cap audit preserves the failed requirement separately from passing runtime observations", () => {
  const value = reviewBossDebuffCapAudit(fixture().result());
  assert.equal(value.status, "required-global-boss-debuff-cap-not-enforced");
  assert.equal(value.maximumRequirementPassed, false);
  assert.deepEqual(
    value.observations.map((row) => row.timerTracked),
    [17, 0],
  );
  assert.equal(value.numericalOptimizationAllowed, false);
  assert.equal(value.publicationAllowed, false);
});

test("compiler failures, panics, incomplete JSON and an unexpected success cannot become cap evidence", () => {
  for (const change of [
    (value) => {
      value.stderr = "build failed: undefined: UnknownAura";
    },
    (value) => {
      value.stderr = "panic: invalid probe setup";
    },
    (value) => {
      value.stdout = "not JSON";
    },
    (value) => {
      value.exitCode = 0;
    },
  ]) {
    const value = fixture().result();
    change(value);
    assert.throws(() => reviewBossDebuffCapAudit(value));
  }
});

test("missing, duplicate, skipped and foreign-package test outcomes are rejected", () => {
  for (const change of [
    (events) => {
      events.pop();
    },
    (events) => {
      events.push(events.at(-1));
    },
    (events) => {
      events.find((event) => event.Action === "pass").Action = "skip";
    },
    (events) => {
      events[0].Package = "another/package";
    },
  ]) {
    const value = fixture();
    change(value.events);
    assert.throws(() => reviewBossDebuffCapAudit(value.result()));
  }
});

test("false counts, expired-tracker claims, duplicate spell identities and combat advancement are rejected", () => {
  for (const change of [
    (row) => {
      row.active = 16;
    },
    (row) => {
      row.timerTracked = 0;
    },
    (row) => {
      row.spellIds[1] = row.spellIds[0];
    },
    (row) => {
      row.currentTimeNanoseconds = 1;
    },
    (row) => {
      row.pendingActions = 1;
    },
  ]) {
    const value = fixture(),
      event = value.events[0],
      marker = "KFC_BOSS_DEBUFF_CAP_SNAPSHOT ",
      row = JSON.parse(event.Output.slice(marker.length));
    change(row);
    event.Output = marker + JSON.stringify(row) + "\n";
    assert.throws(() => reviewBossDebuffCapAudit(value.result()));
  }
});

test("the expected capacity-failure text is required in each requirement subtest", () => {
  const value = fixture();
  value.events.find(
    (event) =>
      event.Test === "TestKfcBossDebuffLimitRequirement/permanent" && event.Action === "output",
  ).Output = "different failure\n";
  assert.throws(() => reviewBossDebuffCapAudit(value.result()));
});
