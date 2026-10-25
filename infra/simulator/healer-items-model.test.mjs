import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  extractHealerItemRules,
  extendPriestHealingItemCatalog,
  renderBlueDragonItemEffect,
  renderPriestHealingSetEffect,
} from "./healer-items-model.mjs";

const bytes = readFileSync(
  new URL("./fixtures/healer-items-client-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "07c051f4f00b50ae9f546475ea2fa77782df1194288c098219254dbe8d2487ec",
);
const evidence = JSON.parse(gunzipSync(bytes)),
  rules = extractHealerItemRules(evidence),
  parent = { items: [], itemIcons: [] },
  common = evidence.engine["sim/common/item_effects.go"].source,
  setSource = evidence.engine["sim/priest/item_sets_pvp.go"].source;

test("the actual client grants Spirit rather than the inherited casting-regeneration override", () => {
  assert.equal(rules.blueDragon.spirit, 150);
  assert.equal(rules.blueDragon.durationMs, 15000);
  assert.equal(rules.blueDragon.procChance, 0.02);
  assert.equal(rules.blueDragon.spiritRegenWhileCastingOverride, false);
  assert.equal(rules.blueDragon.buffSpellId, 23684);
  assert(common.includes("AttachSpiritRegenRateCastingBuff(1)"));
  assert.equal(rules.classMechanicsAdmission, false);
  assert.equal(rules.publicationAllowed, false);
});

test("unsupported proc, payload, duration and snapshot changes reject the item model", () => {
  for (const mutate of [
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 23688).ProcChance = 3;
    },
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 23688).ProcCategoryRecovery =
        1000;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 23684).EffectAura = 134;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 23684).EffectBasePointsF = 151;
    },
    (value) => {
      value.tables.SpellDuration.find((row) => row.id === 8).Duration = 30000;
    },
    (value) => {
      value.normalized.hotfixSha256 = "1".repeat(64);
    },
    (value) => {
      value.tables.ItemEffect = [];
    },
  ]) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extractHealerItemRules(changed));
  }
});

test("the current Priest set has paired damage/healing payloads and the six-piece stamina bonus", () => {
  assert.deepEqual(rules.priestBlueSet, { id: 549, spellPowerAtTwo: 23, staminaAtSix: 20 });
  const changed = globalThis.structuredClone(evidence);
  changed.tables.SpellEffect = changed.tables.SpellEffect.filter(
    (row) => !(row.SpellID === 14047 && row.EffectAura === 135),
  );
  assert.throws(() => extractHealerItemRules(changed));
});

test("the derived catalog appends nine real current records with source assumptions kept separate", () => {
  const result = extendPriestHealingItemCatalog(parent, evidence);
  assert.equal(result.db.items.length, 9);
  assert.equal(result.db.itemIcons.length, 9);
  assert.deepEqual(parent, { items: [], itemIcons: [] });
  const dragon = result.db.items.find((row) => row.id === 19288);
  assert(dragon.unique);
  assert(dragon.stats.every((value) => value === 0));
  assert.equal(
    result.sources.find((row) => row.id === 19288).acquisition.currentServerVerified,
    false,
  );
  assert(
    result.sources
      .filter((row) => row.id !== 19288)
      .every((row) => row.currentServerVerified === false),
  );
  assert.equal(result.publicationAllowed, false);
});

test("existing item records are preserved and cannot be silently replaced", () => {
  const original = evidence.historicalBlueDragon;
  const realParent = { items: [original], itemIcons: [] };
  const before = JSON.stringify(realParent);
  assert.throws(() => extendPriestHealingItemCatalog(realParent, evidence), /Refusing to replace/);
  assert.equal(JSON.stringify(realParent), before);
  const retained = evidence.priorPriestPvp[0];
  assert.throws(
    () => extendPriestHealingItemCatalog({ items: [retained], itemIcons: [] }, evidence),
    /Refusing to replace/,
  );
});

test("new current values or utility effects cannot silently reuse prior PvP records", () => {
  for (const mutate of [
    (value) => {
      value.normalized.items.find((row) => row.itemId === 272562).stats[0].value += 1;
    },
    (value) => {
      value.normalized.items.find((row) => row.itemId === 272562).effectIds = [1];
    },
    (value) => {
      value.tables.ItemSparse.find((row) => row.id === 272562).AllowableClass = -1;
    },
    (value) => {
      value.tables.ItemSparse.find((row) => row.id === 19288).RequiredSkill = 197;
    },
    (value) => {
      value.normalized.items.find((row) => row.itemId === 19288).stats = [
        { statType: 6, value: 20 },
      ];
    },
  ]) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extendPriestHealingItemCatalog(parent, changed));
  }
});

test("the historical deck, quest and Ace links are required without claiming current acquisition", () => {
  for (const field of ["tokenLine", "beastSection"]) {
    const changed = globalThis.structuredClone(evidence);
    changed.historicalAcquisition[field] = "";
    assert.throws(() => extendPriestHealingItemCatalog(parent, changed));
  }
  const changed = globalThis.structuredClone(evidence);
  changed.tables.ItemSparse.find((row) => row.id === 19228).StartQuestID = 1;
  assert.throws(() => extendPriestHealingItemCatalog(parent, changed));
});

test("common source derivation replaces just the old Blue Dragon block and keeps other effects", () => {
  const result = renderBlueDragonItemEffect(common, rules);
  const start = common.indexOf("\t// https://www.wowhead.com/classic/item=19288/"),
    end = common.indexOf("\n\t// https://www.wowhead.com/classic/item=19287/", start);
  assert(result.startsWith(common.slice(0, start)));
  assert(result.endsWith(common.slice(end)));
  assert(result.includes("stats.Spirit: 150"));
  assert(result.includes("Callback: core.CallbackOnCastComplete"));
  assert.throws(() => renderBlueDragonItemEffect(result, rules), /anchor changed/);
});

test("the set derivation binds the exact ID and does not insert an empty four-piece implementation", () => {
  const result = renderPriestHealingSetEffect(setSource, rules);
  assert(result.startsWith(setSource));
  assert(result.includes("ID: 549"));
  assert(result.includes("stats.SpellPower, 23"));
  assert(result.includes("stats.Stamina, 20"));
  assert(!result.slice(setSource.length).includes("4:"));
  assert.throws(() => renderPriestHealingSetEffect(result, rules));
});

test("capture provenance, extraction and derivation stay reproducible without modifying inputs", () => {
  for (const entry of Object.values(evidence.engine))
    assert.equal(createHash("sha256").update(entry.source).digest("hex"), entry.byteSha256);
  const before = JSON.stringify(evidence);
  assert.deepEqual(extractHealerItemRules(evidence), rules);
  assert.deepEqual(
    extendPriestHealingItemCatalog(parent, evidence),
    extendPriestHealingItemCatalog(parent, evidence),
  );
  assert.equal(JSON.stringify(evidence), before);
});
