"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CHAPTER_REFERENCES,
  LEVELING_EVIDENCE,
  getChapterLabel,
  getLevelingRace,
  getPartyGuidance,
  selectChapterSequence,
  type CharacterProfile,
  type GuideChapterSummary,
  DUNGEON_RELEASE,
  DUNGEON_XP_CALIBRATION,
  THANES_REPLACEMENT,
  DUNGEON_VISITS,
} from "@wow-trader/leveling";
import { ForeverIcon } from "./forever-icon";
import { useLeveling } from "./leveling-provider";
import {
  WESTFALL_CHAPTER_ID,
  getPublicChapter,
  levelingChapterPath,
  levelingDashboardPath,
  levelingDungeonPath,
  profileSummary,
  readingPositionPath,
} from "../lib/leveling-experience";
import styles from "./leveling-experience.module.css";
import { LevelingBackupControls } from "./leveling-backup-controls";
import { LevelingDungeonPlans } from "./leveling-dungeon-plans";
import { LevelingChapterPath } from "./leveling-chapter-path";
import type { ChapterActivity } from "../lib/leveling-chapter-path";

interface LevelingDashboardProps {
  readonly defaultProfile: CharacterProfile;
  readonly archiveChapters?: readonly GuideChapterSummary[];
  readonly archiveBuild: number | null;
  readonly activities?: readonly ChapterActivity[];
}

export function LevelingDashboard({
  defaultProfile,
  archiveChapters = [],
  archiveBuild,
  activities = [],
}: LevelingDashboardProps): React.JSX.Element {
  const { session, loaded, notice, storageStatus, saveCharacter } = useLeveling();
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
  const party = getPartyGuidance(profile);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

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
  const dungeonSourceAvailable =
    archiveBuild === LEVELING_EVIDENCE.clientBuild &&
    archiveBuild === DUNGEON_XP_CALIBRATION.targetBuild &&
    archiveChapters.some((entry) => entry.chapterId === THANES_REPLACEMENT.continuationId);
  const activeReplacement = dungeonSourceAvailable
    ? matchingSession?.dungeonPlans[DUNGEON_RELEASE]?.replacements[THANES_REPLACEMENT.chapterId]
    : undefined;
  const dungeonPlan = matchingSession?.dungeonPlans[DUNGEON_RELEASE];
  const activeTrip = dungeonPlan?.activeTripId
    ? dungeonPlan.trips[dungeonPlan.activeTripId]
    : undefined;
  const activeVisit = activeTrip
    ? DUNGEON_VISITS.find((visit) => visit.id === activeTrip.visitId)
    : undefined;
  const current =
    activeTrip && activeVisit
      ? CHAPTER_REFERENCES.find((chapter) => chapter.id === activeTrip.chapterId)
      : activeReplacement?.active
        ? CHAPTER_REFERENCES.find((chapter) => chapter.id === THANES_REPLACEMENT.chapterId)
        : matchingSession?.lastChapterId
          ? CHAPTER_REFERENCES.find(
              (chapter) =>
                chapter.id === matchingSession.lastChapterId &&
                (getPublicChapter(chapter, profile) ||
                  archiveChapters.some((entry) => entry.chapterId === chapter.id)),
            )
          : archiveChapters.length > 0
            ? selection.chapters.find(
                (chapter) =>
                  archiveChapters.some((entry) => entry.chapterId === chapter.id) &&
                  getChapterLabel(chapter, profile).maximumLevel > (profile.level ?? 1),
              )
            : publicChapter;

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
            {activeTrip && activeVisit
              ? `Continue ${activeVisit.name}.`
              : activeReplacement?.active
                ? "Continue Hall of Thanes."
                : current
                  ? archiveChapters.length > 0
                    ? `Continue in ${getChapterLabel(current, profile).zone}.`
                    : "Read the Westfall preview."
                  : "Your starting brackets are mapped."}
          </h2>
          <p>
            {activeTrip && activeVisit
              ? "Your dungeon trip and outdoor return bookmark are saved separately. Finish the quest stages, record actual XP and return to the retained outdoor route."
              : activeReplacement?.active
                ? "Your dungeon instructions and outdoor bookmark are saved separately. Finish the trip, then review the Darkshore return checkpoint."
                : current
                  ? archiveChapters.length > 0
                    ? "Read the full authorized source list, filtered for your character. Original order stays intact; game-state and transition checks still need review."
                    : "The original KFC 13–15 companion keeps its current quest order. It is a preview, not a complete race-specific route."
                  : "The extracted brackets below are reference metadata. An original public quest list for this faction is not ready yet."}
          </p>
          {current ? (
            <Link
              className={styles.button}
              href={
                activeTrip && activeVisit
                  ? `${levelingDungeonPath(profile, activeVisit.id, activeTrip.chapterId, Boolean(activeTrip.alternative || activeTrip.itinerary))}#trip-${activeTrip.stepId}`
                  : activeReplacement?.active
                    ? `${levelingChapterPath(profile, THANES_REPLACEMENT.chapterId)}#dungeon-${activeReplacement.stepId ?? "prepare"}`
                    : matchingSession?.lastReader
                      ? readingPositionPath(matchingSession)
                      : levelingChapterPath(profile, current.id)
              }
            >
              {activeTrip || activeReplacement?.active || matchingSession?.lastReader
                ? "Continue playing →"
                : "Open current quest list →"}
            </Link>
          ) : (
            <Link className={styles.button} href="/forever/encyclopedia/quests">
              Browse the quest encyclopedia →
            </Link>
          )}
          <small>
            {matchingSession && (
              <>
                {storageStatus === "saved"
                  ? "Saved on this device · not account-synced"
                  : storageStatus === "memory"
                    ? "Progress is not saved · export a backup"
                    : "Saving local progress…"}
                <br />
              </>
            )}
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
      <details className={styles.guideDetails} open={!profile.classSlug || profile.xpRate === null}>
        <summary>Character settings · class and known XP rate</summary>
        <div className={styles.detailsRow}>
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
              disabled={!loaded || Boolean(matchingSession?.profile.classSlug)}
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
              {[1, 1.5, 2, 3].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}×
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
      <LevelingChapterPath
        profile={profile}
        session={matchingSession}
        archiveChapters={archiveChapters}
        archiveBuild={archiveBuild}
        activities={activities}
        currentChapterId={current?.id ?? null}
        dungeonSourceAvailable={dungeonSourceAvailable}
      />
      <details className={styles.guideDetails}>
        <summary>Dungeon reference library · all quests and preparation</summary>
        <LevelingDungeonPlans profile={profile} sessionId={matchingSession?.id ?? null} />
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
