"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CHAPTER_REFERENCES,
  LEVELING_EVIDENCE,
  DUNGEON_VISITS,
  DUNGEON_RELEASE,
  chapterDungeonItineraries,
  emptyDungeonPlan,
  chapterEligibility,
  getChapterLabel,
  offersThanesReplacement,
  selectChapterSequence,
  type CharacterProfile,
  type ChapterReference,
  type GuideChapterSummary,
} from "@wow-trader/leveling";
import {
  CHAPTER_PACE_KEY,
  buildChapterPath,
  chapterActivityStats,
  chapterTargetXp,
  estimateChapterMinutes,
  formatChapterMinutes,
  parseChapterPace,
  type ChapterActivity,
  type ChapterPathNode,
} from "../lib/leveling-chapter-path";
import {
  getPublicChapter,
  isChapterComplete,
  levelingDungeonPath,
  levelingChapterPath,
  type LevelingSession,
} from "../lib/leveling-experience";
import { LevelingDungeonAlternative } from "./leveling-dungeon-alternative";
import { LevelingDungeonOptions } from "./leveling-dungeon-options";
import styles from "./leveling-chapter-path.module.css";

interface LevelingChapterPathProps {
  readonly profile: CharacterProfile;
  readonly session: LevelingSession | null;
  readonly archiveChapters: readonly GuideChapterSummary[];
  readonly archiveBuild: number | null;
  readonly activities: readonly ChapterActivity[];
  readonly currentChapterId: string | null;
  readonly dungeonSourceAvailable: boolean;
}

