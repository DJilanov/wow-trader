import { describe, expect, it } from "vitest";
import { emptyPremadeProgress, premadeProgressSchema } from "./premade-model.js";
import { recordPremadeMemberIdentity } from "./premade-identity.js";

describe("party member identity", () => {
  it("preserves actual XP, rewards, history and unknown legacy members", () => {
    const progress = emptyPremadeProgress();
    progress.members[1]!.level = 35;
    progress.members[1]!.currentXp = 1234;
    progress.members[1]!.questStates["153"] = "rewarded";
    const before = structuredClone(progress);
    const next = recordPremadeMemberIdentity(progress, 1, { raceId: "gnome", classSlug: "priest" });
    expect(next.members[1]).toMatchObject({
      raceId: "gnome",
      classSlug: "priest",
      level: 35,
      currentXp: 1234,
      questStates: { "153": "rewarded" },
    });
    expect(next.members[0]!.raceId).toBeUndefined();
    expect(premadeProgressSchema.parse(JSON.parse(JSON.stringify(next)))).toEqual(next);
    expect(progress).toEqual(before);
  });
  it("refuses incompatible identities and invalid member slots", () => {
    const progress = emptyPremadeProgress();
    expect(() =>
      recordPremadeMemberIdentity(progress, 1, { raceId: "gnome", classSlug: "paladin" }),
    ).toThrow(/class/);
    expect(() =>
      recordPremadeMemberIdentity(progress, 1, { raceId: "orc", classSlug: "warrior" }),
    ).toThrow(/Alliance/);
    expect(() =>
      recordPremadeMemberIdentity(progress, 5, { raceId: null, classSlug: null }),
    ).toThrow(/member/);
    const invalid = structuredClone(progress);
    invalid.members[1]!.raceId = "gnome";
    invalid.members[1]!.classSlug = "paladin";
    expect(() => premadeProgressSchema.parse(invalid)).toThrow(/race/);
  });
});
