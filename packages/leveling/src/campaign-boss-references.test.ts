import { describe, expect, it } from "vitest";
import { attachReviewedCampaignBossReferences } from "./campaign-boss-references.js";
import { combatDatasetSchema, combatNpcSchema } from "./combat-model.js";
import { PREMADE_STOPS, premadeEntryLevel } from "./premade.js";
import { emptyPremadeProgress } from "./premade-model.js";
import base from "./fixtures/arathi-wanted-bounties-70205.json" with { type: "json" };
import mograine from "./fixtures/mograine-client-statistic-70205.json" with { type: "json" };

describe("reviewed campaign boss identities", () => {
  it("adds only the reviewed Mograine identity and retains every other combat fact", () => {
    const data = combatDatasetSchema.parse({ ...base.combat,
      npcs: [...base.combat.npcs, combatNpcSchema.parse(mograine.npc)] });
    const before = structuredClone(data), next = attachReviewedCampaignBossReferences(data);
    expect(next.bossReferences?.find((reference) => reference.npcId === 3976)?.identityEvidence)
      .toBe("client-instance-kill-statistic");
    expect({ ...next, bossReferences: data.bossReferences }).toEqual(data);
    expect(attachReviewedCampaignBossReferences(next)).toBe(next);
    expect(data).toEqual(before);
  });

  it("leaves other builds and absent or differently named creatures unchanged", () => {
    const data = combatDatasetSchema.parse(base.combat);
    expect(attachReviewedCampaignBossReferences(data)).toBe(data);
    const foreign = { ...data, targetBuild: 70450, npcs: [combatNpcSchema.parse(mograine.npc)] };
    expect(attachReviewedCampaignBossReferences(foreign)).toBe(foreign);
    const renamed = { ...data, npcs: [{ ...combatNpcSchema.parse(mograine.npc), name: "Other creature" }] };
    expect(attachReviewedCampaignBossReferences(renamed)).toBe(renamed);
  });

  it("rejects an existing contradictory instance context", () => {
    const data = attachReviewedCampaignBossReferences(combatDatasetSchema.parse({ ...base.combat,
      npcs: [...base.combat.npcs, combatNpcSchema.parse(mograine.npc)] }));
    const contradictory = { ...data, bossReferences: data.bossReferences!.map((reference) =>
      reference.npcId === 3976 ? { ...reference, instanceMapId: 43 } : reference) };
    expect(() => attachReviewedCampaignBossReferences(contradictory)).toThrow("conflicts with reviewed client identity");
  });

  it("uses37 for the experienced SM party and preserves38 for conservative play", () => {
    const stop = PREMADE_STOPS.find((entry) => entry.id === "scarlet-monastery")!;
    const progress = emptyPremadeProgress();
    expect(premadeEntryLevel(stop, { ...progress, difficultyPolicy: "experienced-premade" })).toBe(37);
    expect(premadeEntryLevel(stop, { ...progress, difficultyPolicy: "at-level" })).toBe(38);
  });
});
