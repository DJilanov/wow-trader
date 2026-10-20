#!/usr/bin/env node

import { lstat, readdir, realpath, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const catalogBackupPattern =
  /^wow_trader-pre-[a-z0-9_]+-[0-9]+-[a-f0-9]{8}-catalog-[0-9]{8}\.dump$/;

export function isManagedCatalogBackupName(name) {
  return catalogBackupPattern.test(name);
}

export async function pruneCatalogBackups(currentBackupPath) {
  const currentPath = resolve(currentBackupPath);
  const currentName = basename(currentPath);
  const backupDirectory = dirname(currentPath);
  if (basename(backupDirectory) !== "backups" || !isManagedCatalogBackupName(currentName)) {
    throw new Error("Catalog backup retention received an unmanaged backup path");
  }

  const currentInfo = await lstat(currentPath);
  if (!currentInfo.isFile()) throw new Error("Current catalog backup is not a regular file");

  const [resolvedDirectory, resolvedCurrent] = await Promise.all([
    realpath(backupDirectory),
    realpath(currentPath),
  ]);
  if (dirname(resolvedCurrent) !== resolvedDirectory) {
    throw new Error("Current catalog backup escapes the backup directory");
  }

  const removed = [];
  const entries = await readdir(resolvedDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || entry.name === currentName || !isManagedCatalogBackupName(entry.name)) {
      continue;
    }
    await unlink(join(resolvedDirectory, entry.name));
    removed.push(entry.name);
  }

  return { retained: currentName, removed: removed.sort() };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const currentBackupPath = process.argv[2];
  if (!currentBackupPath) {
    process.stderr.write("Usage: prune-catalog-backups.mjs <current-catalog-backup>\n");
    process.exitCode = 2;
  } else {
    await pruneCatalogBackups(currentBackupPath).then(
      (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
      (error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      },
    );
  }
}
