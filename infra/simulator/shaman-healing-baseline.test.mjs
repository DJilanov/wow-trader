import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import { extractShamanHealingSource } from "./shaman-healing-source.mjs";
import { createShamanHealingSpellPolicy } from "./shaman-healing-eligibility.mjs";
import { renderShamanHealingBaseline } from "./shaman-healing-baseline.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  evidence = fixture("shaman-client-healing-source.v1.json.gz"),
  books = fixture("healer-spell-eligibility-source.v1.json.gz"),
  policy = createShamanHealingSpellPolicy({
    classSource: evidence,
    books: linkClientRaidSpellBooks({
      reference: extractClassicRaidSpellBooks(books.atlas.source),
      tables: new Map(Object.entries(books.tables)),
      source: books.source,
    }),
  }),
  source = extractShamanHealingSource(evidence),
  implementation = readFileSync(new URL("./shaman-healing-baseline.go", import.meta.url), "utf8");

test("Shaman baseline rendering keeps all eighteen pre-raid basic ranks and their actual payloads", () => {
  const rendered = renderShamanHealingBaseline({ implementation, source, spellPolicy: policy });
  assert.equal((rendered.match(/\{ID:/g) ?? []).length, 18);
  assert(!rendered.includes("ID:25357"));
  assert(rendered.includes('ID:10623,Family:"chain-heal",Rank:3'));
  assert(
    rendered.includes("Coefficient:0.714,CastMs:2500,GCDMs:1500,ChainTargets:3,ChainAmplitude:0.5"),
  );
  assert(rendered.includes('ID:10396,Family:"healing-wave",Rank:9'));
  assert(!rendered.includes("// KFC_SHAMAN_CLIENT_HEALING_RANKS"));
  assert.equal(
    rendered.slice(rendered.indexOf("func (rank")),
    implementation.slice(implementation.indexOf("func (rank")),
  );
});

test("Shaman renderer rejects a changed source identity or accidental raid-book inclusion", () => {
  const changed = structuredClone(policy);
  changed.actions.find((entry) => entry.spellId === 25357).status = "conditional-client-candidate";
  assert.throws(() =>
    renderShamanHealingBaseline({ implementation, source, spellPolicy: changed }),
  );
  assert.throws(() =>
    renderShamanHealingBaseline({
      implementation,
      source: { ...source, sourceBuild: 1 },
      spellPolicy: policy,
    }),
  );
  assert.throws(() =>
    renderShamanHealingBaseline({
      implementation: implementation.replace("// KFC_SHAMAN_CLIENT_HEALING_RANKS", ""),
      source,
      spellPolicy: policy,
    }),
  );
});
