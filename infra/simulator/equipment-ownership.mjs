// Quest-only rewards are limited to one copy until repeatability is evidenced.
// This is an acquisition constraint, not a fabricated in-game Unique flag.
export function equipmentOwnership(item, source = {}) {
  const itemAlternate = item.sources?.some(
    (entry) => entry.drop || entry.crafted || entry.rep || entry.soldBy || entry.vendor,
  );
  if (source.questChoice && !itemAlternate)
    return { questRewardOnce: true, questChoices: [source.questChoice] };
  const questIds = [
    ...(item.sources ?? []).flatMap((entry) => (entry.quest?.id ? [entry.quest.id] : [])),
    ...(source.sources ?? []).flatMap((entry) =>
      entry.kind === "dungeon-quest" && entry.questId ? [entry.questId] : [],
    ),
  ];
  const alternate =
    itemAlternate ||
    source.sources?.some((entry) =>
      ["dungeon", "crafted", "pvp", "vendor", "ticket-exchange"].includes(entry.kind),
    );
  if (alternate) return { questRewardOnce: false, questChoices: [] };
  const choices = questIds.map((id) => `quest:${id}`);
  return { questRewardOnce: choices.length > 0, questChoices: [...new Set(choices)] };
}
