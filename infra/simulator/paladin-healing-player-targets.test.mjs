import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { renderPaladinHealingPlayerTargets } from "./paladin-healing-player-targets.mjs";

const bytes = readFileSync(
    new URL("./fixtures/paladin-player-targets-parent.v1.json.gz", import.meta.url),
  ),
  source = JSON.parse(gunzipSync(bytes)).source;

test("Paladin target admission changes only player enumeration and adds active-guardian guards", () => {
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "52dc5930928724a8a851c4bfe5416cdfdef93c493d4581151cebfba9d5b1bea5",
  );
  const rendered = renderPaladinHealingPlayerTargets(source);
  for (const [key, original] of Object.entries(source)) {
    assert(!rendered[key].includes(".Raid.AllUnits"));
    const withoutGuards = rendered[key].replaceAll(
      "\n\t\tif guardianErr:=healer.validateKFCPaladinInactiveGuardians();guardianErr!=nil{sim.Cleanup();return nil,guardianErr}",
      "",
    );
    assert.equal(withoutGuards.replaceAll(".Raid.AllPlayerUnits", ".Raid.AllUnits"), original);
  }
  assert.equal(
    rendered.workload.split("healer.validateKFCPaladinInactiveGuardians()").length - 1,
    2,
  );
  assert(rendered.workload.includes("len(units) != len(frame.Targets)"));
  assert(rendered.active.includes("len(positions) != len(holy.Env.Raid.AllPlayerUnits)"));
  assert(rendered.assignment.includes("unit != &healer.Unit"));
});

test("unexpected target loops or missing integration anchors require a new adapter", () => {
  for (const key of Object.keys(source)) {
    assert.throws(() =>
      renderPaladinHealingPlayerTargets({
        ...source,
        [key]: source[key].replace(".Raid.AllUnits", ".Raid.AllPlayerUnits"),
      }),
    );
  }
  assert.throws(() =>
    renderPaladinHealingPlayerTargets({
      ...source,
      workload: source.workload.replace("\t\tsim.Reset()", "\t\tsim.Reset()\n\t\tsim.Reset()"),
    }),
  );
});
