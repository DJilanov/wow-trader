"use client";

import { useState } from "react";
import {
  questDeadlineLabel,
  reportCampaignTimedQuestFailure,
  resumeCampaignTimedQuestAttempt,
  timedQuestFailureKey,
  type CampaignPlan,
  type PremadeProgress,
} from "@wow-trader/leveling";
import styles from "./leveling-guide.module.css";

interface TimedQuestStatusProps {
  readonly plan: CampaignPlan;
  readonly progress: PremadeProgress;
  readonly disabled: boolean;
  readonly onChange: (progress: PremadeProgress) => void;
}

export function LevelingTimedQuestStatus({
  plan,
  progress,
  disabled,
  onChange,
}: TimedQuestStatusProps): React.JSX.Element | null {
  const [error, setError] = useState<string | null>(null);
  const selected = new Set(
    plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  const active = (plan.questTimings ?? []).flatMap((timing) =>
    selected.has(timing.questId)
      ? progress.members.flatMap((member, player) => {
          const state = member.questStates[String(timing.questId)];
          return state === "accepted" || state === "objectives-complete"
            ? [{ timing, member, player }]
            : [];
        })
      : [],
  );
  if (!active.length) return null;

  function change(questId: number, player: number, retry: boolean): void {
    setError(null);
    try {
      onChange(
        retry
          ? resumeCampaignTimedQuestAttempt(plan, progress, questId, player)
          : reportCampaignTimedQuestFailure(plan, progress, questId, player),
      );
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "The quest update could not be saved. Try again.",
      );
    }
  }

  return (
    <details className={styles.details} open>
      <summary>Active timed quests</summary>
      <p>The timer in your game starts when you accept. Finish and hand in before it expires.</p>
      <ul>
        {active.map(({ timing, member, player }) => {
          const failed = member.confirmations[timedQuestFailureKey(timing.questId)] === true;
          const fresh = !member.xpNeedsUpdate && member.level !== null && member.currentXp !== null;
          return (
            <li key={`${timing.questId}-${player}`}>
              <p>
                <strong>{timing.title}</strong> · Player {player + 1} ·{" "}
                {questDeadlineLabel(timing.timeLimitSeconds)} from acceptance
              </p>
              {failed ? (
                <>
                  <p>
                    Failed or expired. Reaccept it in game. Use the level / XP update above to save
                    your current bar, then confirm the new attempt here.
                  </p>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={disabled || !fresh}
                    aria-label={`Confirm a new attempt of ${timing.title} for Player ${player + 1}`}
                    onClick={() => change(timing.questId, player, true)}
                  >
                    I accepted a new attempt
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={styles.button}
                  disabled={disabled}
                  aria-label={`Report ${timing.title} failed or expired for Player ${player + 1}`}
                  onClick={() => change(timing.questId, player, false)}
                >
                  Failed or expired
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
