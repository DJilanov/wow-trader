import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createFuryBlueBaseline,
  furyBlueBaselineIds,
  furyBlueCoreIds,
  createArmsBlueBaseline,
  armsBlueBaselineIds,
} from "../infra/simulator/optimization-baselines.mjs";
import { prebisSlotTypes } from "../infra/simulator/prebis-pool.mjs";
import {
  assertUnchangedEquippedData,
  createBlueControlArtifacts,
  loadBlueControl,
} from "../infra/simulator/baseline-control.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";

function controlFixture() {
  return {
    schema: "kfc-optimization-baseline.v1",
    profile: "warrior",
    variant: "arms",
    playerClass: 9,
    revision: "a".repeat(40),
    dbSha256: "b".repeat(64),
    coreIds: [...furyBlueCoreIds],
    settings: {
      settings: { faction: "Alliance" },
      player: {
        race: "RaceHuman",
        equipment: { items: furyBlueCoreIds.map((id) => ({ id })) },
      },
    },
  };
}

test("versioned blue captures bind an immutable control without rewriting legacy filenames", () => {
  const input = controlFixture();
  const original = globalThis.structuredClone(input);
  const result = createBlueControlArtifacts(input);
  assert.deepEqual(input, original);
  assert.deepEqual(result.control, input);
  assert.equal(result.baseline.controlBaseline.sha256, simulationHash(result.control));
  assert.equal(result.baseline.controlBaseline.path, result.controlPath);
  assert.match(result.controlPath, /warrior-arms-alliance-blue-control-[a-f0-9]{16}\.json$/);
  assert.match(result.baselinePath, /warrior-arms-alliance-blue-[a-f0-9]{16}\.json$/);
  assert.notEqual(result.controlPath, result.baselinePath);
  const changed = controlFixture();
  changed.dbSha256 = "c".repeat(64);
  assert.notEqual(createBlueControlArtifacts(changed).controlPath, result.controlPath);
  result.control.coreIds.pop();
  assert.deepEqual(input, original);
});

