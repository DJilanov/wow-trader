import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareManualCrowdPummeler } from "./manual-crowd-pummeler.mjs";
import { prepareDrakkisathTrinkets } from "./drakkisath-trinkets.mjs";

export function patchFlameWrathSelfRetaliation(source) {
  const start = source.indexOf('itemhelpers.CreateWeaponProcSpell(FlameWrath, "Flame Wrath",');
  const end = source.indexOf("\n\t// PPM from Armaments discord", start);
  if (start < 0 || end < start) throw new Error("Upstream Flame Wrath registration changed");
  const original = "if result.Landed() {\n\t\t\t\t\tshieldSpell.Cast(sim, spell.Unit)";
  const fixed =
    "if result.Landed() && spell.Unit != shieldSpell.Unit {\n\t\t\t\t\tshieldSpell.Cast(sim, spell.Unit)";
  const block = source.slice(start, end);
  if (block.includes(fixed) && !block.includes(original)) return source;
  if (block.split(original).length !== 2 || block.includes(fixed))
    throw new Error("Upstream Flame Wrath retaliation changed");
  return source.slice(0, start) + block.replace(original, fixed) + source.slice(end);
}

export async function prepareItemEffectFixes(root, upstream) {
  const path = join(upstream, "sim/common/item_effects.go");
  const original = await readFile(path, "utf8");
  const patched = patchFlameWrathSelfRetaliation(original);
  if (patched !== original) await writeFile(path, patched);
  await copyFile(
    join(root, "infra/simulator/flame-wrath_test.go"),
    join(upstream, "sim/common/kfc_flame_wrath_test.go"),
  );
  await prepareManualCrowdPummeler(root, upstream);
  await prepareDrakkisathTrinkets(root, upstream);
}
