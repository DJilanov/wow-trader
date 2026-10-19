import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import {
  assertItemWeaponSkillsIgnored,
  itemWeaponSkillPolicy,
  patchItemWeaponSkills,
  prepareItemWeaponSkills,
  withoutItemWeaponSkills,
} from "../infra/simulator/item-weapon-skills.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { workspaceInputs } from "../infra/simulator/workspace-adapter.mjs";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";

const source = `package core
func untouched() {}
func (character *Character) applyWeaponSkills() {
\tfor _, item := range character.Equipment {
\t\tcharacter.PseudoStats.DaggersSkill += item.WeaponSkills[4]
\t}
}
func applyTalentsAndRacials() {}
`;

test("keeps every item and all non-skill properties without mutating the archive", () => {
  const equipment = {
    enchants: [{ effectId: 1900 }],
    items: [
      {
        id: 18392,
        name: "Distracting Dagger",
        weaponSkills: [0, 0, 0, 0, 6],
        stats: Array(44).fill(1),
        weaponDamageMin: 42,
        weaponDamageMax: 64,
        weaponSpeed: 1.3,
        setId: 100,
        effectItemId: 12590,
      },
      { id: 13255, name: "Trueaim Gauntlets", weaponSkills: Array(16).fill(8) },
      { id: 12590, name: "Felstriker", weaponSkills: Array(16).fill(0) },
      { id: 272452, name: "Premier High Warlord's Blade" },
    ],
  };
  const before = globalThis.structuredClone(equipment);
  const result = withoutItemWeaponSkills(equipment);
  assert.deepEqual(equipment, before);
  assert.deepEqual(
    result.equipment.items.map((item) => item.id),
    equipment.items.map((item) => item.id),
  );
  const expected = globalThis.structuredClone(equipment);
  expected.items[0].weaponSkills.fill(0);
  expected.items[1].weaponSkills.fill(0);
  assert.deepEqual(result.equipment, expected);
  assert.deepEqual(
    result.manifest.changes.map((item) => item.id),
    [18392, 13255],
  );
  assert.deepEqual(result.manifest.changes[0].previousWeaponSkills, [0, 0, 0, 0, 6]);
  assert.equal(result.manifest.basis, "owner-directed-model-assumption");
  assert.equal(result.manifest.mode, "ignore-item-bonuses");
  assert.equal(result.referenceDps, undefined);
  assert.doesNotThrow(() => assertItemWeaponSkillsIgnored(result.equipment));
  assert.notEqual(simulationHash(result.equipment), simulationHash(equipment));
});

test("normalization is idempotent and handles all skill columns, not only daggers", () => {
  const equipment = {
    items: [{ id: 1, weaponSkills: Array.from({ length: 16 }, (_, index) => index - 5) }],
  };
  const first = withoutItemWeaponSkills(equipment);
  const second = withoutItemWeaponSkills(first.equipment);
  assert.deepEqual(first.equipment.items[0].weaponSkills, Array(16).fill(0));
  assert.deepEqual(first.equipment, second.equipment);
  assert.deepEqual(second.manifest.changes, []);
});

test("invalid skill data fails closed and old native models cannot start new searches", () => {
  for (const weaponSkills of [
    null,
    {},
    "6",
    [NaN],
    [Infinity],
    ["6"],
    Array(1),
    Array(17).fill(0),
  ]) {
    const equipment = { items: [{ id: 18392, weaponSkills }] };
    assert.throws(() => withoutItemWeaponSkills(equipment), /Invalid item weapon skills/);
    assert.throws(() => assertItemWeaponSkillsIgnored(equipment), /Invalid item weapon skills/);
  }
  assert.throws(
    () => assertItemWeaponSkillsIgnored({ items: [{ id: 18392, weaponSkills: [0, 0, 0, 0, 6] }] }),
    /Prepare a new no-item-skill model/,
  );
  assert.throws(() => withoutItemWeaponSkills({}), /Missing equipment/);
  assert.throws(() => withoutItemWeaponSkills(null), /Missing equipment/);
  assert.throws(() => withoutItemWeaponSkills({ items: [null] }), /Invalid equipment item/);
  assert.doesNotThrow(() => assertItemWeaponSkillsIgnored({ items: [{ id: 12590 }] }));
});