test("new controls survive actual-gear feedback while changed content, identity and paths fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "kfc-blue-control-"));
  try {
    const { control, controlPath, baseline } = createBlueControlArtifacts(controlFixture());
    const path = join(root, controlPath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(control));
    const feedback = globalThis.structuredClone(baseline);
    feedback.coreIds = [];
    feedback.settings.player.equipment.items = [{ id: 12640 }];
    assert.deepEqual((await loadBlueControl(root, feedback)).control, control);
    const changed = globalThis.structuredClone(control);
    changed.settings.player.equipment.items[0].id = 1;
    await writeFile(path, JSON.stringify(changed));
    await assert.rejects(loadBlueControl(root, baseline), /checksum changed/);
    await writeFile(path, JSON.stringify(control));
    for (const change of [
      (value) => (value.dbSha256 = "c".repeat(64)),
      (value) => (value.revision = "c".repeat(40)),
      (value) => (value.variant = "fury"),
      (value) => (value.playerClass = 6),
      (value) => (value.settings.player.race = "RaceOrc"),
      (value) => (value.settings.settings.faction = "Horde"),
      (value) => (value.controlBaseline.path = "/tmp/control.json"),
      (value) =>
        (value.controlBaseline.path =
          "artifacts/forever-simulator/optimization/baselines/../control.json"),
      (value) => (value.controlBaseline.sha256 = "invalid"),
      (value) => (value.controlBaseline.extra = true),
      (value) => (value.controlBaseline = null),
    ]) {
      const invalid = globalThis.structuredClone(baseline);
      change(invalid);
      await assert.rejects(loadBlueControl(root, invalid));
    }
    const chained = { ...control, controlBaseline: baseline.controlBaseline };
    await writeFile(path, JSON.stringify(chained));
    await assert.rejects(
      loadBlueControl(root, {
        ...baseline,
        controlBaseline: { path: controlPath, sha256: simulationHash(chained) },
      }),
      /cannot form chains/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy evidence keeps its original control and cannot be redirected across database versions", async () => {
  const root = await mkdtemp(join(tmpdir(), "kfc-legacy-control-"));
  try {
    const original = controlFixture();
    const path = join(
      root,
      "artifacts/forever-simulator/optimization/baselines/warrior-arms-alliance-blue.json",
    );
    await mkdir(dirname(path), { recursive: true });
    const bytes = JSON.stringify(original);
    await writeFile(path, bytes);
    assert.deepEqual((await loadBlueControl(root, original)).control, original);
    const current = { ...original, dbSha256: "c".repeat(64) };
    await assert.rejects(loadBlueControl(root, current), /dbSha256 changed/);
    assert.equal(await readFile(path, "utf8"), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function refreshFixture() {
  const baseline = controlFixture();
  baseline.settings.player.equipment.items = Array.from({ length: 17 }, (_, index) =>
    index < 8 ? { id: furyBlueCoreIds[index], ...(index === 0 ? { enchant: 931 } : {}) } : {},
  );
  const archived = {
    items: furyBlueCoreIds.map((id) => ({ id, stats: Array(44).fill(0), setId: 548 })),
    enchants: [{ effectId: 931, stats: Array(44).fill(0), type: 6 }],
  };
  baseline.dbSha256 = simulationHash(archived);
  return { baseline, archived, current: globalThis.structuredClone(archived) };
}

test("catalog refresh permits new candidates without inheriting or changing equipped data", () => {
  const { baseline, archived, current } = refreshFixture();
  current.items.push({ id: 13107, stats: Array(44).fill(1), setId: 0 });
  current.enchants.push({ effectId: 1, stats: Array(44).fill(2), type: 13 });
  const original = globalThis.structuredClone({ baseline, archived, current });
  assertUnchangedEquippedData(baseline, archived, current);
  assert.deepEqual({ baseline, archived, current }, original);
});

test("catalog refresh rejects changed stats, sets, missing equipment and selected enchant drift", () => {
  for (const change of [
    (x) => x.current.items[0].stats[0]++,
    (x) => (x.current.items[0].setId = 0),
    (x) => x.current.items.pop(),
    (x) => x.current.enchants[0].stats[0]++,
    (x) => x.current.enchants.pop(),
    (x) => x.archived.items[0].stats[0]++,
    (x) => (x.baseline.settings.player.equipment.items.length = 16),
  ]) {
    const input = refreshFixture();
    change(input);
    assert.throws(() => assertUnchangedEquippedData(input.baseline, input.archived, input.current));
  }
});

function fixture() {
  const items = furyBlueBaselineIds.map((id, slot) => ({
    id,
    type: prebisSlotTypes[slot],
    quality: 3,
    ilvl: 60,
    stats: Array(44).fill(0),
    armorType: 4,
    ...(slot >= 14 ? { weaponType: 9, handType: 2 } : {}),
    ...(slot === 16 ? { rangedWeaponType: 1 } : {}),
    classAllowlist: [9],
  }));
  const sources = new Map(
    items.map((item) => [item.id, { requiredLevel: 60, sources: [{ kind: "pvp" }] }]),
  );
  const rules = Object.fromEntries(
    [
      [1506, 1],
      [2488, 3],
      [247, 4],
      [1891, 5],
      [1885, 6],
      [927, 7],
      [1506, 9],
      [1887, 10],
      [2563, 13],
    ].map(([effectId, type]) => [
      `${effectId}:${type}`,
      {
        effectId,
        type,
        extraTypes: [],
        status: "static",
        spellId: effectId,
        name: "Fixture",
        stats: Array(44).fill(0),
        classAllowlist: [],
        armorTypes: [],
        minLevel: 0,
        maxLevel: 0,
        itemLevelMin: 0,
        itemLevelMax: 0,
        enchantType: 0,
      },
    ]),
  );
  const profile = {
    profile: "warrior",
    variant: "fury",
    playerClass: 9,
    settings: {
      settings: { faction: "Alliance" },
      partyBuffs: {},
      player: {
        profession1: "Engineering",
        profession2: "Engineering",
        foreverTier1Bonuses: true,
        warrior: { options: { startingRage: 50 } },
        rotation: { priorityList: [{ action: { castSpell: { spellId: { spellId: 1719 } } } }] },
      },
      encounter: { duration: 120 },
    },
  };
  return { profile, db: { items }, sources, inspection: { enchants: rules } };
}

test("fixed blue baseline removes invalid professions and free rage/raid bonuses without mutating capture", () => {
  const input = fixture();
  const original = globalThis.structuredClone(input.profile);
  const baseline = createFuryBlueBaseline(input.profile, input.db, input.sources, input.inspection);
  assert.deepEqual(input.profile, original);
  assert.equal(baseline.settings.player.level, 60);
  assert.equal(baseline.settings.player.profession1, "Engineering");
  assert.equal(baseline.settings.player.profession2, "Blacksmithing");
  assert.equal(baseline.settings.player.warrior.options.startingRage, 0);
  assert.equal(baseline.settings.player.foreverTier1Bonuses, false);
  assert.equal(baseline.settings.partyBuffs.windfuryTotem, true);
  assert.deepEqual(
    baseline.settings.player.equipment.items.map((item) => item.id),
    furyBlueBaselineIds,
  );
  assert.equal(furyBlueCoreIds.length, 8);
  assert.deepEqual(baseline.settings.player.rotation.priorityList[0].action.condition, {
    const: { val: "false" },
  });
});

test("missing, epic or incompatible baseline items fail before a run", () => {
  for (const change of [
    (input) => input.db.items.pop(),
    (input) => (input.db.items[0].quality = 4),
    (input) => (input.db.items[0].classAllowlist = [3]),
  ]) {
    const input = fixture();
    change(input);
    assert.throws(
      () => createFuryBlueBaseline(input.profile, input.db, input.sources, input.inspection),
      /Invalid|Illegal/,
    );
  }
});

test("Alliance has an independent Human baseline with its faction-correct blue ring", () => {
  const input = fixture();
  const horde = input.db.items.find((item) => item.id === 272064);
  horde.factionRestriction = 2;
  const alliance = { ...horde, id: 271908, factionRestriction: 1 };
  input.db.items.push(alliance);
  input.sources.set(alliance.id, {
    requiredLevel: 60,
    sources: [{ kind: "pvp", faction: "Alliance" }],
  });
  const baseline = createFuryBlueBaseline(
    input.profile,
    input.db,
    input.sources,
    input.inspection,
    { faction: "Alliance" },
  );
  assert.equal(baseline.settings.player.race, "RaceHuman");
  assert.equal(baseline.settings.settings.faction, "Alliance");
  assert.equal(baseline.settings.player.equipment.items[11].id, alliance.id);
  assert.deepEqual(baseline.coreIds, furyBlueCoreIds);
  assert.equal(furyBlueBaselineIds[11], horde.id, "Horde input must not be rewritten");
  assert.throws(
    () =>
      createFuryBlueBaseline(input.profile, input.db, input.sources, input.inspection, {
        faction: "Unknown",
      }),
    /Unknown baseline faction/,
  );
  input.db.items.find((item) => item.id === 271908).factionRestriction = 2;
  assert.throws(
    () =>
      createFuryBlueBaseline(input.profile, input.db, input.sources, input.inspection, {
        faction: "Alliance",
      }),
    /Illegal/,
  );
});

function armsFixture() {
  const input = fixture();
  input.profile.variant = "arms";
  input.profile.settings.player.consumes = {
    mainHandImbue: "ElementalSharpeningStone",
    offHandImbue: "ElementalSharpeningStone",
  };
  input.profile.settings.player.bonusStats = { stats: [100], pseudoStats: [100] };
  input.profile.settings.player.rotation.priorityList.push({
    action: { castSpell: { spellId: { spellId: 21553 } } },
  });
  const alliance = { ...input.db.items[11], id: 271908, factionRestriction: 1 };
  const weapon = { ...input.db.items[14], id: 12784, handType: 4, weaponType: 1 };
  input.db.items.push(alliance, weapon);
  input.sources.set(alliance.id, {
    requiredLevel: 60,
    sources: [{ kind: "pvp", faction: "Alliance" }],
  });
  input.sources.set(weapon.id, {
    requiredLevel: 58,
    sources: [{ kind: "crafted", spellId: 16994 }],
    craftAudit: { status: "recipe-inputs-reviewed" },
  });
  return input;
}

test("Arms freezes the blue PvP core with two-hand Arcanite Reaper, no paid stats or raid consumes", () => {
  const input = armsFixture();
  const original = globalThis.structuredClone(input.profile);
  const result = createArmsBlueBaseline(input.profile, input.db, input.sources, input.inspection);
  assert.deepEqual(input.profile, original);
  assert.deepEqual(
    result.settings.player.equipment.items.map((item) => item.id || 0),
    armsBlueBaselineIds.map((id, slot) => (slot === 11 ? 271908 : id)),
  );
  assert.equal(result.settings.player.race, "RaceHuman");
  assert.equal(result.settings.player.warrior.options.stance, "WarriorStanceBattle");
  assert.equal(result.settings.player.warrior.options.startingRage, 0);
  assert.equal(result.settings.player.consumes.mainHandImbue, "DenseSharpeningStone");
  assert.equal(result.settings.player.consumes.offHandImbue, undefined);
  assert.deepEqual(result.settings.player.bonusStats, {});
  assert.deepEqual(result.settings.player.equipment.items[15], {});
  assert.deepEqual(result.coreIds, furyBlueCoreIds);
});

test("Arms rejects unchecked crafts, wrong weapon style, changed APL and faction conflicts", () => {
  for (const change of [
    (input) => (input.sources.get(12784).craftAudit.status = "unresolved"),
    (input) => (input.sources.get(12784).craftAudit.status = "raid-dependent"),
    (input) => (input.db.items.find((item) => item.id === 12784).handType = 2),
    (input) => (input.db.items.find((item) => item.id === 12784).quality = 4),
    (input) => (input.db.items.find((item) => item.id === 271908).factionRestriction = 2),
    (input) => input.profile.settings.player.rotation.priorityList.pop(),
  ]) {
    const input = armsFixture();
    change(input);
    assert.throws(() =>
      createArmsBlueBaseline(input.profile, input.db, input.sources, input.inspection),
    );
  }
  const horde = armsFixture();
  const baseline = createArmsBlueBaseline(
    horde.profile,
    horde.db,
    horde.sources,
    horde.inspection,
    { faction: "Horde" },
  );
  assert.equal(baseline.settings.player.race, "RaceOrc");
  assert.equal(baseline.settings.player.equipment.items[11].id, 272064);
});
