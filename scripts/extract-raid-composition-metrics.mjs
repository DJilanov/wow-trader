import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    codec: { type: "string" },
    "codec-sha256": {
      type: "string",
      default: "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
    },
    "evidence-root": {
      type: "string",
      default: "artifacts/forever-simulator/optimization/current-tier-refresh-20261028/evidence",
    },
    output: {
      type: "string",
      default: "apps/web/src/lib/data/forever-raid-composition-metrics.json",
    },
    "tank-output": {
      type: "string",
      default: "apps/web/src/lib/data/forever-raid-tank-incoming.json",
    },
  },
});
assert(values.codec, "Provide --codec=/absolute/path/to/the/admitted/codec-node.mjs");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const codec = resolve(values.codec);
assert.match(values["codec-sha256"], /^[a-f0-9]{64}$/);
assert.equal(hash(await readFile(codec)), values["codec-sha256"], "Codec checksum changed");
const api = await import(pathToFileURL(codec));
const snapshot = JSON.parse(
  await readFile(
    join(root, "apps/web/src/lib/data/forever-dps-tier-list.current.raid.json"),
    "utf8",
  ),
);
assert.equal(snapshot.policy.scenario, "raid");
const evidenceRoot = resolve(root, values["evidence-root"]);
const paths = (await readdir(evidenceRoot)).filter(
  (path) => path.startsWith("raid-") && path.endsWith(".json"),
);
const saved = await Promise.all(
  paths.map(async (path) => JSON.parse(await readFile(join(evidenceRoot, path), "utf8"))),
);
const entries = snapshot.entries.map((entry) => {
  const matches = saved.filter(
    (proof) => hash(Uint8Array.from(proof.result)) === entry.responseSha256,
  );
  assert.equal(matches.length, 1, "An exact unique measurement is required for " + entry.id);
  const proof = matches[0];
  assert.equal(typeof proof.request, "string");
  assert.equal(hash(proof.request), proof.requestSha256);
  assert.equal(hash(JSON.stringify(proof.result)), proof.resultSha256);
  const bytes = Buffer.from(proof.request, "base64");
  assert.equal(hash(bytes), entry.requestSha256);
  const result = api.RaidSimResult.fromBinary(Uint8Array.from(proof.result));
  assert(!result.error?.message, result.error?.message);
  assert.equal(result.iterationsDone, entry.iterations);
  assert.equal(result.avgIterationDuration, snapshot.policy.durationSeconds);
  const players = result.raidMetrics.parties.flatMap((party) => party.players);
  assert.equal(players.length, 1);
  const player = players[0];
  assert.equal(player.dps.avg, entry.dps, "DPS does not match the published measurement");
  assert(Number.isFinite(player.threat.avg) && player.threat.avg >= 0);
  const petThreat = (pets) =>
    pets.reduce((sum, pet) => {
      assert(Number.isFinite(pet.threat.avg) && pet.threat.avg >= 0);
      return sum + pet.threat.avg + petThreat(pet.pets);
    }, 0);
  return {
    id: entry.id,
    dps: player.dps.avg,
    threatPerSecond: player.threat.avg,
    petThreatPerSecond: petThreat(player.pets),
    requestSha256: entry.requestSha256,
    responseSha256: entry.responseSha256,
    capturedAt: entry.capturedAt,
  };
});
await writeFile(
  resolve(root, values.output),
  JSON.stringify(
    {
      schema: "kfc-forever-composition-metrics.v1",
      scenario: "raid",
      policySha256: snapshot.policySha256,
      durationSeconds: snapshot.policy.durationSeconds,
      codecSha256: values["codec-sha256"],
      entries,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    status: "extracted-existing-evidence",
    entries: entries.length,
    newSimulations: 0,
  }),
);

