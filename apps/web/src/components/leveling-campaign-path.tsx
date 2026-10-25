"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DUNGEON_RELEASE,
  LEVELING_EVIDENCE,
  activeCampaignActions,
  currentCampaignAction,
  emptyCampaignProgress,
  emptyPremadeProgress,
  getLevelingRace,
  forecastCampaignGuide,
  initializeCampaignGuideAnchors,
  campaignSections,
  campaignSectionFor,
  campaignSectionActions,
  updatePremadeDungeonBundle,
  type CampaignPlan,
  type CharacterProfile,
  type PremadeProgress,
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
import { LevelingOptionalDungeonBundles } from "./leveling-optional-dungeon-bundles";
import { campaignChapterPath, levelingPlanDashboardPath } from "../lib/leveling-route-plan";
import styles from "./leveling-experience.module.css";
import pathStyles from "./leveling-chapter-path.module.css";
import { LevelingRestedXpExport } from "./leveling-restedxp-export";
import { GuideDownloadAccess } from "./guide-download-access";
import { LevelingDungeonQuestPackage } from "./leveling-dungeon-quest-package";
import { ToolGroupActions } from "./tool-group-actions";
import { DungeonFinishStrategy, LevelingDungeonFinish } from "./leveling-dungeon-finish";

interface CampaignPathProps {
  readonly plan: CampaignPlan;
  readonly profile: CharacterProfile;
  readonly reviewExportEnabled?: boolean;
  readonly initialFinish?: "dungeons" | "mixed" | undefined;
}