test("preparation persists the same zero-skill policy used by native and browser builds", async () => {
  const upstream = await mkdtemp(join(tmpdir(), "kfc-item-skill-prepare-"));
  try {
    await mkdir(join(upstream, "sim/core"), { recursive: true });
    await mkdir(join(upstream, "ui/core"), { recursive: true });
    await writeFile(join(upstream, "sim/core/character.go"), source);
    const root = fileURLToPath(new URL("../", import.meta.url));
    const input = { items: [{ id: 18392, weaponSkills: [0, 0, 0, 0, 6] }] };
    const result = await prepareItemWeaponSkills(root, upstream, input);
    assert.deepEqual(input.items[0].weaponSkills, [0, 0, 0, 0, 6]);
    assert.deepEqual(result.equipment.items[0].weaponSkills, [0, 0, 0, 0, 0]);
    assert.equal(
      await readFile(join(upstream, "sim/core/character.go"), "utf8"),
      patchItemWeaponSkills(source),
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(upstream, "ui/core/kfc_item_weapon_skills.json"), "utf8")),
      result.manifest,
    );
    await access(join(upstream, "sim/core/kfc_item_weapon_skills_test.go"));
  } finally {
    await rm(upstream, { recursive: true, force: true });
  }
});

test("new native runs reject the historical database or engine before any generated source writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "kfc-item-skill-native-"));
  const upstream = join(root, ".cache/forever-sim-upstream");
  try {
    await mkdir(join(upstream, "assets/database"), { recursive: true });
    await mkdir(join(upstream, "sim/core"), { recursive: true });
    const databasePath = join(upstream, "assets/database/db.json");
    await writeFile(databasePath, JSON.stringify({ items: [{ id: 18392, weaponSkills: [6] }] }));
    await writeFile(join(upstream, "sim/core/character.go"), source);
    await assert.rejects(createNativeRunners(root, 1), /still grants weapon skill/);
    await writeFile(databasePath, JSON.stringify({ items: [{ id: 18392, weaponSkills: [0] }] }));
    await assert.rejects(createNativeRunners(root, 1), /Prepare the no-item-skill engine/);
    assert.equal(await readFile(join(upstream, "sim/core/character.go"), "utf8"), source);
    await assert.rejects(access(join(upstream, "cmd/kfcprebis")), { code: "ENOENT" });
    await assert.rejects(access(join(upstream, "sim/common")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime guard covers imported gear but does not reset other sources of skill", () => {
  const patched = patchItemWeaponSkills(source);
  assert.match(patched, /if character.Env != nil && character.Env.IsForever\(\) \{\n\t\treturn/);
  assert(patched.indexOf("return") < patched.indexOf("for _, item"));
  assert(patched.includes("character.PseudoStats.DaggersSkill += item.WeaponSkills[4]"));
  assert(patched.endsWith("func applyTalentsAndRacials() {}\n"));
  assert.equal(patchItemWeaponSkills(patched), patched);
  assert.throws(() => patchItemWeaponSkills(source + source), /method changed/);
  assert.throws(() => patchItemWeaponSkills(source.replace("applyWeaponSkills", "renamed")));
  assert.throws(() =>
    patchItemWeaponSkills(source.replace("\n\tfor", "\n\tif character.Env.IsForever() {}\n\tfor")),
  );
});

test("native and browser preparation share a fingerprinted policy and do not silently patch old searches", async () => {
  for (const name of ["item-weapon-skills.mjs", "item-weapon-skills_test.go"])
    assert(workspaceInputs.includes(name));
  const host = await readFile(
    new URL("../infra/simulator/host-adapter.mjs", import.meta.url),
    "utf8",
  );
  const runner = await readFile(
    new URL("../infra/simulator/native-runner.mjs", import.meta.url),
    "utf8",
  );
  const builder = await readFile(
    new URL("./prepare-forever-simulator.mjs", import.meta.url),
    "utf8",
  );
  assert(host.includes("prepareItemWeaponSkills("));
  assert(host.includes("JSON.stringify(itemSkills.equipment)"));
  assert(
    runner.indexOf("assertItemWeaponSkillsIgnored(\n") <
      runner.indexOf("await prepareItemEffectFixes("),
  );
  assert(runner.includes("patchItemWeaponSkills(characterSource)"));
  assert(builder.includes("TestKfcItemWeaponSkills"));
  assert(builder.includes('"kfc-item-weapon-skills.json"'));
  assert(builder.includes("itemWeaponSkillPolicy: data.itemWeaponSkillPolicy"));
  assert.match(itemWeaponSkillPolicy.notice, /not independent server verification/);
});
