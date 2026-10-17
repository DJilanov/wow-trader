import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import process from "node:process";
import console from "node:console";
import { reviewPrebisFeedback } from "../infra/simulator/prebis-feedback.mjs";
import { prebisSources, prebisContext, legalPrebisGear } from "../infra/simulator/prebis-pool.mjs";
import { describePrebisGear, prebisEnchantPolicy } from "../infra/simulator/prebis-enchants.mjs";
import { talentProblem, decodeTalents } from "../infra/simulator/talent-search.mjs";
import {
  preRaidConsumeSettings,
  weaponConsumeProblem,
} from "../infra/simulator/prebis-consumes.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";

const root = resolve(import.meta.dirname, "..");
const argument = (name) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const paths = Object.fromEntries(
  ["baseline", "gear-review", "talent-review", "browser-review"].map((name) => {
    const path = argument(name);
    if (!path) throw new Error(`Pass --${name}=<evidence.json>`);
    return [name, path];
  }),
);
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const baseline = await read(paths.baseline);
assert(
  ["warrior/fury", "warrior/arms"].includes(`${baseline.profile}/${baseline.variant}`),
  "Only reviewed warrior policies are available so far",
);
const gearReview = await read(paths["gear-review"]);
const talentReview = await read(paths["talent-review"]);
const browserReview = await read(paths["browser-review"]);
const report = reviewPrebisFeedback({ baseline, gearReview, talentReview, browserReview });
const upstream = ".cache/forever-sim-upstream/";
const db = await read(upstream + "assets/database/db.json");
assert.equal(simulationHash(db), report.dbSha256, "Compiled database changed");
const catalog = await read(upstream + "assets/db_inputs/forever_gear_catalog.json");
const imports = await read(upstream + "ui/core/kfc_prebis_import.json");
const inspection = await read(upstream + "ui/core/kfc_inspection.json");
const craftAudit = await read("artifacts/forever-simulator/craft-acquisition.json");
const items = new Map(db.items.map((item) => [item.id, item]));
const sources = prebisSources(catalog, imports, craftAudit, items);
const context = prebisContext(baseline, items);
assert.equal(weaponConsumeProblem(baseline.settings, db), "", "Incompatible final weapon consume");
assert(
  legalPrebisGear(gearReview.result.gear, items, sources, context),
  "Equipment no longer meets current pre-raid eligibility",
);
assert.deepEqual(gearReview.result.professions, context.professions);
describePrebisGear(
  gearReview.result.gear,
  baseline.profile,
  baseline.variant,
  baseline.playerClass,
  db,
  inspection,
  prebisEnchantPolicy(baseline),
);
const trees = await read(upstream + `ui/core/talents/trees/${baseline.profile}.json`);
assert.equal(simulationHash(trees), talentReview.treeSha256, "Talent tree changed");
assert.equal(
  talentProblem(trees, decodeTalents(trees, baseline.settings.player.talentsString)),
  "",
);
const binarySha256 = createHash("sha256")
  .update(await readFile(join(root, ".cache/simulator-toolchain/bin/kfc-prebis")))
  .digest("hex");
assert.equal(binarySha256, report.nativeBinarySha256, "Native combat binary changed");
report.evidencePaths = paths;
report.professions = context.professions;
report.enchantPolicy = prebisEnchantPolicy(baseline);
report.provisionalIds = baseline.settings.player.equipment.items
  .filter((item) => sources.get(item.id)?.status === "classic-provisional")
  .map((item) => item.id);
assert.deepEqual(
  report.provisionalAcquisitionIds ?? [],
  baseline.settings.player.equipment.items
    .filter((item) => sources.get(item.id)?.acquisitionProvenance === "historical-provisional")
    .map((item) => item.id),
  "Current-item acquisition provenance differs from the completed search",
);
report.knownRaidWeaponConsumes = preRaidConsumeSettings(baseline, db).changes;
report.acquisitionNotice = craftAudit.notice;
report.pvpAccess =
  "No honor-rank or reputation cap; Rank 14 and exalted rewards may be selected. Not a launch-day or low-cost loadout.";
const output = join(
  root,
  "artifacts/forever-simulator/optimization",
  `feedback-review-${simulationHash(report).slice(0, 16)}.json`,
);
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    output,
    status: report.status,
    referenceDps: report.referenceDps,
    iterations: report.iterations,
    knownRaidWeaponConsumes: report.knownRaidWeaponConsumes,
  }),
);
