import assert from "node:assert/strict";
import { loadBlueControl } from "../infra/simulator/baseline-control.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { reviewedBuildExport } from "../infra/simulator/reviewed-build-export.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { resolvedWarriorPolicies } from "../infra/simulator/warrior-policies.mjs";
import { prebisContext, prebisSources, legalPrebisGear } from "../infra/simulator/prebis-pool.mjs";
import { hasCurrentPrebisCoverage } from "../infra/simulator/prebis-search-coverage.mjs";
import { describePrebisGear, prebisEnchantPolicy } from "../infra/simulator/prebis-enchants.mjs";
import { decodeTalents, talentProblem } from "../infra/simulator/talent-search.mjs";
import {
  preRaidConsumeSettings,
  weaponConsumeProblem,
} from "../infra/simulator/prebis-consumes.mjs";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
assert(
  args.length === 2 &&
    new Set(args.map((value) => value.split("=")[0])).size === 2 &&
    args.every((value) => /^--(feedback-review|rotation-review)=.+$/.test(value)),
  "Pass --feedback-review=<final-review.json> --rotation-review=<final-rotation-audit.json>",
);
const argument = (name) =>
  args.find((value) => value.startsWith(`--${name}=`)).slice(name.length + 3);
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const feedbackReview = await read(argument("feedback-review"));
const rotationReview = await read(argument("rotation-review"));
const paths = feedbackReview.evidencePaths;
assert(
  paths &&
    ["baseline", "gear-review", "talent-review", "browser-review"].every(
      (key) => typeof paths[key] === "string",
    ),
);
const [baseline, gearReview, talentReview, browserReview] = await Promise.all(
  ["baseline", "gear-review", "talent-review", "browser-review"].map((key) => read(paths[key])),
);
assert(["warrior/fury", "warrior/arms"].includes(`${baseline.profile}/${baseline.variant}`));
const upstream = ".cache/forever-sim-upstream/";
const [db, catalog, imports, inspection, craftAudit, trees, active] = await Promise.all(
  [
    upstream + "assets/database/db.json",
    upstream + "assets/db_inputs/forever_gear_catalog.json",
    upstream + "ui/core/kfc_prebis_import.json",
    upstream + "ui/core/kfc_inspection.json",
    "artifacts/forever-simulator/craft-acquisition.json",
    upstream + "ui/core/talents/trees/warrior.json",
    "artifacts/forever-simulator/active.json",
  ].map(read),
);
const { control: template } = await loadBlueControl(root, baseline);
assert.equal(baseline.dbSha256, simulationHash(db), "Compiled database changed");
assert.equal(baseline.revision, active.revision, "Engine revision changed");
assert.equal(talentReview.treeSha256, simulationHash(trees), "Talent tree changed");
assert.equal(
  talentProblem(trees, decodeTalents(trees, baseline.settings.player.talentsString)),
  "",
);
const nativeBinarySha256 = createHash("sha256")
  .update(await readFile(join(root, ".cache/simulator-toolchain/bin/kfc-prebis")))
  .digest("hex");
assert.equal(feedbackReview.nativeBinarySha256, nativeBinarySha256, "Native engine changed");
const items = new Map(db.items.map((item) => [item.id, item]));
const sources = prebisSources(catalog, imports, craftAudit, items);
const context = prebisContext(baseline, items);
assert(legalPrebisGear(baseline.settings.player.equipment, items, sources, context));
assert(
  hasCurrentPrebisCoverage(gearReview.result, baseline, db, sources, inspection, 100000),
  "Incomplete current gear/enchant coverage",
);
assert.deepEqual(feedbackReview.professions, context.professions);
assert.deepEqual(gearReview.result.professions, context.professions);
assert.equal(weaponConsumeProblem(baseline.settings, db), "");
assert.deepEqual(preRaidConsumeSettings(baseline, db).changes, [], "Known raid weapon consume");
assert.deepEqual(
  feedbackReview.provisionalIds,
  baseline.settings.player.equipment.items
    .filter((item) => sources.get(item.id)?.status === "classic-provisional")
    .map((item) => item.id),
);
assert.deepEqual(
  feedbackReview.provisionalAcquisitionIds ?? [],
  baseline.settings.player.equipment.items
    .filter((item) => sources.get(item.id)?.acquisitionProvenance === "historical-provisional")
    .map((item) => item.id),
  "Current-item acquisition provenance changed",
);
const enchants = describePrebisGear(
  baseline.settings.player.equipment,
  baseline.profile,
  baseline.variant,
  baseline.playerClass,
  db,
  inspection,
  prebisEnchantPolicy(baseline),
);
const result = reviewedBuildExport({
  baseline,
  feedbackReview,
  gearReview,
  talentReview,
  browserReview,
  rotationReview,
  rotationPolicies: resolvedWarriorPolicies(baseline, template, trees),
});
result.enchants = enchants.choices;
result.acquisition = {
  craftInputBuild: craftAudit.build,
  craftAuditSha256: simulationHash(craftAudit),
  notice: craftAudit.notice,
};
const directory = join(root, "artifacts/forever-simulator/optimization/reviewed-builds");
await mkdir(directory, { recursive: true });
const output = join(
  directory,
  `warrior-${baseline.variant}-${simulationHash(result).slice(0, 16)}.json`,
);
await writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" }).catch(
  async (error) => {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(await read(output), result, "Existing build export differs");
  },
);
console.log(
  JSON.stringify({
    output,
    referenceDps: result.referenceDps,
    validationIterations: result.validationIterations,
    requiresProvisionalEnchantOptIn: result.requiresProvisionalEnchantOptIn,
    notice: "Local reviewed export only. Public defaults and saved builds are unchanged.",
  }),
);
