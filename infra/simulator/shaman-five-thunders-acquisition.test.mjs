import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  prepareShamanFiveThundersAccessDomain,
  resolveShamanFiveThundersSources,
  reviewShamanFiveThundersAcquisition,
  shamanFiveThundersAccessPolicy,
} from "./shaman-five-thunders-acquisition.mjs";
import {
  collectShamanHealingEquipment,
  legalShamanHealingGear,
} from "./shaman-healing-equipment.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name + ".json.gz", import.meta.url))));
const source = fixture("shaman-five-thunders-source.v1"),
  delivery = fixture("shaman-five-thunders-delivery-source.v1");
const equipment = fixture("shaman-healing-equipment-source.v1");
const items = new Map(equipment.items.map((row) => [row.id, row]));
const sources = new Map(equipment.sources.map((row) => [row.id, row]));
const context = {
  ...equipment.context,
  currentIds: new Set(),
  originalItems: Array(17).fill(undefined),
};
const input = { source, delivery, items, sources, context };
const professions = [1, 2, 3, 4, 8, 11];
const baselineDomain = {
  schema: "kfc-shaman-healing-equipment-domain.v1",
  statPruning: false,
  qualityPruning: false,
  weaponStyleLocked: false,
  profiles: [1, 2].flatMap((faction) =>
    professions.flatMap((first, index) =>
      professions.slice(index + 1).map((second) => {
        const profileContext = {
          ...context,
          faction,
          factionName: faction === 1 ? "Alliance" : "Horde",
          professions: [first, second],
        };
        const pool = collectShamanHealingEquipment(items, sources, profileContext);
        const seed = structuredClone(equipment.seed);
        if (!pool.slots[13].includes(seed.items[13].id)) {
          const alternative = pool.slots[13].find((id) => id !== seed.items[12].id);
          assert(alternative, "Fixture needs a second non-Engineering trinket");
          seed.items[13] = { id: alternative };
        }
        assert(legalShamanHealingGear(seed, items, sources, profileContext));
        return {
          id: `${faction}-${first}-${second}`,
          faction,
          professions: [first, second],
          seed,
          slots: pool.slots,
        };
      }),
    ),
  ),
};
const domainInput = {
  database: { items: equipment.items },
  sources: equipment.sources,
  baselineDomain,
  source,
  delivery,
};

test("all four current page bundles match the source IDs without verifying character progress", () => {
  const review = reviewShamanFiveThundersAcquisition({ source, delivery });
  assert.deepEqual(
    review.milestones.map((row) => row.rewardIds.length),
    [1, 2, 3, 2],
  );
  assert.equal(review.deliveryPageCount, 4);
  assert.equal(review.rawWearClassMask, -1);
  assert.equal(review.referenceAcquisitionFaction, "Horde");
  assert.equal(review.currentCharacterProgressVerified, false);
  assert.equal(review.liveServerAccessVerified, false);
  assert.equal(review.publicationAllowed, false);
});

test("changed reward IDs, choice semantics, products and class associations are rejected", () => {
  for (const edit of [
    (value) => {
      value.delivery.relations[1].rewardIds.pop();
    },
    (value) => {
      value.delivery.relations[1].rewardDelivery = "choose-one";
    },
    (value) => {
      value.delivery.relations[0].url = value.delivery.relations[0].url.replace(
        "/forever/",
        "/classic/",
      );
    },
    (value) => {
      value.delivery.sourceFaction = "Alliance";
    },
    (value) => {
      value.source.acquisition.relations[0].requiredClassMask = 2;
    },
    (value) => {
      value.delivery.liveServerAccessVerified = true;
    },
  ]) {
    const changed = structuredClone({ source, delivery });
    edit(changed);
    assert.throws(() => reviewShamanFiveThundersAcquisition(changed));
  }
});

test("baseline sources stay unadmitted and each explicit milestone adds only its cumulative rewards", () => {
  const expected = [
    [],
    [22095],
    [22095, 22098, 22099],
    [22095, 22096, 22098, 22099, 22100, 22101],
    [22095, 22096, 22097, 22098, 22099, 22100, 22101, 22102],
  ];
  for (let phase = 0; phase <= 4; phase++) {
    const resolved = resolveShamanFiveThundersSources({
      ...input,
      policy: shamanFiveThundersAccessPolicy(phase),
    });
    assert.deepEqual(resolved.availableIds, expected[phase]);
    assert.equal(resolved.sourceOverrides.length, expected[phase].length);
    for (const id of expected[4]) {
      assert.deepEqual(sources.get(id).sources, []);
      assert.equal(resolved.sources.get(id).sources.length, expected[phase].includes(id) ? 1 : 0);
      assert.equal(resolved.sources.get(id).serverAccessVerified, false);
      assert.equal(resolved.sources.get(id).acquisitionAdmitted, false);
    }
  }
});

