import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { simulationHash } from "./simulation-cache.mjs";
import { tankSearchMetric } from "./tank-optimization.mjs";

export function tankEvidenceInput(requestBase64, gear, duration, iterations, seed) {
  assert(typeof requestBase64 === "string" && requestBase64.length > 0);
  assert(gear.items?.length === 17);
  assert([60, 300].includes(duration));
  assert(Number.isSafeInteger(iterations) && iterations > 0);
  assert(Number.isSafeInteger(seed) && seed > 0);
  return { requestBase64, gear: gear.items, duration, iterations, seed, detail: true };
}

export function tankEvidenceFingerprint(engine, requestBase64) {
  assert(/^[a-f0-9]{64}$/.test(engine));
  return simulationHash({ engine, request: simulationHash(requestBase64), summary: 1 });
}

export async function readTankEvidence(directory, fingerprint, input) {
  assert(/^[a-f0-9]{64}$/.test(fingerprint));
  const id = simulationHash(input);
  const path = join(directory, fingerprint, id + ".json");
  const record = JSON.parse(await readFile(path, "utf8"));
  assert.equal(record.schema, "kfc-simulation-evidence.v1");
  assert.equal(record.fingerprint, fingerprint, "Tank cache engine/request changed");
  assert.equal(record.requestSha256, id, "Tank cache request checksum changed");
  const result = record.result;
  assert.equal(result.id, id, "Tank result belongs to another request");
  assert.equal(result.iterations, input.iterations, "Tank sampling count changed");
  assert(!result.error, result.error);
  assert(Number.isFinite(result.dps) && result.dps > 0);
  assert(Number.isFinite(result.stdev) && result.stdev >= 0);
  assert.equal(result.metrics?.dps?.avg, result.dps, "Tank DPS counters disagree");
  assert.equal(result.metrics?.dps?.stdev, result.stdev, "Tank DPS variance counters disagree");
  assert(Number.isFinite(result.armor) && result.armor >= 0);
  tankSearchMetric(result, "threat");
  tankSearchMetric(result, "mitigation");
  return result;
}
