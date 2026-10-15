import { describe, expect, it } from "vitest";
import { estimateGroupCombat } from "./group-combat.js";

describe("conservative group combat planning", () => {
  it("credits one fifth of solo kill XP per player, not the full camp reward", () => {
    expect(estimateGroupCombat({ soloXpPerKill: 200, kills: 100, partySize: 5 })).toMatchObject({
      xpPerPlayer: 4000,
      creditFraction: 0.2,
      status: "scenario",
    });
  });
  it("does not multiply shared kill quotas by the number of players", () => {
    expect(estimateGroupCombat({ soloXpPerKill: 200, kills: 10, partySize: 5 }).xpPerPlayer).toBe(
      400,
    );
  });
  it("distinguishes a confirmed zero from an unmeasured combat value", () => {
    expect(estimateGroupCombat({ soloXpPerKill: 0, kills: 10, partySize: 5 }).xpPerPlayer).toBe(0);
    expect(estimateGroupCombat({ soloXpPerKill: null, kills: 10, partySize: 5 })).toMatchObject({
      xpPerPlayer: null,
      status: "unknown",
    });
  });
  it.each([
    { soloXpPerKill: -1, kills: 10, partySize: 5 },
    { soloXpPerKill: 100, kills: 1.5, partySize: 5 },
    { soloXpPerKill: 100, kills: 10, partySize: 0 },
  ])("rejects invalid values", (input) => {
    expect(() => estimateGroupCombat(input)).toThrow(/Invalid/);
  });
});
