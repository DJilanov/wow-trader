import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SIMULATOR_SPECS } from "@wow-trader/forever-data/simulator";
import { FOREVER_CLASS_APPEARANCES } from "./forever-classes";
import { getSimulatorClass, getSimulatorClassDirectory } from "./forever-simulator-directory";

describe("Encyclopedia-style simulator selection", () => {
  it("keeps the Encyclopedia class order, colours and local icons without needing a database", () => {
    const classes = getSimulatorClassDirectory();
    expect(classes.map((entry) => entry.name)).toEqual([
      "Warrior",
      "Paladin",
      "Hunter",
      "Rogue",
      "Priest",
      "Shaman",
      "Mage",
      "Warlock",
      "Druid",
    ]);
    for (const appearance of FOREVER_CLASS_APPEARANCES) {
      expect(classes.find((entry) => entry.slug === appearance.slug)).toMatchObject(appearance);
      expect(existsSync(join(process.cwd(), "public", appearance.icon))).toBe(true);
    }
  });
  it("includes each of the 15 individual profiles exactly once and keeps Raid separate", () => {
    const profiles = getSimulatorClassDirectory().flatMap((entry) => entry.profiles);
    expect(profiles).toHaveLength(15);
    expect(new Set(profiles.map((profile) => profile.slug)).size).toBe(15);
    expect(profiles.map((profile) => profile.slug).sort()).toEqual(
      SIMULATOR_SPECS.filter((spec) => spec.role !== "raid")
        .map((spec) => spec.slug)
        .sort(),
    );
    expect(profiles.some((profile) => profile.role === "raid")).toBe(false);
  });
  it("opens single-profile classes directly and makes multi-profile classes an explicit choice", () => {
    expect(getSimulatorClass("mage")?.href).toBe("/forever/simulator/mage");
    expect(getSimulatorClass("warrior")?.href).toBe(
      "/forever/simulator?class=warrior#simulator-profiles",
    );
    expect(getSimulatorClass("druid")?.profiles).toHaveLength(3);
    expect(getSimulatorClass("paladin")?.profiles.map((profile) => profile.slug)).toEqual([
      "protection-paladin",
      "retribution-paladin",
    ]);
    expect(getSimulatorClass("priest")?.description).toBe("Shadow · Smite");
  });
  it("ignores invalid class selections without silently choosing a different profile", () => {
    for (const slug of [undefined, "", "unknown", "Warrior", "../warrior", "raid"])
      expect(getSimulatorClass(slug)).toBeNull();
  });
});
