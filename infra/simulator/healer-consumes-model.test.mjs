import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { extractHealerConsumeRules, renderHealerConsumeRules } from "./healer-consumes-model.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
function fixture(name, checksum) {
  const b = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(sha(b), checksum);
  return JSON.parse(gunzipSync(b));
}
const source = fixture(
    "healer-consumes-source.v1.json.gz",
    "bc6b8140b87c349182e3e0b2f8da9ce91920bf08353c3e2284e6077b9d057396",
  ),
  engine = fixture(
    "healer-consumes-engine-source.v1.json.gz",
    "f3ff215ab840f62278bfbfe4f7a6a1e9415549beac7b292ff26db5051de72659",
  );
assert.equal(sha(engine.source.text), engine.source.byteSha256);
test("current consume effects distinguish damage-only, paired healing and mana stats", () => {
  const rules = extractHealerConsumeRules(source);
  assert.deepEqual(rules.supremePower, { spellDamage: 150, healingPower: 0 });
  assert.deepEqual(rules.lesserManaOil, { mp5: 10, healingPower: 20 });
  assert.deepEqual(rules.wizardOil, { spellDamage: 24, healingPower: 24 });
  assert.deepEqual(rules.sagefishDelight, { spellDamage: 7 });
  assert.deepEqual(rules.tenderWolfSteak, { agility: 15 });
  assert.equal(rules.publicationAllowed, false);
});
test("changed consume chains or payloads cannot reuse a previous model", () => {
  for (const change of [
    (x) => {
      x.effects.find((e) => e.SpellID === 17628).EffectAura = 135;
    },
    (x) => {
      x.effects.find((e) => e.SpellID === 25115 && e.EffectIndex === 1).EffectBasePointsF = 0;
    },
    (x) => {
      x.effects.find((e) => e.SpellID === 25115 && e.EffectIndex === 0).EffectBasePointsF = 8;
    },
    (x) => {
      x.enchants.find((e) => e.id === 2625).EffectArg[0] = 25111;
    },
    (x) => {
      x.effects.find((e) => e.SpellID === 1248395 && e.EffectIndex === 1).EffectTriggerSpell =
        1248421;
    },
  ]) {
    const next = globalThis.structuredClone(source);
    change(next);
    assert.throws(() => extractHealerConsumeRules(next));
  }
});
test("the derived model preserves unrelated effects and retains Classic branches", () => {
  const before = engine.source.text,
    after = renderHealerConsumeRules(before, extractHealerConsumeRules(source));
  assert.notEqual(after, before);
  assert.equal(renderHealerConsumeRules(before, extractHealerConsumeRules(source)), after);
  for (const marker of [
    "case proto.WeaponImbue_WizardOil:",
    "case proto.Food_FoodNightfinSoup:",
    "case proto.ManaRegenElixir_GreaterMagebloodElixir:",
  ]) {
    const start = before.indexOf(marker);
    assert(start >= 0);
    const end = before.indexOf("case proto.", start + marker.length);
    assert(after.includes(before.slice(start, end)));
  }
  assert(after.includes("else { character.AddStat(stats.SpellPower, 150) }"));
  assert(after.includes("else { character.AddStat(stats.MP5,8) }"));
  assert(after.includes("else { character.AddStat(stats.MP5,6) }"));
  assert(after.includes("stats.Stamina:12,stats.Spirit:12"));
  assert.throws(
    () => renderHealerConsumeRules(after, extractHealerConsumeRules(source)),
    /source anchor changed/,
  );
});
