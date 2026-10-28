import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL, URL } from "node:url";
import { SIMULATOR_SPECS } from "../packages/forever-data/dist/simulator.js";

const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const releasePattern = /^[a-f0-9]{24}$/;
const digestPattern = /^[a-f0-9]{64}$/;

function verifyPaladinNativeReplay(browser) {
  assert.equal(browser.profile, "retribution_paladin");
  assert.equal(browser.model, "56698b4729ee198f469d77fb8545538b52451924f283ed0f3f042449a815983e");
  assert.equal(browser.nativeJobs, 0);
  assert.equal(browser.nativePoolCreated, false);
  assert.equal(browser.exactArchivedNativeRequestRequired, true);
  assert.equal(browser.classLedgerUnchanged, true);
  const approved = new Map([
      [
        "paladin-retribution-static",
        "a78a8f20812925216067194331e737ce18c11c44a74c18536ac76fe74c8fdfd1",
      ],
      [
        "paladin-shockadin-static",
        "9b2d184ac5af918d0ad9636507eff2dc330999742c17d4040c27e2fc43be8e0a",
      ],
    ]),
    controls = new Map();
  assert(Array.isArray(browser.nativeReplaySources) && browser.nativeReplaySources.length === 2);
  for (const source of browser.nativeReplaySources) {
    assert(approved.has(source.id) && !controls.has(source.id));
    assert(
      source.sourceSha256 === approved.get(source.id) &&
        checksum(Buffer.from(source.sourceJson)) === source.sourceSha256,
      "Archived native control checksum changed",
    );
    const value = JSON.parse(source.sourceJson),
      wire = Buffer.from(value.capture.requestBase64, "base64");
    assert.equal(wire.toString("base64"), value.capture.requestBase64);
    controls.set(source.id, { requestSha256: checksum(wire), dps: value.native.dps });
  }
  assert.equal(browser.checks.length, 14);
  const simulations = browser.checks.filter((row) => row.kind === "simulation");
  assert.equal(simulations.length, 4);
  for (const width of [1440, 390])
    for (const [id, control] of controls) {
      const matched = simulations.filter((row) => row.id === id && row.width === width);
      assert.equal(matched.length, 1);
      const row = matched[0];
      assert.equal(row.iterations, 32);
      assert.equal(row.ruleset, 1);
      assert.equal(row.seed, 98127001);
      assert.equal(row.requestSha256, control.requestSha256);
      assert.equal(row.nativeDps, control.dps);
      assert(Number.isFinite(row.browserDps) && Math.abs(row.nativeDps - row.browserDps) <= 0.051);
    }
}

