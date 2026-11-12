import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getDisenchantDistribution } from "../apps/web/src/lib/disenchanting.ts";

// Run with the catalog package's existing tsx loader; no separate Lua table is maintained.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rows = [];
for (const classId of [2, 4]) {
  for (const quality of [2, 3, 4]) {
    for (let itemLevel = 1; itemLevel <= 170; itemLevel++) {
      const distribution = getDisenchantDistribution("wow_anniversary", 69795, {
        classId,
        quality,
        itemLevel,
      });
      if (!distribution) continue;
      const materials = distribution.expectedMaterials.map(
        ({ materialItemId, expectedQuantity }) =>
          `{${materialItemId},${expectedQuantity.numerator},${expectedQuantity.denominator}}`,
      );
      rows.push(
        `  ["${classId}:${quality}:${itemLevel}"] = {skill=${distribution.requiredEnchantingSkill},materials={${materials.join(",")}}},`,
      );
    }
  }
}
const contents = `-- Generated from the website's versioned disenchant model. Do not edit.
local _, Addon = ...
Addon.DisenchantData = {
  version = "tbc-disenchant-table-v1",
  verifiedProduct = "wow_anniversary",
  verifiedBuild = 69795,
  referenceMaximumLevel = 65,
  rows = {
${rows.join("\n")}
  },
}
`;
const destination = path.join(root, "apps/addon/WowTraderCollector/DisenchantData.lua");
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== contents)
    throw new Error("Addon disenchant data differs from the shared model; regenerate it.");
} else await writeFile(destination, contents);
process.stdout.write(
  `${rows.length} disenchant entries ${process.argv.includes("--check") ? "verified" : "generated"}.\n`,
);
