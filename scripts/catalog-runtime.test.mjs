import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  mergeGuardianStatus,
  removeDanglingDeploymentLinks,
  verifyCatalogRuntime,
  verifyGuardianRelease,
  writeCatalogRuntimeManifest,
  writeGuardianReleaseManifest,
} from "./catalog-runtime.mjs";
import { canReusePublishedCatalog } from "./catalog-guardian-state.mjs";

test("published catalog reuse includes the extractor version", () => {
  const published = {
    buildNumber: 70_450,
    hotfixHash: "hotfix",
    extractorVersion: "0.4.0",
  };
  const installed = { buildNumber: 70_450 };

  assert.equal(canReusePublishedCatalog(published, installed, "hotfix", "0.4.0"), true);
  assert.equal(canReusePublishedCatalog(published, installed, "hotfix", "0.5.0"), false);
  assert.equal(canReusePublishedCatalog(published, installed, "other", "0.4.0"), false);
});

/** @param {import('node:test').TestContext} t @returns {Promise<string>} */
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "catalog-runtime-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist/cli.js"), "export {};\n");
  await mkdir(join(root, "node_modules/package"), { recursive: true });
  await writeFile(join(root, "node_modules/package/index.js"), "export {};\n");
  return root;
}

test("compiled tooling verifies without tsx and remains portable across directories", async (t) => {
  const root = await fixture(t);
  await symlink("package", join(root, "node_modules/linked-package"));
  const fingerprint = await writeCatalogRuntimeManifest(root);
  assert.equal(await verifyCatalogRuntime(root, fingerprint), fingerprint);
  const renamed = root + "-moved";
  await rename(root, renamed);
  t.after(() => rm(renamed, { recursive: true, force: true }));
  assert.equal(await verifyCatalogRuntime(renamed, fingerprint), fingerprint);
});

test("guardian releases carry their own tools and remain valid outside the development directory", async (t) => {
  const root = await fixture(t);
  await rm(join(root, "dist"), { recursive: true });
  for (const file of [
    "bin/node",
    "extractor/WowTrader.Extractor",
    "scripts/catalog-guardian.mjs",
    "installation.json",
    "runtime/dist/cli.js",
  ]) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), "bundled-tool");
  }
  const fingerprint = await writeGuardianReleaseManifest(root);
  const deployed = root + "-installed";
  await rename(root, deployed);
  t.after(() => rm(deployed, { recursive: true, force: true }));
  assert.equal(await verifyGuardianRelease(deployed, fingerprint), fingerprint);
  await writeFile(join(deployed, "extractor/WowTrader.Extractor"), "changed");
  await assert.rejects(verifyGuardianRelease(deployed, fingerprint), /integrity/);
});

test("guardian release validation rejects missing tools and external development dependencies", async (t) => {
  const root = await fixture(t);
  await assert.rejects(writeGuardianReleaseManifest(root), { code: "ENOENT" });
  await symlink(tmpdir(), join(root, "development-repo"));
  await assert.rejects(writeGuardianReleaseManifest(root), /symlink escapes/);
});

test("runtime verification rejects tampered and unexpected files", async (t) => {
  const root = await fixture(t);
  const fingerprint = await writeCatalogRuntimeManifest(root);
  await writeFile(join(root, "dist/cli.js"), "modified");
  await assert.rejects(verifyCatalogRuntime(root, fingerprint), /integrity verification failed/);
  await writeFile(join(root, "dist/cli.js"), "export {};\n");
  await writeFile(join(root, "unexpected.js"), "unexpected");
  await assert.rejects(verifyCatalogRuntime(root, fingerprint), /integrity verification failed/);
});

test("runtime rejects missing CLI, environment files, and external symlinks", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, ".env"), "private");
  await assert.rejects(writeCatalogRuntimeManifest(root), /Environment files/);
  await rm(join(root, ".env"));
  const external = root + "-outside";
  await mkdir(external);
  t.after(() => rm(external, { recursive: true, force: true }));
  await symlink(external, join(root, "external"));
  await assert.rejects(writeCatalogRuntimeManifest(root), /symlink escapes/);
  await rm(join(root, "external"));
  await rm(join(root, "dist/cli.js"));
  await assert.rejects(writeCatalogRuntimeManifest(root), { code: "ENOENT" });
});

test("runtime rejects a replaced manifest or wrong expected fingerprint", async (t) => {
  const root = await fixture(t);
  await writeCatalogRuntimeManifest(root);
  await assert.rejects(verifyCatalogRuntime(root, "0".repeat(64)), /integrity/);
  const path = join(root, "catalog-runtime.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.schemaVersion = "unknown";
  await writeFile(path, JSON.stringify(manifest));
  await assert.rejects(verifyCatalogRuntime(root), /integrity/);
});

test("pnpm's excluded dev links are removed only inside a generated temporary deployment", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "wow-trader-catalog-runtime-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "runtime");
  await mkdir(join(root, "node_modules"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@wow-trader/catalog" }));
  await writeFile(join(root, "node_modules/installed.js"), "keep");
  await symlink("installed.js", join(root, "node_modules/valid"));
  await symlink("excluded-dev-package", join(root, "node_modules/unused"));
  assert.equal(await removeDanglingDeploymentLinks(root), 1);
  assert.equal(await readFile(join(root, "node_modules/valid"), "utf8"), "keep");
  const unsafe = await fixture(t);
  await writeFile(join(unsafe, "package.json"), JSON.stringify({ name: "@wow-trader/catalog" }));
  await assert.rejects(removeDanglingDeploymentLinks(unsafe), /restricted/);
  await writeFile(join(parent, "outside"), "keep");
  await symlink("../../outside", join(root, "node_modules/escape"));
  await assert.rejects(removeDanglingDeploymentLinks(root), /escapes/);
  assert.equal(await readFile(join(parent, "outside"), "utf8"), "keep");
});

test("new builds and hotfixes cannot inherit another snapshot's assessment or manifest", () => {
  const previous = {
    product: "wow_classic_beta",
    buildNumber: 70245,
    hotfixHash: "old",
    manifestPath: "70245/manifest.json",
    assessment: { targetBuild: 70245 },
    publishedBuildId: "old-build",
    lastReviewNotifiedKey: "70245:old",
  };
  const preparing = mergeGuardianStatus(previous, {
    state: "preparing",
    product: "wow_classic_beta",
    buildNumber: 70291,
    hotfixHash: "new",
  });
  assert.equal(preparing.buildNumber, 70291);
  assert.equal(preparing.manifestPath, undefined);
  assert.equal(preparing.assessment, undefined);
  assert.equal(preparing.publishedBuildId, undefined);
  assert.equal(preparing.lastReviewNotifiedKey, previous.lastReviewNotifiedKey);
  assert.equal(mergeGuardianStatus(previous, { hotfixHash: "new" }).manifestPath, undefined);
  assert.equal(
    mergeGuardianStatus(previous, { state: "error" }).manifestPath,
    previous.manifestPath,
  );
});
