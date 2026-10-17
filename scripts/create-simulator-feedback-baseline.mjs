import assert from "node:assert/strict";
import { readFile, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { legalPrebisGear, prebisContext, prebisSources } from "../infra/simulator/prebis-pool.mjs";
import { describePrebisGear, prebisEnchantPolicy } from "../infra/simulator/prebis-enchants.mjs";

const root = resolve(import.meta.dirname, "..");
const argument = (name) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const baseArgument = argument("baseline");
const gearArgument = argument("gear-review");
if (!baseArgument || !gearArgument)
  throw new Error("Pass --baseline=<input.json> --gear-review=<completed-gear.json>");
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const baseline = await read(baseArgument);
const review = await read(gearArgument);
const result = review.result;
assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
assert(["warrior/fury", "warrior/arms"].includes(`${baseline.profile}/${baseline.variant}`));
assert(
  result && result.status === "simulation-complete-awaiting-browser-review",
  "Gear search has not completed",
);
assert.equal(result.profile, baseline.profile);
assert.equal(result.variant, baseline.variant);
assert.equal(result.playerClass, baseline.playerClass);
assert.equal(result.race, baseline.settings.player.race);
assert.equal(result.faction, baseline.settings.settings.faction === "Alliance" ? 1 : 2);
assert.equal(result.requestSha256, simulationHash(baseline.requestBase64));
const upstream = ".cache/forever-sim-upstream/";
const db = await read(upstream + "assets/database/db.json");
assert.equal(baseline.dbSha256, simulationHash(db));
const catalog = await read(upstream + "assets/db_inputs/forever_gear_catalog.json");
const imports = await read(upstream + "ui/core/kfc_prebis_import.json");
const inspection = await read(upstream + "ui/core/kfc_inspection.json");
const audit = await read("artifacts/forever-simulator/craft-acquisition.json");
const items = new Map(db.items.map((item) => [item.id, item]));
const sources = prebisSources(catalog, imports, audit, items);
const context = prebisContext(baseline, items);
assert.deepEqual(result.professions, context.professions);
assert(legalPrebisGear(result.gear, items, sources, context), "Feedback gear is no longer legal");
describePrebisGear(
  result.gear,
  result.profile,
  result.variant,
  result.playerClass,
  db,
  inspection,
  prebisEnchantPolicy(baseline),
);
const adapted = globalThis.structuredClone(baseline);
adapted.settings.player.equipment = result.gear;
adapted.settings.player.talentsString = result.talentsString;
adapted.settings.player.rotation = result.rotation;
adapted.name = `${baseline.variant === "arms" ? "Arms" : "Fury"} · equipment feedback for talent/APL search`;
adapted.notice =
  "Equipment-feedback experiment, not a published BiS recommendation. Inherits the fixed race, distinct professions, buffs/consumes, zero starting rage and disabled free Tier 1/Recklessness from its source baseline. Equipment is now unlocked and revalidated against the strict non-raid pool; talents and APL must be retested on this actual gear.";
adapted.initialPvpCoreIds = baseline.initialPvpCoreIds ?? baseline.coreIds;
adapted.coreIds = [];
delete adapted.browserMetrics;
adapted.predecessor = {
  baselinePath: baseArgument,
  baselineSha256: simulationHash(baseline),
  gearReviewPath: gearArgument,
  gearReviewSha256: simulationHash(review),
  gearConverged: result.converged,
};
const destination = join(
  root,
  "artifacts/forever-simulator/optimization/baselines",
  `warrior-${baseline.variant}-feedback-${simulationHash(adapted).slice(0, 16)}.json`,
);
const serialized = JSON.stringify(adapted, null, 2) + "\n";
let existing;
try {
  existing = await readFile(destination, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (existing !== undefined)
  assert.equal(existing, serialized, "Immutable feedback baseline changed");
else {
  await writeFile(destination + ".pending", serialized);
  await rename(destination + ".pending", destination);
}
console.log(
  JSON.stringify({
    output: destination,
    gearConverged: result.converged,
    source: gearArgument,
    talents: result.talentsString,
  }),
);
