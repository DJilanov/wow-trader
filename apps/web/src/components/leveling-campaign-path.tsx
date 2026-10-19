"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DUNGEON_RELEASE,
  LEVELING_EVIDENCE,
  PREMADE_STOPS,
  activeCampaignActions,
  currentCampaignAction,
  emptyCampaignProgress,
  emptyPremadeProgress,
  getLevelingRace,
  premadeEntryLevel,
  auditCampaignSections,
  forecastCampaignXp,
  campaignSections,
  campaignSectionFor,
  campaignSectionActions,
  type CampaignPlan,
  type CharacterProfile,
} from "@wow-trader/leveling";
import { useLeveling } from "./leveling-provider";
import { LevelingBackupControls } from "./leveling-backup-controls";
import { ForeverIcon } from "./forever-icon";
import {
  LevelingRewardStatus,
  LevelingXpBudget,
  LevelingChapterBudget,
  LevelingLibraryStatus,
} from "./leveling-xp-budget";
import { LevelingCampaignOutline, LevelingDungeonPreparation } from "./leveling-campaign-outline";
import { LevelingCatchUpSuggestions } from "./leveling-catchup";
import { campaignChapterPath } from "../lib/leveling-route-plan";
import { CHAPTER_PACE_KEY, parseChapterPace } from "../lib/leveling-chapter-path";
import styles from "./leveling-experience.module.css";
import pathStyles from "./leveling-chapter-path.module.css";

interface CampaignPathProps {
  readonly plan: CampaignPlan;
  readonly profile: CharacterProfile;
}

