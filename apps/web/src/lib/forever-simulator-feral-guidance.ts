import { z } from "zod";

const object = z.record(z.string(), z.unknown());
const spells: Readonly<Record<number, string>> = {
  768: "Cat Form",
  9830: "Shred",
  9850: "Claw",
  9896: "Rip",
  9904: "Rake",
  31018: "Ferocious Bite",
  1322605: "Shifting Power",
};
const comparisons: Readonly<Record<string, string>> = {
  OpGe: "at least",
  OpLe: "at most",
  OpLt: "less than",
  OpGt: "more than",
};
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function single(value: unknown, key: string): unknown {
  const row = object.parse(value);
  requireMatch(
    Object.keys(row).length === 1 && Object.hasOwn(row, key),
    "Unsupported Cat guidance node",
  );
  return row[key];
}
function spell(value: unknown): string {
  const row = object.parse(value);
  if (Object.hasOwn(row, "itemId")) {
    requireMatch(
      Object.keys(row).length === 1 && row.itemId === 7676,
      "Unsupported Cat guidance item action",
    );
    return "Thistle Tea";
  }
  const id = z.number().int().positive().parse(single(row, "spellId"));
  const label = spells[id];
  requireMatch(label, "Unsupported Cat guidance spell");
  return label;
}
function condition(value: unknown): string {
  const row = object.parse(value);
  requireMatch(Object.keys(row).length === 1, "Unsupported Cat guidance condition");
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
    "Unsupported Cat comparison",
  );
  const op = z.string().parse(cmp.op);
  requireMatch(Object.hasOwn(comparisons, op), "Unsupported Cat comparison operator");
  const operator = comparisons[op];
  const right = z
    .string()
    .regex(/^[0-9]+(?:\.[0-9]+)?s?$/)
    .parse(single(single(cmp.rhs, "const"), "val"));
  requireMatch(operator, "Unsupported Cat comparison operator");
  const lhs = object.parse(cmp.lhs);
  requireMatch(Object.keys(lhs).length === 1, "Unsupported Cat comparison input");
  const time = right.endsWith("s"),
    text = time
      ? right.slice(0, -1) + (Number.parseFloat(right) === 1 ? " second" : " seconds")
      : right;
  for (const [key, phrase] of [
    ["currentComboPoints", "you have "],
    ["currentEnergy", "your energy is "],
    ["remainingTime", "the fight has "],
  ] as const) {
    if (!Object.hasOwn(lhs, key)) continue;
    requireMatch(
      Object.keys(object.parse(lhs[key])).length === 0 && time === (key === "remainingTime"),
      "Unsupported Cat comparison units",
    );
    return (
      phrase +
      operator +
      " " +
      text +
      (key === "currentComboPoints" ? " combo points" : key === "remainingTime" ? " remaining" : "")
    );
  }
  requireMatch(time, "Expected Cat bleed duration");
  return (
    spell(single(single(lhs, "dotRemainingTime"), "spellId")) +
    " has " +
    operator +
    " " +
    text +
    " remaining"
  );
}

interface FeralGuidanceText {
  readonly prepull: readonly string[];
  readonly priorities: readonly string[];
  readonly instruction: string;
  readonly scenario: string;
  readonly caveats: readonly string[];
}

export function feralSimulatorGuidanceText(
  rotation: Record<string, unknown>,
  conjured: "tea" | "rune",
): FeralGuidanceText {
  requireMatch(rotation.type === "TypeAPL", "Cat guidance requires an explicit APL");
  const prepull = z
    .array(object)
    .parse(rotation.prepullActions ?? [])
    .map((entry): string => {
      requireMatch(
        Object.keys(entry).length === 2 &&
          Object.hasOwn(entry, "action") &&
          Object.hasOwn(entry, "doAtValue"),
        "Unsupported Cat prepull action",
      );
      const time = z
        .string()
        .regex(/^-[0-9]+(?:\.[0-9]+)?s$/)
        .parse(single(single(entry.doAtValue, "const"), "val"));
      requireMatch(
        spell(single(single(entry.action, "castSpell"), "spellId")) === "Cat Form",
        "Unsupported Cat prepull spell",
      );
      return (
        "Enter Cat Form " +
        time.slice(1, -1) +
        (Number.parseFloat(time) === -1 ? " second" : " seconds") +
        " before the pull."
      );
    });
  const priorities = z
    .array(object)
    .min(1)
    .max(32)
    .parse(rotation.priorityList)
    .map((entry): string => {
      requireMatch(
        !entry.hide && Object.keys(entry).every((key) => ["action", "hide"].includes(key)),
        "Hidden or unsupported Cat action",
      );
      const action = object.parse(entry.action);
      requireMatch(
        Object.keys(action).every((key) =>
          ["condition", "castSpell", "autocastOtherCooldowns"].includes(key),
        ) &&
          Number(Boolean(action.castSpell)) + Number(Boolean(action.autocastOtherCooldowns)) === 1,
        "Unsupported Cat action",
      );
      let label: string;
      if (action.castSpell) label = spell(single(action.castSpell, "spellId"));
      else {
        requireMatch(
          Object.keys(object.parse(action.autocastOtherCooldowns)).length === 0,
          "Unsupported Cat cooldown policy",
        );
        label = "the enabled modeled cooldowns and automatic consumable policies";
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
    prepull,
    priorities,
    instruction: [
      ...prepull,
      "Use Cat Form, stay behind the target and keep melee auto-attacks active. Recheck this priority from the top after every action; it is not a fixed repeating sequence.",
      conjured === "tea"
        ? "This measured setup uses Thistle Tea at the energy threshold shown below."
        : "This measured setup uses the engine's Demonic Rune policy for mana; do not substitute a Tea setup without resimulating.",
    ].join(" "),
    scenario:
      "Level 60, one level 63 Dragonkin, 300 seconds, stationary melee at 5 yards behind the target with the measured gear, buffs and consumes.",
    caveats: [
      "These instructions reproduce the measured engine action list, not an exhaustive global optimum or guaranteed live-server DPS. Changing the encounter, gear, buffs or consumables can change the result.",
      "The pinned Forever model uses Shifting Power instead of removed Tiger's Fury. Do not replace this priority with a Classic Tiger's Fury or repeated Cat Form powershift macro.",
      "Wolfshead Helm, if equipped, adds 5 Shifting Power energy in this model, not the old 20. The registered maximum-rank Ferocious Bite and consumable availability still require live verification.",
      "The cooldown action delegates to built-in engine policies. This pass did not exhaustively optimize manual cooldown timing, movement, Bear weaving or every Cat rotation.",
    ],
  };
}
