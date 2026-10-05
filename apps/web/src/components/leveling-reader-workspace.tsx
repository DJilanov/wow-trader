"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import { scrollReaderToAnchor } from "../lib/leveling-reader-navigation";
import {
  DEFAULT_READER_PREFERENCES,
  READER_PREFERENCES_KEY,
  readReaderPreferences,
  type ReaderPreferences,
  type ReaderView,
} from "../lib/leveling-reader-preferences";
import styles from "./leveling-experience.module.css";
import { LevelingBackupControls } from "./leveling-backup-controls";
import { useLeveling } from "./leveling-provider";

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
  readonly settingsButtonRef?: Ref<HTMLButtonElement>;
  readonly map: (revealAnchor: (anchor: string) => void) => ReactNode;
  readonly toolbar: ReactNode;
  readonly children: ReactNode;
  readonly onNavigate: (hash: string) => void;
}

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
  settingsButtonRef,
  map,
  toolbar,
  children,
  onNavigate,
}: LevelingReaderWorkspaceProps): React.JSX.Element {
  const { storageStatus } = useLeveling();
  const [preferences, setPreferences] = useState<ReaderPreferences>(DEFAULT_READER_PREFERENCES);
  const [mobile, setMobile] = useState(false);
  const view = mobile ? preferences.mobileView : "split";
  const { display, textSize } = preferences;
  const dialog = useRef<HTMLDialogElement>(null);
  const settingsId = useId();
  const pendingScroll = useRef(false);
  const pendingTarget = useRef<string | null>(null);
  const [revealSequence, setRevealSequence] = useState(0);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const resize = (): void => setMobile(media.matches);
    resize();
    media.addEventListener("change", resize);
    try {
      setPreferences(readReaderPreferences(localStorage.getItem(READER_PREFERENCES_KEY)));
    } catch {
      /* Optional display preferences do not affect character progress. */
    }
    return () => media.removeEventListener("change", resize);
  }, []);
  function changePreferences(change: Partial<ReaderPreferences>): void {
    const next = { ...preferences, ...change };
    setPreferences(next);
    try {
      localStorage.setItem(READER_PREFERENCES_KEY, JSON.stringify(next));
    } catch {
      /* Keep preferences usable for this visit when browser storage is denied. */
    }
  }
  function setView(next: ReaderView): void {
    if (view === "map" && next !== "map" && !pendingScroll.current) {
      pendingTarget.current = null;
      pendingScroll.current = true;
    }
    changePreferences({ mobileView: next });
  }
  function changeDisplay(nextDisplay: "all" | "focus", nextSize: "standard" | "large"): void {
    pendingTarget.current = null;
    pendingScroll.current = true;
    changePreferences({ display: nextDisplay, textSize: nextSize });
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
  }, [view, currentStepAnchor, display, textSize, revealSequence]);
  useEffect(() => {
    if (!ready || !currentStepAnchor) return;
    let frame = 0;
    const resize = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => scrollReaderToAnchor(currentStepAnchor));
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, [ready, currentStepAnchor]);

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
      style={{ "--reader-map-width": `${preferences.mapWidth}%` } as CSSProperties}
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
          <span
            title={`${progressLabel} · ${storageStatus === "saved" ? "Saved on this device · not account-synced" : storageStatus === "memory" ? "Progress is not saved; export a backup" : "Local progress"}`}
          >
            {progressLabel}
            {storageStatus === "saved"
              ? " · Saved"
              : storageStatus === "memory"
                ? " · Not saved"
                : ""}
          </span>
          <progress
            value={completed}
            max={Math.max(total, 1)}
            aria-label="Completed chapter steps"
          />
        </div>
        <button
          className={styles.workspaceSettingsButton}
          type="button"
          ref={settingsButtonRef}
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
          data-reader-action="undo"
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
            aria-label="Review chapter"
            title="Review the chapter return checkpoint"
            onClick={() => {
              changePreferences({ display: "all", mobileView: "quests" });
              requestAnimationFrame(() => scrollReaderToAnchor("chapter-handoff"));
            }}
          >
            Review
          </button>
        )}
      </div>
      <div className={styles.workspaceControls}>
        <div className={styles.workspaceReadingMode} role="group" aria-label="Reading mode">
          <button
            type="button"
            aria-pressed={display === "focus"}
            onClick={() => changeDisplay("focus", textSize)}
          >
            Current + next
          </button>
          <button
            type="button"
            aria-pressed={display === "all"}
            onClick={() => changeDisplay("all", textSize)}
          >
            All steps
          </button>
        </div>
        <label className={styles.workspaceMapWidth}>
          Map width
          <input
            type="range"
            min="35"
            max="60"
            step="5"
            value={preferences.mapWidth}
            onChange={(event) => changePreferences({ mapWidth: Number(event.target.value) })}
          />
        </label>
        <button
          className={styles.workspaceMapToggle}
          type="button"
          aria-pressed={view === "map"}
          onClick={() => setView(view === "map" ? "quests" : "map")}
        >
          {view === "map" ? "Show quests" : "Show map"}
        </button>
      </div>
      <div className={styles.workspaceBody}>
        <div className={styles.workspaceMap}>{map(revealAnchor)}</div>
        <section
          className={styles.workspaceQuests}
          aria-label="Chapter quest reader"
          onClick={navigateAnchor}
        >
          {toolbar && <div className={styles.workspaceQuestToolbar}>{toolbar}</div>}
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
            Mobile layout
            <select
              value={preferences.mobileView}
              onChange={(event) =>
                setView(
                  event.target.value === "split"
                    ? "split"
                    : event.target.value === "map"
                      ? "map"
                      : "quests",
                )
              }
            >
              <option value="quests">Quest list focus</option>
              <option value="map">Map focus</option>
              <option value="split">Split view</option>
            </select>
          </label>
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
