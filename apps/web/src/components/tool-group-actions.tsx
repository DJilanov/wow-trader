import { helperAbsoluteUrl } from "../lib/seo";
import {
  encodeToolGroupDraft,
  toolGroupCreatePath,
  toolGroupEventType,
  type ToolGroupDraft,
} from "../lib/tool-group-draft";

interface ToolGroupActionsProps {
  readonly kind: ToolGroupDraft["kind"];
  readonly label: string;
  readonly sourcePath: string;
  readonly faction?: "Alliance" | "Horde";
  readonly capacity?: number;
}

export function ToolGroupActions({
  kind,
  label,
  sourcePath,
  faction,
  capacity,
}: ToolGroupActionsProps): React.JSX.Element {
  const draft: ToolGroupDraft = {
    version: 1,
    kind,
    label: label.trim().slice(0, 80),
    sourceUrl: helperAbsoluteUrl(sourcePath),
    ...(faction ? { faction } : {}),
    ...(capacity && capacity >= 2 && capacity <= 5 ? { capacity } : {}),
  };
  const query = new URLSearchParams({
    draft: encodeToolGroupDraft(draft),
    activity: toolGroupEventType(draft) === "dungeon" ? "Dungeon" : "Questing",
    q: draft.label,
    ...(faction ? { faction } : {}),
  });
  return (
    <div className="tool-group-actions" aria-label="Play this plan with other people">
      <a href={`https://www.wowforeverdiscord.online/lfg?${query}`}>Find a group</a>
      <a href={`https://www.wowforeverdiscord.online${toolGroupCreatePath(draft)}`}>
        Host this plan
      </a>
    </div>
  );
}
