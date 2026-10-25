import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { renderPaladinHealingPlayerTargets } from "./paladin-healing-player-targets-v2.mjs";
const bytes = readFileSync(
  new URL("./fixtures/paladin-player-targets-parent.v2.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "d571b43f58811574292b77965326fb719eda919c72c542594ee2ef5b2e19cfa1",
);
const source = JSON.parse(gunzipSync(bytes)).source;
test("Paladin player-agent adapter preserves every non-target expression and exact profile guards", () => {
  const result = renderPaladinHealingPlayerTargets(source);
  for (const [key, value] of Object.entries(source)) {
    const owner = key === "active" || key === "rules" ? "holy" : "healer",
      before =
        key === "workload"
          ? "sim.Raid.AllUnits"
          : key === "rules"
            ? "holy.Env.Raid.AllPlayerUnits"
            : owner + ".Env.Raid.AllUnits";
    assert(!result[key].includes(before));
    const reverted = result[key]
      .replaceAll(
        "\n\t\tif guardianErr:=healer.validateKFCPaladinInactiveGuardians();guardianErr!=nil{sim.Cleanup();return nil,guardianErr}",
        "",
      )
      .replaceAll(owner + ".kfcPaladinHealingPlayerUnits()", before);
    assert.equal(reverted, value);
  }
  assert.equal(result.workload.split("healer.validateKFCPaladinInactiveGuardians()").length, 3);
  assert(result.workload.includes("len(units) != len(frame.Targets)"));
  assert(result.active.includes("len(positions) != len(holy.kfcPaladinHealingPlayerUnits())"));
});
test("Paladin player-agent adapter rejects missing cached-selector and step integration anchors", () => {
  for (const key of Object.keys(source)) {
    assert.throws(() =>
      renderPaladinHealingPlayerTargets({
        ...source,
        [key]: source[key].replace(
          key === "rules" ? ".Raid.AllPlayerUnits" : ".Raid.AllUnits",
          ".Raid.UnexpectedUnits",
        ),
      }),
    );
  }
  assert.throws(() =>
    renderPaladinHealingPlayerTargets({
      ...source,
      workload: source.workload.replace(
        "finished := sim.Step()",
        "finished := sim.UnexpectedStep()",
      ),
    }),
  );
});
