"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CHAPTER_REFERENCES,
  DUNGEON_LEVELS,
  LEVELING_EVIDENCE,
  WESTFALL_ROUTE,
  findChapterTargets,
  getChapterLabel,
  getPartyGuidance,
  type CharacterProfile,
  type ChapterReference,
} from "@wow-trader/leveling";
import { ForeverLevelingPlanner } from "./forever-leveling-planner";
import { useLeveling } from "./leveling-provider";
import { LevelingEntityLinks } from "./leveling-entity-links";
import { LevelingStepProgress } from "./leveling-step-progress";
import { LevelingZoneMap } from "./leveling-zone-map";
import { LevelingReaderWorkspace } from "./leveling-reader-workspace";
import { LevelingQuestCard } from "./leveling-quest-card";
import { useLevelingReaderSelection } from "./leveling-reader-selection";
import { scrollReaderToAnchor } from "../lib/leveling-reader-navigation";
import type { LevelingChapterMaps } from "../lib/leveling-map-data";
import {
  getPublicChapter,
  chapterProgressKey,
  LEGACY_PLANNER_STORAGE_KEY,
  levelingChapterPath,
  levelingDashboardPath,
  profileSummary,
  type StepProgress,
} from "../lib/leveling-experience";
import styles from "./leveling-experience.module.css";

interface LevelingReaderProps {
  readonly chapter: ChapterReference;
  readonly defaultProfile: CharacterProfile;
  readonly maps: LevelingChapterMaps;
}
const actionLabels = {
  travel: "Travel",
  accept: "Accept",
  complete: "Objective",
  turnin: "Turn in",
  checkpoint: "Level check",
  instruction: "Prepare",
} as const;
const actionIcons = {
  travel: "→",
  accept: "!",
  complete: "◇",
  turnin: "?",
  checkpoint: "↑",
  instruction: "•",
} as const;

