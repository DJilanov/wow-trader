import { z } from "zod";

const object = z.record(z.string(), z.unknown());
const spells: Readonly<Record<number, string>> = {
  9912: "Wrath",
  25298: "Starfire",
  9835: "Moonfire",
  24977: "Insect Swarm",
  48518: "Eclipse",
};
const comparisons: Readonly<Record<string, string>> = {
  OpGe: "at least",
  OpLe: "at most",
  OpGt: "more than",
  OpLt: "less than",
};
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function single(value: unknown, key: string): unknown {
  const row = object.parse(value);
  requireMatch(
    Object.keys(row).length === 1 && Object.hasOwn(row, key),
    "Unsupported Balance guidance node",
  );
  return row[key];
}
function spell(value: unknown): string {
  const id = z.number().int().positive().parse(single(value, "spellId"));
  const label = spells[id];
  requireMatch(label, "Unsupported Balance guidance spell");
  return label;
}
function condition(value: unknown): string {
  const row = object.parse(value);
  requireMatch(Object.keys(row).length === 1, "Unsupported Balance guidance condition");
  if (row.and)
    return (
      "(" +
      z.array(z.unknown()).min(1).parse(single(row.and, "vals")).map(condition).join(" and ") +
      ")"
    );
  if (row.not)
    return (
      spell(single(single(single(row.not, "val"), "dotIsActive"), "spellId")) +
      " is not active on the target"
    );
  const cmp = object.parse(single(row, "cmp"));
  requireMatch(
    Object.keys(cmp).length === 3 && ["lhs", "rhs", "op"].every((key) => Object.hasOwn(cmp, key)),
    "Unsupported Balance comparison",
  );
  const op = z.string().parse(cmp.op);
  requireMatch(Object.hasOwn(comparisons, op), "Unsupported Balance comparison operator");
  const operator = comparisons[op];
  const right = z
    .string()
    .regex(/^[0-9]+(?:\.[0-9]+)?s?$/)
    .parse(single(single(cmp.rhs, "const"), "val"));
  const lhs = object.parse(cmp.lhs);
  requireMatch(Object.keys(lhs).length === 1, "Unsupported Balance comparison input");
  if (lhs.remainingTime) {
    requireMatch(
      Object.keys(object.parse(lhs.remainingTime)).length === 0 && right.endsWith("s"),
      "Unsupported Balance time comparison",
    );
    return (
      "the fight has " +
      operator +
      " " +
      right.slice(0, -1) +
      (Number.parseFloat(right) === 1 ? " second" : " seconds") +
      " remaining"
    );
  }
  requireMatch(!right.endsWith("s"), "Unsupported Eclipse charge units");
  const aura = object.parse(single(lhs, "auraNumStacks"));
  const auraId = object.parse(single(aura, "auraId"));
  requireMatch(
    Object.keys(auraId).length === 1 && auraId.spellId === 48518,
    "Unsupported Balance aura",
  );
  return (
    "you have " +
    operator +
    " " +
    right +
    (Number(right) === 1 ? " Eclipse charge" : " Eclipse charges")
  );
}
interface BalanceGuidanceText {
  readonly prepull: readonly string[];
  readonly priorities: readonly string[];
  readonly instruction: string;
  readonly scenario: string;
  readonly caveats: readonly string[];
}
export function balanceSimulatorGuidanceText(
  rotation: Record<string, unknown>,
  hasEclipse: boolean,
): BalanceGuidanceText {
  requireMatch(rotation.type === "TypeAPL", "Balance guidance requires an explicit APL");
  requireMatch(
    z.array(z.unknown()).parse(rotation.prepullActions ?? []).length === 0,
    "This Balance guide has no prepull action",
  );
  const priorities = z
    .array(object)
    .min(1)
    .max(32)
    .parse(rotation.priorityList)
    .map((entry): string => {
      requireMatch(
        Object.keys(entry).length === 1 && Object.hasOwn(entry, "action"),
        "Hidden or unsupported Balance action",
      );
      const action = object.parse(entry.action);
      requireMatch(
        Object.keys(action).every((key) =>
          ["condition", "castSpell", "autocastOtherCooldowns"].includes(key),
        ) &&
          Number(Boolean(action.castSpell)) + Number(Boolean(action.autocastOtherCooldowns)) === 1,
        "Unsupported Balance action",
      );
      let label: string;
      if (action.castSpell) label = spell(single(action.castSpell, "spellId"));
      else {
        requireMatch(
          Object.keys(object.parse(action.autocastOtherCooldowns)).length === 0,
          "Unsupported Balance cooldown policy",
        );
        label = "the enabled modeled cooldowns and automatic mana-consumable policies";
      }
      return (
        "Use " +
        label +
        " when available" +
        (action.condition ? " if " + condition(action.condition) : "") +
        "."
      );
    });
  return {
    prepull: [],
    priorities,
    scenario:
      "Level60, one level63 Dragonkin,300 seconds, stationary caster at30yards behind the target with the measured gear, buffs and consumes.",
    instruction: [
      "Begin in Moonkin Form at range. Recheck this priority from the top after every spell; it is not a fixed repeating sequence.",
      ...(hasEclipse
        ? [
            "In this Forever model, Wrath banks two Eclipse charges and each Starfire consumes one. Follow the measured charge threshold below rather than a Vanilla or Wrath-of-the-Lich-King Eclipse rotation.",
          ]
        : []),
      "This setup keeps Demonic Rune, Major Mana Potion, self Innervate and Wizard Oil on the measured engine policies. Do not spend mana recasting Moonkin at the pull.",
      "When ready, allow room for 1,500 Rune mana or 2,250 potion mana plus two seconds of casting regeneration before using them. The modeled self Innervate waits until 500 mana or less and does not overlap an active Innervate.",
    ].join(" "),
    caveats: [
      "These instructions reproduce the measured engine action list, not an exhaustive global optimum or guaranteed live-server DPS. Different encounter lengths, targets, gear, buffs or consumables can change the result.",
      "The pinned beta model changes Wrath/Starfire damage, Eclipse charges, Nature's Grace, talent costs and Omen. Omen can proc from Wrath, but Wrath does not consume the free-cast charge in this model.",
      "Maximum spell ranks, trainer/book availability, consumables and provisional Classic item sources still need live verification; client/model presence does not prove a release unlock.",
      "The cooldown action delegates to engine policies. This pass did not exhaustively optimize manual cooldown timing, movement, form weaving, non-Moonkin hybrids or every caster rotation.",
      "Demonic Rune causes self-damage. The modeled mana trigger has no low-health safety condition; protect your character rather than blindly copying that trigger in a dangerous encounter.",
    ],
  };
}
