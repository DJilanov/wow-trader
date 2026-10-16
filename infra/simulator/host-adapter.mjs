import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";

export async function adaptSource(root) {
  const catalog = JSON.parse(
    await readFile(join(root, "assets/db_inputs/forever_gear_catalog.json"), "utf8"),
  );
  const allowed = new Set(catalog.items.map((item) => item.id));
  const equipmentPath = join(root, "assets/db_inputs/forever_equipment.json");
  const original = (path) =>
    JSON.parse(
      execFileSync("git", ["show", `HEAD:${path}`], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 32_000_000,
      }),
    );
  const equipment = original("assets/db_inputs/forever_equipment.json");
  const before = equipment.items.length;
  equipment.items = equipment.items.filter((item) => allowed.has(item.id));
  if (equipment.items.length < 1000)
    throw new Error("Unexpectedly incomplete real-source equipment catalog");
  await writeFile(equipmentPath, JSON.stringify(equipment));
  const rankedPath = join(root, "ui/core/forever_ranked_profiles.json");
  const ranked = original("ui/core/forever_ranked_profiles.json");
  ranked.profiles = ranked.profiles.filter(
    (profile) =>
      !profile.modeledGear &&
      profile.settings.player.equipment.items.every((item) => !item.id || allowed.has(item.id)),
  );
  ranked.gearScenario = "actual-forever-catalog";
  await writeFile(rankedPath, JSON.stringify(ranked));
  const tsconfigPath = join(root, "tsconfig.json");
  const ts = createRequire(join(root, "package.json"))("typescript");
  const parsed = ts.parseConfigFileTextToJson(tsconfigPath, await readFile(tsconfigPath, "utf8"));
  if (parsed.error) throw new Error("Invalid upstream TypeScript configuration");
  const tsconfig = parsed.config;
  tsconfig.compilerOptions.typeRoots = ["./node_modules/@types"];
  await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2));
  const uiPath = join(root, "ui/core/sim_ui.tsx");
  const ui = await readFile(uiPath, "utf8");
  const originalMessage = "if (event.data == 'runOnce') {";
  const guardedMessage =
    "if (event.origin === window.location.origin && (event.source === window.parent || event.source === window) && event.data == 'runOnce') {";
  if (ui.includes(originalMessage))
    await writeFile(uiPath, ui.replace(originalMessage, guardedMessage));
  else if (!ui.includes(guardedMessage))
    throw new Error("Upstream simulator message contract changed");
  return {
    itemCount: equipment.items.length,
    excludedModeledItems: before - equipment.items.length,
  };
}

export async function hostSimulatorAssets(root, base, vendors) {
  const { mkdir, readdir } = await import("node:fs/promises");
  // Missing Forever items must not re-enter with obsolete Classic stats through the fallback DB.
  await writeFile(
    join(root, "assets/database/leftover_db.json"),
    await readFile(join(root, "assets/database/db.json")),
  );
  for (const vendor of vendors) {
    const response = await globalThis.fetch(vendor.url, {
      signal: globalThis.AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Simulator vendor HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const { createHash } = await import("node:crypto");
    if (createHash("sha256").update(bytes).digest("hex") !== vendor.sha256)
      throw new Error("Simulator vendor integrity mismatch");
    const target = join(root, vendor.path);
    await mkdir((await import("node:path")).dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  const rewrite = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await rewrite(path);
      else if (entry.name.endsWith(".html")) {
        let html = await readFile(path, "utf8");
        for (const vendor of vendors) html = html.replaceAll(vendor.url, base + vendor.path);
        html = html.replace(
          /<script[^>]*src="https:\/\/wow\.zamimg\.com\/js\/tooltips\.js"[^>]*><\/script>/g,
          "",
        );
        await writeFile(path, html);
      }
    }
  };
  await rewrite(root);
}
