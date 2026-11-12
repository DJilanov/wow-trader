"use client";

import type { CampaignPlan, PremadeProgress } from "@wow-trader/leveling";

interface DungeonCatchUpsProps {
  readonly plan: Pick<CampaignPlan, "legs">;
  readonly progress: PremadeProgress;
  readonly disabled: boolean;
  readonly onChange: (questId: number, included: boolean) => void;
}

export function LevelingDungeonCatchUps({
  plan,
  progress,
  disabled,
  onChange,
}: DungeonCatchUpsProps): React.JSX.Element | null {
  const visits = plan.legs.filter((leg) => leg.dungeonVisitId && leg.optionalQuestId !== undefined);
  if (!visits.length) return null;
  const required = visits.filter((leg) => leg.requiredVisit);
  const optional = visits.filter((leg) => !leg.requiredVisit);
  return (
    <>
      {required.length > 0 && (
        <div>
          <p>
            <strong>Scheduled dungeons</strong>
          </p>
          <ul>
            {required.map((leg) => (
              <li key={leg.id}>
                <strong>{leg.title}</strong> · Required · {leg.questIds.length} quests
              </li>
            ))}
          </ul>
          <p>Complete these visits together, including the outside quest hand-ins.</p>
        </div>
      )}
      {optional.length > 0 && (
        <details>
          <summary>Optional dungeon catch-up</summary>
          <p>
            Include the full trip when your party needs more XP. Skipping removes its planned work
            and rewards; your saved quest history stays. You can include it again here.
          </p>
          {optional.map((leg) => (
            <label key={leg.id}>
              <input
                type="checkbox"
                checked={progress.selectedExtras[String(leg.optionalQuestId)] !== false}
                disabled={disabled}
                onChange={(event) => onChange(leg.optionalQuestId!, event.target.checked)}
              />{" "}
              {leg.title}
            </label>
          ))}
        </details>
      )}
    </>
  );
}
