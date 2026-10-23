import assert from "node:assert/strict";

/** Aggregate the actual worker counters, retaining flat threat and non-damaging actions. */
export function tankThreatBreakdown(unit, database, iterations, durationSeconds) {
  assert(iterations > 0 && durationSeconds > 0);
  const spells = new Map(database.spellIcons.map((row) => [row.id, row.name]));
  const items = new Map(
    [...database.items, ...(database.itemIcons ?? [])].map((row) => [row.id, row.name]),
  );
  const divisor = iterations * durationSeconds;
  const groups = new Map();
  for (const action of unit.actions) {
    const id = action.id;
    assert(id && (id.spellId || id.itemId || id.otherId), "Missing action identity");
    const key = id.spellId
      ? `spell:${id.spellId}`
      : id.itemId
        ? `item:${id.itemId}`
        : `other:${id.otherId}`;
    const name = id.spellId
      ? (spells.get(id.spellId) ?? `Spell ${id.spellId}`) +
        (id.spellId === 414647 ? " (bleed)" : "")
      : id.itemId
        ? (items.get(id.itemId) ?? `Item ${id.itemId}`)
        : id.otherId === "OtherActionAttack"
          ? "Weapon attacks"
          : id.otherId.replace(/^OtherAction/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
    const row = groups.get(key) ?? { key, name, damagePerSecond: 0, threatPerSecond: 0 };
    for (const target of action.targets) {
      assert(
        Number.isFinite(target.damage ?? 0) && Number.isFinite(target.threat ?? 0),
        "Invalid action counters",
      );
      row.damagePerSecond += (target.damage ?? 0) / divisor;
      row.threatPerSecond += (target.threat ?? 0) / divisor;
    }
    groups.set(key, row);
  }
  const rows = [...groups.values()]
    .filter((row) => row.damagePerSecond !== 0 || row.threatPerSecond !== 0)
    .sort(
      (left, right) =>
        right.threatPerSecond - left.threatPerSecond || left.key.localeCompare(right.key),
    );
  for (const [field, metric] of [
    ["damagePerSecond", "dps"],
    ["threatPerSecond", "threat"],
  ]) {
    const total = rows.reduce((sum, row) => sum + row[field], 0);
    assert(
      Math.abs(total - unit[metric].avg) <= Math.max(0.000001, unit[metric].avg * 1e-9),
      `Action counters do not reconcile with ${metric}`,
    );
  }
  return rows;
}
