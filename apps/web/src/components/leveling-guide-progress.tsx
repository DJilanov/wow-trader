"use client";

import { useId, useRef, useState, type FormEvent, type Ref } from "react";
import {
  FOREVER_XP_CURVE,
  recordCampaignGuideXp,
  type CampaignPlan,
  type PremadeProgress,
} from "@wow-trader/leveling";
import styles from "./leveling-guide.module.css";

interface GuideProgressProps {
  readonly plan: CampaignPlan;
  readonly progress: PremadeProgress;
  readonly actionId: string;
  readonly personal: boolean;
  readonly disabled: boolean;
  readonly onChange: (progress: PremadeProgress) => void;
  readonly buttonRef?: Ref<HTMLButtonElement>;
}

export function LevelingGuideProgress({
  plan,
  progress,
  actionId,
  personal,
  disabled,
  onChange,
  buttonRef,
}: GuideProgressProps): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const dialogId = useId();
  const [player, setPlayer] = useState(0);
  const [level, setLevel] = useState("1");
  const [xp, setXp] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function choosePlayer(index: number): void {
    const member = progress.members[index]!;
    setPlayer(index);
    setLevel(String(member.level ?? 1));
    setXp(String(member.currentXp ?? 0));
    setError(null);
  }
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!level.trim() || !xp.trim()) {
      setError("Enter the level and XP shown in game.");
      return;
    }
    try {
      onChange(recordCampaignGuideXp(plan, progress, player, Number(level), Number(xp), actionId));
      setNotice(
        `${personal ? "Your" : `Player ${player + 1}'s`} update was saved. The remaining plan has been recalculated.`,
      );
      dialog.current?.close();
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Your update could not be saved. Try again.",
      );
    }
  }
  return (
    <>
      <div className={styles.actions}>
        <button
          ref={buttonRef}
          className={styles.button}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-controls={dialogId}
          onClick={() => {
            choosePlayer(personal ? 0 : player);
            setNotice(null);
            dialog.current?.showModal();
            dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
          }}
        >
          Update {personal ? "my" : "party"} level / XP
        </button>
        {notice && (
          <span className={styles.caption} role="status">
            {notice}
          </span>
        )}
      </div>
      <dialog id={dialogId} ref={dialog} className={styles.dialog} aria-labelledby={heading}>
        <header>
          <h2 id={heading}>Where are {personal ? "you" : "your players"} now?</h2>
          <button
            className={styles.button}
            type="button"
            aria-label="Close progress update"
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </header>
        <p>
          Enter the bar shown in game at the start of your current step. This corrects the plan; it
          does not complete any quests.
        </p>
        <form onSubmit={submit}>
          {!personal && (
            <label>
              Player
              <select value={player} onChange={(event) => choosePlayer(Number(event.target.value))}>
                {progress.members.map((_, index) => (
                  <option key={index} value={index}>
                    Player {index + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className={styles.fields}>
            <label>
              Level
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                required
                value={level}
                onChange={(event) => setLevel(event.target.value)}
              />
            </label>
            <label>
              XP into this level
              <input
                type="number"
                min="0"
                max={Number(level) === 60 ? 0 : (FOREVER_XP_CURVE[Number(level)] ?? 1_000_001) - 1}
                step="1"
                required
                value={xp}
                onChange={(event) => setXp(event.target.value)}
              />
            </label>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button className={styles.button} type="submit" disabled={disabled}>
            Save progress update
          </button>
        </form>
      </dialog>
    </>
  );
}
