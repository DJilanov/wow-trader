import assert from "node:assert/strict";
import { test } from "node:test";
import {
  armsRotationCandidates,
  armsRotationForTalents,
  armsTalentSeeds,
} from "../infra/simulator/arms-policy.mjs";
import { decodeTalents, encodeTalents, talentProblem } from "../infra/simulator/talent-search.mjs";
import { resolvedWarriorPolicies } from "../infra/simulator/warrior-policies.mjs";

const spell = (entry) => entry.action?.castSpell?.spellId?.spellId;
const cast = (id) => ({ action: { castSpell: { spellId: { spellId: id } } } });
const fixture = {
  type: "TypeAPL",
  priorityList: [
    { ...cast(1719), action: { ...cast(1719).action, condition: { const: { val: "false" } } } },
    { action: { autocastOtherCooldowns: {} } },
    ...[2457, 2458, 11585, 11574, 20662, 21553, 1680, 11605, 1310222].map(cast),
    { action: { castSpell: { spellId: { spellId: 25286, tag: 1 } } } },
  ],
};
const fields = [
  "mortalStrike",
  "spearingStrike",
  "improvedSlam",
  "bloodthrill",
  ...Array.from({ length: 11 }, (_, i) => `fixture${i}`),
];
const trees = [
  {
    name: "Arms",
    talents: fields.map((fieldName, i) => ({
      fieldName,
      maxPoints: i < 2 ? 1 : i === 2 ? 2 : 5,
      location: { rowIdx: 0, colIdx: i },
    })),
  },
];
const talents = encodeTalents([[1, 1, 2, ...Array(9).fill(5), 2, 0, 0]]);

test("Arms policies preserve the incumbent and cover distinct priorities, rage fillers and stances", () => {
  const original = globalThis.structuredClone(fixture);
  const policies = armsRotationCandidates(fixture);
  assert.equal(policies.length, 451);
  assert.equal(
    new Set(policies.map((policy) => JSON.stringify(policy.value))).size,
    policies.length,
  );
  assert.deepEqual(policies[0].value, original);
  assert.deepEqual(fixture, original);
  assert(policies.some((policy) => policy.name.includes("No Heroic Strike")));
  assert(policies.some((policy) => policy.name.includes("Hamstring")));
  for (const policy of policies) {
    assert.deepEqual(
      policy.value.priorityList.find((entry) => spell(entry) === 1719).action.condition,
      { const: { val: "false" } },
    );
    const ids = policy.value.priorityList.map(spell).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, "Duplicated spell action");
    assert(ids.includes(21553));
    if (policy.family === "no-rend") assert(!ids.includes(11574));
    const heroic = policy.value.priorityList.find((entry) => spell(entry) === 25286);
    if (heroic) assert.equal(heroic.action.castSpell.spellId.tag, 1);
  }
  assert.deepEqual(
    new Set(policies.slice(1).map((policy) => policy.stance)),
    new Set(["battle", "execute-berserker", "reactive"]),
  );
  const changed = policies.find((policy) => policy.stance === "execute-berserker");
  changed.value.priorityList.find(
    (entry) => spell(entry) === 2458,
  ).action.condition.and.vals[0].isExecutePhase.threshold = "E35";
  assert(
    !policies
      .filter((policy) => policy !== changed)
      .some((policy) => JSON.stringify(policy.value).includes("E35")),
  );
  assert(!JSON.stringify(armsRotationCandidates(fixture)).includes("E35"));
});

test("Arms policy rejects changed templates and restores removed actions from the frozen template", () => {
  const incumbent = armsRotationCandidates(fixture).find(
    (policy) => policy.name.includes("No filler") && policy.family === "no-rend",
  );
  const policies = armsRotationCandidates(incumbent.value, fixture);
  assert.deepEqual(policies[0].value, incumbent.value);
  assert(
    policies.some((policy) => policy.value.priorityList.some((entry) => spell(entry) === 11605)),
  );
  assert.throws(() => armsRotationCandidates({ priorityList: [] }), /Arms action/);
  const reckless = globalThis.structuredClone(fixture);
  delete reckless.priorityList[0].action.condition;
  assert.throws(() => armsRotationCandidates(reckless), /disable Recklessness/);
});

test("Arms seeds spend exactly 51 legal points and never drop Mortal Strike", () => {
  const seeds = armsTalentSeeds(trees, [talents, talents]);
  assert.equal(new Set(seeds).size, seeds.length);
  assert(seeds.length > 1 && seeds.includes(talents));
  for (const value of seeds) {
    const points = decodeTalents(trees, value);
    assert.equal(talentProblem(trees, points), "");
    assert.equal(points[0][0], 1);
  }
  const noMortal = decodeTalents(trees, talents);
  noMortal[0][0] = 0;
  noMortal[0][14]++;
  assert.throws(() => armsTalentSeeds(trees, [encodeTalents(noMortal)]), /requires Mortal Strike/);
});

test("untalented Spearing Strike is removed from the actual simulated and selected APL", () => {
  const without = decodeTalents(trees, talents);
  without[0][1] = 0;
  without[0][14]++;
  const value = armsRotationForTalents(trees, encodeTalents(without), fixture);
  assert(!value.priorityList.some((entry) => spell(entry) === 1310222));
  assert(fixture.priorityList.some((entry) => spell(entry) === 1310222));
  assert.deepEqual(armsRotationForTalents(trees, talents, fixture), fixture);
});

test("an untalented Bloodthrill condition is explicitly false, including beneath negation", () => {
  const reactive = armsRotationCandidates(fixture).find((policy) => policy.stance === "reactive");
  const original = globalThis.structuredClone(reactive.value);
  assert.deepEqual(armsRotationForTalents(trees, talents, reactive.value), original);
  const without = decodeTalents(trees, talents);
  without[0][3] = 0;
  without[0][13] += 4;
  without[0][14]++;
  const value = armsRotationForTalents(trees, encodeTalents(without), reactive.value);
  assert(!JSON.stringify(value).includes("56638"));
  assert(JSON.stringify(value).includes("1282733"));
  const returnToBerserker = value.priorityList.find((entry) => spell(entry) === 2458);
  assert.deepEqual(returnToBerserker.action.condition.and.vals[0].not.val.or.vals[1], {
    const: { val: "false" },
  });
  assert.deepEqual(reactive.value, original);
});

test("the final policy bank is resolved and deduplicated on the chosen Arms talents", () => {
  const without = decodeTalents(trees, talents);
  without[0][1] = 0;
  without[0][14]++;
  const chosen = encodeTalents(without);
  const original = armsRotationForTalents(trees, chosen, fixture);
  const baseline = {
    profile: "warrior",
    variant: "arms",
    settings: { player: { talentsString: chosen, rotation: original } },
  };
  const control = {
    ...baseline,
    settings: { player: { talentsString: talents, rotation: fixture } },
  };
  const policies = resolvedWarriorPolicies(baseline, control, trees);
  assert.deepEqual(policies[0].value, original);
  assert.equal(
    new Set(policies.map((policy) => JSON.stringify(policy.value))).size,
    policies.length,
  );
  assert(
    policies.every(
      (policy) => !policy.value.priorityList.some((entry) => spell(entry) === 1310222),
    ),
  );
  assert.throws(
    () => resolvedWarriorPolicies(baseline, { ...control, variant: "fury" }, trees),
    /Wrong fixed/,
  );
  assert.throws(
    () => resolvedWarriorPolicies({ ...baseline, variant: "unknown" }, control, trees),
    /Unsupported/,
  );
});
