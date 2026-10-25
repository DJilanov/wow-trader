import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { renderShamanDirectHealing } from "./shaman-direct-healing-model.mjs";
import { extractShamanHealingSource } from "./shaman-healing-source.mjs";

const source = extractShamanHealingSource(
    JSON.parse(
      gunzipSync(
        readFileSync(
          new URL("./fixtures/shaman-client-healing-source.v1.json.gz", import.meta.url),
        ),
        { maxOutputLength: 4_000_000 },
      ),
    ),
  ),
  implementation = readFileSync(new URL("./shaman-direct-healing.go", import.meta.url), "utf8");

test("direct component renders all sixteen source ranks without Chain Heal or later heals", () => {
  const rendered = renderShamanDirectHealing({ implementation, source });
  assert(!rendered.includes("// KFC_SHAMAN_DIRECT_CLIENT_RANKS"));
  assert.equal((rendered.match(/\{ID:/g) ?? []).length, 16);
  assert(rendered.includes("ID:25357,Rank:10"));
  assert(rendered.includes("ID:10468,Rank:6"));
  assert(!/ID:(1064|10622|10623|408521),/.test(rendered));
});

test("rendering requires complete source-only ranks and a unique integration marker", () => {
  assert.throws(() => renderShamanDirectHealing({ implementation: "missing", source }));
  assert.throws(() =>
    renderShamanDirectHealing({ implementation: implementation + implementation, source }),
  );
  const incomplete = globalThis.structuredClone(source);
  incomplete.ranks = incomplete.ranks.filter((rank) => rank.id !== 331);
  assert.throws(() => renderShamanDirectHealing({ implementation, source: incomplete }));
  const admitted = globalThis.structuredClone(source);
  admitted.modelAdmission = true;
  assert.throws(() => renderShamanDirectHealing({ implementation, source: admitted }));
});

test("invalid or chained direct values fail without mutating the captured source", () => {
  for (const mutate of [
    (rank) => {
      rank.base = Number.NaN;
    },
    (rank) => {
      rank.chainTargets = 3;
    },
    (rank) => {
      rank.rank = 1;
    },
  ]) {
    const invalid = globalThis.structuredClone(source);
    mutate(invalid.ranks.find((rank) => rank.id === 25357));
    assert.throws(() => renderShamanDirectHealing({ implementation, source: invalid }));
  }
  const before = JSON.stringify(source);
  assert.equal(
    renderShamanDirectHealing({ implementation, source }),
    renderShamanDirectHealing({ implementation, source }),
  );
  assert.equal(JSON.stringify(source), before);
});
