import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { format, resolveConfig } from "prettier";
import { readCatalogClientInstallation } from "./catalog-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values: options } = parseArgs({
  options: { check: { type: "boolean" }, "wow-root": { type: "string" } },
  strict: true,
});
const addon = path.join(root, "apps/addon/WowTraderCollector");
const wowRoot = options["wow-root"] ?? (await defaultWowRoot());
if (wowRoot !== undefined) {
  if (!wowRoot.trim()) throw new Error("The WoW root must not be empty.");
  const installed = await readCatalogClientInstallation(path.resolve(wowRoot), "wow_classic_beta");
  const valuation = await readFile(path.join(addon, "ClientValuationData.lua"), "utf8");
  const valuationBuild = Number(/\bclientBuild\s*=\s*(\d+)\b/u.exec(valuation)?.[1]);
  if (valuationBuild !== installed.buildNumber)
    throw new Error(
      `Disenchant data build ${valuationBuild || "unknown"} does not match installed Forever build ${installed.buildNumber}. Refresh the client valuation snapshot before packaging.`,
    );
}
const tocName = "WowTraderCollector.toc";
const toc = await readFile(path.join(addon, tocName), "utf8");
const version = /^## Version:\s*(\d+\.\d+\.\d+)$/m.exec(toc)?.[1];
if (!version) throw new Error("Collector TOC has no valid version.");
const names = toc.split(/\r?\n/u).filter((line) => line.trim() && !line.startsWith("#"));
names.push(tocName);
if (new Set(names).size !== names.length || names.some((name) => !/^[A-Za-z0-9_.-]+$/u.test(name)))
  throw new Error("Collector TOC contains duplicate or unsafe file paths.");
const files = {};
for (const name of names)
  files[name] = createHash("sha256")
    .update(await readFile(path.join(addon, name)))
    .digest("hex");
const manifest = `${JSON.stringify({ version, files }, null, 2)}\n`;
const sourceFile = path.join(root, "apps/desktop/src/main/products.ts");
const source = await readFile(sourceFile, "utf8");
const generatedSource = source
  .replace(/const COLLECTOR_VERSION = "[^"]+";/u, `const COLLECTOR_VERSION = "${version}";`)
  .replace(
    /const ADDON_FILES: Readonly<Record<string, string>> = \{[\s\S]*?\n\};/u,
    `const ADDON_FILES: Readonly<Record<string, string>> = ${JSON.stringify(files, null, 2)};`,
  );
const nextSource = await format(generatedSource, {
  ...(await resolveConfig(sourceFile)),
  filepath: sourceFile,
});
const manifestPath = path.join(root, "apps/desktop/resources/addon-manifest.json");
if (options.check) {
  if ((await readFile(manifestPath, "utf8")) !== manifest || source !== nextSource)
    throw new Error("Collector checksums are out of date. Run scripts/prepare-addon-manifest.mjs.");
} else {
  await writeFile(manifestPath, manifest);
  await writeFile(sourceFile, nextSource);
}
process.stdout.write(
  `Collector ${version}: ${names.length} file checksums ${options.check ? "verified" : "updated"}.\n`,
);

/** @returns {Promise<string | undefined>} */
async function defaultWowRoot() {
  if (process.platform !== "darwin") return undefined;
  const candidate = "/Applications/World of Warcraft";
  for (const folder of ["_forever_", "_classic_beta_"]) {
    try {
      await access(path.join(candidate, folder, ".flavor.info"));
      return candidate;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  }
  return undefined;
}
