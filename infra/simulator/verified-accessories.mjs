import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

export const accessorySnapshot = {
  checksum: "b52b73d2765c00a0569a86f2923843ea1c264fafd5af9d5eec3874db4d7a23aa",
  clientVersion: "1.60.1.70425",
};
const rings = [
  { id: 19325, name: "Don Julio's Band", faction: 0 },
  // Current Item row 13001 has icon file 133354; only the planner icon is absent.
  { id: 13001, name: "Maiden's Circle", faction: 0, icon: "inv_jewelry_ring_12" },
  {
    id: 271908,
    name: "Theramore Signet",
    faction: 1,
  },
  { id: 272064, name: "Insurgent's Band", faction: 2 },
];

export function normalizeVerifiedAccessories(snapshot, planner) {
  if (
    snapshot.schema !== "forever-client-mechanics.v1" ||
    snapshot.clientVersion !== accessorySnapshot.clientVersion
  )
    throw new Error("Unreviewed simulator accessory snapshot");
  const result = [];
  for (const definition of rings) {
    const source = snapshot.items.find((item) => item.itemId === definition.id);
    const icon = planner[String(definition.id)]?.icon ?? definition.icon;
    if (
      !source ||
      source.name !== definition.name ||
      source.inventoryType !== 11 ||
      source.classId !== 4 ||
      source.requiredLevel > 60 ||
      source.issues.length ||
      source.effectIds.length ||
      source.armor !== 0 ||
      !/^[a-z0-9_]+$/i.test(icon ?? "")
    )
      throw new Error(`Unresolved verified accessory ${definition.id}`);
    const stats = Array(44).fill(0);
    const mapping = {
      5: [3, 1],
      6: [4, 1],
      7: [2, 1],
      32: [19, 14],
      31: [18, 10],
      38: [17, 1],
      45: [5, 1],
    };
    for (const stat of source.stats) {
      const target = mapping[stat.statType];
      if (!target || !Number.isFinite(stat.value) || stat.value < 0)
        throw new Error(`Unmapped verified accessory stat ${definition.id}/${stat.statType}`);
      stats[target[0]] += stat.value / target[1];
    }
    stats[27] = stats[17];
    result.push({
      id: source.itemId,
      name: source.name,
      icon,
      type: 11,
      stats,
      ilvl: source.itemLevel,
      quality: source.quality,
      phase: 1,
      expansion: 1,
      unique: true,
      factionRestriction: definition.faction,
    });
  }
  return result;
}

export async function loadVerifiedAccessories(root, sourceRoot) {
  const directory = resolve(
    process.env.FOREVER_MECHANICS_ROOT || join(root, "artifacts/forever-client-data"),
  );
  let bytes;
  try {
    bytes = await readFile(join(directory, accessorySnapshot.checksum + ".json"));
  } catch (error) {
    if (error?.code === "ENOENT")
      throw new Error(
        `Import the reviewed ${accessorySnapshot.clientVersion} mechanics snapshot into ${directory} before preparing simulator accessories`,
      );
    throw error;
  }
  if (createHash("sha256").update(bytes).digest("hex") !== accessorySnapshot.checksum)
    throw new Error("Simulator accessory snapshot integrity mismatch");
  const text = await readFile(
    join(sourceRoot, "assets/db_inputs/wowhead_forever_gearplanner.txt"),
    "utf8",
  );
  const marker = 'WH.setPageData("wow.gearPlanner.classicplus.item"';
  const start = text.indexOf("{", text.indexOf(marker));
  const end = text.indexOf(");", start);
  if (!text.includes(marker) || start < 0 || end < start)
    throw new Error("Upstream accessory icon source changed");
  const planner = JSON.parse(text.slice(start, end).replace(/,\s*([}\]])/g, "$1"));
  return normalizeVerifiedAccessories(JSON.parse(bytes.toString("utf8")), planner);
}
