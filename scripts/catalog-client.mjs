import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/** Select the installed client while retaining the catalog's stable product identifier. */
export async function readCatalogClientInstallation(wowRoot, product) {
  const contents = await readFile(join(wowRoot, ".build.info"), "utf8");
  const lines = contents.trim().split(/\r?\n/);
  const headers = lines[0].split("|").map((value) => value.split("!", 1)[0]);
  const productIndex = headers.indexOf("Product");
  const versionIndex = headers.indexOf("Version");
  const activeIndex = headers.indexOf("Active");
  if (productIndex < 0 || versionIndex < 0 || activeIndex < 0)
    throw new Error("The WoW build manifest has an unsupported format.");
  const rows = lines.slice(1).map((line) => line.split("|"));
  // Forever launch replaced the beta installation. Existing scans/catalogs keep their stable key.
  const clientProduct =
    product === "wow_classic_beta" &&
    rows.some((row) => row[productIndex] === "wowf" && row[activeIndex] === "1")
      ? "wowf"
      : product;
  const matches = rows.filter(
    (row) => row[productIndex] === clientProduct && row[activeIndex] === "1",
  );
  if (matches.length !== 1)
    throw new Error(`Expected one active ${clientProduct} build, found ${matches.length}.`);
  const version = matches[0][versionIndex];
  const buildNumber = Number(version?.split(".").at(-1));
  if (!version || !Number.isSafeInteger(buildNumber) || buildNumber <= 0)
    throw new Error("The installed client has an invalid version.");
  const productRoots = [];
  for (const entry of await readdir(wowRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(wowRoot, entry.name);
    try {
      const flavor = await readFile(join(candidate, ".flavor.info"), "utf8");
      if (flavor.trim().split(/\r?\n/)[1] === clientProduct) productRoots.push(candidate);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (productRoots.length !== 1)
    throw new Error(
      `Expected one installed ${clientProduct} directory, found ${productRoots.length}.`,
    );
  return { clientProduct, version, buildNumber, productRoot: productRoots[0] };
}