export function LevelingCampaignPath({ plan, profile }: CampaignPathProps): React.JSX.Element {
  const { session, loaded, notice, storageStatus } = useLeveling();
  const fallback = useMemo(emptyPremadeProgress, []);
  const active =
    session?.profile.faction === "alliance" &&
    session.profile.raceId === plan.race &&
    session.profile.classSlug === plan.leaderClass &&
    session.profile.party.size === 5
      ? session
      : null;
  const progress = active?.dungeonPlans[DUNGEON_RELEASE]?.premade ?? fallback;
  const journey = progress.campaigns[plan.release] ?? emptyCampaignProgress();
  const actions = activeCampaignActions(plan, progress);
  const current = currentCampaignAction(plan, progress);
  const forecasts = useMemo(
    () => forecastCampaignXp(plan, progress, { fromActionId: current.id }),
    [plan, progress, current.id],
  );
  const audits = useMemo(() => auditCampaignSections(plan, progress), [plan, progress]);
  const chapters = campaignSections(plan, progress);
  const currentChapter = campaignSectionFor(plan, current.legId, progress)!;
  const race = getLevelingRace("alliance", plan.race)!;
  const [paceInput, setPaceInput] = useState("");
  const [paceNotice, setPaceNotice] = useState<string | null>(null);
  const paceKey = `${CHAPTER_PACE_KEY}:${active?.id ?? `alliance-${plan.race}`}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(paceKey) ?? "";
      setPaceInput(parseChapterPace(raw) === null ? "" : raw);
      setPaceNotice(null);
    } catch {
      setPaceNotice("Pace cannot be saved on this device.");
    }
  }, [paceKey]);
  function changePace(value: string): void {
    setPaceInput(value);
    if (value && parseChapterPace(value) === null) return;
    try {
      if (value) localStorage.setItem(paceKey, value);
      else localStorage.removeItem(paceKey);
      setPaceNotice(null);
    } catch {
      setPaceNotice("Pace is available for this visit only.");
    }
  }
  const pace = parseChapterPace(paceInput);
  return (
    <div
      className={styles.dashboard}
      data-route-plan="premade"
      data-route-release={plan.release}
      data-route-workflow={plan.executionRevision}
    >
      <header className={styles.dashboardHero}>
        <div>
          <span className="eyebrow">Your adventure · Alliance · Premade 5</span>
          <h1>{race.name}'s path through Azeroth.</h1>
          <p>
            Follow the zones, pick up the dungeon quests along the way, and regroup for each run.
          </p>
        </div>
        <span className={styles.heroPortrait}>
          <ForeverIcon
            iconKey={race.icon}
            snapshotChecksum="leveling-70205"
            alt={`${race.name} portrait`}
          />
        </span>
      </header>
      <div className={styles.profileBar}>
        <span>
          {plan.leaderClass ?? "Choose your class for personal steps"} · coordinated 5-player route
        </span>
        <Link
          href={active ? `/forever/leveling?stage=style&edit=${active.id}` : "/forever/leveling"}
        >
          Change setup
        </Link>
        <Link href="/forever/leveling">Characters</Link>
      </div>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {!loaded && <p role="status">Loading your saved route…</p>}
      <section className={styles.continueCard} aria-labelledby="continue-heading">
        <span className="eyebrow">The revised questing flow · 1–60</span>
        <h2 id="continue-heading">
          {active ? `Continue ${currentChapter.title}.` : "Start your dungeon-quest route."}
        </h2>
        <p>
          Quest by area, with a short readiness checklist before each dungeon. Catch-up work can be
          skipped when all five are ready; required quest chains stay in the route.
        </p>
        <Link className={styles.button} href={campaignChapterPath(plan, current.legId, current.id)}>
          {active ? "Continue playing →" : "Open current quest list →"}
        </Link>
        {!active && (
          <p className={styles.muted}>
            Browse freely. Save or connect a five-player character in the reader to track this
            route; existing solo progress is kept.
          </p>
        )}
        <LevelingRewardStatus plan={plan} />
        <LevelingLibraryStatus plan={plan} />
      </section>
      <section className={pathStyles.path} aria-labelledby="chapters-heading">
        <header className={pathStyles.heading}>
          <div>
            <span className="eyebrow">The whole journey · 1–60</span>
            <h2 id="chapters-heading">Your chapter path</h2>
            <p>
              Zone questing and dungeon runs share one path. Each zone chapter keeps its pickups and
              travel in order, without treating preparation as several levels of its own.
            </p>
          </div>
          <span className={pathStyles.count}>
            {chapters.length} chapters ·{" "}
            {chapters.filter((entry) => entry.kind === "dungeon").length} verified dungeon stops
          </span>
        </header>
        <div className={pathStyles.tools}>
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
              placeholder="Enter your observed pace"
              aria-describedby="campaign-pace-help"
            />
          </label>
          <a className={pathStyles.jump} href={`#path-${currentChapter.id}`}>
            Jump to current chapter ↓
          </a>
        </div>
        <p id="campaign-pace-help" className={pathStyles.explanation}>
          Every chapter shows its XP deficit or unresolved blocker. Independent reference budgets
          assume an empty entry bar and earlier prerequisites, not guaranteed progression. Your
          observed pace estimates the equivalent gap time, not the itinerary's travel or clear time.
        </p>
        {paceInput && pace === null && (
          <p role="alert">Enter a positive XP/hour up to 1,000,000,000.</p>
        )}
        {paceNotice && <p role="status">{paceNotice}</p>}
        <ol className={pathStyles.tree} aria-label="Your ordered leveling chapters">
          {chapters.map((leg, ordinal) => {
            const entries = campaignSectionActions(plan, leg, actions);
            const done = entries.filter(
              (action) => journey.completion[action.id] === "done",
            ).length;
            const skipped = entries.filter(
              (action) => journey.completion[action.id] === "skipped",
            ).length;
            const audit = audits.find((entry) => entry.sectionId === leg.id)!;
            const forecast = forecasts.find((entry) => entry.sectionId === leg.id)!;
            const stop = PREMADE_STOPS.find((entry) => entry.id === leg.stopId);
            const next = chapters[ordinal + 1];
            return (
              <li
                key={leg.id}
                className={pathStyles.levelGroup}
                data-route-chapter={leg.id}
                data-kind={leg.kind}
              >
                <div className={pathStyles.milestone}>
                  <span>{leg.kind === "dungeon" ? "Entry" : "Target"}</span>
                  <strong>
                    {leg.kind === "dungeon" && stop
                      ? premadeEntryLevel(stop, progress, plan.rewardFacts)
                      : audit.targetLevel}
                  </strong>
                </div>
                <div className={pathStyles.branches}>
                  <article
                    id={`path-${leg.id}`}
                    className={`${pathStyles.node} ${currentChapter.id === leg.id ? pathStyles.current : ""}`}
                  >
                    <div className={pathStyles.nodeTop}>
                      <span>
                        Chapter {ordinal + 1} · {leg.kind === "zone" ? "zone questing" : leg.kind}
                      </span>
                      <span>
                        {done}/{entries.length} done{skipped ? ` · ${skipped} skipped` : ""}
                      </span>
                    </div>
                    <Link
                      className={pathStyles.chapterLink}
                      href={campaignChapterPath(plan, leg.id)}
                    >
                      <span className={pathStyles.bracket}>
                        {leg.kind === "dungeon" ? "Entry " : "Goal "}
                        {leg.kind === "dungeon" && stop
                          ? premadeEntryLevel(stop, progress, plan.rewardFacts)
                          : audit.targetLevel}
                      </span>
                      <h3>
                        {leg.kind === "dungeon" ? "⚑ " : ""}
                        {leg.title}
                      </h3>
                      <span aria-hidden="true">→</span>
                    </Link>
                    <LevelingChapterBudget audit={audit} forecast={forecast} pace={pace} />
                    <LevelingXpBudget forecast={forecast} />
                    {(leg.kind === "zone" || leg.kind === "finish") && (
                      <LevelingCampaignOutline
                        plan={plan}
                        chapter={leg}
                        actions={entries}
                        progress={progress}
                      />
                    )}
                    <LevelingDungeonPreparation plan={plan} chapter={leg} progress={progress} />
                    {leg.legIds
                      .filter(
                        (id) => plan.legs.find((phase) => phase.id === id)?.kind === "xp-bridge",
                      )
                      .map((id) => (
                        <LevelingCatchUpSuggestions
                          key={id}
                          plan={plan}
                          legId={id}
                          progress={progress}
                        />
                      ))}
                    {stop && (
                      <p className={pathStyles.reward}>
                        Requested level {stop.level} · current entry policy requires{" "}
                        {premadeEntryLevel(stop, progress, plan.rewardFacts)}. Every player's quest
                        and actual XP readiness still apply.
                      </p>
                    )}
                    {entries.some((action) => action.kind === "unverified") && (
                      <p className={pathStyles.warning}>
                        Quest bundle unverified. This chapter cannot certify completion or award
                        assumed XP.
                      </p>
                    )}
                    {leg.unresolvedQuestIds.length > 0 && (
                      <p className={pathStyles.warning}>
                        Prerequisite source detail still needed: {leg.unresolvedQuestIds.join(", ")}
                        .
                      </p>
                    )}
                    {next && (
                      <div className={pathStyles.transitions}>
                        <span>Then</span>
                        <Link href={campaignChapterPath(plan, next.id)}>{next.title} →</Link>
                      </div>
                    )}
                  </article>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <p className={styles.muted}>
        Review edition {plan.release} · class {plan.leaderClass ?? "unresolved"} · source guide
        build {plan.targetBuild} · reward identity build {plan.rewardBuild ?? "unavailable"}. The XP
        curve is byte-verified unchanged on build {LEVELING_EVIDENCE.curveReverifiedBuild}. Actual
        XP and game-state checks remain necessary. The RestedXP review pack is compiled from this
        same ordered route; public release waits for its bounded in-game validation.
      </p>
      <LevelingBackupControls />
      {storageStatus === "memory" && (
        <p role="status">Storage is unavailable. Export your backup before leaving.</p>
      )}
      {profile.party.size < 5 && (
        <p className={styles.muted}>
          Your saved solo or small-group setup is unchanged. Browsing this edition does not mark its
          quests completed.
        </p>
      )}
    </div>
  );
}
