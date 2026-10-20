import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { simulationHash as hash } from "../infra/simulator/simulation-cache.mjs";
import { presentationPresetFiles } from "../artifacts/forever-simulator/optimization/review-tools/reviewed-preset-presentation.mjs";
import { firstPassWarriorPresetFiles } from "../artifacts/forever-simulator/optimization/review-tools/first-pass-preset-overlay.mjs";
import { rogueCombatPresetFiles } from "../artifacts/forever-simulator/optimization/review-tools/rogue-combat-preset-overlay.mjs";
import { mutilateFirstPassPresetFiles } from "../artifacts/forever-simulator/optimization/review-tools/rogue-mutilate-preset-overlay-v1.mjs";
import { subtletyFirstPassPresetFiles } from "../artifacts/forever-simulator/optimization/review-tools/rogue-subtlety-preset-overlay-v1.mjs";
import { hunterBeastMasteryPresetFiles } from "../artifacts/forever-simulator/optimization/review-tools/hunter-beast-mastery-preset-overlay-v1.mjs";

// Reconstruct the exact already-approved virtual files, not another numerical search.
export async function loadReviewedPresetInputs(root, api) {
  const directory = join(root, "artifacts/forever-simulator");
  const upstream = join(root, ".cache/forever-sim-upstream");
  const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
  const source = (profile, name) => readFile(join(upstream, "ui", profile, name), "utf8");
  const reference = async (ref) => {
    const value = await read(ref.path);
    assert.equal(hash(value), ref.sha256);
    return value;
  };
  const files = [];
  const parents = {};
  const reviewed = [];
  for (const profile of ["warrior", "rogue", "hunter"]) {
    const presentation = await api.readSimulatorPresentation(profile, directory);
    assert.equal(presentation?.kind, "reviewed-presets", `Missing ${profile} approval`);
    const builds = await api.readPublishedSimulatorReviews(presentation, profile, directory);
    assert.equal(builds.length, { warrior: 5, rogue: 3, hunter: 1 }[profile]);
    const proof = await read(
      `artifacts/forever-simulator/${presentation.manifest.release}/kfc-reviewed-presets.json`,
    );
    parents[profile] = presentation.manifest.release;
    reviewed.push(...builds);
    const tree = await read(`.cache/forever-sim-upstream/ui/core/talents/trees/${profile}.json`);
    const delivery = async (entry) => ({
      build: await reference(entry.build),
      review: builds.find((build) => build.id === entry.caseId),
    });
    let overlay;
    if (profile === "warrior") {
      const exports = await Promise.all(
        proof.reviewedExports.map((entry) => reference(entry.evidence.exported)),
      );
      const staging = await read(
        "artifacts/forever-simulator/optimization/reviews/reviewed-preset-staging-00bd0f61e51932f3.json",
      );
      const entry = proof.firstPassBuilds[0];
      overlay = firstPassWarriorPresetFiles({
        presentation: presentationPresetFiles(staging, exports),
        delivery: await delivery(entry),
        buildReference: entry.build,
        shareReference: entry.share,
        trees: tree,
      });
    } else if (profile === "rogue") {
      const [combat, mutilate, subtlety] = proof.classBuilds;
      const first = rogueCombatPresetFiles({
        source: await source(profile, "presets.ts"),
        simulatorSource: await source(profile, "sim.ts"),
        delivery: await delivery(combat),
        buildReference: combat.build,
        shareReference: combat.share,
        trees: tree,
      });
      const second = mutilateFirstPassPresetFiles({
        combatPresentation: first,
        delivery: await delivery(mutilate),
        buildReference: mutilate.build,
        shareReference: mutilate.share,
        trees: tree,
      });
      overlay = subtletyFirstPassPresetFiles({
        practicalPresentation: second,
        delivery: await delivery(subtlety),
        buildReference: subtlety.build,
        shareReference: subtlety.share,
        trees: tree,
      });
    } else {
      const entry = proof.classBuilds[0];
      overlay = hunterBeastMasteryPresetFiles({
        source: await source(profile, "presets.ts"),
        simulatorSource: await source(profile, "sim.ts"),
        delivery: await delivery(entry),
        buildReference: entry.build,
        shareReference: entry.share,
        trees: tree,
      });
    }
    assert.equal(
      hash(overlay),
      proof.presentationInputSha256,
      `${profile} approved preset reconstruction changed`,
    );
    assert.deepEqual(
      overlay.files.map(({ path, sha256 }) => ({ path, sha256 })),
      proof.virtualSourceFiles,
    );
    for (const file of overlay.files) {
      assert.equal(createHash("sha256").update(file.content).digest("hex"), file.sha256);
      files.push(file);
    }
  }
  return { files, parents, reviewed };
}
