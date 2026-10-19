import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL, URL } from "node:url";

const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const releasePattern = /^[a-f0-9]{24}$/;

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
  const pointerBytes = await readFile(resolve(directory, "published-reviews.json"));
  const pointer = JSON.parse(pointerBytes.toString("utf8"));
  assert.equal(pointer.schema, "kfc-published-simulator-reviews.v1");
  const request = async (path) => {
    const response = await fetcher(new URL(mount + path, base).href, {
      signal: globalThis.AbortSignal.timeout(30000),
      redirect: "error",
    });
    assert.equal(response.status, 200, `Simulator request failed: ${path}`);
    return response;
  };
  const profiles = [];
  for (const [profile, reference] of Object.entries(pointer.profiles)) {
    assert(/^[a-z_]+$/.test(profile), "Invalid published simulator profile");
    assert(
      new RegExp(`^published-reviews/${profile}-[a-f0-9]{16}\\.json$`).test(reference.path),
      "Invalid publication path",
    );
    const publication = await json(resolve(directory, reference.path));
    assert.equal(checksum(JSON.stringify(publication)), reference.sha256);
    assert.equal(publication.profile, profile);
    assert.equal(publication.presentationRelease, selection.release);
    assert(publication.builds.length > 0, "No approved builds in publication");
    const html = await (await request(`/forever/simulator/${profile}`)).text();
    assert(
      html.includes(`src="${mount}/forever-sim/${selection.release}/${profile}/`),
      `${profile}: server ignored the selected simulator model`,
    );
    assert(html.includes("Choose a build"), `${profile}: Build library is missing`);
    for (const build of publication.builds) {
      assert(/^[a-z0-9-]+$/.test(build.id));
      assert(html.includes(`value="${build.id}"`), `${profile}: missing build ${build.id}`);
    }
    profiles.push({ profile, builds: publication.builds.length });
  }
  assert(profiles.length > 0, "No published simulator profiles");
  const manifest = await json(resolve(directory, selection.release, "manifest.json"));
  assert.equal(manifest.release, selection.release);
  const asset = manifest.files["assets/database/db.json"];
  assert(asset, "Missing simulator item database");
  const bytes = Buffer.from(
    await (
      await request(`/forever-sim/${selection.release}/assets/database/db.json`)
    ).arrayBuffer(),
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
  for (const name of ["kfc-reviewed-presets.json", "kfc-preset-safety.json"]) {
    const response = await fetcher(
      new URL(`${mount}/forever-sim/${selection.release}/${name}`, base).href,
      { signal: globalThis.AbortSignal.timeout(30000), redirect: "error" },
    );
    assert.equal(response.status, 404, `Private simulator proof exposed: ${name}`);
  }
  assert.deepEqual(await readFile(resolve(directory, "model-update.json")), selectionBytes);
  assert.deepEqual(await readFile(resolve(directory, "published-reviews.json")), pointerBytes);
  return {
    status: "passed",
    sourceRelease: selection.sourceRelease,
    presentationRelease: selection.release,
    profiles,
    items: database.items.length,
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
