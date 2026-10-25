import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import { createShamanHealingSpellPolicy } from "./shaman-healing-eligibility.mjs";
import { extractShamanHealingTalentSource } from "./shaman-healing-talents-source.mjs";
import {
  extractShamanRiptideSource,
  integrateShamanRiptide,
  renderShamanRiptide,
} from "./shaman-riptide.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  evidence = fixture("shaman-client-healing-source.v1.json.gz"),
  adapter = fixture("shaman-healing-talents-source.v1.json.gz"),
  bookSource = fixture("healer-spell-eligibility-source.v1.json.gz"),
  books = linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(bookSource.atlas.source),
    tables: new Map(Object.entries(bookSource.tables)),
    source: bookSource.source,
  }),
  domain = extractShamanHealingTalentSource({ evidence, adapter }),
  spellPolicy = createShamanHealingSpellPolicy({ classSource: evidence, books }),
  input = { evidence, domain, spellPolicy },
  source = extractShamanRiptideSource(input),
  implementation = String(readFileSync(new URL("./shaman-riptide.go", import.meta.url)));

test("Riptide retains three source ranks and the full Healing Way prerequisite", () => {
  assert.deepEqual(source.prerequisite, { field: "healingWay", rank: 3 });
  assert.deepEqual(
    source.ranks.map((rank) => rank.id),
    [408521, 1239242, 1239243],
  );
  assert.deepEqual(
    source.ranks.map((rank) => rank.mana),
    [245, 300, 385],
  );
  assert.deepEqual(
    source.ranks.map((rank) => rank.periodic.base),
    [89, 115, 161],
  );
  for (const rank of source.ranks) {
    assert.equal(rank.direct.coefficient, 0.214);
    assert.equal(rank.periodic.coefficient, 0.1);
    assert.equal(rank.tickMs, 3000);
    assert.equal(rank.durationMs, 15000);
    assert.equal(rank.sharedCooldownMs, 6000);
    assert.equal(rank.chainHealBonusPercent, 25);
  }
  assert.equal(source.chainBonusTiming, "on-heal-reference");
  assert.equal(source.ownerDeath, "hot-continues-reference");
  for (const key of [
    "hotSnapshotVerified",
    "hotCriticalRuleVerified",
    "hotHasteVerified",
    "chainBonusPropagationVerified",
    "chainHotConsumptionVerified",
    "fullClassAdmission",
    "startsNewClassClock",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(source[key], false);
});

test("Riptide extraction rejects changed effects, ownership, eligibility and build", () => {
  const changed = structuredClone(evidence);
  changed.rawTables.SpellEffect.find(
    (row) => row.SpellID === 1239243 && row.EffectIndex === 1,
  ).EffectBonusCoefficient = 0.2;
  assert.throws(() => extractShamanRiptideSource({ ...input, evidence: changed }));
  const wrongDomain = structuredClone(domain);
  wrongDomain.fields.find((row) => row.field === "riptide").prerequisiteNodeIds = [];
  assert.throws(() => extractShamanRiptideSource({ ...input, domain: wrongDomain }));
  const wrongPolicy = structuredClone(spellPolicy);
  wrongPolicy.actions = wrongPolicy.actions.filter((row) => row.spellId !== 1239243);
  assert.throws(() => extractShamanRiptideSource({ ...input, spellPolicy: wrongPolicy }));
  assert.throws(() =>
    extractShamanRiptideSource({ ...input, domain: { ...domain, sourceBuild: "other" } }),
  );
});

test("Riptide rendering preserves coefficients and does not mutate source inputs", () => {
  const before = structuredClone(input),
    rendered = renderShamanRiptide({ implementation, source });
  assert(!rendered.includes("// KFC_SHAMAN_RIPTIDE_VALUES"));
  assert.equal((rendered.match(/DirectCoefficient:0.214/g) ?? []).length, 3);
  assert.equal((rendered.match(/PeriodicCoefficient:0.1,/g) ?? []).length, 3);
  assert.equal((rendered.match(/CooldownMs:6000/g) ?? []).length, 3);
  assert.deepEqual(input, before);
  const next = extractShamanRiptideSource(input);
  next.ranks[0].mana = 1;
  assert.equal(source.ranks[0].mana, 245);
  assert.throws(() => renderShamanRiptide({ implementation: "", source }));
  assert.throws(() => renderShamanRiptide({ implementation, source: { ...source, ranks: [] } }));
});

test("actual Riptide parent integration changes only owned class boundaries", () => {
  const bytes = readFileSync(
    new URL("./fixtures/shaman-riptide-parent-source.v1.json.gz", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "4aeff5d45768df09782a6f29d6c2553a960d6eab318b6fc669d85db5a08b839e",
  );
  const parent = JSON.parse(gunzipSync(bytes));
  for (const file of Object.values(parent.files))
    assert.equal(createHash("sha256").update(file.source).digest("hex"), file.byteSha256);
  const original = Object.fromEntries(
      Object.entries(parent.files).map(([name, file]) => [name, file.source]),
    ),
    before = structuredClone(original),
    integrated = integrateShamanRiptide(original);
  assert.deepEqual(original, before);
  assert(
    integrated.baseline.includes(
      "riptideBonus, riptideAll := resto.prepareKFCRiptideChain(sim, target)",
    ),
  );
  assert(integrated.baseline.includes("result.Damage *= healingScale"));
  assert(integrated.baseline.includes("result.Threat *= healingScale"));
  assert(integrated.baseline.includes("scale *= rank.ChainAmplitude"));
  assert(integrated.actives.includes('field.Name() == "riptide"'));
  assert(
    integrated.baseline.indexOf("resto.registerKFCShamanRiptide()") <
      integrated.baseline.indexOf("resto.registerKFCShamanResourceActives()"),
  );
  assert.throws(() => integrateShamanRiptide(integrated));
  assert.throws(() => integrateShamanRiptide({ ...original, actives: "" }));
});