export function LevelingCampaignPath({
  plan,
  profile,
  reviewExportEnabled = false,
  initialFinish,
}: CampaignPathProps): React.JSX.Element {
  const { session, loaded, notice, storageStatus, setDungeonPlan } = useLeveling();
  const fallback = useMemo(emptyPremadeProgress, []);
  const [preview, setPreview] = useState<PremadeProgress | null>(null);
  const [viewStrategy, setViewStrategy] = useState<"dungeons" | "mixed" | null>(
    initialFinish ?? null,
  );
  const active =
    session?.profile.faction === "alliance" &&
    session.profile.raceId === plan.race &&
    session.profile.classSlug === plan.leaderClass &&
    session.profile.party.size === 5
      ? session
      : null;
  const saved = active?.dungeonPlans[DUNGEON_RELEASE]?.premade ?? fallback;
  const currentProgress = active ? saved : (preview ?? saved);
  const progress = viewStrategy
    ? {
        ...currentProgress,
        dungeonFinish: { ...currentProgress.dungeonFinish, strategy: viewStrategy },
      }
    : currentProgress;
  function updateProgress(next: PremadeProgress): void {
    setPreview(next);
    setViewStrategy(next.dungeonFinish.strategy);
    if (active) setDungeonPlan(active.id, (current) => ({ ...current, premade: next }));
  }
  const journey = progress.campaigns[plan.release] ?? emptyCampaignProgress();
  const actions = activeCampaignActions(plan, progress);
  const current = currentCampaignAction(plan, progress);
  const guideForecast = useMemo(
    () =>
      forecastCampaignGuide(plan, progress, {
        startingLevel: active?.profile.level ?? profile.level ?? 1,
      }),
    [plan, progress, active?.profile.level, profile.level],
  );
  const chapters = campaignSections(plan, progress);
  const currentChapter = campaignSectionFor(plan, current.legId, progress)!;
  const race = getLevelingRace("alliance", plan.race)!;
  const groupSourcePath = levelingPlanDashboardPath(profile, "premade");
  useEffect(() => {
    if (!loaded || !active) return;
    if (initializeCampaignGuideAnchors(plan, progress) !== progress)
      setDungeonPlan(active.id, (saved) => ({
        ...saved,
        premade: initializeCampaignGuideAnchors(plan, saved.premade ?? fallback),
      }));
  }, [loaded, active, plan, progress, setDungeonPlan, fallback]);
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
      {plan.dungeonFinish && (
        <DungeonFinishStrategy progress={progress} onChange={updateProgress} />
      )}
      <section className={styles.continueCard} aria-labelledby="continue-heading">
        <span className="eyebrow">Your next chapter</span>
        <h2 id="continue-heading">
          {active ? `Continue ${currentChapter.title}.` : `Start in ${currentChapter.title}.`}
        </h2>
        <p>
          Your route starts at level {guideForecast.startingLevel} and 0 XP unless you update your
          progress. Follow the quests in order; XP carries forward into the next area.
        </p>
        <Link
          className={styles.button}
          href={campaignChapterPath(plan, current.legId, current.id, progress)}
        >
          {active ? "Continue guide →" : "Open guide →"}
        </Link>
        {!active && (
          <p className={styles.muted}>
            Browse freely. Save or connect a five-player character in the reader to track this
            route; existing solo progress is kept.
          </p>
        )}
        {profile.party.size > 1 && (
          <ToolGroupActions
            kind="leveling"
            label={`${race.name} premade leveling`}
            sourcePath={`${groupSourcePath}&setup=${encodeURIComponent(JSON.stringify(profile))}`}
            faction="Alliance"
            capacity={profile.party.size}
          />
        )}
        <LevelingDungeonQuestPackage
          progress={progress}
          rewardFacts={plan.rewardFacts ?? []}
          disabled={!loaded || !active}
          onChange={(next): void => {
            if (active)
              setDungeonPlan(active.id, (saved) => ({
                ...saved,
                premade: { ...(saved.premade ?? fallback), selectedExtras: next.selectedExtras },
              }));
          }}
        />
        <LevelingOptionalDungeonBundles
          progress={progress}
          disabled={!loaded || !active}
          rewardFacts={plan.rewardFacts ?? []}
          onChange={(bundle) => {
            if (active)
              setDungeonPlan(active.id, (current) => ({
                ...current,
                premade: updatePremadeDungeonBundle(current.premade ?? fallback, bundle),
              }));
          }}
        />
      </section>
      {reviewExportEnabled ? (
        <LevelingRestedXpExport plan={plan} progress={progress} />
      ) : (
        <GuideDownloadAccess plan={plan} progress={progress} />
      )}
      <section className={pathStyles.path} aria-labelledby="chapters-heading">
        <header className={pathStyles.heading}>
          <div>
            <span className="eyebrow">The whole journey · 1–60</span>
            <h2 id="chapters-heading">Your chapter path</h2>
            <p>
              Quest by area, prepare the dungeon quests along the way, and continue to the next
              stop. Targets guide your route; they are not a reason to grind when the next quests
              are already available.
            </p>
          </div>
          <span className={pathStyles.count}>
            {chapters.length} chapters ·{" "}
            {chapters.filter((entry) => entry.kind === "dungeon" && !entry.planningOnly).length}{" "}
            sourced dungeon stops
            {" + "}
            {chapters.filter((entry) => entry.planningOnly).length} planning stops
          </span>
        </header>
        <div className={pathStyles.tools}>
          <a className={pathStyles.jump} href={`#path-${currentChapter.id}`}>
            Jump to current chapter ↓
          </a>
        </div>
        <ol className={pathStyles.tree} aria-label="Your ordered leveling chapters">
          {chapters.map((leg, ordinal) => {
            const entries = campaignSectionActions(plan, leg, actions);
            const done = entries.filter(
              (action) => journey.completion[action.id] === "done",
            ).length;
            const skipped = entries.filter(
              (action) => journey.completion[action.id] === "skipped",
            ).length;
            const guide = guideForecast.sections.find((entry) => entry.chapter.id === leg.id)!;
            const next = chapters[ordinal + 1];
            return (
              <li
                key={leg.id}
                className={pathStyles.levelGroup}
                data-route-chapter={leg.id}
                data-kind={leg.kind}
              >
                <div className={pathStyles.milestone}>
                  <span>{guide.targetKind === "entry" ? "Entry" : "Target"}</span>
                  <strong>{guide.targetLevel}</strong>
                </div>
                <div className={pathStyles.branches}>
                  <article
                    id={`path-${leg.id}`}
                    className={`${pathStyles.node} ${currentChapter.id === leg.id ? pathStyles.current : ""}`}
                  >
                    <div className={pathStyles.nodeTop}>
                      <span>
                        Chapter {ordinal + 1} ·{" "}
                        {leg.planningOnly
                          ? "guaranteed bundle · planning only"
                          : leg.kind === "zone"
                            ? "zone questing"
                            : leg.kind}
                      </span>
                      <span>
                        {done}/{entries.length} done{skipped ? ` · ${skipped} skipped` : ""}
                      </span>
                    </div>
                    <Link
                      className={pathStyles.chapterLink}
                      href={campaignChapterPath(plan, leg.id, undefined, progress)}
                    >
                      <span className={pathStyles.bracket}>
                        {guide.targetKind === "entry" ? "Entry" : "Target level"}{" "}
                        {guide.targetLevel}
                      </span>
                      <h3>
                        {leg.kind === "dungeon" ? "⚑ " : ""}
                        {leg.title}
                      </h3>
                      <span aria-hidden="true">→</span>
                    </Link>
                    {leg.dungeonFinish ? (
                      <LevelingDungeonFinish
                        plan={plan}
                        progress={progress}
                        guide={guide}
                        disabled={!loaded || !active}
                        onChange={updateProgress}
                      />
                    ) : (
                      <>
                        <LevelingChapterBudget guide={guide} />
                        <LevelingXpBudget guide={guide} />
                      </>
                    )}
                    {!leg.dungeonFinish && (leg.kind === "zone" || leg.kind === "finish") && (
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
                    {(leg.planningOnly ||
                      entries.some((action) => action.kind === "unverified")) && (
                      <p className={pathStyles.warning}>
                        Four quest slots are selected for this optional dungeon. Quest names and
                        instructions are still pending; you can skip the stop or adjust its quest
                        slots.
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
                        <Link href={campaignChapterPath(plan, next.id, undefined, progress)}>
                          {next.title} →
                        </Link>
                      </div>
                    )}
                  </article>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <details className={pathStyles.method}>
        <summary>About this guide</summary>
        <p className={styles.muted}>
          Review edition {plan.release} · class {plan.leaderClass ?? "unresolved"} · source guide
          build {plan.targetBuild} · reward identity build {plan.rewardBuild ?? "unavailable"}. The
          XP curve is byte-verified unchanged on build {LEVELING_EVIDENCE.curveReverifiedBuild}.
          Actual XP and game-state checks remain necessary. The RestedXP review pack is compiled
          from this same ordered route; public release waits for its bounded in-game validation.
        </p>
        <LevelingRewardStatus plan={plan} />
        <LevelingLibraryStatus plan={plan} />
      </details>
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