test("quest bundles coexist in whole loadouts and later rewards cannot leak into earlier milestones", () => {
  const domain = prepareShamanFiveThundersAccessDomain(domainInput);
  const base = domain.profiles.find((row) => row.id === "2-4-11");
  const phases = [1, 2, 3, 4].map((phase) =>
    domain.profiles.find((row) => row.id === `${base.id}:five-thunders-through-${phase}`),
  );
  for (const profile of phases) {
    const resolved = resolveShamanFiveThundersSources({ ...input, policy: profile.accessPolicy });
    assert(legalShamanHealingGear(profile.fullRewardWitness, items, resolved.sources, context));
    assert.equal(
      profile.fullRewardWitness.items.filter((row) => items.get(row.id)?.setId === 519).length,
      profile.availableRewardIds.length,
    );
  }
  const early = resolveShamanFiveThundersSources({ ...input, policy: phases[0].accessPolicy });
  assert.equal(
    legalShamanHealingGear(phases[1].fullRewardWitness, items, early.sources, context),
    false,
  );
  const choices = resolveShamanFiveThundersSources({ ...input, policy: phases[1].accessPolicy });
  for (const id of [22098, 22099]) choices.sources.get(id).sources[0].questId = 8942;
  assert.equal(
    legalShamanHealingGear(phases[1].fullRewardWitness, items, choices.sources, context),
    false,
  );
});

test("all profession profiles, seventeen slots and 4620 complete set comparisons are preserved", () => {
  const domain = prepareShamanFiveThundersAccessDomain(domainInput);
  assert.equal(domain.profileCount, 90);
  assert.equal(domain.baselineProfiles, 30);
  assert.equal(domain.conditionalProfiles, 60);
  assert.equal(domain.multiPieceSetComparisons, 4620);
  const original = new Set(baselineDomain.profiles.flatMap((row) => row.slots.flat()));
  assert.equal(domain.totalDistinctCandidates, original.size + 8);
  for (const base of baselineDomain.profiles) {
    const kept = domain.profiles.find((row) => row.id === base.id);
    assert.deepEqual(kept.slots, base.slots);
    assert.deepEqual(kept.seed, base.seed);
  }
  for (const profile of domain.profiles) {
    assert.equal(profile.slots.length, 17);
    assert.equal(
      profile.setCandidates.length,
      2 ** profile.availableRewardIds.length - 1 - profile.availableRewardIds.length,
    );
    assert.equal(
      new Set(profile.setCandidates.map((row) => row.itemIds.join(","))).size,
      profile.setCandidates.length,
    );
    if (profile.availableRewardIds.length >= 2) {
      const last = profile.setCandidates.at(-1);
      assert.deepEqual(last.itemIds, profile.availableRewardIds);
      assert.deepEqual(profile.mandatorySetCandidateIds, [last.id]);
    }
  }
  assert.equal(domain.parentCatalogChanged, false);
  assert.equal(domain.runtimeAndWorkloadBindingRequired, true);
  assert.equal(domain.numericalQualification, false);
});

test("uncaptured faction routes, other classes, forged policies and changed current items are rejected", () => {
  const policy = shamanFiveThundersAccessPolicy(4);
  assert.throws(() =>
    resolveShamanFiveThundersSources({
      ...input,
      policy,
      context: { ...context, faction: 1, factionName: "Alliance" },
    }),
  );
  assert.throws(() =>
    resolveShamanFiveThundersSources({ ...input, policy, context: { ...context, playerClass: 4 } }),
  );
  for (const phase of [-1, 1.5, 5, NaN, "4"])
    assert.throws(() => shamanFiveThundersAccessPolicy(phase));
  assert.throws(() =>
    resolveShamanFiveThundersSources({
      ...input,
      policy: { ...policy, liveServerAccessVerified: true },
    }),
  );
  const changedItems = structuredClone(items);
  changedItems.get(22095).stats[3]++;
  assert.throws(() => resolveShamanFiveThundersSources({ ...input, policy, items: changedItems }));
  const changedSources = structuredClone(sources);
  changedSources.get(22095).sources = [{ kind: "vendor" }];
  assert.throws(() =>
    resolveShamanFiveThundersSources({ ...input, policy, sources: changedSources }),
  );
});

test("caller data and independent profile outputs cannot overwrite each other", () => {
  const before = structuredClone({ source, delivery, equipment, baselineDomain });
  const domain = prepareShamanFiveThundersAccessDomain(domainInput);
  const a = domain.profiles.find((row) => row.id === "2-4-11:five-thunders-through-2");
  const b = domain.profiles.find((row) => row.id === "2-4-11:five-thunders-through-3");
  a.sourceOverrides[0].sources[0].quests[0].id = 0;
  a.fullRewardWitness.items[5].id = 0;
  a.setCandidates[0].gear.items[5].id = 0;
  assert.equal(b.sourceOverrides[0].sources[0].quests[0].id, 8918);
  assert.equal(b.fullRewardWitness.items[5].id, 22095);
  assert.deepEqual({ source, delivery, equipment, baselineDomain }, before);
  const resolved = resolveShamanFiveThundersSources({
    ...input,
    policy: shamanFiveThundersAccessPolicy(4),
  });
  resolved.sources.get(872).name = "changed output";
  assert.notEqual(sources.get(872).name, "changed output");
});

test("omitted profiles, invented profession pairs and changed baseline pools cannot narrow coverage", () => {
  for (const edit of [
    (value) => {
      value.profiles.pop();
    },
    (value) => {
      value.profiles[0] = structuredClone(value.profiles[1]);
    },
    (value) => {
      value.profiles[0].id = "1-9-10";
      value.profiles[0].professions = [9, 10];
    },
    (value) => {
      value.profiles[0].slots[0].pop();
    },
    (value) => {
      value.weaponStyleLocked = true;
    },
  ]) {
    const changed = structuredClone(baselineDomain);
    edit(changed);
    assert.throws(() =>
      prepareShamanFiveThundersAccessDomain({ ...domainInput, baselineDomain: changed }),
    );
  }
});
