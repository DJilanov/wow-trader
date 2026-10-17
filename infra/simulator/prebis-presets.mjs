import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { enchantDefaultGear } from "./default-enchants.mjs";
import { prebisNotice, statisticallyBetter } from "./prebis-pool.mjs";

export function patchPrebisDefaults(source) {
  const marker = "this.player.setForeverTier1Bonuses(eventID, !healingSpec && !tankSpec);";
  if (source.split(marker).length !== 2)
    throw new Error("Upstream default Tier 1 contract changed");
  return source.replace(marker, "this.player.setForeverTier1Bonuses(eventID, false);");
}

export function patchPrebisGearPresets(source) {
  const marker =
    "Level 60 Forever equipment. Reviewed role-based default enchants, not simulated BiS. Recipe, reputation and release unlocks need in-game confirmation. Unverified procs are excluded. Saved builds are not changed; select a gear preset to load these enchants.";
  if (!source.includes(marker)) throw new Error("Upstream pre-raid gear tooltip changed");
  if (!source.includes("import { TypedEvent } from '../core/typed_event';"))
    source = "import { TypedEvent } from '../core/typed_event';\n" + source;
  return source.replaceAll(
    `tooltip: ${JSON.stringify(marker)}`,
    `tooltip: ${JSON.stringify(prebisNotice)}, onLoad: player => player.setForeverTier1Bonuses(TypedEvent.nextEventID(), false)`,
  );
}

export async function preparePrebisPresets(repo, upstream) {
  const report = JSON.parse(
    await readFile(join(repo, "infra/simulator/prebis-results.json"), "utf8"),
  );
  const db = JSON.parse(await readFile(join(upstream, "assets/database/db.json"), "utf8"));
  const checksum = createHash("sha256").update(JSON.stringify(db)).digest("hex");
  if (
    report.schema !== "kfc-prebis-results.v1" ||
    report.dbSha256 !== checksum ||
    report.profiles.length !== 23
  )
    throw new Error(
      "Pre-raid results do not match the compiled item database; rerun the optimization",
    );
  const inspection = JSON.parse(
    await readFile(join(upstream, "ui/core/kfc_inspection.json"), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(join(upstream, "ui/core/kfc_default_enchants.json"), "utf8"),
  );
  const updated = new Set();
  for (const result of report.profiles) {
    const key = `${result.profile}/${result.variant}`;
    if (updated.has(key)) throw new Error(`Duplicate optimized profile ${key}`);
    const preset = manifest.presets.find(
      (preset) => preset.profile === result.profile && preset.variant === result.variant,
    );
    if (
      !preset ||
      !result.validation?.length ||
      !Number.isFinite(result.optimizedDps) ||
      result.optimizedDps <= 0
    )
      throw new Error(`Invalid optimized profile ${key}`);
    if (
      result.accepted &&
      !result.validation.every((entry) => statisticallyBetter(entry.candidate, entry.baseline))
    )
      throw new Error(`Unvalidated pre-raid gain ${key}`);
    const enchanted = enchantDefaultGear(
      result.gear,
      result.profile,
      result.variant,
      db,
      inspection,
    );
    if (JSON.stringify(enchanted.gear) !== JSON.stringify(result.gear))
      throw new Error(`Optimized enchant policy changed for ${key}; rerun optimization`);
    const accessories = (slots) =>
      slots.map((slot) => {
        const item = db.items.find((item) => item.id === result.gear.items[slot].id);
        if (!item) throw new Error(`Missing optimized accessory ${key}`);
        return {
          itemId: item.id,
          name: item.name,
          stats: item.stats,
          note: result.provisionalIds.includes(item.id)
            ? "Provisional Classic reference; Forever values and availability unverified."
            : "Current Forever catalog candidate.",
        };
      });
    Object.assign(preset, enchanted, {
      trinkets: accessories([12, 13]),
      rings: accessories([10, 11]),
      optimization: {
        fingerprint: report.fingerprint,
        baselineDps: result.baselineDps,
        optimizedDps: result.optimizedDps,
        provisionalIds: result.provisionalIds,
      },
    });
    await writeFile(
      join(upstream, `ui/${result.profile}/gear_sets/forever_${result.variant}.gear.json`),
      JSON.stringify(result.gear, null, 2) + "\n",
    );
    updated.add(key);
  }
  for (const profile of new Set(report.profiles.map((entry) => entry.profile))) {
    const path = join(upstream, `ui/${profile}/presets.ts`);
    await writeFile(path, patchPrebisGearPresets(await readFile(path, "utf8")));
  }
  const path = join(upstream, "ui/core/individual_sim_ui.ts");
  await writeFile(path, patchPrebisDefaults(await readFile(path, "utf8")));
  await writeFile(join(upstream, "ui/core/kfc_default_enchants.json"), JSON.stringify(manifest));
  await writeFile(join(upstream, "sim/core/kfc_default_enchants.json"), JSON.stringify(manifest));
  await writeFile(
    join(upstream, "ui/core/kfc_prebis_results.json"),
    JSON.stringify({
      schema: report.schema,
      fingerprint: report.fingerprint,
      notice: report.notice,
      scenario: report.scenario,
      profiles: report.profiles.map(
        ({ profile, variant, name, baselineDps, optimizedDps, provisionalIds }) => ({
          profile,
          variant,
          name,
          baselineDps,
          optimizedDps,
          provisionalIds,
        }),
      ),
    }),
  );
}