const tankSnapshot = JSON.parse(
  await readFile(
    join(root, "apps/web/src/lib/data/forever-tank-tier-list.current.raid.json"),
    "utf8",
  ),
);
const tankPaths = (await readdir(evidenceRoot)).filter(
  (path) => path.startsWith("tank-raid-") && path.endsWith(".json"),
);
const tankProofs = await Promise.all(
  tankPaths.map(async (path) => JSON.parse(await readFile(join(evidenceRoot, path), "utf8"))),
);
const incoming = tankSnapshot.entries
  .filter((entry) => entry.objective === "mitigation")
  .map((entry) => {
    const matches = tankProofs.filter(
      (proof) => proof.identity.release === entry.release && proof.capturedAt === entry.capturedAt,
    );
    assert.equal(matches.length, 1, "Exact incoming-damage proof required for " + entry.id);
    const proof = matches[0];
    assert.equal(proof.identity.wasmSha256, entry.wasmSha256);
    assert.equal(proof.identity.policySha256, tankSnapshot.policySha256);
    assert.equal(hash(proof.request), proof.requestSha256);
    assert.equal(hash(JSON.stringify(proof.result)), proof.resultSha256);
    const request = api.RaidSimRequest.fromBinary(Buffer.from(proof.request, "base64"));
    assert.equal(request.encounter.targets.length, 1);
    const target = request.encounter.targets[0];
    assert.equal(target.minBaseDamage, tankSnapshot.policy.minBaseDamage);
    assert.equal(target.damageSpread, tankSnapshot.policy.damageSpread);
    assert.equal(target.swingSpeed, tankSnapshot.policy.swingSpeed);
    // The admitted comparison clears all target stats except armor; no boss AP is added.
    assert(target.stats.every((value, index) => index === 26 || value === 0));
    const result = api.RaidSimResult.fromBinary(Uint8Array.from(proof.result));
    assert.equal(result.iterationsDone, entry.iterations);
    assert.equal(result.avgIterationDuration, tankSnapshot.policy.durationSeconds);
    const player = result.raidMetrics.parties[0].players[0];
    assert.equal(player.dtps.avg, entry.metrics.dtps.avg);
    assert.equal(player.dps.avg, entry.metrics.dps.avg);
    assert.equal(player.threat.avg, entry.metrics.threat.avg);
    const attacks = result.encounterMetrics.targets[0].actions
      .filter((action) => action.isMelee)
      .flatMap((action) => action.targets)
      .filter((outcome) => outcome.casts > 0);
    const sum = (key) => attacks.reduce((value, outcome) => value + outcome[key], 0);
    const casts = sum("casts"),
      damage = sum("damage");
    assert(casts > 0);
    const divisor = entry.iterations * tankSnapshot.policy.durationSeconds;
    assert(Math.abs(damage / divisor - player.dtps.avg) < 1e-6);
    assert.equal(
      sum("tickDamage") + sum("critTickDamage") + sum("resistedHits") + sum("resistedCrits"),
      0,
    );
    const categories = [
      ["avoided", sum("misses") + sum("dodges") + sum("parries"), 0],
      ["critical", sum("crits"), sum("critDamage")],
      ["crushing", sum("crushes"), sum("crushDamage")],
      ["blocked", sum("blocks"), sum("blockDamage")],
      ["blocked-critical", sum("blockedCrits"), sum("blockedCritDamage")],
      ["glancing", sum("glances"), sum("glanceDamage")],
    ];
    categories.push([
      "normal",
      sum("hits"),
      damage - categories.reduce((value, row) => value + row[2], 0),
    ]);
    assert.equal(
      categories.reduce((value, row) => value + row[1], 0),
      casts,
    );
    const outcomes = categories
      .filter(([, count]) => count > 0)
      .map(([kind, count, totalDamage]) => ({
        kind,
        probability: count / casts,
        damage: totalDamage / count,
      }));
    const swingSeconds = divisor / casts;
    const meanDamage = outcomes.reduce(
      (value, outcome) => value + outcome.probability * outcome.damage,
      0,
    );
    assert(Math.abs(meanDamage / swingSeconds - player.dtps.avg) < 1e-6);
    return {
      id: entry.id,
      release: entry.release,
      objective: entry.objective,
      capturedAt: entry.capturedAt,
      manifestSha256: entry.manifestSha256,
      proofSha256: entry.proofSha256,
      settingsSha256: entry.settingsSha256,
      requestSha256: hash(Buffer.from(proof.request, "base64")),
      responseSha256: hash(Uint8Array.from(proof.result)),
      dps: player.dps.avg,
      tps: player.threat.avg,
      dtps: player.dtps.avg,
      health: entry.health,
      armor: entry.armor,
      rawDps: (target.minBaseDamage * (1 + target.damageSpread / 2)) / target.swingSpeed,
      swingSeconds,
      outcomes,
    };
  });
assert.equal(incoming.length, 3);
await writeFile(
  resolve(root, values["tank-output"]),
  JSON.stringify(
    {
      schema: "kfc-forever-composition-incoming.v1",
      scenario: "raid",
      policySha256: tankSnapshot.policySha256,
      entries: incoming,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    status: "extracted-incoming-distributions",
    tanks: incoming.length,
    newSimulations: 0,
  }),
);
