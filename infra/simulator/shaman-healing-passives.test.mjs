import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractShamanHealingTalentSource,
  extractShamanHealingPassiveSource,
} from "./shaman-healing-talents-source.mjs";
import {
  integrateShamanHealingPassives,
  renderShamanHealingPassives,
} from "./shaman-healing-passives.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  evidence = fixture("shaman-client-healing-source.v1.json.gz"),
  adapter = fixture("shaman-healing-talents-source.v1.json.gz"),
  domain = extractShamanHealingTalentSource({ evidence, adapter }),
  passives = extractShamanHealingPassiveSource({ evidence, domain }),
  implementation = String(readFileSync(new URL("./shaman-healing-passives.go", import.meta.url))),
  baseline = String(readFileSync(new URL("./shaman-healing-baseline.go", import.meta.url)));

test("Shaman passive renderer preserves learned curves and admits exactly nine owned fields", () => {
  const before = structuredClone({ domain, passives }),
    rendered = renderShamanHealingPassives({ implementation, domain, passives });
  assert(!rendered.includes("// KFC_SHAMAN_HEALING_PASSIVE_VALUES"));
  assert.equal((rendered.match(/Tree:\d+,Index:\d+,Maximum:/g) ?? []).length, 9);
  assert.match(
    rendered,
    /"healing_way":\{Tree:2,Index:12,Maximum:3,Effects:\[\]\[\]float64\{\{0,8,17,25\}\}\}/,
  );
  assert.match(
    rendered,
    /"mindfulness":\{Tree:2,Index:2,Maximum:3,Effects:\[\]\[\]float64\{\{0,17,33,50\}\}\}/,
  );
  assert.match(
    rendered,
    /"mental_quickness":\{Tree:1,Index:14,Maximum:2,Effects:\[\]\[\]float64\{\{0,15,30\},\{0,15,30\}\}\}/,
  );
  assert(!rendered.includes('"restorative_totems":{'));
  assert(!rendered.includes('"totemic_focus":{'));
  assert.deepEqual({ domain, passives }, before);
});

test("Shaman passive integration changes only the controlled derived class factory", () => {
  const derived = integrateShamanHealingPassives(baseline);
  assert(derived.includes("return newKFCShamanPassiveAgent(character, player)"));
  assert(derived.includes("func (resto *RestorationShaman) Initialize()"));
  assert.throws(() => integrateShamanHealingPassives(derived), /Unknown Shaman baseline factory/);
  assert.throws(() => integrateShamanHealingPassives(baseline + baseline));
});

test("Shaman passive rendering rejects missing curves, invalid operations and source drift", () => {
  for (const mutate of [
    (source) => {
      source.talents.find((row) => row.field === "healingWay").effects[0].operation = 1;
    },
    (source) => {
      source.talents.find((row) => row.field === "healingWay").effects[0].byRank.pop();
    },
    (source) => {
      source.talents.find((row) => row.field === "mindfulness").effects[0].byRank[0] = 1;
    },
    (source) => {
      source.talents.find((row) => row.field === "mentalQuickness").maximum = 3;
    },
    (source) => {
      source.talents = source.talents.filter((row) => row.field !== "tidalFocus");
    },
  ]) {
    const changed = structuredClone(passives);
    mutate(changed);
    assert.throws(() => renderShamanHealingPassives({ implementation, domain, passives: changed }));
  }
  assert.throws(() => renderShamanHealingPassives({ implementation: "", domain, passives }));
});
