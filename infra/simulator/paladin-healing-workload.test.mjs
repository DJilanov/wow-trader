import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import {
  renderPaladinHealingWorkload,
  renderPaladinHealingWorkloadRules,
} from "./paladin-healing-workload.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  parent = fixture("druid-healing-controller-source.v1.json.gz"),
  baseline = fixture("paladin-baseline-source.v1.json.gz"),
  actives = fixture("paladin-healing-actives-source.v1.json.gz"),
  captured = fixture("healer-spell-eligibility-source.v1.json.gz"),
  books = linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(captured.atlas.source),
    tables: new Map(Object.entries(captured.tables)),
    source: captured.source,
  });

test("derives real Paladin fight control while preserving common accounting and strict decoding", () => {
  const result = renderPaladinHealingWorkload(parent.sources);
  for (const source of Object.values(result)) {
    assert(source.startsWith("package holy"));
    for (const forbidden of [
      "priest.",
      "HealingPriest",
      "UseInnerFocus",
      "UsePowerInfusion",
      "KeepRenew",
    ])
      assert(!source.includes(forbidden), forbidden);
  }
  assert(
    result.workload.includes("ConfigureKFCPaladinActiveHealing(positions, frame.VigilRefundMode)"),
  );
  assert(result.workload.includes("ConfigureKFCPaladinHealingRankScaling(*frame.RankScaling)"));
  assert(result.workload.includes("kfcPaladinPriorityTarget(sim, priority)"));
  assert(result.workload.includes("validateKFCPaladinPriority(priority)"));
  assert(result.workload.includes("unit.ConfigureKFCHealingBenchmarkHealth(sim, maximum)"));
  assert(result.workload.includes("output.MissingHealthSecondsMean += beforeMissing * elapsed"));
  assert(result.workload.includes("output.DeliveredIncomingDamageMean += event.Amount"));
  assert(result.job.includes("decoder.DisallowUnknownFields()"));
  assert(result.job.includes("kfc-paladin-healing-job.v1"));
  assert(result.job.includes("kfcHealingUnknownFields(request.ProtoReflect())"));
});

test("requires declared hypotheses and owns Favor without auto-activating Priest cooldowns", () => {
  const result = renderPaladinHealingWorkload(parent.sources);
  assert(
    result.workload.includes("!frame.AllowConditionalSpellCandidates || frame.RankScaling == nil"),
  );
  assert(result.workload.includes("healer.useKFCPaladinFavor(sim, frame, spell)"));
  assert(result.cooldowns.includes("healer.kfcPaladinPriorityTarget(sim, priority)"));
  assert(result.cooldowns.includes("healer.GetCharacter()"));
  assert(!result.cooldowns.includes("KeepRenew"));
});

test("fails on incompatible or ambiguous parent control flow", () => {
  for (const field of ["workload", "cooldowns"])
    assert.throws(() =>
      renderPaladinHealingWorkload({ ...parent.sources, [field]: "package healing" }),
    );
});

test("renders source-backed rank metadata and excludes the raid book from the allowed cast roots", () => {
  const implementation = readFileSync(
      new URL("./paladin-healing-workload-rules.go", import.meta.url),
      "utf8",
    ),
    before = JSON.stringify({ baseline, actives, books }),
    result = renderPaladinHealingWorkloadRules({ implementation, baseline, actives, books });
  assert(result.includes('25292:{Root:25292,Family:"holy-light",RequiredLevel:60}'));
  assert(!result.includes("25292:true"));
  assert(result.includes("20930:true"));
  assert(!result.includes("25903:true"));
  assert(result.includes('1311596:{Root:1311595,Family:"lights-vigil",RequiredLevel:60}'));
  assert.equal(JSON.stringify({ baseline, actives, books }), before);
  assert.throws(() =>
    renderPaladinHealingWorkloadRules({ implementation: "package holy", baseline, actives, books }),
  );
});
