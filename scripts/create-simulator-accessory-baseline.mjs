import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { accessoryFeedbackSettings } from "../infra/simulator/accessory-feedback.mjs";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { describePrebisGear, prebisEnchantPolicy } from "../infra/simulator/prebis-enchants.mjs";
import { prebisSources } from "../infra/simulator/prebis-pool.mjs";
import { reviewPrebisFeedback } from "../infra/simulator/prebis-feedback.mjs";
import { campaignArtifactPath } from "../infra/simulator/prebis-campaign.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { acquireSimulatorWorkspace } from "../infra/simulator/simulator-workspace.mjs";

const root = resolve(import.meta.dirname, "..");
const args = new Map();
for (const value of process.argv.slice(2)) {
  const match = /^--(feedback-review|accessory-review)=(.+)$/.exec(value);
  assert(
    match && !args.has(match[1]),
    "Pass --feedback-review=<file> --accessory-review=<file> once each",
  );
  args.set(match[1], match[2]);
}
assert.equal(args.size, 2, "Pass --feedback-review=<file> --accessory-review=<file>");
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const lease = await acquireSimulatorWorkspace(
  root,
  campaignArtifactPath(root, args.get("accessory-review")),
);
try {
  const review = await read(campaignArtifactPath(root, args.get("feedback-review")));
  const audit = await read(campaignArtifactPath(root, args.get("accessory-review")));
  const [baseline, gearReview, talentReview, browserReview] = await Promise.all(
    ["baseline", "gear-review", "talent-review", "browser-review"].map((key) =>
      read(campaignArtifactPath(root, review.evidencePaths[key])),
    ),
  );
  const checked = reviewPrebisFeedback({ baseline, gearReview, talentReview, browserReview });
  for (const [key, value] of Object.entries(checked)) assert.deepEqual(review[key], value);
  const upstream = ".cache/forever-sim-upstream/";
  const [db, catalog, imports, inspection, craft, active] = await Promise.all(
    [
      upstream + "assets/database/db.json",
      upstream + "assets/db_inputs/forever_gear_catalog.json",
      upstream + "ui/core/kfc_prebis_import.json",
      upstream + "ui/core/kfc_inspection.json",
      "artifacts/forever-simulator/craft-acquisition.json",
      "artifacts/forever-simulator/active.json",
    ].map(read),
  );
  assert.equal(baseline.revision, active.revision);
  assert.equal(baseline.sourceRelease, active.release);
  const binary = await readFile(join(root, ".cache/simulator-toolchain/bin/kfc-prebis"));
  assert.equal(createHash("sha256").update(binary).digest("hex"), review.nativeBinarySha256);
  for (const [path, checksum] of Object.entries(audit.sourceHashes))
    assert.equal(
      createHash("sha256")
        .update(await readFile(resolve(root, path)))
        .digest("hex"),
      checksum,
      `Accessory audit source changed: ${path}`,
    );
  assert.deepEqual(
    await Promise.all(audit.inputPaths.map(async (path) => simulationHash(await read(path)))),
    audit.inputHashes,
    "Accessory audit inputs changed",
  );
  const sources = prebisSources(
    catalog,
    imports,
    craft,
    new Map(db.items.map((item) => [item.id, item])),
  );
  const settings = accessoryFeedbackSettings(baseline, review, audit, db, sources);
  describePrebisGear(
    settings.player.equipment,
    baseline.profile,
    baseline.variant,
    baseline.playerClass,
    db,
    inspection,
    prebisEnchantPolicy(baseline),
  );
  const captured = await captureSimulatorRequest(root, settings, {
    release: active.release,
    profile: baseline.profile,
    allowProvisionalEnchants: prebisEnchantPolicy(baseline).provisionalEffectIds.length > 0,
  });
  const adapted = globalThis.structuredClone(baseline);
  delete adapted.predecessor;
  delete adapted.rotationScenarioParent;
  Object.assign(adapted, {
    settings: captured.settings,
    requestBase64: captured.requestBase64,
    browserMetrics: captured.metrics,
    capturedAt: new Date().toISOString(),
    name: `${baseline.name} · confirmed accessory challenger, pending full feedback`,
    accessoryScenarioParent: {
      baselinePath: review.evidencePaths.baseline,
      baselineSha256: simulationHash(baseline),
      auditPath: args.get("accessory-review"),
      auditSha256: simulationHash(audit),
    },
    notice:
      baseline.notice +
      " Independently confirmed accessory improvement, recaptured in the current browser. No inherited convergence, rotation or public-recommendation claim: rerun full feedback.",
  });
  const output = join(
    root,
    "artifacts/forever-simulator/optimization/baselines",
    `warrior-${baseline.variant}-accessory-feedback-${simulationHash(adapted).slice(0, 16)}.json`,
  );
  await writeFile(output, JSON.stringify(adapted, null, 2) + "\n", { flag: "wx" });
  console.log(
    JSON.stringify({ output, status: "unreviewed-accessory-feedback", metrics: captured.metrics }),
  );
} finally {
  await lease.release();
}
