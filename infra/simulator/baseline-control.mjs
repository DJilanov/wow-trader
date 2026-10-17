import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { simulationHash } from "./simulation-cache.mjs";

const directory = "artifacts/forever-simulator/optimization/baselines";
const digestPattern = /^[a-f0-9]{64}$/;

function assertControl(control, baseline) {
  assert.equal(control.schema, "kfc-optimization-baseline.v1");
  for (const field of ["profile", "variant", "playerClass", "revision", "dbSha256"])
    assert.equal(control[field], baseline[field], `Fixed blue control ${field} changed`);
  assert(
    Array.isArray(control.coreIds) && control.coreIds.length === 8,
    "Not a fixed blue control",
  );
  assert.equal(new Set(control.coreIds).size, 8, "Duplicate blue control item");
  assert(
    control.coreIds.every(
      (id) =>
        Number.isSafeInteger(id) &&
        id > 0 &&
        control.settings.player.equipment.items.some((item) => item.id === id),
    ),
    "Missing fixed blue control equipment",
  );
  assert(!control.controlBaseline, "Blue control references cannot form chains");
}

export function createBlueControlArtifacts(artifact) {
  assert(["warrior/fury", "warrior/arms"].includes(`${artifact.profile}/${artifact.variant}`));
  assert.equal(artifact.playerClass, 9);
  assert(digestPattern.test(artifact.dbSha256));
  assertControl(artifact, artifact);
  const faction = artifact.settings.settings.faction;
  assert(["Alliance", "Horde"].includes(faction));
  const stem = `warrior-${artifact.variant}-${faction.toLowerCase()}-blue`;
  const control = globalThis.structuredClone(artifact);
  const controlSha256 = simulationHash(control);
  const controlPath = `${directory}/${stem}-control-${controlSha256.slice(0, 16)}.json`;
  const baseline = {
    ...globalThis.structuredClone(artifact),
    controlBaseline: { path: controlPath, sha256: controlSha256 },
  };
  return {
    control,
    controlPath,
    baseline,
    baselinePath: `${directory}/${stem}-${simulationHash(baseline).slice(0, 16)}.json`,
  };
}

export async function loadBlueControl(root, baseline) {
  assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
  assert(["warrior/fury", "warrior/arms"].includes(`${baseline.profile}/${baseline.variant}`));
  const reference = baseline.controlBaseline;
  let path;
  if (reference !== undefined) {
    assert(reference && typeof reference === "object" && !Array.isArray(reference));
    assert.deepEqual(Object.keys(reference).sort(), ["path", "sha256"]);
    assert.equal(typeof reference.path, "string");
    assert(digestPattern.test(reference.sha256), "Invalid blue control checksum");
    const file = reference.path.slice(directory.length + 1);
    assert(
      reference.path.startsWith(directory + "/") && /^[a-z0-9][a-z0-9._-]*\.json$/.test(file),
      "Blue control must be an artifact in the baseline directory",
    );
    path = reference.path;
  } else {
    // Legacy artifacts keep their original template; never redirect them to a new catalog.
    path = `${directory}/${baseline.variant === "arms" ? "warrior-arms-alliance" : "warrior-fury"}-blue.json`;
  }
  const bytes = await readFile(join(root, path));
  assert(bytes.length <= 2_000_000, "Blue control is too large");
  const control = JSON.parse(bytes.toString("utf8"));
  const sha256 = simulationHash(control);
  if (reference) assert.equal(sha256, reference.sha256, "Referenced blue control checksum changed");
  assertControl(control, baseline);
  if (reference) {
    assert.equal(
      control.settings.player.race,
      baseline.settings.player.race,
      "Blue control race changed",
    );
    assert.equal(
      control.settings.settings.faction,
      baseline.settings.settings.faction,
      "Blue control faction changed",
    );
  }
  return { control, path, sha256 };
}

export function assertUnchangedEquippedData(baseline, archivedDb, currentDb) {
  assert.equal(simulationHash(archivedDb), baseline.dbSha256, "Archived database checksum changed");
  assert.equal(baseline.settings.player.equipment.items.length, 17);
  const archived = new Map(archivedDb.items.map((item) => [item.id, item]));
  const current = new Map(currentDb.items.map((item) => [item.id, item]));
  const enchantIds = new Set();
  for (const item of baseline.settings.player.equipment.items) {
    if (!item.id) continue;
    assert(archived.has(item.id) && current.has(item.id), `Missing equipped item ${item.id}`);
    assert.deepEqual(
      current.get(item.id),
      archived.get(item.id),
      `Equipped item ${item.id} changed; adapt explicitly`,
    );
    if (item.enchant) enchantIds.add(item.enchant);
  }
  for (const effectId of enchantIds) {
    const previous = archivedDb.enchants.filter((row) => row.effectId === effectId);
    assert(previous.length > 0, `Missing archived enchant ${effectId}`);
    assert.deepEqual(
      currentDb.enchants.filter((row) => row.effectId === effectId),
      previous,
      `Equipped enchant ${effectId} changed; adapt explicitly`,
    );
  }
}
