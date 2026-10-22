import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL, URL } from "node:url";
import { inflateSync } from "node:zlib";
import { auditWeaponLoadout } from "../infra/simulator/weapon-audit.mjs";

const root = resolve(import.meta.dirname, ".."),
  directory = join(root, "artifacts/forever-simulator"),
  digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const origin = "https://kfcguild.online";
const codecPath =
  "optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs";
const codecSha256 = "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a";

async function main() {
  const args = process.argv.slice(2);
  assert(
    args.every((arg) => ["--live", "--record"].includes(arg)),
    "Usage: [--live] [--record]",
  );
  assert.equal(new Set(args).size, args.length);
  const esbuild = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))("esbuild");
  let bundled;
  try {
    bundled = await esbuild.build({
      stdin: {
        contents:
          'export * from "./apps/web/src/lib/forever-simulator.ts";' +
          'export * from "./apps/web/src/lib/forever-simulator-presentation.ts";' +
          'export * from "./apps/web/src/lib/forever-simulator-published-reviews.ts";' +
          'export {SIMULATOR_SPECS} from "./packages/forever-data/src/simulator.ts";',
        resolveDir: root,
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      logLevel: "silent",
    });
  } finally {
    esbuild.stop();
  }
  const api = await import(
    "data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].contents).toString("base64")
  );
  assert.equal(digest(await readFile(join(directory, codecPath))), codecSha256);
  const codec = await import(pathToFileURL(join(directory, codecPath)).href);
  const pointerNames = [
    "active.json",
    "model-update.json",
    "profile-model-updates.json",
    "published-reviews.json",
  ];
  const pointerBytes = new Map(
    await Promise.all(
      pointerNames.map(async (name) => [name, await readFile(join(directory, name))]),
    ),
  );
  const published = JSON.parse(pointerBytes.get("published-reviews.json").toString("utf8"));
  const releases = new Map();
  async function asset(manifest, name, live) {
    const expected = manifest.files[name];
    assert(expected, "Missing manifest asset: " + name);
    const bytes = live
      ? Buffer.from(
          await (
            await fetchChecked(`/tools/forever-sim/${manifest.release}/${name}`)
          ).arrayBuffer(),
        )
      : await readFile(join(directory, manifest.release, name));
    assert.equal(bytes.length, expected.bytes, "Asset size differs: " + name);
    assert.equal(digest(bytes), expected.sha256, "Asset checksum differs: " + name);
    return JSON.parse(bytes.toString("utf8"));
  }
  async function fetchChecked(path) {
    const response = await globalThis.fetch(origin + path, {
      signal: globalThis.AbortSignal.timeout(30000),
    });
    assert(response.ok, "Live audit HTTP " + response.status + ": " + path);
    assert.equal(new URL(response.url).origin, origin, "Unexpected live audit redirect");
    return response;
  }
  async function releaseData(release, live) {
    const key = release + ":" + live;
    if (!releases.has(key)) {
      const manifest = await api.readSimulatorManifest(directory, release);
      assert(
        manifest,
        "Live release is not present locally; cannot authenticate its assets: " + release,
      );
      releases.set(key, {
        catalogSha256: manifest.files["assets/database/db.json"].sha256,
        db: await asset(manifest, "assets/database/db.json", live),
        presets: await asset(manifest, "kfc-default-enchants.json", live),
      });
    }
    return releases.get(key);
  }
  const profiles = [];
  for (const spec of api.SIMULATOR_SPECS.filter((row) => row.role !== "raid")) {
    const presentation = await api.readSimulatorPresentation(spec.page, directory);
    assert(presentation, "Missing local presentation: " + spec.page);
    const builds = await api.readPublishedSimulatorReviews(presentation, spec.page, directory);
    if (published.profiles[spec.page])
      assert(builds.length > 0, "Published library failed validation: " + spec.page);
    const release = presentation.manifest.release;
    const local = await releaseData(release, false);
    const inspect = (gear, playerClass, db, variant) =>
      auditWeaponLoadout({ profile: spec.page, variant, playerClass, gear, items: db.items });
    const library = builds.map((build) => {
      const settings = codec.IndividualSimSettings.fromBinary(
        inflateSync(
          Buffer.from(new URL(build.href, "https://helper.invalid").hash.slice(1), "base64"),
          {
            maxOutputLength: 4_000_000,
          },
        ),
      );
      assert(settings.player?.equipment, "Library build has no character equipment");
      return {
        id: build.id,
        ...inspect(
          settings.player.equipment,
          settings.player.class,
          local.db,
          build.spec.split("/")[1],
        ),
      };
    });
    const inspectPresets = (data) => {
      const rows = data.presets.presets.filter((preset) => preset.profile === spec.page);
      assert(rows.length > 0, "No profile preset metadata: " + spec.page);
      return rows.map((preset) => ({
        variant: preset.variant,
        ...inspect(preset.gear, preset.playerClass, data.db, preset.variant),
      }));
    };
    const row = {
      profile: spec.page,
      localRelease: release,
      localCatalogSha256: local.catalogSha256,
      publication: published.profiles[spec.page] ?? null,
      library,
      localPresets: inspectPresets(local),
    };
    if (args.includes("--live")) {
      const html = await (await fetchChecked(`/tools/forever/simulator/${spec.slug}`)).text();
      const paths = [
        ...new Set(
          [...html.matchAll(/\/forever-sim\/([a-f0-9]{24})\/([a-z_]+)\//g)]
            .filter((match) => match[2] === spec.page)
            .map((match) => match[1]),
        ),
      ];
      assert.equal(paths.length, 1, "Expected exactly one live profile release: " + spec.page);
      row.liveRelease = paths[0];
      const live = await releaseData(paths[0], true);
      row.liveCatalogSha256 = live.catalogSha256;
      row.livePresets = inspectPresets(live);
      row.deploymentDiffers = paths[0] !== release;
    }
    profiles.push(row);
    console.error("[weapon-audit] " + spec.page + ": library=" + library.length);
  }
  for (const [name, bytes] of pointerBytes)
    assert.deepEqual(
      await readFile(join(directory, name)),
      bytes,
      "Local selection changed during audit: " + name,
    );
  const findings = profiles
    .flatMap((row) => [
      ...row.library.map((build) => ({ profile: row.profile, surface: "local-library", ...build })),
      ...row.localPresets.map((preset) => ({
        profile: row.profile,
        surface: "local-preset-metadata",
        ...preset,
      })),
      ...(row.livePresets ?? []).map((preset) => ({
        profile: row.profile,
        surface: "live-preset-metadata",
        ...preset,
      })),
    ])
    .filter((row) => row.findings.length > 0);
  const result = {
    schema: "kfc-simulator-weapon-review-audit.v1",
    capturedAt: new Date().toISOString(),
    status: findings.length ? "weapon-review-required" : "no-weapon-review-flags",
    scope:
      "Authenticated preset metadata and decoded reviewed library links; not a new DPS search or runtime-browser test.",
    sourceFiles: await Promise.all(
      ["scripts/audit-simulator-weapons.mjs", "infra/simulator/weapon-audit.mjs"].map(
        async (path) => ({ path, byteSha256: digest(await readFile(join(root, path))) }),
      ),
    ),
    profiles,
    findings,
    nativeJobs: 0,
    browserCombatJobs: 0,
    publicationAllowed: false,
  };
  let recordedPath = null;
  if (args.includes("--record")) {
    recordedPath =
      "optimization/weapon-audit-" + digest(JSON.stringify(result)).slice(0, 16) + ".json";
    await writeFile(join(directory, recordedPath), JSON.stringify(result, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  }
  console.log(
    JSON.stringify({
      status: result.status,
      recordedPath,
      profiles: profiles.length,
      reviewedLibraryEntries: profiles.reduce((sum, row) => sum + row.library.length, 0),
      localPresetEntries: profiles.reduce((sum, row) => sum + row.localPresets.length, 0),
      deploymentDifferences: profiles
        .filter((row) => row.deploymentDiffers)
        .map((row) => row.profile),
      findings: findings.map(({ profile, surface, id, variant, findings: issues }) => ({
        profile,
        surface,
        id,
        variant,
        issues,
      })),
      nativeJobs: 0,
      browserCombatJobs: 0,
      publicationAllowed: false,
    }),
  );
}

main().catch((error) => {
  console.error("[weapon-audit] " + (error instanceof Error ? error.stack : String(error)));
  process.exitCode = 1;
});
