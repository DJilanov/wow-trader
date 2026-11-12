import type { CampaignAction } from "./campaign.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";
import type { ImportedDirective } from "./guide-archive.js";
import { campaignZoneId } from "./campaign-geography.js";

export function capturedQuestNpc(
  action: CampaignAction,
  directives: readonly ImportedDirective[],
  candidates: readonly QuestCatalogEntry["ends"][number][],
): QuestCatalogEntry["ends"][number] | null {
  const names = new Set(
    directives
      .filter((row) => row.tag === ".target")
      .map((row) => row.arguments.trim().toLowerCase()),
  );
  if (names.size !== 1) return null;
  const matches = candidates.filter(
    (npc) =>
      npc.friendlyToAlliance &&
      names.has(npc.name.toLowerCase()) &&
      action.positions.some(
        ({ position }) =>
          Number.isFinite(position.x) &&
          Number.isFinite(position.y) &&
          (position.space === "world" ||
            [position.x, position.y].every((value) => value >= 0 && value <= 100)) &&
          npc.positions.some(
            (point) =>
              campaignZoneId(point.zone) !== null &&
              campaignZoneId(point.zone) === campaignZoneId(position.zone),
          ),
      ),
  );
  return matches.length === 1 ? matches[0]! : null;
}

/** Bind a named source interaction to a real quest object, keeping its captured coordinates. */
export function capturedQuestObject(
  action: CampaignAction,
  directives: readonly ImportedDirective[],
  candidates: NonNullable<QuestCatalogEntry["objectEnds"]>,
): NonNullable<QuestCatalogEntry["objectEnds"]>[number] | null {
  const matches = candidates.filter((object) => {
    const name = object.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const instruction = new RegExp(
      `^(?:Click|Interact with|Examine) (?:the )?${name}(?: (?:on the ground|on top of (?:the|a|an) (?:barrel|crate|table|chest)))?[.!]?$`,
      "i",
    );
    return (
      directives.some((row) => row.tag === "text" && instruction.test(row.text.trim())) &&
      action.positions.some(
        ({ position }) =>
          Number.isFinite(position.x) &&
          Number.isFinite(position.y) &&
          (position.space === "world" ||
            [position.x, position.y].every((value) => value >= 0 && value <= 100)) &&
          object.positions.some(
            (point) =>
              campaignZoneId(point.zone) !== null &&
              campaignZoneId(point.zone) === campaignZoneId(position.zone),
          ),
      )
    );
  });
  return matches.length === 1 ? matches[0]! : null;
}
