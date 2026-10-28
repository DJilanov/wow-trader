import { createHash } from "node:crypto";
import { z } from "zod";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";

const settingsSchema = z.object({
  player: z.object({
    class: z.literal("ClassPaladin"),
    talentsString: z.literal("-5520513321301551-15102"),
    protectionPaladin: z.object({
      options: z.object({
        primarySeal: z.literal("Righteousness"),
        righteousFury: z.literal(true),
      }),
    }),
    rotation: z.record(z.string(), z.unknown()),
  }),
  encounter: z.object({
    duration: z.number().positive(),
    targets: z.array(z.object({ level: z.number().int().positive() })).min(1),
  }),
});

export function readPaladinTankRotationGuidance(
  settings: unknown,
  scenario: "raid" | "solo",
): NonNullable<LocalSimulatorBuildReview["rotationGuidance"]> {
  const parsed = settingsSchema.parse(settings);
  const rotationSha256 = createHash("sha256")
    .update(JSON.stringify(parsed.player.rotation))
    .digest("hex");
  if (rotationSha256 !== "13ddb2027e9aafe7fd65409dee855bb5b27a4406451ceed014410163d08de282")
    throw new Error("Protection Paladin instructions do not match the measured priority");
  const allocation = parsed.player.talentsString
    .split("-")
    .map((tree): number => [...tree].reduce((total, rank): number => total + Number(rank), 0));
  while (allocation.length < 3) allocation.push(0);
  if (allocation.reduce((total, count): number => total + count, 0) !== 51)
    throw new Error("Protection Paladin guidance requires the complete measured talent allocation");
  if (
    parsed.encounter.duration !== (scenario === "raid" ? 300 : 60) ||
    parsed.encounter.targets.length !== (scenario === "raid" ? 1 : 3)
  )
    throw new Error("Protection Paladin guidance encounter does not match its scenario");

  return {
    talents: allocation.join("/"),
    scenario:
      scenario === "raid"
        ? "Five-minute, single-target physical raid encounter with the recorded full raid buffs."
        : "One-minute, three-target physical dungeon encounter with the recorded self buffs.",
    instruction:
      "Keep Righteous Fury enabled and main-hand autoattacks active. Recheck this priority from the top after every action. Mitigation minimizes physical damage taken; threat maximizes threat per second.",
    prepull: [
      "Cast Seal of Righteousness 3 seconds before the pull.",
      "Cast Holy Shield (Rank 3) 1.5 seconds before the pull.",
    ],
    priorities: [
      "Use Judgement when available.",
      "Use Swift Judgement when Judgement has at least 6 seconds remaining on its cooldown, then return to Judgement at the top of the priority.",
      "Use the enabled automatic cooldown and potion policies when available.",
      "Use Templar's Bulwark when your health is below 30%.",
      "Refresh Holy Shield (Rank 3) when it has at most 2 seconds remaining.",
      "Refresh Seal of Righteousness when the current seal has at most 2 seconds remaining.",
      // The two measured Consecration entries cast the same rank at 30% and 15% mana.
      "Use Consecration (Rank 5) when you have at least 15% mana.",
      "Use Hammer of Wrath (Rank 3) when the target is executable.",
      "Use Holy Strike (Rank 8) when available, then Holy Shield (Rank 3) as the remaining filler.",
    ],
    caveats: [
      "Fixed measured talents and priority; this all-slot gear update did not perform a deep rotation search.",
      "These tank benchmarks have no execute phase, so the Hammer of Wrath entry contributes no measured damage.",
      "Physical mitigation, health and threat describe separate trade-offs. Magic damage, live acquisition and server proc cadence remain outside this benchmark.",
    ],
  };
}
