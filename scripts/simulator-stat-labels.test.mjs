import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { completeSimulatorStatLabels } from "../infra/simulator/stat-labels.mjs";

const root = resolve(import.meta.dirname, ".."),
  source = await readFile(
    resolve(root, ".cache/forever-sim-upstream/ui/core/proto_utils/names.ts"),
    "utf8",
  ),
  proto = await readFile(
    resolve(root, ".cache/forever-sim-upstream/ui/core/proto/common.ts"),
    "utf8",
  ),
  anchor = "\t[Stat.StatSpellDamage, 'Spell Damage'],",
  label = "\t[Stat.StatHealingPower, 'Healing Power'],";

test("the actual missing enum41 label is repaired without changing other names, sorting or calculations", () => {
  assert.match(proto, /StatHealingPower = 41,/);
  const fixed = completeSimulatorStatLabels(source);
  assert.equal(fixed, source.replace(anchor, anchor + "\n" + label));
  assert.equal(fixed.split(label).length, 2);
  assert.equal(fixed.replace("\n" + label, ""), source);
});

test("an upstream-corrected label is preserved rather than duplicated", () => {
  const fixed = completeSimulatorStatLabels(source);
  assert.equal(completeSimulatorStatLabels(fixed), fixed);
});

test("conflicting, duplicate or structurally changed stat-name contracts fail closed", () => {
  for (const value of [
    source.replace(anchor, anchor + "\n" + label.replace("Healing Power", "Other stat")),
    source.replace(anchor, anchor + "\n" + label + "\n" + label),
    source.replace(anchor, ""),
    source.replace("export const statNames:", "export const changedNames:"),
    source + "\n" + source,
  ])
    assert.throws(() => completeSimulatorStatLabels(value));
});
