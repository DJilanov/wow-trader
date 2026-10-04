"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { scrollReaderToAnchor } from "../lib/leveling-reader-navigation";
import styles from "./leveling-experience.module.css";

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
  readonly settings: ReactNode;
  readonly map: ReactNode;
  readonly toolbar: ReactNode;
  readonly children: ReactNode;
  readonly onNavigate: (hash: string, resume: boolean) => void;
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
  settings,
  map,
  toolbar,
  children,
  onNavigate,
}: LevelingReaderWorkspaceProps): React.JSX.Element {
  const [view, setView] = useState<ReaderView>("split");
  const dialog = useRef<HTMLDialogElement>(null);
  const settingsId = useId();
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
    if (!scrollReaderToAnchor(anchor)) return;
    event.preventDefault();
    window.history.replaceState(window.history.state, "", href);
    onNavigate(href, link?.hasAttribute("data-reader-resume") ?? false);
  }
  return (
    <article className={styles.readerWorkspace} data-leveling-workspace data-reader-view={view}>
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
        <div className={styles.workspaceMap}>{map}</div>
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
        {settings}
      </dialog>
    </article>
  );
}
