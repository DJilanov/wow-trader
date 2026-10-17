export function furyRotationCandidates(original, template = original) {
  if (!Array.isArray(original.priorityList) || !Array.isArray(template.priorityList))
    throw new Error("Expected a resolved Fury APL");
  const result = [
    {
      name: "Exact incumbent rotation",
      family: "incumbent",
      value: globalThis.structuredClone(original),
    },
  ];
  const seen = new Set([JSON.stringify(original)]);
  for (const heroicRage of [15, 20, 25, 30, 45, 60, 75, 90, null]) {
    for (const berserkerRage of [null, 0, 10, 20, 30]) {
      for (const stance of ["original25", "conservative10", "disabled"]) {
        for (const earlyRend of stance === "disabled" ? [false] : [false, true]) {
          const value = globalThis.structuredClone(template);
          const spell = (entry) => entry.action?.castSpell?.spellId?.spellId;
          if (stance === "disabled") {
            value.priorityList = value.priorityList.filter(
              (entry) => ![2457, 2458, 11585, 11574].includes(spell(entry)),
            );
          } else if (stance === "conservative10") {
            const switchStance = value.priorityList.find((entry) => spell(entry) === 2457);
            const limit = switchStance?.action.condition?.and?.vals.find(
              (entry) => entry.cmp?.lhs?.currentRage,
            );
            if (!limit?.cmp?.rhs?.const || limit.cmp.op !== "OpLe")
              throw new Error("Fury stance condition changed");
            limit.cmp.rhs.const.val = "10";
          }
          if (earlyRend) {
            const index = value.priorityList.findIndex((entry) => spell(entry) === 11574);
            if (index < 0) throw new Error("Fury Rend action changed");
            const [rend] = value.priorityList.splice(index, 1);
            const overpower = value.priorityList.findIndex((entry) => spell(entry) === 11585);
            if (overpower < 0) throw new Error("Fury Overpower action changed");
            value.priorityList.splice(overpower, 0, rend);
          }
          const heroic = value.priorityList.findIndex((entry) => spell(entry) === 25286);
          if (heroic < 0) throw new Error("Fury Heroic Strike priority changed");
          if (heroicRage === null) value.priorityList.splice(heroic, 1);
          else {
            const condition = value.priorityList[heroic].action.condition?.and?.vals.find(
              (entry) => entry.cmp?.lhs?.currentRage,
            );
            if (!condition?.cmp?.rhs?.const || condition.cmp.op !== "OpGe")
              throw new Error("Fury Heroic Strike condition changed");
            condition.cmp.rhs.const.val = String(heroicRage);
          }
          if (berserkerRage !== null) {
            const execute = value.priorityList.findIndex((entry) => spell(entry) === 20662);
            if (execute < 0) throw new Error("Fury Execute priority changed");
            value.priorityList.splice(execute, 0, {
              action: {
                condition: {
                  cmp: {
                    op: "OpLe",
                    lhs: { currentRage: {} },
                    rhs: { const: { val: String(berserkerRage) } },
                  },
                },
                castSpell: { spellId: { spellId: 18499 } },
              },
            });
          }
          const key = JSON.stringify(value);
          if (seen.has(key)) continue;
          seen.add(key);
          result.push({
            name: `${heroicRage === null ? "No Heroic Strike" : `Heroic Strike ≥${heroicRage}`} · ${berserkerRage === null ? "No explicit Berserker Rage" : `Berserker Rage ≤${berserkerRage}`} · ${stance} · ${earlyRend ? "early Rend" : "original Rend"}`,
            family: stance + " · " + (earlyRend ? "early Rend" : "original Rend"),
            value,
          });
        }
      }
    }
  }
  return result;
}