export function LevelingChapterPath({
  profile,
  session,
  archiveChapters,
  archiveBuild,
  activities,
  currentChapterId,
  dungeonSourceAvailable,
}: LevelingChapterPathProps): React.JSX.Element {
  const [family, setFamily] = useState<ChapterReference["family"]>("questing");
  const [paceInput, setPaceInput] = useState("");
  const [paceNotice, setPaceNotice] = useState<string | null>(null);
  const paceKey = `${CHAPTER_PACE_KEY}:${session?.id ?? `${profile.faction}-${profile.raceId}`}`;
  useEffect(() => {
    try {
      const value = window.localStorage.getItem(paceKey) ?? "";
      setPaceInput(parseChapterPace(value) === null ? "" : value);
      setPaceNotice(null);
    } catch {
      setPaceInput("");
      setPaceNotice(
        "Pace settings are available for this visit only; browser storage is unavailable.",
      );
    }
  }, [paceKey]);
  function changePace(value: string): void {
    setPaceInput(value);
    if (value && parseChapterPace(value) === null) return;
    try {
      if (value) window.localStorage.setItem(paceKey, value);
      else window.localStorage.removeItem(paceKey);
      setPaceNotice(null);
    } catch {
      setPaceNotice("This pace is not saved; browser storage is unavailable.");
    }
  }
  const pace = parseChapterPace(paceInput);
  const nodes = useMemo(
    () => buildChapterPath(CHAPTER_REFERENCES, profile, family),
    [profile, family],
  );
  const groups = new Map<number, ChapterPathNode[]>();
  for (const node of nodes) {
    const level = getChapterLabel(node.chapter, profile).minimumLevel;
    groups.set(level, [...(groups.get(level) ?? []), node]);
  }
  const sequence = selectChapterSequence(CHAPTER_REFERENCES, profile);
  const sourceAligned = archiveBuild === LEVELING_EVIDENCE.clientBuild;
  const activityById = new Map(activities.map((activity) => [activity.chapterId, activity]));
  const byId = new Map(nodes.map((node) => [node.chapter.id, node.chapter]));
  const dungeonPlan = session?.dungeonPlans[DUNGEON_RELEASE] ?? emptyDungeonPlan();
  const dungeonNodes = nodes.filter(
    (node) =>
      offersThanesReplacement(node.chapter, profile) ||
      chapterDungeonItineraries(node.chapter, profile, dungeonPlan).length > 0,
  );
  const dungeonJump =
    dungeonNodes.find((node) => node.chapter.id === currentChapterId) ??
    dungeonNodes.find(
      (node) => getChapterLabel(node.chapter, profile).maximumLevel > (profile.level ?? 1),
    ) ??
    dungeonNodes[0];

  return (
    <section className={styles.path} aria-labelledby="chapters-heading">
      <header className={styles.heading}>
        <div>
          <span className="eyebrow">The whole journey · 1–60</span>
          <h2 id="chapters-heading">Your chapter path</h2>
          <p>
            Every available chapter, with source-linked continuations and separate alternatives.
          </p>
        </div>
        <span className={styles.count}>{nodes.length} chapters</span>
      </header>
      <div className={styles.tools}>
        <label>
          Guide family
          <select
            value={family}
            onChange={(event) => setFamily(event.target.value as ChapterReference["family"])}
          >
            <option value="questing">Questing · all classes</option>
            <option value="mage-aoe">Mage AoE · explicit alternative</option>
            <option value="advanced-mage-aoe">Advanced Mage AoE</option>
          </select>
        </label>
        <label>
          Your effective XP/hour
          <input
            type="number"
            min="1"
            max="1000000000"
            step="any"
            inputMode="decimal"
            value={paceInput}
            onChange={(event) => changePace(event.target.value)}
            aria-describedby="chapter-pace-help"
            placeholder="Enter your observed pace"
          />
        </label>
        {currentChapterId && byId.has(currentChapterId) && (
          <a className={styles.jump} href={`#path-${currentChapterId}`}>
            Jump to current chapter ↓
          </a>
        )}
        {dungeonJump && (
          <a className={styles.dungeonJump} href={`#path-${dungeonJump.chapter.id}`}>
            Find dungeon alternatives ↓
          </a>
        )}
      </div>
      <p className={styles.explanation} id="chapter-pace-help">
        XP targets are level requirements, not verified zone rewards. Enter your pace to model time;
        the client curve is not runtime-confirmed.
      </p>
      {paceInput && pace === null && (
        <p role="alert" className={styles.warning}>
          Enter a positive XP/hour value up to 1,000,000,000.
        </p>
      )}
      {paceNotice && (
        <p role="status" className={styles.warning}>
          {paceNotice}
        </p>
      )}
      <details className={styles.method}>
        <summary>How quest counts, XP and time are estimated</summary>
        <p className={styles.explanation}>
          Time = bracket XP ÷ your entered pace. Use per-player XP/hour including travel and
          hand-ins; bonuses are already included, not multiplied again. This is a planning scenario,
          not a measured zone duration. Pace changes with level. Same-level chapters need
          reward/timing data.
        </p>
        <p className={styles.explanation}>
          Quest counts deduplicate IDs in the applicable source list; optional quests are included
          and unknown conditions are separate. Game-state checks can change what you actually do. XP
          targets mean progress from the start of the first level to the bracket end, not XP awarded
          by those quests. Reward subtotals cover only known references, not kills or exploration.
          Later chapters exceed the beta cap.
        </p>
      </details>
      {!sourceAligned && (
        <p className={styles.warning}>
          The exact build-{LEVELING_EVIDENCE.clientBuild} activity archive is unavailable. Counts
          are not guessed from source steps or unrelated builds.
        </p>
      )}
      {sequence.messages.map((message) => (
        <p className={styles.explanation} key={message}>
          {message}
        </p>
      ))}
      <ol className={styles.tree} aria-label="Full chapter route tree">
        {[...groups].map(([level, entries]) => (
          <li className={styles.levelGroup} key={level}>
            <div className={styles.milestone}>
              <span>Level</span>
              <strong>{level}</strong>
            </div>
            <div className={styles.branches}>
              {entries.map((node) => {
                const { chapter } = node;
                const label = getChapterLabel(chapter, profile);
                const imported = archiveChapters.find((entry) => entry.chapterId === chapter.id);
                const activity = sourceAligned ? activityById.get(chapter.id) : undefined;
                const stats = activity ? chapterActivityStats(activity, profile) : null;
                const targetXp = sourceAligned ? chapterTargetXp(chapter, profile) : null;
                const minutes = estimateChapterMinutes(targetXp, pace);
                const sequenceIndex = sequence.chapters.findIndex(
                  (entry) => entry.id === chapter.id,
                );
                const conditional =
                  chapterEligibility(chapter, profile) === "unknown" || label.unresolved;
                const current = chapter.id === currentChapterId;
                return (
                  <article
                    id={`path-${chapter.id}`}
                    className={`${styles.node} ${current ? styles.current : ""}`}
                    key={chapter.id}
                    data-chapter-node={chapter.id}
                  >
                    <div className={styles.nodeTop}>
                      <span>
                        {sequenceIndex >= 0
                          ? `Chapter ${String(sequenceIndex + 1).padStart(2, "0")}`
                          : "Route chapter"}
                      </span>
                      <span>
                        {current
                          ? "Current chapter"
                          : isChapterComplete(session, chapter)
                            ? "Completed"
                            : conditional
                              ? "Condition needs review"
                              : imported
                                ? "Full source list"
                                : getPublicChapter(chapter, profile)
                                  ? "KFC preview"
                                  : "Reference only"}
                      </span>
                    </div>
                    <Link
                      className={styles.chapterLink}
                      href={levelingChapterPath(profile, chapter.id)}
                      prefetch={false}
                      aria-label={`${sequenceIndex >= 0 ? `Chapter ${String(sequenceIndex + 1).padStart(2, "0")} · ` : ""}${label.title} · ${imported || getPublicChapter(chapter, profile) ? "Open quest list" : "View chapter reference"}`}
                    >
                      <span className={styles.bracket}>
                        {label.minimumLevel}–{label.maximumLevel}
                      </span>
                      <h3>{label.zone}</h3>
                      <span aria-hidden="true">↗</span>
                    </Link>
                    <dl className={styles.metrics}>
                      <div>
                        <dt>Quests planned</dt>
                        <dd>
                          <span>{stats ? stats.questCount.toLocaleString() : "Not counted"}</span>
                          {stats && (
                            <small>
                              {stats.optionalQuestCount > 0 &&
                                `${stats.optionalQuestCount} optional`}
                              {stats.optionalQuestCount > 0 &&
                                stats.conditionalQuestCount > 0 &&
                                " · "}
                              {stats.conditionalQuestCount > 0 &&
                                `+${stats.conditionalQuestCount} conditional`}
                              {stats.optionalQuestCount === 0 &&
                                stats.conditionalQuestCount === 0 &&
                                "Unique quest IDs"}
                            </small>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Quest hand-ins</dt>
                        <dd>
                          <span>{stats ? stats.handInCount.toLocaleString() : "Not counted"}</span>
                          {stats && stats.conditionalHandInCount > 0 && (
                            <small>+{stats.conditionalHandInCount} conditional</small>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>XP target</dt>
                        <dd>
                          <span>{targetXp === null ? "Not known" : targetXp.toLocaleString()}</span>
                          <small>
                            {label.minimumLevel === label.maximumLevel
                              ? "Same-level chapter"
                              : "Bracket requirement"}
                          </small>
                        </dd>
                      </div>
                      <div>
                        <dt>Estimated time</dt>
                        <dd>
                          <span>{formatChapterMinutes(minutes)}</span>
                          <small>
                            {pace === null
                              ? "Set your pace above"
                              : targetXp === null
                                ? "Needs chapter XP data"
                                : "At your entered pace"}
                          </small>
                        </dd>
                      </div>
                    </dl>
                    <p className={styles.reward}>
                      {stats
                        ? stats.handInCount === 0
                          ? "No applicable hand-in rewards in this chapter."
                          : stats.referenceRewardXp === null
                            ? `Quest reward XP unavailable · 0/${stats.handInCount} rewards known`
                            : `${stats.referenceRewardXp.toLocaleString()} reference quest XP · ${stats.knownRewardCount}/${stats.handInCount} rewards known${stats.knownRewardCount < stats.handInCount ? " · incomplete subtotal" : " · runtime unconfirmed"}`
                        : "Quest rewards not published for this source."}
                    </p>
                    {node.targets.length > 0 && (
                      <div
                        className={styles.transitions}
                        aria-label={`Continuations from ${label.title}`}
                      >
                        <span>
                          {node.targets.length > 1 ? "Source branches →" : "Source continues →"}
                        </span>
                        {node.targets.map((target) => {
                          const destination = byId.get(target.chapterId);
                          return destination ? (
                            <a key={target.chapterId} href={`#path-${target.chapterId}`}>
                              {getChapterLabel(destination, profile).title}
                              {target.conditional ? " · conditional" : ""}
                            </a>
                          ) : null;
                        })}
                      </div>
                    )}
                    {node.missingTargets.length > 0 && (
                      <p className={styles.warning}>
                        Unresolved source link: {node.missingTargets.join("; ")}
                      </p>
                    )}
                    {!node.targets.length &&
                      !node.missingTargets.length &&
                      label.maximumLevel < 60 && (
                        <p className={styles.explanation}>
                          No applicable source continuation · do not infer a connection from nearby
                          levels.
                        </p>
                      )}
                    {label.minimumLevel > LEVELING_EVIDENCE.betaLevelCap && (
                      <small className={styles.explanation}>
                        Beyond the current level-{LEVELING_EVIDENCE.betaLevelCap} beta cap
                      </small>
                    )}
                    {offersThanesReplacement(chapter, profile) && (
                      <LevelingDungeonAlternative
                        chapter={chapter}
                        profile={profile}
                        sourceAvailable={Boolean(imported) && dungeonSourceAvailable}
                      />
                    )}
                    <LevelingDungeonOptions chapter={chapter} profile={profile} />
                  </article>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {family === "questing" && (
        <details className={styles.method}>
          <summary>Unplaced dungeon references · visit level needs review</summary>
          <p className={styles.explanation}>
            These have no reviewed At-level bracket. They cannot be scheduled from a quest pickup
            minimum.
          </p>
          {DUNGEON_VISITS.filter(
            (visit) =>
              visit.levels === null &&
              (visit.faction === "both" || visit.faction === profile.faction),
          ).map((visit) => (
            <p key={visit.id}>
              <Link prefetch={false} href={levelingDungeonPath(profile, visit.id)}>
                {visit.name} · review reference quests →
              </Link>
            </p>
          ))}
        </details>
      )}
      {!nodes.length && (
        <p className={styles.warning}>
          No applicable chapters for this guide family and character setup. Choose another guide
          family or review your class and known XP rate.
        </p>
      )}
      <p className={styles.explanation}>
        Branches can rejoin the same chapter. Linked arrows are extracted source transitions; the
        vertical line only orders chapters by starting level. Alternatives are not added into a
        single route XP or time total.
      </p>
    </section>
  );
}
