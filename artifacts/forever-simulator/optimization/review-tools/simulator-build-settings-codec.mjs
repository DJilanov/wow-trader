import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";

export async function loadSimulatorBuildSettingsCodec(root) {
  const require = createRequire(join(root, ".cache/forever-sim-upstream/package.json"));
  const esbuild = require("esbuild");
  let built;
  try {
    built = await esbuild.build({
      absWorkingDir: root,
      stdin: {
        contents:
          "export {IndividualSimSettings} from './ui/core/proto/ui'; export {Stat, PseudoStat} from './ui/core/proto/common';",
        resolveDir: join(root, ".cache/forever-sim-upstream"),
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      metafile: true,
      logLevel: "silent",
    });
  } finally {
    esbuild.stop();
  }
  let api;
  try {
    api = await import(
      "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].contents).toString("base64")
    );
  } catch (error) {
    throw new Error("Build settings codec failed to load: " + error.message);
  }
  const files = [
    ...Object.keys(built.metafile.inputs).filter((path) => path !== "<stdin>"),
    ".cache/forever-sim-upstream/sim/core/base_stats.go",
    ".cache/forever-sim-upstream/ui/core/proto_utils/stats.ts",
  ];
  const sourcePins = await Promise.all(
    files.sort().map(async (path) => {
      const absolute = resolve(root, path);
      return {
        path: relative(root, absolute),
        byteSha256: createHash("sha256")
          .update(await readFile(absolute))
          .digest("hex"),
      };
    }),
  );
  function normalize(settings) {
    const combat = Object.fromEntries(
      ["player", "encounter", "raidBuffs", "partyBuffs", "debuffs", "tanks", "targetDummies"]
        .filter((key) => settings[key] !== undefined)
        .map((key) => [key, settings[key]]),
    );
    let proto;
    try {
      proto = api.IndividualSimSettings.fromJson(combat);
    } catch (error) {
      throw new Error("Invalid build settings: " + error.message);
    }
    assert(proto.player && proto.encounter);
    // PlayerLevel in the pinned native engine treats omitted/zero and explicit60 as the cap.
    // This handoff is level60 only; never normalize a real lower-level character to60.
    assert([0, 60].includes(proto.player.level), "Only default/cap-level builds are comparable");
    proto.player.level = 60;
    const padded = {};
    for (const [field, entries] of [
      ["stats", api.Stat],
      ["pseudoStats", api.PseudoStat],
    ]) {
      const numeric = Object.values(entries).filter((value) => typeof value === "number");
      const length = Math.max(...numeric) + 1;
      assert(numeric.length > 0 && numeric.every((value) => Number.isInteger(value) && value >= 0));
      const values = proto.player.bonusStats?.[field] ?? [];
      assert(values.length <= length, "Out-of-model bonus stats cannot be discarded");
      assert(values.every((value) => Number.isFinite(value)));
      padded[field] = [...values, ...Array(length - values.length).fill(0)];
    }
    proto.player.bonusStats = padded;
    return api.IndividualSimSettings.toJson(proto);
  }
  return {
    normalize,
    sourcePins,
    schema: "kfc-level60-protobuf-combat-settings.v1",
    codecSha256: createHash("sha256").update(built.outputFiles[0].contents).digest("hex"),
    scope:
      "Known protobuf default omission, zero-padded bonus stat vectors and native default/cap level only. Nonzero values, lower levels, gear, talents, rotations, race, buffs, consumes and encounter changes are not ignored. No DPS/wire-equivalence claim.",
  };
}
