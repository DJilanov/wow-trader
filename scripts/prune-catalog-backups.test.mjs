import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { isManagedCatalogBackupName, pruneCatalogBackups } from "./prune-catalog-backups.mjs";

test("keeps the current catalog backup and removes only older managed backups", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "catalog-backup-retention-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const backups = join(root, "backups");
  await mkdir(backups);

  const current = "wow_trader-pre-wow_classic_beta-70450-a00ad2b8-catalog-20261019.dump";
  const older = [
    "wow_trader-pre-wow_classic_beta-70374-6bc806ec-catalog-20261018.dump",
    "wow_trader-pre-wow_anniversary-69795-1234abcd-catalog-20261017.dump",
  ];
  await Promise.all([
    writeFile(join(backups, current), "current"),
    ...older.map((name) => writeFile(join(backups, name), "old")),
    writeFile(join(backups, "wow_trader-latest-before-catalog-retention-20261019.dump"), "keep"),
    writeFile(join(backups, "notes.txt"), "keep"),
  ]);
  await symlink(join(backups, older[0]), join(backups, "catalog-backup-link.dump"));

  assert.deepEqual(await pruneCatalogBackups(join(backups, current)), {
    retained: current,
    removed: older.sort(),
  });
  assert.deepEqual(
    (await readdir(backups)).sort(),
    [
      "catalog-backup-link.dump",
      "notes.txt",
      current,
      "wow_trader-latest-before-catalog-retention-20261019.dump",
    ].sort(),
  );
});

test("rejects paths outside the managed catalog-backup naming contract", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "catalog-backup-retention-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const backups = join(root, "backups");
  await mkdir(backups);
  const unmanaged = join(backups, "database.dump");
  await writeFile(unmanaged, "keep");

  assert.equal(isManagedCatalogBackupName("database.dump"), false);
  await assert.rejects(pruneCatalogBackups(unmanaged), /unmanaged backup path/);
  assert.deepEqual(await readdir(backups), ["database.dump"]);
});
