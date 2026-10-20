export function referenceNonItemClientConflicts(record, recipes, quests) {
  if (record.kind === "spell") {
    const key = `${record.game}-spell-${record.id}`;
    if (!recipes.has(key)) return ["missing_current_client_recipe"];
    return recipes.get(key) === record.name ? [] : ["client_recipe_name_conflict"];
  }

  if (record.kind !== "quest") {
    throw new Error(`Unsupported non-item reference kind: ${record.kind}`);
  }
  if (record.game !== "forever" || !quests.has(record.id)) {
    return ["missing_current_client_quest"];
  }
  const title = quests.get(record.id);
  return title && title !== record.name ? ["client_quest_title_conflict"] : [];
}

export function referenceQuestXpClientConflicts(record, conflicts, levelingQuestIds) {
  if (record.game !== "forever" || record.kind !== "quest" || !levelingQuestIds.has(record.id))
    return conflicts;
  return conflicts.filter((conflict) => conflict !== "missing_current_client_quest");
}
