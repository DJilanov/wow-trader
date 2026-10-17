import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import process from "node:process";
import console from "node:console";
import {
  createFuryBlueBaseline,
  createArmsBlueBaseline,
} from "../infra/simulator/optimization-baselines.mjs";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { prebisSources } from "../infra/simulator/prebis-pool.mjs";
import { decodeTalents, talentProblem } from "../infra/simulator/talent-search.mjs";
import { createBlueControlArtifacts } from "../infra/simulator/baseline-control.mjs";
import {
  preRaidConsumeSettings,
  weaponConsumeProblem,
} from "../infra/simulator/prebis-consumes.mjs";

const root = resolve(import.meta.dirname, "..");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const directory = join(root, "artifacts/forever-simulator");
const spec = process.argv.find((value) => value.startsWith("--spec="))?.slice(7) ?? "warrior/fury";
assert(
  ["warrior/fury", "warrior/arms"].includes(spec),
  "Use --spec=warrior/fury or --spec=warrior/arms",
);
assert(
  process.argv.slice(2).every((value) => /^--(faction|spec)=.+$/.test(value)),
  "Use --spec/--faction only; captures are immutable and --replace is no longer supported",
);
assert.equal(
  new Set(process.argv.slice(2).map((value) => value.split("=")[0])).size,
  process.argv.length - 2,
  "Repeated baseline argument",
);
const factionArgument =
  process.argv.find((value) => value.startsWith("--faction="))?.slice(10) ?? "horde";
assert(
  ["alliance", "horde"].includes(factionArgument),
  "Use --faction=alliance or --faction=horde",
);
const faction = factionArgument === "alliance" ? "Alliance" : "Horde";
const variant = spec.split("/")[1];
const manifest = await read(join(directory, "active.json"));
const captured = await read(join(directory, "optimization/requests.json"));
assert.equal(captured.revision, manifest.revision);
const profile = captured.profiles.find(
  (entry) => entry.profile === "warrior" && entry.variant === variant,
);
assert(profile, `Missing captured profile ${spec}`);
const source = join(root, ".cache/forever-sim-upstream");
const db = await read(join(source, "assets/database/db.json"));
assert.deepEqual(
  db,
  await read(join(directory, manifest.release, "assets/database/db.json")),
  "Browser and native databases differ",
);
const catalog = await read(join(source, "assets/db_inputs/forever_gear_catalog.json"));
const imports = await read(join(source, "ui/core/kfc_prebis_import.json"));
const inspection = await read(join(source, "ui/core/kfc_inspection.json"));
const audit = await read(join(directory, "craft-acquisition.json"));
const sources = prebisSources(
  catalog,
  imports,
  audit,
  new Map(db.items.map((item) => [item.id, item])),
);
const createBaseline = variant === "arms" ? createArmsBlueBaseline : createFuryBlueBaseline;
const baseline = createBaseline(profile, db, sources, inspection, { faction });
const consumes = preRaidConsumeSettings(
  { schema: "kfc-optimization-baseline.v1", settings: baseline.settings },
  db,
);
baseline.settings = consumes.settings;
assert.equal(weaponConsumeProblem(baseline.settings, db), "");
if (consumes.changes.length) baseline.notice += " " + consumes.notice;
const trees = await read(join(source, "ui/core/talents/trees/warrior.json"));
assert.equal(
  talentProblem(trees, decodeTalents(trees, baseline.settings.player.talentsString)),
  "",
);
const result = await captureSimulatorRequest(root, baseline.settings, {
  release: manifest.release,
  profile: "warrior",
  iterations: 10,
});
assert.equal(result.settings.player.foreverTier1Bonuses ?? false, false);
assert.equal(result.settings.player.warrior.options.startingRage ?? 0, 0);
assert.equal(result.settings.player.profession2, "Blacksmithing");
assert.equal(result.settings.player.race, faction === "Alliance" ? "RaceHuman" : "RaceOrc");
assert.equal(result.settings.settings.faction, faction);
assert.equal(result.settings.partyBuffs.windfuryTotem, true);
const sha = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const artifact = {
  schema: "kfc-optimization-baseline.v1",
  sourceRelease: manifest.release,
  revision: manifest.revision,
  dbSha256: sha(db),
  inspectionSha256: sha(inspection),
  profile: profile.profile,
  variant: profile.variant,
  playerClass: profile.playerClass,
  name: `${profile.name} · ${faction} fixed PvP blue baseline`,
  acquisitionAuditSha256: sha(audit),
  notice: baseline.notice,
  coreIds: baseline.coreIds,
  requestBase64: result.requestBase64,
  settings: result.settings,
  capturedAt: new Date().toISOString(),
  browserMetrics: result.metrics,
};
const artifacts = createBlueControlArtifacts(artifact);
await mkdir(join(directory, "optimization/baselines"), { recursive: true });
for (const [path, value] of [
  [artifacts.controlPath, artifacts.control],
  [artifacts.baselinePath, artifacts.baseline],
]) {
  const serialized = JSON.stringify(value, null, 2) + "\n";
  try {
    await writeFile(join(root, path), serialized, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.equal(
      await readFile(join(root, path), "utf8"),
      serialized,
      "Immutable blue artifact changed",
    );
  }
}
console.log(
  JSON.stringify({
    output: join(root, artifacts.baselinePath),
    control: artifacts.baseline.controlBaseline,
    gear: result.settings.player.equipment,
    metrics: artifact.browserMetrics,
    notice: baseline.notice,
  }),
);
