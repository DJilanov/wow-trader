import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";

const COLLECTOR_FILENAME = "WowTraderCollector.lua";

export interface FileSignature {
  readonly size: number;
  readonly modifiedAtMilliseconds: number;
}

export async function discoverCollectorSavedVariables(
  wowProductRoot: string,
): Promise<readonly string[]> {
  const accountRoot = path.join(path.resolve(wowProductRoot), "WTF", "Account");
  let entries;
  try {
    entries = await readdir(accountRoot, { withFileTypes: true });
  } catch (error: unknown) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
  const matches: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(accountRoot, entry.name, "SavedVariables", COLLECTOR_FILENAME);
    try {
      await access(candidate);
      matches.push(candidate);
    } catch (error: unknown) {
      if (!isMissingFileError(error)) throw error;
    }
  }
  return matches.sort((left, right) => left.localeCompare(right));
}

export async function readFileSignature(filePath: string): Promise<FileSignature> {
  const details = await stat(filePath);
  if (!details.isFile())
    throw new Error(`Collector SavedVariables path is not a file: ${filePath}`);
  return { size: details.size, modifiedAtMilliseconds: details.mtimeMs };
}

export function signaturesMatch(left: FileSignature, right: FileSignature): boolean {
  return left.size === right.size && left.modifiedAtMilliseconds === right.modifiedAtMilliseconds;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
