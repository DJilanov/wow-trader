import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinRegenerationItems,
  renderPaladinRegenerationItems,
} from "./paladin-regeneration-items.mjs";
import {
  assertPaladinRegenerationHealingJob,
  parsePaladinRegenerationHealingJobReply,
} from "./paladin-regeneration-protocol.mjs";

const source = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("./fixtures/paladin-regeneration-item-source.v1.json.gz", import.meta.url),
      ),
    ),
  ),
  template = readFileSync(new URL("./paladin-regeneration-items.go", import.meta.url), "utf8"),
  sample = JSON.parse(
    readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
  );

test("current regeneration payloads retain party scope, shield linkage and area conditions", () => {
  const before = structuredClone(source),
    rules = extractPaladinRegenerationItems(source);
  assert.deepEqual(source, before);
  assert.deepEqual(
    [
      rules.baron.health,
      rules.baron.radius,
      rules.mark.shield,
      rules.mark.mana,
      rules.runeblade.health,
      rules.royalSeal.mp5,
    ],
    [4, 30, 500, 22, 60, 9],
  );
  assert.equal(rules.royalSeal.area, "haunted");
  assert.equal(rules.mark.manaRequiresShield, true);
  assert.equal(rules.serverMechanicsVerified, false);
});

test("changed triggers, health, regen, category or party radius require a fresh review", () => {
  for (const change of [
    (s) => {
      s.tables.ItemEffect[0].TriggerType = 2;
    },
    (s) => {
      s.tables.SpellEffect[0].EffectBasePointsF++;
    },
    (s) => {
      s.tables.SpellEffect[1].Variance = 0.5;
    },
    (s) => {
      s.tables.ItemEffect.find((r) => r.SpellID === 17252).SpellCategoryID = 1153;
    },
    (s) => {
      s.tables.SpellRadius[0].Radius = 40;
    },
    (s) => {
      s.tables.Spell.find((r) => r.id === 1318477).Description_lang = "Restores mana everywhere";
    },
  ]) {
    const copy = structuredClone(source);
    change(copy);
    assert.throws(() => extractPaladinRegenerationItems(copy));
  }
});

test("derived integration adds only the owned actor hooks and explicit area transport", () => {
  const rendered = renderPaladinRegenerationItems(source, template);
  assert(rendered.actor.includes("holy.registerKFCPaladinRegenerationItems()"));
  assert(rendered.cooldowns.includes("policy.SpellID == 17252"));
  assert(rendered.workload.includes("configureKFCPaladinWorkloadItemArea(sim,frame)"));
  assert(rendered.workload.includes('json:"itemArea,omitempty"'));
  assert.throws(() =>
    renderPaladinRegenerationItems(
      { ...source, integration: { ...source.integration, actor: "" } },
      template,
    ),
  );
});

test("one item area agrees with legacy Orb context and preserves older jobs", () => {
  assertPaladinRegenerationHealingJob(sample.request);
  for (const itemArea of ["neutral", "haunted", "wasteland"]) {
    assertPaladinRegenerationHealingJob({
      ...sample.request,
      workload: { ...sample.request.workload, itemArea },
    });
    assertPaladinRegenerationHealingJob({
      ...sample.request,
      workload: { ...sample.request.workload, itemArea, orbArea: itemArea },
    });
  }
  for (const itemArea of [null, "", true, "Haunted", 0, {}])
    assert.throws(() =>
      assertPaladinRegenerationHealingJob({
        ...sample.request,
        workload: { ...sample.request.workload, itemArea },
      }),
    );
  assert.throws(() =>
    assertPaladinRegenerationHealingJob({
      ...sample.request,
      workload: { ...sample.request.workload, itemArea: "haunted", orbArea: "neutral" },
    }),
  );
});

test("reply transport retains explicit area evidence and rejects malformed echoes", () => {
  parsePaladinRegenerationHealingJobReply(
    JSON.stringify(sample.reply),
    sample.request.id,
    sample.request.detail,
  );
  for (const itemArea of ["neutral", "haunted", "wasteland"]) {
    const reply = structuredClone(sample.reply);
    reply.result.itemArea = itemArea;
    assert.equal(
      parsePaladinRegenerationHealingJobReply(
        JSON.stringify(reply),
        sample.request.id,
        sample.request.detail,
      ).result.itemArea,
      itemArea,
    );
  }
  for (const itemArea of [null, "", 1, "everywhere"]) {
    const reply = structuredClone(sample.reply);
    reply.result.itemArea = itemArea;
    assert.throws(() =>
      parsePaladinRegenerationHealingJobReply(
        JSON.stringify(reply),
        sample.request.id,
        sample.request.detail,
      ),
    );
  }
});
