import { access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Pin upstream definitions without requiring a build-number commit message. DBCD resolves each
 * installed table by its declared build or actual layout hash, and rejects unknown layouts.
 * @param {string} sourceDirectory
 * @param {(command: string, args: string[], options?: {capture: boolean}) => Promise<{stdout: string}>} run
 * @returns {Promise<string>}
 */
export async function resolveCatalogDefinitionsRevision(sourceDirectory, run) {
  try {
    await access(join(sourceDirectory, ".git"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(dirname(sourceDirectory), { recursive: true });
    await run("git", [
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      "https://github.com/wowdev/WoWDBDefs.git",
      sourceDirectory,
    ]);
  }
  await run("git", ["-C", sourceDirectory, "fetch", "--quiet", "origin", "master"]);
  const result = await run(
    "git",
    ["-C", sourceDirectory, "rev-parse", "refs/remotes/origin/master^{commit}"],
    { capture: true },
  );
  const revision = result.stdout.trim();
  if (!/^[a-f0-9]{40}$/.test(revision))
    throw new Error("Upstream catalog definitions did not resolve to an exact Git commit.");
  return revision;
}
