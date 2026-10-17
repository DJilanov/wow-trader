import assert from "node:assert/strict";
import { decodeTalents, encodeTalents, talentNeighbors, talentProblem } from "./talent-search.mjs";

const spellId = (entry) => entry.action?.castSpell?.spellId?.spellId;
const cast = (id, condition) => ({
  action: { castSpell: { spellId: { spellId: id } }, ...(condition ? { condition } : {}) },
});
const rage = (op, amount) => ({
  cmp: { op, lhs: { currentRage: {} }, rhs: { const: { val: String(amount) } } },
});
const active = (id) => ({ auraIsActive: { auraId: { spellId: id } } });
const not = (val) => ({ not: { val } });
const and = (...vals) => (vals.length === 1 ? vals[0] : { and: { vals } });
const or = (...vals) => (vals.length === 1 ? vals[0] : { or: { vals } });
const execute = { isExecutePhase: { threshold: "E20" } };
const rendMissing = { not: { val: { dotIsActive: { spellId: { spellId: 11574 } } } } };
const overpowerReady = or(active(1282733), active(56638));

export function armsTalentSeeds(trees, originals) {
  const result = new Set();
  const mortalStrike = trees
    .flatMap((tree, ti) => tree.talents.map((talent, index) => ({ ...talent, ti, index })))
    .find((talent) => talent.fieldName === "mortalStrike");
  assert(mortalStrike, "Arms Mortal Strike talent is missing");
  for (const original of originals) {
    const points = decodeTalents(trees, original);
    assert.equal(talentProblem(trees, points), "");
    assert.equal(points[mortalStrike.ti][mortalStrike.index], 1, "Arms requires Mortal Strike");
    const canonical = encodeTalents(points);
    result.add(canonical);
    for (const candidate of talentNeighbors(trees, canonical, { mortalStrike: 1 }))
      result.add(candidate);
  }
  return [...result];
}

export function armsRotationForTalents(trees, talents, rotation) {
  const points = decodeTalents(trees, talents);
  assert.equal(talentProblem(trees, points), "");
  const ranks = Object.fromEntries(
    trees.flatMap((tree, ti) =>
      tree.talents.map((talent, index) => [talent.fieldName, points[ti][index]]),
    ),
  );
  const resolveAura = (node) => {
    if (!ranks.bloodthrill && node?.auraIsActive?.auraId?.spellId === 56638)
      return { const: { val: "false" } };
    if (Array.isArray(node)) return node.map(resolveAura);
    if (node && typeof node === "object")
      return Object.fromEntries(
        Object.entries(node).map(([key, value]) => [key, resolveAura(value)]),
      );
    return node;
  };
  const value = resolveAura(rotation);
  if (!ranks.spearingStrike)
    value.priorityList = value.priorityList.filter((entry) => spellId(entry) !== 1310222);
  return value;
}

export function armsRotationCandidates(original, template = original) {
  assert(
    Array.isArray(original.priorityList) && Array.isArray(template.priorityList),
    "Expected a resolved Arms APL",
  );
  const managed = [2457, 2458, 11585, 11574, 20662, 21553, 1680, 11605, 1310222, 25286, 7373];
  for (const id of managed.filter((id) => id !== 7373))
    assert.equal(
      template.priorityList.filter((entry) => spellId(entry) === id).length,
      1,
      `Arms action ${id} changed`,
    );
  const reckless = template.priorityList.filter((entry) => spellId(entry) === 1719);
  assert.equal(reckless.length, 1, "Arms Recklessness action changed");
  assert.deepEqual(
    reckless[0].action.condition,
    { const: { val: "false" } },
    "Arms benchmark must disable Recklessness",
  );
  const prefix = template.priorityList.filter((entry) => !managed.includes(spellId(entry)));
  const priorities = [
    { name: "bleed-first", ids: [11574, 11585, 20662, 21553, 1680, 1310222, 11605] },
    { name: "overpower-first", ids: [11585, 11574, 20662, 21553, 11605, 1680, 1310222] },
    { name: "mortal-first", ids: [20662, 21553, 11585, 11574, 11605, 1310222, 1680] },
    { name: "slam-first", ids: [11574, 11585, 20662, 11605, 21553, 1310222, 1680] },
    { name: "no-rend", ids: [20662, 21553, 11585, 11605, 1310222, 1680] },
  ];
  const dumps = [
    { name: "Slam", slam: 15, hamstring: null },
    { name: "Hamstring", slam: null, hamstring: 30 },
    { name: "Slam + Hamstring", slam: 15, hamstring: 30 },
    { name: "No filler", slam: null, hamstring: null },
    { name: "Reserved rage", slam: 50, hamstring: 60 },
  ];
  const result = [
    {
      name: "Exact incumbent rotation",
      family: "incumbent",
      stance: "incumbent",
      value: globalThis.structuredClone(original),
    },
  ];
  const seen = new Set([JSON.stringify(original)]);
  for (const priority of priorities) {
    for (const heroic of [30, 45, 60, 75, 90, null]) {
      for (const dump of dumps) {
        for (const stance of ["battle", "execute-berserker", "reactive"]) {
          const value = {
            ...globalThis.structuredClone(template),
            priorityList: globalThis.structuredClone(prefix),
          };
          if (stance === "battle") value.priorityList.push(cast(2457));
          else if (stance === "execute-berserker")
            value.priorityList.push(
              cast(2458, and(execute, rage("OpLe", 25))),
              cast(2457, not(execute)),
            );
          else
            value.priorityList.push(
              cast(
                2457,
                and(
                  rage("OpLe", 25),
                  or(overpowerReady, ...(priority.name === "no-rend" ? [] : [rendMissing])),
                ),
              ),
            );
          for (const id of priority.ids) {
            if (id === 11605 && dump.slam === null) continue;
            let condition;
            if (id === 11574) condition = rendMissing;
            if (id === 11605) condition = rage("OpGe", dump.slam);
            if (id === 1310222) condition = rage("OpGe", 15);
            value.priorityList.push(cast(id, condition));
            if (stance === "reactive" && id === 11585)
              value.priorityList.push(
                cast(
                  2458,
                  and(
                    not(overpowerReady),
                    ...(priority.name === "no-rend" ? [] : [not(rendMissing)]),
                  ),
                ),
              );
          }
          if (heroic !== null) {
            const heroicStrike = cast(25286, and(rage("OpGe", heroic), not(execute)));
            heroicStrike.action.castSpell.spellId.tag = 1;
            value.priorityList.push(heroicStrike);
          }
          if (dump.hamstring !== null)
            value.priorityList.push(cast(7373, and(rage("OpGe", dump.hamstring), not(execute))));
          const key = JSON.stringify(value);
          if (seen.has(key)) continue;
          seen.add(key);
          result.push({
            name: `${priority.name} · ${heroic === null ? "No Heroic Strike" : `Heroic Strike ≥${heroic}`} · ${dump.name} · ${stance}`,
            family: priority.name,
            stance,
            value: globalThis.structuredClone(value),
          });
        }
      }
    }
  }
  return result;
}
