import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { loadGearParityCodec } from "../artifacts/forever-simulator/optimization/review-tools/gear-parity-codec.mjs";
import {
  deriveHunterRangedPetConsumeTemplates,
  hunterRangedTemplatesForPet,
} from "../artifacts/forever-simulator/optimization/review-tools/hunter-ranged-pets-v1.mjs";
import { hunterGearRequest } from "../artifacts/forever-simulator/optimization/review-tools/hunter-gear-requests-v1.mjs";
import { feralStateRequest } from "../artifacts/forever-simulator/optimization/review-tools/feral-state-requests-v1.mjs";
import { balanceStateRequest } from "../artifacts/forever-simulator/optimization/review-tools/balance-state-requests-v1.mjs";
import { simulationHash as hash } from "../infra/simulator/simulation-cache.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function modelFirstPassShareHref(build, release, api) {
  assert(/^[a-f0-9]{24}$/.test(release));
  const bytes = api.IndividualSimSettings.toBinary(
    api.IndividualSimSettings.fromJson(build.settings),
  );
  return (
    `/forever-sim/${release}/${build.profile}/#` +
    deflateSync(Buffer.from(bytes)).toString("base64")
  );
}

export async function loadModelFirstPassInput(root, qualifiedPath, api) {
  const storage = await realpath(join(root, "artifacts/forever-simulator"));
  async function document(path) {
    const normalized = path.replace(/^artifacts\/forever-simulator\//, "");
    assert(
      normalized.startsWith("optimization/") ||
        /^[a-f0-9]{24}\/(?:manifest\.json|assets\/database\/db\.json)$/.test(normalized),
    );
    assert(
      !isAbsolute(normalized) &&
        !normalized.includes("\\") &&
        !normalized.includes("\0") &&
        !normalized.split("/").includes(".."),
    );
    const target = await realpath(resolve(storage, normalized));
    const offset = relative(storage, target);
    assert(offset && !isAbsolute(offset) && !offset.startsWith("../"));
    const info = await stat(target);
    const maximumBytes =
      /^optimization\/bounded-native-studies\/[a-f0-9]{64}\/result-[a-f0-9]{16}\.json$/.test(
        normalized,
      )
        ? 16_000_000
        : 8_000_000;
    assert(info.isFile() && info.size <= maximumBytes);
    const bytes = await readFile(target);
    assert.equal(bytes.length, info.size);
    return { bytes, value: JSON.parse(bytes) };
  }
  async function reference(ref) {
    assert(/^[a-f0-9]{64}$/.test(ref.sha256));
    const value = await document(ref.path);
    assert.equal(hash(value.value), ref.sha256, "Model first-pass evidence changed: " + ref.path);
    if (ref.byteSha256) assert.equal(sha(value.bytes), ref.byteSha256);
    return value.value;
  }
  assert(/^optimization\/[a-z0-9-]+\/qualified-build\.json$/.test(qualifiedPath));
  const qualified = (await document(qualifiedPath)).value;
  assert.equal(qualified.publicationAllowed, false);
  const rawBuild = await reference(qualified.build);
  const freshSurvival = rawBuild.id === "hunter-survival-static";
  const feral = rawBuild.id === "feral-cat-static";
  const balance = rawBuild.id === "balance-static";
  const fresh = freshSurvival || feral || balance;
  assert.equal(
    qualified.schema,
    fresh ? "kfc-fresh-first-pass-qualified-build.v1" : "kfc-model-first-pass-qualified-build.v1",
  );
  assert.equal(
    rawBuild.schema,
    fresh ? "kfc-fresh-first-pass-build.v1" : "kfc-model-first-pass-build.v1",
  );
  assert.equal(
    rawBuild.id,
    balance
      ? "balance-static"
      : feral
        ? "feral-cat-static"
        : freshSurvival
          ? "hunter-survival-static"
          : "hunter-marksmanship-static",
  );
  assert.equal(rawBuild.sourceRelease, qualified.sourceRelease);
  const manifest = (await document(rawBuild.sourceRelease + "/manifest.json")).value;
  const db = (await document(rawBuild.sourceRelease + "/assets/database/db.json")).value;
  const declaration = await reference(rawBuild.evidence.confirmationDeclaration);
  const codec = await loadGearParityCodec(root);
  assert.equal(codec.codecSha256, declaration.backend.codecSha256);
  let requestTemplates;
  if (feral || balance) {
    assert.equal(qualified.browserHandoffRequired, true);
    const state = await reference(rawBuild.evidence.stateResult);
    const stateDeclaration = await reference(state.declaration);
    requestTemplates = declaration.confirmationPlan.originalPlan.arms.map((arm) => {
      const input = (balance ? balanceStateRequest : feralStateRequest)({
        settings: arm.settings,
        gear: arm.settings.player.equipment,
        templates: stateDeclaration.templates,
        db,
        candidate: {
          state: arm.state,
          talentsString: arm.settings.player.talentsString,
          rotation: arm.settings.player.rotation,
        },
        iterations: 10000,
        seed: 77191,
      });
      assert.equal(hash(input), arm.inspected.id);
      return { arm: arm.name, requestBase64: input.requestBase64 };
    });
  } else {
    let captured;
    if (freshSurvival) {
      assert.equal(qualified.browserHandoffRequired, true);
      const blue = await reference(rawBuild.evidence.blueResult);
      const blueDeclaration = await reference(blue.declaration);
      const prepared = await reference(blueDeclaration.capture);
      const controlKey = blue.semantic.evaluation.selected.controlKey;
      assert(typeof controlKey === "string" && controlKey.includes("|"));
      const source = prepared.records.find((row) => row.label === controlKey.replace("|", "-"));
      assert(source?.captured && typeof source.captured.requestBase64 === "string");
      captured = source.captured;
    } else {
      const selectionResult = await reference(rawBuild.evidence.selectionResult);
      const selectionDeclaration = await reference(selectionResult.declaration);
      const sourcePin = selectionDeclaration.sourcePins.find((pin) =>
        pin.path.endsWith(
          "/hunter-marksmanship-item-skill-correction-v1/selected-source-browser.json",
        ),
      );
      assert(sourcePin);
      const source = await document(sourcePin.path);
      assert.equal(sha(source.bytes), sourcePin.byteSha256);
      captured = source.value;
    }
    const templates = deriveHunterRangedPetConsumeTemplates(codec.api, captured.requestBase64);
    requestTemplates = declaration.confirmationPlan.originalPlan.arms.map((arm) => {
      const input = hunterGearRequest({
        settings: arm.settings,
        gear: arm.settings.player.equipment,
        templates: hunterRangedTemplatesForPet(
          templates,
          arm.settings.player.hunter.options.petType ?? "PetNone",
        ),
        db,
        iterations: 10000,
        seed: 77191,
      });
      assert.equal(hash(input), arm.inspected.id);
      return { arm: arm.name, requestBase64: input.requestBase64 };
    });
  }
  const entry = {
    id: rawBuild.id,
    profile: rawBuild.profile,
    build: qualified.build,
    settingsSha256: hash(rawBuild.settings),
    hrefSha256: sha(modelFirstPassShareHref(rawBuild, rawBuild.sourceRelease, api)),
    referenceDps: rawBuild.referenceDps,
    validationIterations: rawBuild.validationIterations,
    requestTemplates,
  };
  await api.readSimulatorModelFirstPassBuild(entry, {
    sourceRelease: manifest.release,
    revision: manifest.revision,
    databaseSha256: hash(db),
    reference,
  });
  // Keep authenticated serialization order for content hashes and frozen preset inputs.
  return { build: rawBuild, reference: qualified.build, entry, qualifiedPath };
}

export async function loadCumulativeModelFirstPassInputs(root, qualifiedPath, api) {
  const directory = join(root, "artifacts/forever-simulator");
  const previous = await api.readSimulatorModelUpdate("hunter", directory);
  const builds = new Map();
  if (previous) {
    const bytes = await readFile(
      join(directory, previous.manifest.release, "kfc-reviewed-presets.json"),
    );
    assert.equal(sha(bytes), previous.manifest.files["kfc-reviewed-presets.json"].sha256);
    const proof = JSON.parse(bytes);
    for (const entry of proof.firstPassBuilds ?? []) {
      const path = entry.build.path
        .replace(/^artifacts\/forever-simulator\//, "")
        .replace(/\/build-[a-f0-9]{16}\.json$/, "/qualified-build.json");
      const input = await loadModelFirstPassInput(root, path, api);
      assert.deepEqual(input.reference, entry.build);
      assert.equal(input.entry.settingsSha256, entry.settingsSha256);
      assert.equal(input.entry.referenceDps, entry.referenceDps);
      assert.equal(input.entry.validationIterations, entry.validationIterations);
      assert(!builds.has(input.build.id), "Duplicate previously approved first-pass build");
      builds.set(input.build.id, input);
    }
  }
  if (qualifiedPath) {
    const incoming = await loadModelFirstPassInput(root, qualifiedPath, api);
    builds.set(incoming.build.id, incoming);
  }
  assert(builds.size <= 24);
  return [...builds.values()].sort((left, right) =>
    left.build.id.localeCompare(right.build.id, "en"),
  );
}
