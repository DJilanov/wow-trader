import assert from "node:assert/strict";
import test from "node:test";
import { simulationHash } from "./simulation-fingerprint.mjs";
import {
  createShamanTestedGearPrior,
  shamanTestedGearPriorMatcher,
} from "./shaman-tested-gear-prior.mjs";

function fixture() {
  const profile = { id: "profile", slots: Array.from({ length: 17 }, () => [1, 2, 3, 4, 5, 6]) };
  const domain = {
    schema: "kfc-shaman-equipped-domain.v1",
    profiles: [profile],
    items: [1, 2, 3, 4, 5, 6].map((id) => ({ id })),
  };
  const fingerprints = Object.fromEntries(
    domain.items.map((item) => [item.id, simulationHash(item)]),
  );
  const gear = (slot, id, enchant = 0) => ({
    items: Array.from({ length: 17 }, (_, index) => ({
      id: index === slot ? id : 1,
      ...(index === slot && enchant ? { enchant } : {}),
    })),
  });
  const rankedCandidates = [1, 2, 3, 4, 5].map((id) => ({
    key: "request-" + id,
    gear: gear(0, id),
    groups: ["slot-0"],
    eligible: true,
  }));
  const prior = createShamanTestedGearPrior({
    domain,
    profileId: profile.id,
    source: { modelIdentity: simulationHash("model"), recordSha256: simulationHash("report") },
    itemFingerprints: fingerprints,
    rankedCandidates,
  });
  const matches = shamanTestedGearPriorMatcher({
    prior,
    domain,
    profileId: profile.id,
    itemFingerprints: fingerprints,
  });
  return { domain, profile, fingerprints, gear, prior, matches };
}

test("a prior retains distinct leading candidates without reusing their old numerical scores", () => {
  const { gear, prior, matches } = fixture();
  assert.equal(prior.groups["slot-0"].signatures.length, 5);
  assert.equal(prior.numericalResultsReusable, false);
  assert.equal(matches({ group: "slot-0", gear: gear(0, 5) }), true);
  assert.equal(matches({ group: "slot-0", gear: gear(0, 6) }), false);
});

test("new or changed item facts, explicit effect changes and empty groups always receive new tests", () => {
  const { domain, profile, fingerprints, gear, prior, matches } = fixture();
  assert.equal(matches({ group: "slot-1", gear: gear(1, 6) }), true);
  for (const current of [
    { ...fingerprints, 6: simulationHash("changed stats") },
    { ...fingerprints, 6: undefined },
  ]) {
    const match = shamanTestedGearPriorMatcher({
      prior,
      domain,
      profileId: profile.id,
      itemFingerprints: current,
    });
    assert.equal(match({ group: "slot-0", gear: gear(0, 6) }), true);
  }
  const forced = shamanTestedGearPriorMatcher({
    prior,
    domain,
    profileId: profile.id,
    itemFingerprints: fingerprints,
    forceRetestItemIds: [6],
  });
  assert.equal(forced({ group: "slot-0", gear: gear(0, 6) }), true);
});

test("failed candidates cannot occupy the leading slots and duplicates do not consume the limit", () => {
  const { domain, profile, fingerprints, gear } = fixture();
  const candidates = [
    { key: "failed", gear: gear(0, 6), groups: ["slot-0"], eligible: false },
    ...Array.from({ length: 8 }, (_, i) => ({
      key: "duplicate-" + i,
      gear: gear(0, 1),
      groups: ["slot-0"],
      eligible: true,
    })),
    { key: "second", gear: gear(0, 2), groups: ["slot-0"], eligible: true },
  ];
  const prior = createShamanTestedGearPrior({
    domain,
    profileId: profile.id,
    source: { modelIdentity: simulationHash("model"), recordSha256: simulationHash("report") },
    itemFingerprints: fingerprints,
    rankedCandidates: candidates,
    limit: 2,
  });
  assert.deepEqual(prior.groups["slot-0"].sourceKeys, ["duplicate-0", "second"]);
});

test("ordered rings remain distinct and enchant priors apply to the current item", () => {
  const { domain, profile, fingerprints, gear } = fixture(),
    rings = gear(10, 2);
  rings.items[11] = { id: 3 };
  const prior = createShamanTestedGearPrior({
    domain,
    profileId: profile.id,
    source: { modelIdentity: simulationHash("model"), recordSha256: simulationHash("report") },
    itemFingerprints: fingerprints,
    rankedCandidates: [
      { key: "rings", gear: rings, groups: ["rings"], eligible: true },
      { key: "enchant", gear: gear(0, 2, 99), groups: ["enchant-0"], eligible: true },
    ],
  });
  const matches = shamanTestedGearPriorMatcher({
    prior,
    domain,
    profileId: profile.id,
    itemFingerprints: fingerprints,
  });
  const reversed = structuredClone(rings);
  reversed.items[10] = { id: 3 };
  reversed.items[11] = { id: 2 };
  assert.equal(matches({ group: "rings", gear: rings }), true);
  assert.equal(matches({ group: "rings", gear: reversed }), false);
  assert.equal(matches({ group: "enchant-0", gear: gear(0, 4, 99) }), true);
});

test("new set geometry falls back to complete group coverage", () => {
  const { domain, profile, fingerprints, gear } = fixture();
  domain.items[0].setId = 77;
  profile.slots = Array.from({ length: 17 }, (_, index) => (index < 2 ? [1, 2] : [2]));
  const prior = createShamanTestedGearPrior({
    domain,
    profileId: profile.id,
    source: { modelIdentity: simulationHash("model"), recordSha256: simulationHash("report") },
    itemFingerprints: fingerprints,
    rankedCandidates: [{ key: "set", gear: gear(0, 1), groups: ["set-77"], eligible: true }],
  });
  const next = structuredClone(domain);
  next.profiles[0].slots[2] = [1, 2];
  const matches = shamanTestedGearPriorMatcher({
    prior,
    domain: next,
    profileId: profile.id,
    itemFingerprints: fingerprints,
  });
  assert.equal(matches({ group: "set-77", gear: gear(2, 1) }), true);
});
