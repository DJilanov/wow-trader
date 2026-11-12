import { describe, expect, it } from "vitest";
import { campaignGroundJourney, campaignJourneyInstructions } from "./campaign-transport.js";

const stormwindRegion = ["1453", "1429", "1436", "1433", "1431"];
const northernKalimdor = ["1439", "1440", "1442", "1438", "1457"];
const crossings = stormwindRegion.flatMap((east) =>
  northernKalimdor.flatMap(
    (west) =>
      [
        [east, west],
        [west, east],
      ] as const,
  ),
);

describe("confirmed Stormwind–Auberdine crossing", () => {
  it.each(crossings)("uses the harbor ship for %s → %s", (from, to) => {
    const route = campaignGroundJourney(from, to);
    expect(route).not.toBeNull();
    expect(route![0]!.from).toBe(from);
    expect(route!.at(-1)!.to).toBe(to);
    expect(
      route!.some(
        (leg) =>
          leg.mode === "boat" &&
          ((leg.from === "1453" && leg.to === "1439") ||
            (leg.from === "1439" && leg.to === "1453")),
      ),
    ).toBe(true);
    expect(
      route!.some((leg) => [leg.from, leg.to].some((zone) => zone === "1434" || zone === "1413")),
    ).toBe(false);
    for (let index = 1; index < route!.length; index++)
      expect(route![index]!.from).toBe(route![index - 1]!.to);
  });

  it("uses the same crossing in player-facing travel instructions", () => {
    const text = campaignJourneyInstructions("Duskwood", "Ashenvale", "warrior").join(" ");
    expect(text).toContain("Stormwind Harbor");
    expect(text).toContain("Auberdine");
    expect(text).not.toContain("Stranglethorn");
    expect(text).not.toContain("Booty Bay");
  });

  it("retains journeys whose intended destination is Stranglethorn or Ratchet", () => {
    expect(campaignGroundJourney("1431", "1434")?.map((leg) => [leg.from, leg.to])).toEqual([
      ["1431", "1434"],
    ]);
    expect(campaignGroundJourney("1413", "1434")?.map((leg) => leg.mode)).toEqual(["boat"]);
    expect(
      campaignGroundJourney("1431", "1413")?.some(
        (leg) => leg.from === "1434" && leg.to === "1413",
      ),
    ).toBe(true);
  });

  it("retains the tram, empty same-zone journeys and unknown-zone failures", () => {
    expect(campaignGroundJourney("Stormwind", "Ironforge")?.map((leg) => leg.mode)).toEqual([
      "tram",
    ]);
    expect(campaignGroundJourney("Darkshore", "1439")).toEqual([]);
    expect(campaignGroundJourney("unknown", "Ashenvale")).toBeNull();
  });
});
