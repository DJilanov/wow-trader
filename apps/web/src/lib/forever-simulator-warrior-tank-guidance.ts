import { createHash } from "node:crypto";
import { z } from "zod";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";

const settingsSchema = z
  .object({
    player: z
      .object({
        talentsString: z.literal("35-05-251333120330021351"),
        rotation: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
    encounter: z
      .object({
        duration: z.number().positive(),
        targets: z
          .array(z.object({ level: z.number().int().positive() }).passthrough())
          .min(1)
          .max(3),
      })
      .passthrough(),
  })
  .passthrough();
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]): number => a.localeCompare(b, "en"))
        .map(([key, entry]): [string, unknown] => [key, canonical(entry)]),
    );
  return value;
}
export function testedWarriorTankGuidance(
  settings: unknown,
  scenario: "raid" | "solo",
): NonNullable<LocalSimulatorBuildReview["rotationGuidance"]> {
  const parsed = settingsSchema.parse(settings),
    expected =
      scenario === "raid"
        ? { duration: 300, targets: 1, level: 63 }
        : { duration: 60, targets: 3, level: 62 };
  if (
    parsed.encounter.duration !== expected.duration ||
    parsed.encounter.targets.length !== expected.targets ||
    parsed.encounter.targets.some((target): boolean => target.level !== expected.level)
  )
    throw new Error("Tank guidance encounter differs from the measured scenario");
  const rotationHash = createHash("sha256")
    .update(JSON.stringify(canonical(parsed.player.rotation)))
    .digest("hex");
  if (rotationHash !== "7eac9986830f51f44492947964a0e8c692ce30ac306e9ddcf0829f0672bc6db1")
    throw new Error("The Warrior tank rotation needs updated guidance");
  return {
    talents: "8/5/38",
    scenario:
      scenario === "raid"
        ? "Five-minute encounter against one level-63 target with the recorded full raid support."
        : "One-minute encounter against three level-62 targets with the recorded self-buff setup.",
    instruction:
      "This summarizes the fixed tested priorities. The Rotation tab contains the complete conditions, including rage reserved for Sunder Armor and Shield Block.",
    priorities: [
      "Refresh Battle Shout within 3 seconds of expiry when at least 8 seconds remain in the fight and you have 10 rage.",
      "Use Shield Wall below 35% health, followed by Last Stand below 30% health when available.",
      "Use Shield Block with at least 15 rage when its remaining duration is under 1 second.",
      "Use Bloodrage below 35 rage while above 50% health.",
      "Refresh five Sunder Armor stacks within 8 seconds of expiry when the fight will outlast the current debuff.",
      "Refresh Thunder Clap within 3 seconds of expiry with at least 4 seconds left in the fight; refresh Demoralizing Shout within 4 seconds with at least 5 seconds left.",
      "Build Sunder Armor to five stacks before the remaining threat fillers.",
      "Against three or more targets, use additional Thunder Claps when the saved rage-reserve conditions allow.",
      "Use Revenge before Shield Slam when available, keeping enough rage for required Sunder Armor and Shield Block refreshes.",
      "With at least 20 rage and the same reserves protected, queue Cleave against multiple targets or Heroic Strike against one target.",
      "Use additional Sunder Armor as the remaining filler at 45 rage or more.",
    ],
    caveats: [
      "Fixed talents and rotation; this gear update did not perform a deep rotation timing search.",
      "The readable summary compresses the saved APL's rage-reserve conditions. Live-server effects and item acquisition remain unverified.",
    ],
  };
}