async function qualifiedProfiles(directory, snapshots) {
  const profiles = new Map();
  for (const contract of [
    {
      name: "qualified-dps-models.json",
      schema: "kfc-qualified-dps-selection.v1",
      proofSchema: "kfc-qualified-combat-model.v2",
      proofName: "kfc-qualified-combat-model.json",
      browserDirectory: "dps-browser-reviews",
      browserSchema: "kfc-current-combat-menu-browser.v2",
      profiles: [
        "mage",
        "warlock",
        "shadow_priest",
        "smite_priest",
        "elemental_shaman",
        "enhancement_shaman",
        "retribution_paladin",
      ],
    },
    {
      name: "qualified-combat-models.json",
      schema: "kfc-qualified-combat-selection.v1",
      proofSchema: "kfc-qualified-combat-model.v1",
      proofName: "kfc-qualified-combat-model.json",
      browserDirectory: "combat-browser-reviews",
      browserSchema: "kfc-current-combat-menu-browser.v1",
      profiles: ["warrior"],
    },
    {
      name: "qualified-warrior-tank-model.json",
      schema: "kfc-qualified-tank-selection.v1",
      proofSchema: "kfc-qualified-tank-model.v1",
      proofName: "kfc-qualified-tank-model.json",
      browserDirectory: "warrior-tank-browser-reviews",
      browserSchema: "kfc-qualified-tank-browser.v1",
      profile: "tank_warrior",
      profiles: ["tank_warrior"],
    },
    {
      name: "qualified-tank-model.json",
      schema: "kfc-qualified-tank-selection.v1",
      proofSchema: "kfc-qualified-tank-model.v1",
      proofName: "kfc-qualified-tank-model.json",
      browserDirectory: "tank-browser-reviews",
      browserSchema: "kfc-qualified-tank-browser.v1",
      profile: "feral_tank_druid",
      profiles: ["feral_tank_druid"],
    },
    {
      name: "qualified-paladin-tank-model.json",
      schema: "kfc-qualified-tank-selection.v1",
      proofSchema: "kfc-qualified-tank-model.v1",
      proofName: "kfc-qualified-tank-model.json",
      browserDirectory: "tank-browser-reviews",
      browserSchema: "kfc-qualified-tank-browser.v1",
      profile: "protection_paladin",
      profiles: ["protection_paladin"],
    },
  ]) {
    let bytes = null;
    try {
      bytes = await readFile(resolve(directory, contract.name));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    snapshots.set(contract.name, bytes);
    if (!bytes) continue;
    assert(bytes.length <= 32_000, "Qualified selection exceeds its size budget");
    const pointer = JSON.parse(bytes);
    assert.equal(pointer.schema, contract.schema);
    const entries = contract.profile ? { [contract.profile]: pointer } : pointer.profiles;
    assert(entries && typeof entries === "object" && !Array.isArray(entries));
    if (contract.profile) assert.equal(pointer.profile, contract.profile);
    for (const [profile, selected] of Object.entries(entries)) {
      assert(contract.profiles.includes(profile), "Unknown qualified simulator profile");
      assert(selected && releasePattern.test(selected.release), "Invalid qualified release");
      assert(
        digestPattern.test(selected.proofSha256) &&
          digestPattern.test(selected.browserReviewSha256),
      );
      const proofBytes = await readFile(resolve(directory, selected.release, contract.proofName));
      assert(
        proofBytes.length <= 8_000_000 && checksum(proofBytes) === selected.proofSha256,
        "Qualified proof checksum changed",
      );
      const proof = JSON.parse(proofBytes);
      assert.equal(proof.schema, contract.proofSchema);
      assert.equal(proof.profile, profile);
      assert.equal(proof.release, selected.release);
      assert(releasePattern.test(proof.sourceRelease) && digestPattern.test(proof.model));
      assert(Array.isArray(proof.builds) && proof.builds.length > 0);
      assert.equal(new Set(proof.builds.map((row) => row.id)).size, proof.builds.length);
      const manifest = await json(resolve(directory, selected.release, "manifest.json"));
      assert.equal(manifest.release, selected.release);
      assert.equal(manifest.files[contract.proofName]?.sha256, selected.proofSha256);
      assert.equal(manifest.files[contract.proofName]?.bytes, proofBytes.length);
      const browserBytes = await readFile(
        resolve(directory, contract.browserDirectory, selected.release + ".json"),
      );
      assert(
        browserBytes.length <= 8_000_000 && checksum(browserBytes) === selected.browserReviewSha256,
        "Qualified browser approval checksum changed",
      );
      const browser = JSON.parse(browserBytes);
      if (
        profile === "retribution_paladin" &&
        browser.schema === "kfc-current-paladin-menu-native-replay.v1"
      ) {
        assert.equal(contract.browserSchema, "kfc-current-combat-menu-browser.v2");
        verifyPaladinNativeReplay(browser);
      } else assert.equal(browser.schema, contract.browserSchema);
      assert.equal(browser.status, "passed");
      assert.equal(browser.release, selected.release);
      assert.equal(browser.model, proof.model);
      assert.equal(browser.proofSha256, selected.proofSha256);
      assert.deepEqual(browser.errors, []);
      assert(!profiles.has(profile), "Duplicate qualified profile selection");
      profiles.set(profile, { release: selected.release, builds: proof.builds });
    }
  }
  return profiles;
}

export async function verifySimulatorDeployment(
  { baseUrl, artifactRoot },
  fetcher = globalThis.fetch,
) {
  const base = new URL(baseUrl);
  assert(["http:", "https:"].includes(base.protocol));
  assert(!base.username && !base.password && !base.search && !base.hash);
  const mount = base.pathname.replace(/\/$/, "");
  assert(mount === "" || mount === "/tools", "Unexpected Helper mount path");
  const directory = resolve(artifactRoot);
  const selectionBytes = await readFile(resolve(directory, "model-update.json"));
  const selection = JSON.parse(selectionBytes.toString("utf8"));
  assert.equal(selection.schema, "kfc-simulator-model-update-selection.v1");
  assert(releasePattern.test(selection.release));
  assert(releasePattern.test(selection.sourceRelease));
  let profileSelectionBytes = null;
  try {
    profileSelectionBytes = await readFile(resolve(directory, "profile-model-updates.json"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const profileSelection = profileSelectionBytes
    ? JSON.parse(profileSelectionBytes.toString("utf8"))
    : { schema: "kfc-simulator-profile-model-selection.v1", profiles: {} };
  assert.equal(profileSelection.schema, "kfc-simulator-profile-model-selection.v1");
  assert(profileSelection.profiles && typeof profileSelection.profiles === "object");
  assert(!Array.isArray(profileSelection.profiles));
  for (const [profile, selected] of Object.entries(profileSelection.profiles)) {
    assert(
      SIMULATOR_SPECS.some((entry) => entry.page === profile),
      "Unknown profile selection",
    );
    assert(selected && releasePattern.test(selected.release), "Invalid profile release");
    assert(releasePattern.test(selected.sourceRelease), "Invalid profile source release");
  }
  const pointerBytes = await readFile(resolve(directory, "published-reviews.json"));
  const pointer = JSON.parse(pointerBytes.toString("utf8"));
  assert.equal(pointer.schema, "kfc-published-simulator-reviews.v1");
  const qualifiedSnapshots = new Map();
  const qualified = await qualifiedProfiles(directory, qualifiedSnapshots);
  const request = async (path) => {
    const response = await fetcher(new URL(mount + path, base).href, {
      signal: globalThis.AbortSignal.timeout(30000),
      redirect: "error",
    });
    assert.equal(response.status, 200, `Simulator request failed: ${path}`);
    return response;
  };
  const profiles = [];
  const profileReleases = {};
  const releases = new Set([selection.release]);
  for (const profile of new Set([...Object.keys(pointer.profiles), ...qualified.keys()])) {
    assert(/^[a-z_]+$/.test(profile), "Invalid published simulator profile");
    const reference = pointer.profiles[profile];
    let publication;
    if (reference) {
      assert(
        new RegExp(`^published-reviews/${profile}-[a-f0-9]{16}\\.json$`).test(reference.path),
        "Invalid publication path",
      );
      publication = await json(resolve(directory, reference.path));
      assert.equal(checksum(JSON.stringify(publication)), reference.sha256);
      assert.equal(publication.profile, profile);
    }
    const selected = qualified.get(profile) ?? profileSelection.profiles[profile] ?? selection;
    if (!qualified.has(profile)) assert.equal(publication.presentationRelease, selected.release);
    const builds = qualified.get(profile)?.builds ?? publication.builds;
    releases.add(selected.release);
    profileReleases[profile] = selected.release;
    assert(builds.length > 0, "No approved builds in publication");
    const spec = SIMULATOR_SPECS.find((entry) => entry.page === profile);
    assert(spec, "Unknown simulator profile: " + profile);
    const html = await (await request(`/forever/simulator/${spec.slug}`)).text();
    assert(
      html.includes(`src="${mount}/forever-sim/${selected.release}/${profile}/`),
      `${profile}: server ignored the selected simulator model`,
    );
    assert(html.includes("Choose a build"), `${profile}: Build library is missing`);
    for (const build of builds) {
      assert(/^[a-z0-9-]+$/.test(build.id));
      assert(html.includes(`value="${build.id}"`), `${profile}: missing build ${build.id}`);
    }
    profiles.push({ profile, builds: builds.length });
  }
  assert(profiles.length > 0, "No published simulator profiles");
  const databases = {};
  for (const release of releases) {
    const manifest = await json(resolve(directory, release, "manifest.json"));
    assert.equal(manifest.release, release);
    const asset = manifest.files["assets/database/db.json"];
    assert(asset, "Missing simulator item database");
    const bytes = Buffer.from(
      await (await request(`/forever-sim/${release}/assets/database/db.json`)).arrayBuffer(),
    );
    assert.equal(bytes.length, asset.bytes, "Public simulator database size mismatch");
    assert.equal(checksum(bytes), asset.sha256, "Public simulator database checksum mismatch");
    const database = JSON.parse(bytes.toString("utf8"));
    assert.equal(database.items.length, manifest.itemCount);
    assert.equal(manifest.itemWeaponSkillPolicy?.mode, "ignore-item-bonuses");
    assert(
      database.items.every((item) => (item.weaponSkills ?? []).every((value) => value === 0)),
      "Public database still grants item weapon skill",
    );
    for (const item of manifest.itemWeaponSkillPolicy.changes)
      assert(
        database.items.some((row) => row.id === item.id),
        `Skill-bearing item ${item.id} removed`,
      );
    for (const name of [
      "kfc-reviewed-presets.json",
      "kfc-preset-safety.json",
      "kfc-qualified-combat-model.json",
      "kfc-combat-update-qualification.json",
      "kfc-qualified-tank-model.json",
      "kfc-tank-update-qualification.json",
    ]) {
      const response = await fetcher(
        new URL(`${mount}/forever-sim/${release}/${name}`, base).href,
        { signal: globalThis.AbortSignal.timeout(30000), redirect: "error" },
      );
      assert.equal(response.status, 404, `Private simulator proof exposed: ${name}`);
    }
    databases[release] = database.items.length;
  }
  assert.deepEqual(await readFile(resolve(directory, "model-update.json")), selectionBytes);
  assert.deepEqual(await readFile(resolve(directory, "published-reviews.json")), pointerBytes);
  if (profileSelectionBytes)
    assert.deepEqual(
      await readFile(resolve(directory, "profile-model-updates.json")),
      profileSelectionBytes,
    );
  for (const [name, expected] of qualifiedSnapshots) {
    let current = null;
    try {
      current = await readFile(resolve(directory, name));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    assert.deepEqual(
      current,
      expected,
      "Qualified selection changed during deployment verification",
    );
  }
  return {
    status: "passed",
    sourceRelease: selection.sourceRelease,
    presentationRelease: selection.release,
    profiles,
    items: databases[selection.release],
    profileReleases,
    databases,
    itemWeaponSkillsIgnored: true,
    privateProofsHidden: true,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(await realpath(resolve(process.argv[1]))).href
) {
  const args = process.argv.slice(2);
  assert.equal(args.length, 2, "Supply --base-url=<url> --artifact-root=<directory>");
  assert(args[0].startsWith("--base-url=") && args[1].startsWith("--artifact-root="));
  const result = await verifySimulatorDeployment({
    baseUrl: args[0].slice("--base-url=".length),
    artifactRoot: args[1].slice("--artifact-root=".length),
  });
  process.stdout.write(JSON.stringify(result) + "\n");
}
