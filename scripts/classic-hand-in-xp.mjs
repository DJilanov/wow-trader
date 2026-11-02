import assert from "node:assert/strict";
import {
  classicQuestRows,
  classicQuestTitleMatches,
  classicQuestHasRewardScript,
} from "./classic-quest-sql.mjs";

export const CLASSIC_QUEST_XP_RULE = {
  repository: "https://github.com/cmangos/mangos-classic",
  revision: "5731249195520323cb5fb9aa29761d4f033272ce",
  file: "src/game/Quests/QuestDef.cpp",
  sha256: "e4f868e95421c2be5b90bd046178b6f4413dc5203e945cf5735b9bac26104cfb",
};

// Mirrors the pinned Quest::XPValue float expressions, before the caller's level-cap handling.
export function classicQuestXpValue(money, questLevel, playerLevel) {
  assert.ok(
    Number.isInteger(money) && money >= 0 && money <= 0xffffffff,
    "Invalid historical quest money.",
  );
  for (const level of [questLevel, playerLevel])
    assert.ok(
      Number.isInteger(level) && level >= 1 && level <= 60,
      "Unsupported historical quest level.",
    );
  const full = Math.fround(Math.fround(money) / Math.fround(0.6));
  const difference = playerLevel - questLevel;
  const multiplier = difference <= 5 ? 1 : ([0.8, 0.6, 0.4, 0.2][difference - 6] ?? 0.1);
  const xp = Math.ceil(Math.fround(full * Math.fround(multiplier)));
  assert.ok(xp <= 0xffffffff, "Historical reward exceeds the source integer range.");
  return xp;
}

export function extractClassicHandInXpRows(sql, wanted) {
  const rows = classicQuestRows(
    sql,
    wanted.map((quest) => quest.questId),
  );
  const records = [],
    held = [];
  for (const quest of wanted) {
    const row = rows.get(quest.questId);
    let reason = null;
    if (!row) reason = "No historical quest row.";
    else if (!classicQuestTitleMatches(row.Title, quest.title))
      reason = "Historical and current quest titles differ.";
    else if (classicQuestHasRewardScript(row))
      reason = "Scripted or spell-based rewards require separate review.";
    else if (!/^\d+$/.test(row.QuestLevel ?? "") || Number(row.QuestLevel) !== quest.questLevel)
      reason = "Historical and current reward quest levels differ.";
    else if (
      !/^\d+$/.test(row.RewMoneyMaxLevel ?? "") ||
      !Number.isSafeInteger(Number(row.RewMoneyMaxLevel)) ||
      Number(row.RewMoneyMaxLevel) > 600_000
    )
      reason = "Historical reward money is unresolved.";
    else if (!Number.isInteger(quest.questLevel) || quest.questLevel < 1 || quest.questLevel > 60)
      reason = "Historical quest level is unsupported.";
    else if (
      classicQuestXpValue(Number(row.RewMoneyMaxLevel), quest.questLevel, quest.questLevel) !==
      quest.fullXp
    )
      reason = "Historical full reward differs from the existing reward fact.";
    if (reason) {
      held.push({ questId: quest.questId, reason });
      continue;
    }
    const xpByLevel = Array.from({ length: 59 }, (_, index) => ({
      level: index + 1,
      xp: classicQuestXpValue(Number(row.RewMoneyMaxLevel), quest.questLevel, index + 1),
    }));
    if (
      (quest.xpByLevel ?? []).some(
        (entry) => entry.level < 60 && xpByLevel[entry.level - 1]?.xp !== entry.xp,
      )
    ) {
      held.push({
        questId: quest.questId,
        reason: "Existing level-specific rewards differ from the historical rule.",
      });
      continue;
    }
    records.push({ id: quest.questId, level: quest.questLevel, xp: quest.fullXp, xpByLevel });
  }
  return { records, held };
}
