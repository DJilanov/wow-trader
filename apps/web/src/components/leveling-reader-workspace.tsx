"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { scrollReaderToAnchor } from "../lib/leveling-reader-navigation";
import styles from "./leveling-experience.module.css";
import { LevelingBackupControls } from "./leveling-backup-controls";

interface LevelingReaderWorkspaceProps {
  readonly scope: string;
  readonly ready: boolean;
  readonly title: string;
  readonly minimumLevel: number;
  readonly maximumLevel: number;
  readonly profile: string;
  readonly dashboardHref: string;
  readonly completed: number;
  readonly total: number;
  readonly progressLabel: string;
  readonly notice: string | null;
  readonly currentStepLabel: string;
  readonly currentStepAnchor: string | null;
  readonly nextDisabled: boolean;
  readonly doneDisabled: boolean;
  readonly previousDisabled: boolean;
  readonly undoDisabled: boolean;
  readonly onPrevious: () => void;
  readonly onUndo: () => void;
  readonly onNext: () => void;
  readonly onDone: () => void;
  readonly settings: ReactNode;
  readonly map: (revealAnchor: (anchor: string) => void) => ReactNode;
  readonly toolbar: ReactNode;
  readonly children: ReactNode;
  readonly onNavigate: (hash: string) => void;
}
type ReaderView = "split" | "map" | "quests";

