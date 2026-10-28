import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { tierSourceBindingsSchema, type TierSourceBindings } from "./forever-tier-source-contract";

export async function captureTierSourceBindings(
  directory: string,
  paths: readonly string[],
): Promise<TierSourceBindings> {
  const root = await realpath(directory);
  const bindings: TierSourceBindings = [];
  for (const path of [...new Set(paths)].sort()) {
    const target = join(root, path);
    const offset = relative(root, target);
    if (
      !offset ||
      offset.startsWith("..") ||
      isAbsolute(offset) ||
      (await realpath(target)) !== target
    )
      throw new Error("Tier source escaped its runtime");
    const info = await lstat(target);
    if (!info.isFile() || info.size > 8_000_000) throw new Error("Invalid tier source size");
    bindings.push({
      path,
      sha256: createHash("sha256")
        .update(await readFile(target))
        .digest("hex"),
    });
  }
  return tierSourceBindingsSchema.parse(bindings);
}

export async function verifyTierSourceBindings(directory: string, input: unknown): Promise<void> {
  const expected = tierSourceBindingsSchema.parse(input);
  if (new Set(expected.map((entry) => entry.path)).size !== expected.length)
    throw new Error("Duplicate tier source binding");
  const actual = await captureTierSourceBindings(
    directory,
    expected.map((entry) => entry.path),
  );
  const byPath = new Map(actual.map((entry) => [entry.path, entry.sha256]));
  if (expected.some((entry) => byPath.get(entry.path) !== entry.sha256))
    throw new Error("Tier source changed; refresh its measurements");
}
