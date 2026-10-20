import assert from "node:assert/strict";

export function completeSimulatorStatLabels(source) {
  const pattern = /^export const statNames: Map<Stat, string> = new Map\(\[[\s\S]*?^\]\);/gm;
  const blocks = [...source.matchAll(pattern)];
  assert.equal(blocks.length, 1, "Simulator stat-name source contract changed");
  const block = blocks[0][0];
  const label = "\t[Stat.StatHealingPower, 'Healing Power'],";
  if (block.includes("Stat.StatHealingPower")) {
    assert.equal(block.split("Stat.StatHealingPower").length, 2, "Duplicate Healing Power label");
    assert(block.split("\n").includes(label), "Conflicting Healing Power label");
    return source;
  }
  const marker = "\t[Stat.StatSpellDamage, 'Spell Damage'],";
  assert.equal(block.split(marker).length, 2, "Missing unambiguous spell-stat label anchor");
  return source.replace(pattern, () => block.replace(marker, marker + "\n" + label));
}
