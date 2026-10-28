import { z } from "zod";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";

const spells = new Map<number, string>([
  [1680, "Whirlwind"],
  [1719, "Recklessness"],
  [2457, "Battle Stance"],
  [2458, "Berserker Stance"],
  [7373, "Hamstring"],
  [11574, "Rend"],
  [11585, "Overpower"],
  [11605, "Slam"],
  [18499, "Berserker Rage"],
  [20662, "Execute"],
  [21553, "Mortal Strike"],
  [23894, "Bloodthirst"],
  [25286, "Heroic Strike"],
  [1282733, "Offensive State"],
  [1310222, "Spearing Strike"],
]);
const rotationSchema = z
  .object({
    player: z
      .object({
        talentsString: z.string().regex(/^[0-5]+(?:-[0-5]*){0,2}$/),
        rotation: z
          .object({
            type: z.literal("TypeAPL"),
            priorityList: z
              .array(z.object({ action: z.record(z.string(), z.unknown()) }).strict())
              .min(1)
              .max(32),
          })
          .strict(),
      })
      .passthrough(),
  })
  .passthrough();
function object(value: unknown): Record<string, unknown> {
  return z.record(z.string(), z.unknown()).parse(value);
}
function only(value: unknown, name: string): unknown {
  const row = object(value);
  if (Object.keys(row).length !== 1 || !Object.hasOwn(row, name))
    throw new Error("Unsupported tested Warrior rotation node");
  return row[name];
}
function spell(value: unknown, allowQueue = false): string {
  const row = z
      .object({ spellId: z.number().int().positive(), tag: z.literal(1).optional() })
      .strict()
      .parse(value),
    name = spells.get(row.spellId);
  if (!name || (row.tag !== undefined && (!allowQueue || row.spellId !== 25286)))
    throw new Error("Unknown tested Warrior spell or queue action");
  return name;
}
function condition(value: unknown, depth = 0): string {
  if (depth > 12) throw new Error("Tested Warrior condition is too deeply nested");
  const row = object(value),
    keys = Object.keys(row);
  if (keys.length !== 1) throw new Error("Unsupported tested Warrior condition");
  if (row.not) return `not (${condition(only(row.not, "val"), depth + 1)})`;
  if (row.and)
    return z
      .array(z.unknown())
      .min(1)
      .max(8)
      .parse(only(row.and, "vals"))
      .map((entry: unknown): string => `(${condition(entry, depth + 1)})`)
      .join(" and ");
  if (row.isExecutePhase) {
    if (only(row.isExecutePhase, "threshold") !== "E20")
      throw new Error("Unsupported Warrior execute threshold");
    return "the target is in the 20% execute phase";
  }
  if (row.auraIsActive) return `${spell(only(row.auraIsActive, "auraId"))} is active`;
  if (row.dotIsActive) return `${spell(only(row.dotIsActive, "spellId"))} is active on the target`;
  if (row.spellIsReady) return `${spell(only(row.spellIsReady, "spellId"))} is ready`;
  if (row.cmp) {
    const comparison = z
      .object({ op: z.enum(["OpGe", "OpLe"]), lhs: z.unknown(), rhs: z.unknown() })
      .strict()
      .parse(row.cmp);
    if (Object.keys(object(only(comparison.lhs, "currentRage"))).length !== 0)
      throw new Error("Unsupported Warrior rage comparison");
    const amount = z
      .string()
      .regex(/^\d{1,3}$/)
      .parse(only(only(comparison.rhs, "const"), "val"));
    if (Number(amount) > 100) throw new Error("Invalid Warrior rage threshold");
    return `rage is ${comparison.op === "OpGe" ? "at least" : "at most"} ${amount}`;
  }
  throw new Error("Unsupported tested Warrior condition");
}
export function testedWarriorRotationGuidance(
  settings: unknown,
): NonNullable<LocalSimulatorBuildReview["rotationGuidance"]> {
  const player = rotationSchema.parse(settings).player,
    points = player.talentsString
      .split("-")
      .map((tree: string): number =>
        [...tree].reduce((sum: number, rank: string): number => sum + Number(rank), 0),
      );
  while (points.length < 3) points.push(0);
  if (points.reduce((sum: number, rank: number): number => sum + rank, 0) !== 51)
    throw new Error("Tested Warrior build must spend 51 talent points");
  const priorities = player.rotation.priorityList.map(({ action }): string => {
    if (Object.hasOwn(action, "autocastOtherCooldowns")) {
      if (
        Object.keys(action).length !== 1 ||
        Object.keys(object(action.autocastOtherCooldowns)).length !== 0
      )
        throw new Error("Unsupported Warrior cooldown action");
      return "Use the other enabled automatic cooldowns when available.";
    }
    const row = z
        .object({ castSpell: z.unknown(), condition: z.unknown().optional() })
        .strict()
        .parse(action),
      id = object(only(row.castSpell, "spellId")),
      name = spell(id, true);
    return `${id.tag === 1 ? "Queue" : "Use"} ${name}${row.condition === undefined ? "" : ` when ${condition(row.condition)}`}.`;
  });
  return {
    talents: points.join("/"),
    scenario:
      "Five-minute single-target level-63 encounter with the recorded complete raid support.",
    instruction:
      "These priorities are generated from the exact tested rotation. Read from top to bottom and use the first available action whose conditions are met.",
    priorities,
    caveats: [
      "This practical comparison targets a 2% gap and does not claim a globally optimal rotation.",
      "The reference assumes the saved buffs, consumables, weapon effects and encounter. Live-server mechanics and item acquisition remain unverified.",
    ],
  };
}
