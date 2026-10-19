import assert from "node:assert/strict";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const itemWeaponSkillPolicy = Object.freeze({
  schema: "kfc-item-weapon-skills.v1",
  mode: "ignore-item-bonuses",
  basis: "owner-directed-model-assumption",
  notice:
    "Item-granted weapon skill is ignored. Items, their other stats and effects remain available; talents and racials are unchanged. This is an owner-directed model assumption, not independent server verification. Results from the previous item-skill model must not be relabelled as recalculated.",
});

const method = "func (character *Character) applyWeaponSkills() {\n";
const guard =
  "\t// Item skill is excluded only from the Forever model; talents and racials still apply.\n" +
  "\tif character.Env != nil && character.Env.IsForever() {\n\t\treturn\n\t}\n";

export function patchItemWeaponSkills(source) {
  assert.equal(source.split(method).length, 2, "Upstream item weapon-skill method changed");
  const start = source.indexOf(method) + method.length;
  const end = source.indexOf("\n}\n", start);
  assert(end > start, "Upstream item weapon-skill method has no end");
  const body = source.slice(start, end);
  assert.equal(body.split("for _, item := range character.Equipment {").length, 2);
  if (body.startsWith(guard)) return source;
  assert(!body.includes("IsForever"), "Unreviewed item weapon-skill ruleset guard");
  return source.slice(0, start) + guard + source.slice(start);
}

function validateSkills(item) {
  assert(item && Number.isSafeInteger(item.id) && item.id > 0, "Invalid equipment item");
  if (item.weaponSkills === undefined) return;
  assert(
    Array.isArray(item.weaponSkills) &&
      item.weaponSkills.length <= 16 &&
      Array.from(item.weaponSkills).every((value) => Number.isFinite(value)),
    `Invalid item weapon skills: ${item.id}`,
  );
}

export function withoutItemWeaponSkills(equipment) {
  assert(Array.isArray(equipment?.items), "Missing equipment items");
  const result = globalThis.structuredClone(equipment);
  const changes = [];
  for (const item of result.items) {
    validateSkills(item);
    if (!item.weaponSkills?.some((value) => value !== 0)) continue;
    changes.push({
      id: item.id,
      ...(typeof item.name === "string" ? { name: item.name } : {}),
      previousWeaponSkills: [...item.weaponSkills],
    });
    item.weaponSkills = item.weaponSkills.map(() => 0);
  }
  return { equipment: result, manifest: { ...itemWeaponSkillPolicy, changes } };
}

export function assertItemWeaponSkillsIgnored(database) {
  assert(Array.isArray(database?.items), "Missing equipment items");
  for (const item of database.items) {
    validateSkills(item);
    assert(
      !item.weaponSkills?.some((value) => value !== 0),
      `Item ${item.id} still grants weapon skill. Prepare a new no-item-skill model before running new searches; preserve the previous model and checkpoints.`,
    );
  }
}

export async function prepareItemWeaponSkills(root, upstream, equipment) {
  const path = join(upstream, "sim/core/character.go");
  const original = await readFile(path, "utf8");
  const patched = patchItemWeaponSkills(original);
  const result = withoutItemWeaponSkills(equipment);
  if (patched !== original) await writeFile(path, patched);
  await copyFile(
    join(root, "infra/simulator/item-weapon-skills_test.go"),
    join(upstream, "sim/core/kfc_item_weapon_skills_test.go"),
  );
  await writeFile(
    join(upstream, "ui/core/kfc_item_weapon_skills.json"),
    JSON.stringify(result.manifest),
  );
  return result;
}