export function LevelingReaderWorkspace({
  scope,
  ready,
  title,
  minimumLevel,
  maximumLevel,
  profile,
  dashboardHref,
  completed,
  total,
  progressLabel,
  notice,
  currentStepLabel,
  currentStepAnchor,
  nextDisabled,
  doneDisabled,
  previousDisabled,
  undoDisabled,
  onPrevious,
  onUndo,
  onNext,
  onDone,
  settings,
  map,
  toolbar,
  children,
  onNavigate,
}: LevelingReaderWorkspaceProps): React.JSX.Element {
  const [view, setView] = useState<ReaderView>("split");
  const dialog = useRef<HTMLDialogElement>(null);
  const settingsId = useId();
  const pendingScroll = useRef(false);
  const pendingTarget = useRef<string | null>(null);
  const [revealSequence, setRevealSequence] = useState(0);
  const [display, setDisplay] = useState<"all" | "focus">("all");
  const [textSize, setTextSize] = useState<"standard" | "large">("standard");
  useEffect(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem("kfc-leveling:reader-preferences:v1") ?? "null",
      );
      if (value && typeof value === "object") {
        if ("display" in value && value.display === "focus") setDisplay("focus");
        if ("textSize" in value && value.textSize === "large") setTextSize("large");
      }
    } catch {
      /* Optional display preferences do not affect character progress. */
    }
  }, []);
  function changeDisplay(nextDisplay: "all" | "focus", nextSize: "standard" | "large"): void {
    setDisplay(nextDisplay);
    setTextSize(nextSize);
    try {
      localStorage.setItem(
        "kfc-leveling:reader-preferences:v1",
        JSON.stringify({ display: nextDisplay, textSize: nextSize }),
      );
    } catch {
      /* Keep preferences usable for this visit when browser storage is denied. */
    }
  }
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      let anchor: string;
      try {
        anchor = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (anchor) scrollReaderToAnchor(anchor);
    });
    return () => cancelAnimationFrame(frame);
  }, [scope, ready]);

  useEffect(() => {
    if (!pendingScroll.current) return;
    const anchor = pendingTarget.current ?? currentStepAnchor;
    if (!anchor) {
      pendingScroll.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (scrollReaderToAnchor(anchor)) {
        pendingScroll.current = false;
        pendingTarget.current = null;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [view, currentStepAnchor, display, revealSequence]);

  function revealAnchor(anchor: string): void {
    pendingTarget.current = anchor;
    pendingScroll.current = true;
    if (view === "map") setView("quests");
    setRevealSequence((previous) => previous + 1);
  }

  function advance(complete: boolean): void {
    pendingTarget.current = null;
    pendingScroll.current = !nextDisabled;
    if (complete) onDone();
    else onNext();
  }

  function navigateAnchor(event: MouseEvent<HTMLElement>): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    const href = link?.getAttribute("href");
    if (!href?.startsWith("#")) return;
    let anchor: string;
    try {
      anchor = decodeURIComponent(href.slice(1));
    } catch {
      return;
    }
    const pane = document.getElementById("leveling-quest-pane");
    const target = document.getElementById(anchor);
    if (!target || !pane?.contains(target)) return;
    event.preventDefault();
    window.history.replaceState(window.history.state, "", href);
    onNavigate(href);
    revealAnchor(anchor);
  }
  return (
    <article
      className={styles.readerWorkspace}
      data-leveling-workspace
      data-reader-view={view}
      data-reader-display={display}
      data-reader-text={textSize}
    >
      <header className={styles.workspaceHeader}>
        <Link className={styles.workspaceBack} href={dashboardHref}>
          ← Chapters
        </Link>
        <div className={styles.workspaceTitle}>
          <h1>
            {title}{" "}
            <span>
              {minimumLevel}–{maximumLevel}
            </span>
          </h1>
          <p title={profile}>{profile}</p>
        </div>
        <div className={styles.workspaceProgress}>
          <span>{progressLabel}</span>
          <progress
            value={completed}
            max={Math.max(total, 1)}
            aria-label="Completed chapter steps"
          />
        </div>
        <button
          className={styles.workspaceSettingsButton}
          type="button"
          onClick={() => dialog.current?.showModal()}
        >
          Settings
        </button>
      </header>
      {notice && (
        <p className={styles.workspaceNotice} role="status">
          {notice}
        </p>
      )}
      <div className={styles.workspaceStepActions} role="group" aria-label="Step navigation">
        <p title={currentStepLabel} aria-live="polite">
          {currentStepLabel}
        </p>
        <button
          className={styles.workspaceStepButton}
          type="button"
          aria-label="Previous step"
          disabled={previousDisabled}
          onClick={() => {
            pendingScroll.current = true;
            onPrevious();
          }}
        >
          Previous
        </button>
        <button
          className={styles.workspaceStepButton}
          type="button"
          disabled={nextDisabled}
          title="Move forward without completing the current step"
          onClick={() => advance(false)}
        >
          Next step
        </button>
        <button
          className={`${styles.workspaceStepButton} ${styles.workspaceDoneButton}`}
          type="button"
          disabled={doneDisabled}
          title="Complete the current step and move forward"
          onClick={() => advance(true)}
        >
          Done
        </button>
        <button
          className={styles.workspaceStepButton}
          type="button"
          disabled={undoDisabled}
          onClick={() => {
            pendingScroll.current = true;
            onUndo();
          }}
        >
          Undo Done
        </button>
        {nextDisabled && currentStepAnchor && (
          <button
            className={styles.workspaceStepButton}
            type="button"
            onClick={() => {
              setDisplay("all");
              setView("quests");
              requestAnimationFrame(() => scrollReaderToAnchor("chapter-handoff"));
            }}
          >
            Review chapter
          </button>
        )}
      </div>
      <div className={styles.workspaceViews} role="group" aria-label="Reader view">
        {(
          [
            ["split", "Split view"],
            ["map", "Map focus"],
            ["quests", "Quest list focus"],
          ] as const
        ).map(([mode, text]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={view === mode}
            onClick={() => setView(mode)}
          >
            {text}
          </button>
        ))}
      </div>
      <div className={styles.workspaceBody}>
        <div className={styles.workspaceMap}>{map(revealAnchor)}</div>
        <section
          className={styles.workspaceQuests}
          aria-label="Chapter quest reader"
          onClick={navigateAnchor}
        >
          <div className={styles.workspaceQuestToolbar}>{toolbar}</div>
          <section
            id="leveling-quest-pane"
            className={styles.questPane}
            aria-label="Scrollable quest list"
            tabIndex={0}
          >
            {children}
          </section>
        </section>
      </div>
      <dialog
        ref={dialog}
        className={styles.readerSettingsDialog}
        aria-labelledby={settingsId}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.settingsHeader}>
          <h2 id={settingsId}>Chapter settings & evidence</h2>
          <button type="button" className={styles.button} onClick={() => dialog.current?.close()}>
            Close settings
          </button>
        </div>
        <div className={styles.detailsRow}>
          <label className={styles.field}>
            Reading mode
            <select
              value={display}
              onChange={(event) =>
                changeDisplay(event.target.value === "focus" ? "focus" : "all", textSize)
              }
            >
              <option value="all">All steps</option>
              <option value="focus">Current + next step</option>
            </select>
          </label>
          <label className={styles.field}>
            Text size
            <select
              value={textSize}
              onChange={(event) =>
                changeDisplay(display, event.target.value === "large" ? "large" : "standard")
              }
            >
              <option value="standard">Standard</option>
              <option value="large">Larger</option>
            </select>
          </label>
        </div>
        <LevelingBackupControls />
        {settings}
      </dialog>
    </article>
  );
}
