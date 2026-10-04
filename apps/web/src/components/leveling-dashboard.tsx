"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CHAPTER_REFERENCES,
  LEVELING_EVIDENCE,
  chapterEligibility,
  getChapterLabel,
  getLevelingRace,
  getPartyGuidance,
  selectChapterSequence,
  type CharacterProfile,
  type ChapterReference,
  type GuideChapterSummary,
} from "@wow-trader/leveling";
import { ForeverIcon } from "./forever-icon";
import { useLeveling } from "./leveling-provider";
import {
  WESTFALL_CHAPTER_ID,
  getPublicChapter,
  isChapterComplete,
  levelingChapterPath,
  levelingDashboardPath,
  profileSummary,
  type LevelingSession,
  readingPositionPath,
} from "../lib/leveling-experience";
import styles from "./leveling-experience.module.css";
import { LevelingBackupControls } from "./leveling-backup-controls";

interface LevelingDashboardProps {
  readonly defaultProfile: CharacterProfile;
  readonly archiveChapters?: readonly GuideChapterSummary[];
}

export function LevelingDashboard({
  defaultProfile,
  archiveChapters = [],
}: LevelingDashboardProps): React.JSX.Element {
  const { session, loaded, notice, saveCharacter } = useLeveling();
  const matchingSession =
    session &&
    session.profile.faction === defaultProfile.faction &&
    session.profile.raceId === defaultProfile.raceId
      ? session
      : null;
  const profile = matchingSession?.profile ?? defaultProfile;
  const race = getLevelingRace(profile.faction, profile.raceId);
  const selection = selectChapterSequence(CHAPTER_REFERENCES, profile);
  const publicChapter = CHAPTER_REFERENCES.find(
    (chapter) => chapter.id === WESTFALL_CHAPTER_ID && getPublicChapter(chapter, profile),
  );
  const referenceChapters = [...selection.alternatives, ...selection.unresolved].filter(
    (chapter) => archiveChapters.length > 0 || chapter.id !== publicChapter?.id,
  );
  const party = getPartyGuidance(profile);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [levelBand, setLevelBand] = useState("1");
  const [family, setFamily] = useState("questing");

  async function share(): Promise<void> {
    const url = new URL(levelingDashboardPath(profile), window.location.origin);
    url.searchParams.set("setup", JSON.stringify(profile));
    setShareUrl(url.toString());
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareMessage("Setup link copied. Private quest progress is not shared.");
    } catch {
      setShareMessage("Copy this setup link. Private quest progress is not shared.");
    }
  }
  function changeProfile(next: CharacterProfile): void {
    saveCharacter(next, matchingSession?.id);
  }
  const current = matchingSession?.lastChapterId
    ? CHAPTER_REFERENCES.find(
        (chapter) =>
          chapter.id === matchingSession.lastChapterId &&
          (getPublicChapter(chapter, profile) ||
            archiveChapters.some((entry) => entry.chapterId === chapter.id)),
      )
    : archiveChapters.length > 0
      ? selection.chapters.find((chapter) =>
          archiveChapters.some((entry) => entry.chapterId === chapter.id),
        )
      : publicChapter;
  const allChapters = CHAPTER_REFERENCES.filter(
    (chapter) => chapter.family === family && chapterEligibility(chapter, profile) !== "exclude",
  )
    .filter((chapter) => {
      const label = getChapterLabel(chapter, profile);
      return (
        levelBand === "all" ||
        (label.minimumLevel < Number(levelBand) + 20 && label.maximumLevel >= Number(levelBand))
      );
    })
    .sort(
      (a, b) =>
        getChapterLabel(a, profile).minimumLevel - getChapterLabel(b, profile).minimumLevel ||
        a.sourceId - b.sourceId,
    );

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHero}>
        <div>
          <span className="eyebrow">
            Your adventure · {profile.faction === "alliance" ? "Alliance" : "Horde"}
          </span>
          <h1>{race?.name.split(" · ")[0]}'s path through Azeroth.</h1>
          <p>Choose a small chapter. Follow its current list. Keep your place.</p>
        </div>
        {race && (
          <span className={styles.heroPortrait}>
            <ForeverIcon iconKey={race.icon} snapshotChecksum="leveling-70205" />
          </span>
        )}
      </header>
      <div className={styles.profileBar}>
        <span>{profileSummary(profile)}</span>
        <span>
          {profile.pace === "fast" ? "Speed" : "Chill"} ·{" "}
          {profile.party.size === 1 ? "Solo" : `${profile.party.size} players`}
        </span>
        {profile.level !== null && <span>Level {profile.level}</span>}
        <Link
          href={
            matchingSession
              ? `/forever/leveling?stage=style&edit=${matchingSession.id}`
              : "/forever/leveling"
          }
        >
          Change setup
        </Link>
        <Link href="/forever/leveling">Characters</Link>
        <button type="button" onClick={() => void share()}>
          Share setup
        </button>
      </div>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {shareMessage && (
        <div className={styles.notice} role="status">
          {shareMessage}
          {shareUrl && (
            <label className={styles.field}>
              Setup link
              <input readOnly value={shareUrl} onFocus={(event) => event.target.select()} />
            </label>
          )}
        </div>
      )}
      {!loaded && (
        <p className={styles.muted} role="status">
          Loading your saved character…
        </p>
      )}
      {loaded && !matchingSession && (
        <div className={styles.notice}>
          You are browsing this race's reference route.{" "}
          <button
            className={styles.quietButton}
            type="button"
            onClick={() => saveCharacter(profile)}
          >
            Save as another character
          </button>
        </div>
      )}
      <div className={styles.dashboardColumns}>
        <section className={styles.continueCard} aria-labelledby="continue-heading">
          <span className="eyebrow">{current ? "Available to read now" : "Route coverage"}</span>
          <h2 id="continue-heading">
            {current
              ? archiveChapters.length > 0
                ? `Continue in ${getChapterLabel(current, profile).zone}.`
                : "Read the Westfall preview."
              : "Your starting brackets are mapped."}
          </h2>
          <p>
            {current
              ? archiveChapters.length > 0
                ? "Read the full authorized source list, filtered for your character. Original order stays intact; game-state and transition checks still need review."
                : "The original KFC 13–15 companion keeps its current quest order. It is a preview, not a complete race-specific route."
              : "The extracted brackets below are reference metadata. An original public quest list for this faction is not ready yet."}
          </p>
          {current ? (
            <Link
              className={styles.button}
              href={
                matchingSession?.lastReader
                  ? readingPositionPath(matchingSession)
                  : levelingChapterPath(profile, current.id)
              }
            >
              {matchingSession?.lastReader ? "Continue playing →" : "Open current quest list →"}
            </Link>
          ) : (
            <Link className={styles.button} href="/forever/encyclopedia/quests">
              Browse the quest encyclopedia →
            </Link>
          )}
          <small>
            Build {LEVELING_EVIDENCE.clientBuild} · current beta cap{" "}
            {LEVELING_EVIDENCE.betaLevelCap} · runtime validation pending
          </small>
        </section>
        <aside className={styles.partyCard}>
          <span className="eyebrow">{profile.party.size === 1 ? "Your pace" : "Your party"}</span>
          <h2>{party.title}</h2>
          <p>{party.text}</p>
          {profile.party.size > 1 && (
            <>
              <small>Everyone must meet the actual entry and selected quest requirements.</small>
              <a href="https://www.wowforeverdiscord.online/lfg">Find a leveling group ↗</a>
            </>
          )}
        </aside>
      </div>
      <LevelingBackupControls />
      <section aria-labelledby="chapters-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">One chapter at a time</span>
            <h2 id="chapters-heading">Your chapter path</h2>
          </div>
          <span className={styles.muted}>Real brackets · not uniform level blocks</span>
        </div>
        {selection.messages.map((message) => (
          <p className={styles.notice} key={message}>
            {message}
          </p>
        ))}
        {selection.chapters.length > 0 ? (
          <div className={styles.chapterGrid}>
            {selection.chapters.map((chapter, index) => (
              <ChapterCard
                key={chapter.id}
                chapter={chapter}
                profile={profile}
                session={matchingSession}
                position={index + 1}
                imported={archiveChapters.find((entry) => entry.chapterId === chapter.id)}
              />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            There is no unambiguous starting sequence for this setup yet. Review its reference
            candidates below.
          </p>
        )}
        {publicChapter &&
          archiveChapters.length === 0 &&
          !selection.chapters.some((chapter) => chapter.id === publicChapter.id) && (
            <div className={styles.availableCompanion}>
              <h3>Available original KFC companion</h3>
              <ChapterCard chapter={publicChapter} profile={profile} session={matchingSession} />
            </div>
          )}
      </section>
      <details
        className={styles.referenceSection}
        open={archiveChapters.length > 0 || selection.chapters.length === 0}
      >
        <summary>
          {archiveChapters.length > 0 ? "All chapters to level 60" : "Other reference brackets"}{" "}
          <span>{archiveChapters.length > 0 ? allChapters.length : referenceChapters.length}</span>
        </summary>
        <p>
          These include alternative and condition-dependent chapters, not a single automatically
          connected route.
          {archiveChapters.length > 0
            ? " Full instructions are available from the authorized source; disconnected transitions remain marked for review."
            : " Only reviewed public instructions open a quest list."}
        </p>
        <div className={styles.detailsRow}>
          {archiveChapters.length > 0 && (
            <>
              <label className={styles.field}>
                Level bracket
                <select value={levelBand} onChange={(event) => setLevelBand(event.target.value)}>
                  <option value="all">All levels · 1–60</option>
                  <option value="1">1–20</option>
                  <option value="21">21–40</option>
                  <option value="41">41–60</option>
                </select>
              </label>
              <label className={styles.field}>
                Guide family
                <select value={family} onChange={(event) => setFamily(event.target.value)}>
                  <option value="questing">Questing · all classes</option>
                  <option value="mage-aoe">Mage AoE · explicit alternative</option>
                  <option value="advanced-mage-aoe">Advanced Mage AoE</option>
                </select>
              </label>
            </>
          )}
          <label className={styles.field}>
            Class
            <select
              value={profile.classSlug ?? ""}
              onChange={(event) =>
                changeProfile({
                  ...profile,
                  classSlug: race?.classes.find((slug) => slug === event.target.value) ?? null,
                })
              }
              disabled={
                !loaded ||
                (matchingSession?.profile.classSlug !== undefined &&
                  matchingSession.profile.classSlug !== null)
              }
            >
              <option value="">Not selected</option>
              {race?.classes.map((slug) => (
                <option value={slug} key={slug}>
                  {slug[0]?.toUpperCase()}
                  {slug.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Outdoor XP-rate multiplier
            <small>Only set a known global rate, not a dungeon reward bonus</small>
            <select
              value={profile.xpRate ?? ""}
              disabled={!loaded}
              onChange={(event) =>
                changeProfile({
                  ...profile,
                  xpRate: event.target.value ? Number(event.target.value) : null,
                })
              }
            >
              <option value="">Unknown · do not guess</option>
              <option value="1">1×</option>
              <option value="1.5">1.5×</option>
              <option value="2">2×</option>
              <option value="3">3×</option>
            </select>
          </label>
        </div>
        <div className={styles.chapterGrid}>
          {(archiveChapters.length > 0 ? allChapters : referenceChapters).map((chapter) => (
            <ChapterCard
              key={chapter.id}
              chapter={chapter}
              profile={profile}
              session={matchingSession}
              imported={archiveChapters.find((entry) => entry.chapterId === chapter.id)}
            />
          ))}
        </div>
      </details>
      <p className={styles.footnote}>
        Speed, Chill and Group set the planning context. Current published quest order is unchanged;
        optimized mode-specific lists are a later content phase. Extracted references do not
        establish server availability or completed playtesting.
        {publicChapter && archiveChapters.length > 0 && (
          <>
            <br />
            <Link href={`${levelingChapterPath(profile, publicChapter.id)}?edition=kfc`}>
              Open KFC preview & preserved dungeon calculator →
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function ChapterCard({
  chapter,
  profile,
  session,
  position,
  imported,
}: {
  readonly chapter: ChapterReference;
  readonly profile: CharacterProfile;
  readonly session: LevelingSession | null;
  readonly position?: number;
  readonly imported?: GuideChapterSummary | undefined;
}): React.JSX.Element {
  const label = getChapterLabel(chapter, profile);
  const route = getPublicChapter(chapter, profile);
  const complete = isChapterComplete(session, chapter);
  const unknown = chapterEligibility(chapter, profile) === "unknown" || label.unresolved;
  return (
    <Link
      className={`${styles.chapterCard} ${route || imported ? styles.published : ""}`}
      href={levelingChapterPath(profile, chapter.id)}
    >
      <div className={styles.chapterTop}>
        <span>
          {position ? `Chapter ${String(position).padStart(2, "0")}` : "Reference bracket"}
        </span>
        <span className={styles.badge}>
          {imported
            ? "Full source list"
            : complete
              ? "Completed"
              : route
                ? "KFC preview"
                : "Reference only"}
        </span>
      </div>
      <strong className={styles.levelBracket}>
        {label.minimumLevel}
        <span>–</span>
        {label.maximumLevel}
      </strong>
      <h3>{label.zone}</h3>
      <p>
        {imported
          ? `${imported.stepCount} source steps${unknown ? " · conditional" : " · current quest list"}`
          : route
            ? `${route.steps.length} original steps · current quest list`
            : unknown
              ? "Character / XP condition needs review"
              : "Quest list not published yet"}
      </p>
      <div className={styles.chapterBottom}>
        <small>
          {label.minimumLevel > LEVELING_EVIDENCE.betaLevelCap
            ? "Beyond current beta cap"
            : route || imported
              ? "Readable · runtime check pending"
              : "Extracted chapter metadata"}
        </small>
        <span aria-hidden="true">→</span>
      </div>
    </Link>
  );
}
