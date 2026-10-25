import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { renderPriestDragonMark } from "./priest-dragon-mark.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  integration = fixture("priest-dragon-mark-integration-source.v1.json.gz"),
  evidence = fixture("druid-dragon-mark-source.v1.json.gz"),
  implementation = readFileSync(new URL("./priest-dragon-mark.go", import.meta.url), "utf8");

test("Priest ring uses captured shield-linked mana with class-scoped registration", () => {
  const input = { ...integration, evidence, implementation },
    before = structuredClone(input),
    result = renderPriestDragonMark(input);
  assert.deepEqual(input, before);
  assert.deepEqual(
    [
      result.rules.itemId,
      result.rules.shield,
      result.rules.manaPerTick,
      result.rules.durationMs,
      result.rules.cooldownMs,
    ],
    [13143, 500, 22, 1800000, 1800000],
  );
  assert.equal(result.rules.scope, "healing-priest-only");
  assert.equal(result.rules.manaRequiresActiveShield, true);
  assert(result.actor.includes("hpriest.registerKFCPriestDragonMark()"));
  assert(result.cooldowns.includes("policy.SpellID == 17252"));
});

test("missing ownership, shield linkage or integration anchors cannot silently produce an admitted model", () => {
  for (const change of [
    { actor: "" },
    { cooldowns: "" },
    { implementation: implementation.replace("if !shield.IsActive()", "if false") },
    { implementation: implementation.replace("item.ID == 13143", "item.ID == 0") },
  ])
    assert.throws(() =>
      renderPriestDragonMark({ ...integration, evidence, implementation, ...change }),
    );
});

test("changed current mana or item cooldown requires fresh source admission", () => {
  for (const mutate of [
    (s) => {
      s.tables.SpellEffect[1].EffectBasePointsF++;
    },
    (s) => {
      s.tables.ItemEffect[0].SpellCategoryID = 1153;
    },
  ]) {
    const copy = structuredClone(evidence);
    mutate(copy);
    assert.throws(() => renderPriestDragonMark({ ...integration, evidence: copy, implementation }));
  }
});