export function LevelingReader({
  chapter,
  defaultProfile,
  maps,
}: LevelingReaderProps): React.JSX.Element {
  const { session, notice, loaded, saveCharacter, setProgress } = useLeveling();
  const matchingSession =
    session &&
    session.profile.faction === defaultProfile.faction &&
    session.profile.raceId === defaultProfile.raceId
      ? session
      : null;
  const profile = matchingSession?.profile ?? defaultProfile;
  const label = getChapterLabel(chapter, profile);
  const route = getPublicChapter(chapter, profile);
  const progress = route
    ? (matchingSession?.progress[
        chapterProgressKey(chapter.id, route.version, route.clientBuild)
      ] ?? {})
    : {};
  const [hideDone, setHideDone] = useState(false);
  const [skipWarning, setSkipWarning] = useState<string | null>(null);
  const comparison = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (
      window.location.hash === "#planner" ||
      new URLSearchParams(window.location.search).has("plan")
    ) {
      if (comparison.current) comparison.current.open = true;
      requestAnimationFrame(() => scrollReaderToAnchor("planner"));
    }
  }, []);
  const next = findChapterTargets(chapter, CHAPTER_REFERENCES, profile);
  const party = getPartyGuidance(profile);
  const completed = route?.steps.filter((step) => progress[step.id] === "done").length ?? 0;
  const scope = route
    ? chapterProgressKey(chapter.id, route.version, route.clientBuild)
    : chapter.id;
  const selection = useLevelingReaderSelection(
    `${matchingSession?.id ?? "unsaved"}:${scope}`,
    "route-",
    route?.steps.map((step) => step.id) ?? [],
    route?.steps.filter((step) => !progress[step.id]).map((step) => step.id) ?? [],
    route?.steps
      .filter((step) => !hideDone || progress[step.id] !== "done")
      .map((step) => step.id) ?? [],
  );
  const selectedMapStep = route?.steps.find((step) => step.id === selection.selectedId);
  const mapPoints = maps.points.filter((point) => point.stepId === selectedMapStep?.id);

  function mark(stepId: string, status: StepProgress): void {
    const step = route?.steps.find((entry) => entry.id === stepId);
    if (status === "skipped" && step) {
      const dependents =
        step.questId === null
          ? []
          : WESTFALL_ROUTE.quests.filter((quest) =>
              quest.prerequisiteIds.includes(step.questId ?? 0),
            );
      setSkipWarning(
        dependents.length
          ? `Keep the prerequisite work for ${dependents.map((quest) => quest.title).join(", ")}. Skipping this step does not satisfy those requirements.`
          : "Skipped steps do not satisfy prerequisites or count as completed work. Check the next checkpoint before continuing.",
      );
    }
    setProgress(chapter.id, stepId, status);
  }

  if (!route)
    return (
      <article className={styles.reader}>
        <Link className={styles.backLink} href={levelingDashboardPath(profile)}>
          ← Your chapter path
        </Link>
        <header className={styles.readerHero}>
          <span className="eyebrow">
            {profile.faction === "alliance" ? "Alliance" : "Horde"} · Chapter reference
          </span>
          <h1>
            {label.zone}
            <span>
              Levels {label.minimumLevel}–{label.maximumLevel}
            </span>
          </h1>
          <p>
            {profileSummary(profile)} · {profile.pace === "fast" ? "Speed" : "Chill"} ·{" "}
            {profile.party.size === 1 ? "Solo" : `${profile.party.size} players`}
          </p>
        </header>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        <section className={styles.coveragePanel}>
          <span className="eyebrow">Extracted bracket · instructions pending</span>
          <h2>This chapter's public quest list is not ready yet.</h2>
          <p>
            The bracket comes from reviewed guide headers. It is not proof that all quests are
            available in the current build, or that this transition works for your character. We
            publish original KFC instructions or authorized content, not a private account-derived
            guide export.
          </p>
          {label.minimumLevel > LEVELING_EVIDENCE.betaLevelCap && (
            <p className={styles.notice}>
              This bracket begins above the current reviewed beta cap of{" "}
              {LEVELING_EVIDENCE.betaLevelCap}.
            </p>
          )}
          <div className={styles.actions}>
            <Link className={styles.button} href={levelingDashboardPath(profile)}>
              Back to chapters
            </Link>
            <Link href="/forever/encyclopedia/quests">Browse quest facts →</Link>
          </div>
        </section>
        <Link href={levelingDashboardPath(profile)}>← Chapter overview</Link>
      </article>
    );

  return (
    <LevelingReaderWorkspace
      scope={scope}
      ready={loaded}
      title={label.zone}
      minimumLevel={label.minimumLevel}
      maximumLevel={label.maximumLevel}
      profile={`${profileSummary(profile)} · ${profile.pace === "fast" ? "Speed" : "Chill"} · ${profile.party.size === 1 ? "Solo" : `${profile.party.size} players`}`}
      dashboardHref={levelingDashboardPath(profile)}
      completed={completed}
      total={route.steps.length}
      progressLabel={`${completed} / ${route.steps.length} steps done`}
      notice={notice}
      onNavigate={selection.navigate}
      settings={
        <>
          <div className={styles.notice}>
            Version {route.version} · build {route.clientBuild} · original {route.minimumLevel}–
            {route.maximumLevel} companion. Current quest order is preserved. Race-specific bracket
            labels do not mean the complete imported variant is published. Quest XP and a live beta
            playthrough still need verification.
          </div>
          <p className={styles.muted}>
            Chapter completion requires every required step. Optional steps can stay open. Reader
            checkmarks do not change the independent XP comparison.
          </p>
        </>
      }
      map={
        <LevelingZoneMap
          maps={maps}
          points={mapPoints}
          stepLabel={selectedMapStep?.title ?? "No active step"}
          followingNext={selection.followingNext}
          onFollowNext={selection.follow}
        />
      }
      toolbar={
        <>
          <div className={styles.readerToolbar}>
            <h2 id="quest-list-heading">The current quest list</h2>
            <label>
              <input
                type="checkbox"
                checked={hideDone}
                onChange={(event) => setHideDone(event.target.checked)}
              />{" "}
              Hide completed
            </label>
          </div>
          <div className={styles.workspaceListLinks}>
            {selection.resumeId && (
              <a href={`#route-${selection.resumeId}`} data-reader-resume>
                Resume next step ↓
              </a>
            )}
            <a href="#dungeon-opportunities">Optional dungeon comparison</a>
          </div>
        </>
      }
    >
      <p className={styles.readerSource}>
        Original KFC preview · version {route.version} · build {route.clientBuild} · current order
        preserved. Runtime verification pending.
      </p>
      {loaded && !matchingSession && (
        <div className={styles.resume}>
          <p>Save this character setup to track steps locally.</p>
          <button type="button" className={styles.button} onClick={() => saveCharacter(profile)}>
            Save character & enable progress
          </button>
        </div>
      )}
      {skipWarning && (
        <p className={styles.notice} role="status">
          {skipWarning}
        </p>
      )}
      <ol className={styles.questSteps}>
        {route.steps
          .filter((step) => !hideDone || progress[step.id] !== "done")
          .map((step) => (
            <LevelingQuestCard
              key={step.id}
              id={`route-${step.id}`}
              title={step.title}
              selectionLabel={
                maps.points.some((point) => point.stepId === step.id)
                  ? `Show ${step.title} on map`
                  : `Select ${step.title}`
              }
              selected={selection.selectedId === step.id}
              done={progress[step.id] === "done"}
              onSelect={() => selection.select(step.id)}
              leading={
                <span className={styles.actionIcon} aria-hidden="true">
                  {actionIcons[step.action]}
                </span>
              }
              meta={
                <>
                  {actionLabels[step.action]}
                  {step.optional && " · Optional"}
                  {progress[step.id] === "skipped" && " · Skipped, not completed"}
                </>
              }
              progress={
                <LevelingStepProgress
                  label={step.title}
                  value={progress[step.id] ?? "pending"}
                  disabled={!matchingSession || !loaded}
                  onChange={(status) => mark(step.id, status)}
                />
              }
            >
              <p>{step.text}</p>
              {step.position && (
                <small>
                  {step.position.zone} · {step.position.x}, {step.position.y}
                </small>
              )}
              {step.action === "checkpoint" && <small>Requires level {step.level}</small>}
              {step.questId !== null && <LevelingEntityLinks kind="quest" id={step.questId} />}
            </LevelingQuestCard>
          ))}
      </ol>
      {hideDone && completed === route.steps.length && (
        <p className={styles.empty}>
          All steps are marked done. Show completed to review or change them.
        </p>
      )}
      <div className={styles.rejoin}>
        <strong>Rejoin checkpoint</strong>
        <p>{route.rejoin}</p>
      </div>
      <section id="dungeon-opportunities" className={styles.opportunities}>
        <span className="eyebrow">Optional · never an automatic detour</span>
        <h2>Would a dungeon suit this session?</h2>
        <p>
          <strong>{party.title}.</strong> {party.text}
        </p>
        <div className={styles.detailsRow}>
          {DUNGEON_LEVELS.filter((entry) => entry.id === "thanes" || entry.id === "deadmines").map(
            (entry) => (
              <div className={styles.dungeonCard} key={entry.id}>
                <strong>{entry.name}</strong>
                <span>At level {entry.atLevel} · conservative baseline</span>
                <small>
                  {entry.id === "thanes"
                    ? "Selected quest pickups can raise the visit to 15 or 16."
                    : "Prepare the unlock chain here; the visit is later, outside this slice."}
                </small>
              </div>
            ),
          )}
        </div>
        <details className={styles.comparison} ref={comparison}>
          <summary>Open advanced XP / full-trip comparison</summary>
          <p>
            The existing calculator is independent of manual reader checkmarks. Set your actual
            completed quests, current XP and times explicitly; party setup does not silently change
            its assumptions.
          </p>
          <ForeverLevelingPlanner
            key={matchingSession?.id ?? "legacy"}
            route={route}
            storageKey={
              matchingSession
                ? `kfc-leveling:planner:${matchingSession.id}:${route.version}:${route.clientBuild}`
                : LEGACY_PLANNER_STORAGE_KEY
            }
          />
        </details>
      </section>
      <nav className={styles.chapterPagination} aria-label="Chapter navigation">
        <Link href={levelingDashboardPath(profile)}>← Chapter overview</Link>
        {next.length === 1 ? (
          <Link href={levelingChapterPath(profile, next[0]!.id)}>
            Next reference: {getChapterLabel(next[0]!, profile).zone} →
          </Link>
        ) : (
          <span>
            {next.length > 1
              ? "Choose a continuation in the chapter overview"
              : "Next transition needs review"}
          </span>
        )}
      </nav>
    </LevelingReaderWorkspace>
  );
}
