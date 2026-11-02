import {
  classicQuestRows,
  classicQuestTitleMatches,
  classicQuestHasRewardScript,
} from "./classic-quest-sql.mjs";

export function extractClassicZeroXpRows(sql, wanted) {
  const rows = classicQuestRows(
    sql,
    wanted.map((quest) => quest.questId),
  );
  const records = [];
  const held = [];
  for (const quest of wanted) {
    const row = rows.get(quest.questId);
    let reason = null;
    if (!row) reason = "No historical quest row.";
    else if (!classicQuestTitleMatches(row.Title, quest.title))
      reason = "Historical and current quest titles differ.";
    else if (row.RewMoneyMaxLevel !== "0") reason = "No explicit zero-XP reference.";
    else if (classicQuestHasRewardScript(row))
      reason = "Scripted or spell-based rewards require separate review.";
    else if (
      !/^\d+$/.test(row.QuestLevel ?? "") ||
      Number(row.QuestLevel) < 1 ||
      Number(row.QuestLevel) > 60
    )
      reason = "Historical quest level is unresolved.";
    if (reason) {
      held.push({ questId: quest.questId, reason });
      continue;
    }
    records.push({
      id: quest.questId,
      level: Number(row.QuestLevel),
      xp: 0,
      xpByLevel: Array.from({ length: 60 }, (_, index) => ({ level: index + 1, xp: 0 })),
    });
  }
  return { records, held };
}
