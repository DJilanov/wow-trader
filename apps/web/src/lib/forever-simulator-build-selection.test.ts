import { describe, expect, it } from "vitest";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import {
  simulatorBuildForLink,
  simulatorBuildForPreset,
  simulatorBuildLabel,
  simulatorBuildSelectionStorageKey,
} from "./forever-simulator-build-selection";

function build(id: string, displayName?: string, provisional = false): LocalSimulatorBuildReview {
  return {
    id,
    ...(displayName ? { displayName } : {}),
    spec: "warrior/fury",
    faction: "Horde",
    scenario: "standard",
    stage: "reviewed",
    status: "reviewed",
    href: null,
    referenceDps: 100,
    requiresProvisionalEnchantOptIn: provisional,
    warnings: [],
  };
}

describe("Reviewed build selection", () => {
  it("scopes a remembered choice to its exact model/profile without including share data", () => {
    const release = "a".repeat(24),
      path = `/forever-sim/${release}/balance_druid/`,
      key = simulatorBuildSelectionStorageKey(path);
    expect(key).toBe(`kfc.simulator.reviewed-build-selection.v1:${release}:balance_druid`);
    expect(simulatorBuildSelectionStorageKey(`/tools${path}`)).toBe(key);
    expect(simulatorBuildSelectionStorageKey(`${path}#saved-share`)).toBe(key);
    expect(simulatorBuildSelectionStorageKey(path.replace("balance_druid", "mage"))).not.toBe(key);
    expect(simulatorBuildSelectionStorageKey(path.replace(release, "b".repeat(24)))).not.toBe(key);
    for (const invalid of [
      `https://other.invalid${path}`,
      `/forever-sim/bad/balance_druid/`,
      `https://user:password@helper.invalid${path}`,
      "/forever/simulator/balance-druid",
    ])
      expect(simulatorBuildSelectionStorageKey(invalid)).toBeNull();
  });
  const twoHand = build("two-hand-fury-static", "Two-hand Fury · Standard enchants");
  const arms = build("arms-static", "Arms · Standard enchants");
  const combat = build("rogue-combat-static", "Combat · Backstab · Standard enchants");
  const bm = build("hunter-beast-mastery-static", "Beast Mastery · first-pass tested");
  const builds = [
    build("arms-proc", "Arms · Provisional proc enchants", true),
    arms,
    twoHand,
    combat,
    bm,
  ];

  it("synchronizes the two-hand and Arms configuration chips with their standard library entries", () => {
    expect(simulatorBuildForPreset(builds, "Two-hand Fury · pre-raid tested")).toBe(twoHand);
    expect(simulatorBuildForPreset(builds, "Arms · pre-raid tested")).toBe(arms);
  });
  it("supports reviewed class-specific labels", () => {
    expect(simulatorBuildForPreset(builds, "Combat · Backstab · pre-raid tested")).toBe(combat);
    expect(simulatorBuildForPreset(builds, "Beast Mastery · first-pass tested")).toBe(bm);
  });
  it("does not mislabel starters, custom setups or proc opt-ins as the standard reviewed scenario", () => {
    expect(simulatorBuildForPreset(builds, "Fury (Adaptive AoE) · pre-raid starter")).toBeNull();
    expect(simulatorBuildForPreset(builds, "Arms · Provisional proc enchants")).toBeNull();
  });
  it("retains the existing labels for builds without an explicit display name", () => {
    expect(simulatorBuildLabel(build("fury-static"))).toBe("Fury · Standard enchants");
  });
  it("loads complete reviewed scenarios from legacy community links, without enabling proc opt-ins", () => {
    const arms = build("arms-alliance");
    expect(simulatorBuildForLink([arms, twoHand], "Arms 34/17/0")).toBe(arms);
    expect(simulatorBuildForLink([arms, twoHand], "2H Bloodthirst 20/31/0")).toBe(twoHand);
    expect(simulatorBuildForLink([arms, twoHand], twoHand.id)).toBe(twoHand);
    expect(simulatorBuildForLink(builds, "arms-proc")).toBeNull();
    expect(simulatorBuildForLink(builds, "unreviewed")).toBeNull();
    expect(simulatorBuildForLink(builds, ["Arms 34/17/0"])).toBeNull();
  });
  it("routes legacy and current Hunter names to the measured builds without approving the experimental Pet/Melee starter", () => {
    const mm = build("hunter-marksmanship-static", "Marksmanship · first-pass tested");
    const sv = build("hunter-survival-static", "Survival · first-pass tested");
    for (const name of ["Marksmanship 5/35/11", "Marksmanship 7/40/4"])
      expect(simulatorBuildForLink([bm, mm, sv], name)).toBe(mm);
    for (const name of ["Survival 7/11/33", "Survival 16/4/31"])
      expect(simulatorBuildForLink([bm, mm, sv], name)).toBe(sv);
    expect(simulatorBuildForPreset([bm, mm, sv], mm.displayName!)).toBe(mm);
    expect(simulatorBuildForPreset([bm, mm, sv], sv.displayName!)).toBe(sv);
    expect(simulatorBuildForLink([bm, mm, sv], "Pet/Melee 16/11/24")).toBeNull();
    expect(simulatorBuildForLink([bm], "Survival 7/11/33")).toBeNull();
  });
  it("maps old and current Cat links and configuration labels to the measured Cat build, not a tank starter", () => {
    const cat = build("feral-cat-static", "Feral Cat · first-pass tested");
    for (const name of ["Feral Cat 7/34/10", "Feral Cat 8/33/10", "feral-cat-static"])
      expect(simulatorBuildForLink([cat], name)).toBe(cat);
    expect(simulatorBuildForPreset([cat], cat.displayName!)).toBe(cat);
    expect(simulatorBuildForLink([cat], "Feral Tank")).toBeNull();
    expect(simulatorBuildForLink([], "Feral Cat 8/33/10")).toBeNull();
  });
  it("maps the old and measured Moonkin links to the approved caster build without selecting Cat or tank", () => {
    const moonkin = build("balance-static", "Balance · first-pass tested");
    const cat = build("feral-cat-static", "Feral Cat · first-pass tested");
    for (const name of [
      "Balance 38/0/13",
      "Balance 39/0/12",
      "Moonkin 38/0/13",
      "Moonkin 39/0/12",
      "balance-static",
    ])
      expect(simulatorBuildForLink([cat, moonkin], name)).toBe(moonkin);
    expect(simulatorBuildForPreset([cat, moonkin], moonkin.displayName!)).toBe(moonkin);
    expect(simulatorBuildForLink([cat], "Balance 39/0/12")).toBeNull();
  });
});
