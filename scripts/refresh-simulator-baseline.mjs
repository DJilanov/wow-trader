import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import {
  assertUnchangedEquippedData,
  loadBlueControl,
} from "../infra/simulator/baseline-control.mjs";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { prebisSources, prebisContext, legalPrebisGear } from "../infra/simulator/prebis-pool.mjs";
import { describePrebisGear, prebisEnchantPolicy } from "../infra/simulator/prebis-enchants.mjs";
import {
  preRaidConsumeSettings,
  weaponConsumeProblem,
} from "../infra/simulator/prebis-consumes.mjs";
import { decodeTalents, talentProblem } from "../infra/simulator/talent-search.mjs";
import { armsRotationForTalents } from "../infra/simulator/arms-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const args = new Map();
for (const argument of process.argv.slice(2)) {
  const match = /^--(baseline|control)=(.+)$/.exec(argument);
  assert(
    match && !args.has(match[1]),
    "Pass --baseline=<archived-baseline.json> --control=<fresh-blue-baseline.json> once each",
  );
  args.set(match[1], match[2]);
}
assert.equal(
  args.size,
  2,
  "Pass --baseline=<archived-baseline.json> --control=<fresh-blue-baseline.json>",
);
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const baseline = await read(args.get("baseline"));
const fresh = await read(args.get("control"));
const control = await loadBlueControl(root, fresh);
assert(fresh.controlBaseline, "Use a versioned fresh blue baseline, not a legacy control");
assert(/^[a-f0-9]{24}$/.test(baseline.sourceRelease), "Invalid archived release");
for (const field of ["schema", "profile", "variant", "playerClass", "revision"])
  assert.equal(baseline[field], fresh[field], `Refresh ${field} changed`);
assert.equal(baseline.settings.player.race, fresh.settings.player.race);
assert.equal(baseline.settings.settings.faction, fresh.settings.settings.faction);
const directory = "artifacts/forever-simulator/";
const upstream = ".cache/forever-sim-upstream/";
const active = await read(directory + "active.json");
const db = await read(upstream + "assets/database/db.json");
assert.equal(fresh.dbSha256, simulationHash(db), "Fresh control database changed");
assert.equal(fresh.revision, active.revision, "Fresh control revision changed");
assert.deepEqual(db, await read(directory + active.release + "/assets/database/db.json"));
assertUnchangedEquippedData(
  baseline,
  await read(directory + baseline.sourceRelease + "/assets/database/db.json"),
  db,
);
const inspection = await read(upstream + "ui/core/kfc_inspection.json");
const audit = await read(directory + "craft-acquisition.json");
const items = new Map(db.items.map((item) => [item.id, item]));
const sources = prebisSources(
  await read(upstream + "assets/db_inputs/forever_gear_catalog.json"),
  await read(upstream + "ui/core/kfc_prebis_import.json"),
  audit,
  items,
);
assert(
  legalPrebisGear(
    baseline.settings.player.equipment,
    items,
    sources,
    prebisContext(baseline, items),
  ),
  "Archived equipment no longer has a legal non-raid acquisition path",
);
describePrebisGear(
  baseline.settings.player.equipment,
  baseline.profile,
  baseline.variant,
  baseline.playerClass,
  db,
  inspection,
  prebisEnchantPolicy(baseline),
);
assert.equal(weaponConsumeProblem(baseline.settings, db), "");
assert.deepEqual(
  preRaidConsumeSettings(baseline, db).changes,
  [],
  "Adapt known raid consumes explicitly",
);
const trees = await read(upstream + "ui/core/talents/trees/warrior.json");
assert.equal(
  talentProblem(trees, decodeTalents(trees, baseline.settings.player.talentsString)),
  "",
);
if (baseline.variant === "arms")
  assert.deepEqual(
    armsRotationForTalents(
      trees,
      baseline.settings.player.talentsString,
      baseline.settings.player.rotation,
    ),
    baseline.settings.player.rotation,
  );
const captured = await captureSimulatorRequest(root, baseline.settings, {
  release: active.release,
  profile: baseline.profile,
  allowProvisionalEnchants: prebisEnchantPolicy(baseline).provisionalEffectIds.length > 0,
});
const updated = globalThis.structuredClone(baseline);
for (const field of [
  "predecessor",
  "rotationScenarioParent",
  "enchantScenarioParent",
  "consumeScenario",
])
  delete updated[field];
Object.assign(updated, {
  name: `${baseline.variant} · new-catalog warm start, not a reviewed recommendation`,
  sourceRelease: active.release,
  dbSha256: simulationHash(db),
  inspectionSha256: simulationHash(inspection),
  acquisitionAuditSha256: simulationHash(audit),
  controlBaseline: { path: control.path, sha256: control.sha256 },
  settings: captured.settings,
  requestBase64: captured.requestBase64,
  browserMetrics: captured.metrics,
  capturedAt: new Date().toISOString(),
  catalogScenarioParent: {
    baselinePath: args.get("baseline"),
    baselineSha256: simulationHash(baseline),
    dbSha256: baseline.dbSha256,
    sourceRelease: baseline.sourceRelease,
  },
  notice:
    "Unreviewed current-catalog warm start. Equipped item and enchant data exactly match the archived inputs and remain legal under current non-raid acquisition rules. The request was recaptured in the current real browser and uses an immutable current blue control. Prior optimization coverage, scores and engine behavior are NOT inherited; rerun talent/APL, full equipment/enchant search and feedback before recommendation.",
});
const output = join(
  root,
  directory,
  "optimization/baselines",
  `warrior-${updated.variant}-catalog-refresh-${simulationHash(updated).slice(0, 16)}.json`,
);
const serialized = JSON.stringify(updated, null, 2) + "\n";
try {
  await writeFile(output, serialized, { flag: "wx" });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  assert.equal(await readFile(output, "utf8"), serialized, "Immutable refreshed baseline changed");
}
console.log(
  JSON.stringify({
    output,
    control: updated.controlBaseline,
    metrics: captured.metrics,
    status: "unreviewed-current-catalog-warm-start",
  }),
);
