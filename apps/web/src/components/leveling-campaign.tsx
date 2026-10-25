"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CAMPAIGN_RACES,
  DUNGEON_RELEASE,
  PREMADE_STOPS,
  activeCampaignActions,
  campaignActionReasons,
  currentCampaignAction,
  createCharacterProfile,
  emptyCampaignProgress,
  emptyPremadeProgress,
  getLevelingRace,
  updateCampaignAction,
  skipCampaignXpBlock,
  premadeEntryLevel,
  forecastCampaignGuide,
  initializeCampaignGuideAnchors,
  campaignSections,
  campaignSectionFor,
  campaignSectionActions,
  campaignQuestTargets,
  campaignQuestAlreadyReported,
  campaignOptionalXpReady,
  nextCampaignAction,
  campaignRequiredDungeonQuest,
  getDungeonBundle,
  dungeonBundleKey,
  updatePremadeDungeonBundle,
  type CampaignAction,
  type CampaignPlan,
  type PremadeProgress,
} from "@wow-trader/leveling";
import { useLeveling } from "./leveling-provider";
import { LevelingReaderWorkspace } from "./leveling-reader-workspace";
import { LevelingQuestCard } from "./leveling-quest-card";
import { LevelingZoneMap } from "./leveling-zone-map";
import { LevelingEntityLinks } from "./leveling-entity-links";
import type { LevelingChapterMaps } from "../lib/leveling-map-data";
import { levelingChapterPath } from "../lib/leveling-experience";
import {
  campaignChapterAction,
  campaignChapterPath,
  campaignLegacyStarterPath,
  campaignLegacyXpPath,
  levelingPlanDashboardPath,
} from "../lib/leveling-route-plan";
import styles from "./leveling-campaign.module.css";
import readerStyles from "./leveling-experience.module.css";
import { LevelingXpBudget, LevelingChapterBudget } from "./leveling-xp-budget";
import { LevelingGuideProgress } from "./leveling-guide-progress";
import { LevelingCampaignHandoff } from "./leveling-campaign-handoff";
import guideStyles from "./leveling-guide.module.css";
import { LevelingDungeonPreparation } from "./leveling-campaign-outline";
import { LevelingCatchUpSuggestions } from "./leveling-catchup";
import { LevelingCombatTargets } from "./leveling-combat-targets";
import { LevelingDungeonBundle } from "./leveling-dungeon-bundle";
import { LevelingOptionalDungeonBundles } from "./leveling-optional-dungeon-bundles";
import { LevelingPartyIdentity } from "./leveling-party-identity";
import { LevelingStepProjection, LevelingCombatPlanningSettings } from "./leveling-step-projection";
import { DungeonFinishStrategy, LevelingDungeonFinish } from "./leveling-dungeon-finish";
import { LevelingBackupControls } from "./leveling-backup-controls";
import finishStyles from "./leveling-dungeon-finish.module.css";

interface CampaignProps {
  readonly plan: CampaignPlan;
  readonly maps: LevelingChapterMaps;
  readonly legId?: string;
  readonly initialFinish?: "dungeons" | "mixed" | undefined;
}

export function LevelingCampaign({
  plan,
  maps,
  legId,
  initialFinish,
}: CampaignProps): React.JSX.Element {
  const router = useRouter();
  const { session, loaded, notice, saveCharacter, setDungeonPlan, storageStatus } = useLeveling();
  const fallback = useMemo(emptyPremadeProgress, []);
  const [previewProgress, setPreviewProgress] = useState<PremadeProgress | null>(null);
  const [viewStrategy, setViewStrategy] = useState<"dungeons" | "mixed" | null>(
    initialFinish ?? null,
  );
  const [previewId, setPreviewId] = useState<string | null>(null);
  const active =
    session?.profile.faction === "alliance" &&
    session.profile.raceId === plan.race &&
    session.profile.party.size === 5 &&
    session.profile.classSlug === plan.leaderClass
      ? session
      : null;
  const savedProgress = active?.dungeonPlans[DUNGEON_RELEASE]?.premade ?? fallback;
  const currentProgress = active ? savedProgress : (previewProgress ?? savedProgress);
  const progress = viewStrategy
    ? {
        ...currentProgress,
        dungeonFinish: { ...currentProgress.dungeonFinish, strategy: viewStrategy },
      }
    : currentProgress;
  const journey = progress.campaigns[plan.release] ?? emptyCampaignProgress();
  const actions = activeCampaignActions(plan, progress);
  const savedAction =
    actions.find((entry) => entry.id === previewId) ??
    (active ? currentCampaignAction(plan, progress) : actions[0]!);
  const action = legId
    ? (campaignChapterAction(plan, progress, legId, previewId) ?? savedAction)
    : savedAction;
  const leg = plan.legs.find((entry) => entry.id === action.legId)!;
  const chapters = campaignSections(plan, progress);
  const chapter = campaignSectionFor(plan, leg.id, progress)!;
  const currentArea = chapter.areas.find((area) => area.legIds.includes(leg.id))!;
  const guideForecast = useMemo(
    () =>
      forecastCampaignGuide(plan, progress, {
        startingLevel: active?.profile.level ?? 1,
      }),
    [plan, progress, active?.profile.level],
  );
  const guide = guideForecast.sections.find((entry) => entry.chapter.id === chapter.id)!;
  const nextChapter = chapters[chapters.findIndex((entry) => entry.id === chapter.id) + 1];
  const index = actions.findIndex((entry) => entry.id === action.id);
  const legActions = campaignSectionActions(plan, chapter, actions);
  const completed = actions.filter((entry) => journey.completion[entry.id] === "done").length;
  const selectedBatchActions = actions.filter((entry) => entry.catchUpBatchId);
  const effectivePoints = maps.points.map((point) => {
    const selected = selectedBatchActions.find(
      (entry) => entry.id.slice(entry.legId.length + 1) === point.stepId,
    );
    return selected ? { ...point, stepId: selected.id } : point;
  });
  const currentPoints = effectivePoints.filter((point) => point.stepId === action.id);
  const legIds = new Set(legActions.map((entry) => entry.id));
  const points = currentPoints.length
    ? currentPoints
    : effectivePoints.filter((point) => legIds.has(point.stepId));
  const blocked = campaignActionReasons(action, progress, plan.rewardFacts);
  const enabled = loaded && active !== null;
  const [message, setMessage] = useState<string | null>(null);
  const [showFullPath, setShowFullPath] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const progressButton = useRef<HTMLButtonElement>(null);
  const batchRevision = JSON.stringify(progress.selectedBatches ?? {});
  const bundleRevision = JSON.stringify(progress.guaranteedBundles ?? {});
  const race = getLevelingRace("alliance", plan.race)!;
  useEffect(() => {
    if (!loaded || !active) return;
    const normalized = initializeCampaignGuideAnchors(plan, progress);
    if (normalized !== progress)
      setDungeonPlan(active.id, (current) => ({
        ...current,
        premade: initializeCampaignGuideAnchors(plan, current.premade ?? fallback),
      }));
  }, [loaded, active, plan, progress, fallback, setDungeonPlan]);
  useEffect(() => {
    if (!loaded) return;
    function restore(): void {
      const routeId = window.location.pathname
        .split("/")
        .at(-1)
        ?.replace(/^premade-/, "");
      if (legId && campaignSectionFor(plan, routeId ?? "", progress)?.id !== chapter.id) return;
      const rawId = window.location.hash.replace(/^#campaign-/, "");
      const id = plan.bookmarkAliases?.[rawId] ?? rawId;
      const legacyPath =
        legId &&
        (campaignLegacyStarterPath(plan, progress, routeId ?? "", id) ??
          campaignLegacyXpPath(plan, progress, routeId ?? "", rawId));
      if (legacyPath) {
        router.replace(legacyPath, { scroll: false });
        return;
      }
      const target =
        actions.find(
          (entry) => entry.id === id && (!legId || chapter.actionIds.includes(entry.id)),
        ) ?? (legId ? campaignChapterAction(plan, progress, legId) : null);
      if (!target) return;
      // Native fragment navigation creates a null history entry, which Next's Back handler ignores.
      if (legId && window.history.state === null)
        router.replace(campaignChapterPath(plan, target.legId, target.id, progress), {
          scroll: false,
        });
      setPreviewId(target.id);
      if (active)
        setDungeonPlan(active.id, (current) => {
          const saved = current.premade ?? fallback;
          const existing = saved.campaigns[plan.release] ?? emptyCampaignProgress();
          return {
            ...current,
            premade: {
              ...saved,
              campaigns: {
                ...saved.campaigns,
                [plan.release]: { ...existing, selectedActionId: target.id },
              },
            },
          };
        });
    }
    function restoreHistory(event: PopStateEvent): void {
      if (legId && event.state === null) {
        const routeId = window.location.pathname
          .split("/")
          .at(-1)
          ?.replace(/^premade-/, "");
        const targetLeg = window.location.pathname.startsWith(
          `/forever/leveling/routes/alliance-${plan.race}/chapters/`,
        )
          ? campaignSectionFor(plan, routeId ?? "", progress)
          : null;
        if (targetLeg) {
          const id = window.location.hash.replace(/^#campaign-/, "");
          const target = actions.find(
            (entry) => entry.id === id && targetLeg.actionIds.includes(entry.id),
          );
          router.replace(campaignChapterPath(plan, targetLeg.id, target?.id, progress), {
            scroll: false,
          });
          return;
        }
      }
      restore();
    }
    restore();
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restoreHistory);
    return () => {
      window.removeEventListener("hashchange", restore);
      window.removeEventListener("popstate", restoreHistory);
    };
  }, [loaded, legId, plan.release, active?.id, progress.raidGoals, batchRevision, bundleRevision]);
  function savePlan(): void {
    const matching =
      session?.profile.faction === "alliance" && session.profile.raceId === plan.race
        ? session
        : null;
    const id = matching?.id ?? `character-${globalThis.crypto.randomUUID()}`;
    if (
      !saveCharacter(
        {
          ...(matching?.profile ?? createCharacterProfile("alliance", plan.race)),
          classSlug: plan.leaderClass,
          party: { size: 5, readiness: "together", tank: "unknown", healer: "unknown" },
        },
        id,
      )
    )
      return;
    setDungeonPlan(id, (current) => ({
      ...current,
      premade: {
        ...(current.premade ?? fallback),
        dungeonFinish: progress.dungeonFinish,
        campaigns: {
          ...(current.premade ?? fallback).campaigns,
          [plan.release]: {
            ...((current.premade ?? fallback).campaigns[plan.release] ?? emptyCampaignProgress()),
            selectedActionId: action.id,
          },
        },
      },
    }));
  }
  function update(next: PremadeProgress): void {
    setPreviewProgress(next);
    setViewStrategy(next.dungeonFinish.strategy);
    if (active) setDungeonPlan(active.id, (current) => ({ ...current, premade: next }));
  }
  function select(id: string): void {
    const target = actions.find((entry) => entry.id === id);
    if (!target) return;
    setPreviewId(id);
    if (active)
      update({
        ...progress,
        campaigns: { ...progress.campaigns, [plan.release]: { ...journey, selectedActionId: id } },
      });
    setConfirmed(null);
    setMessage(null);
    if (legId && campaignSectionFor(plan, target.legId, progress)?.id !== chapter.id)
      router.push(campaignChapterPath(plan, target.legId, id, progress), { scroll: false });
    else globalThis.history.replaceState(globalThis.history.state, "", `#campaign-${id}`);
  }
  function advance(done: boolean): void {
    if (!done) {
      select(nextCampaignAction(plan, progress, action.id).id);
      return;
    }
    try {
      const updated = updateCampaignAction(plan, progress, action.id, done);
      update(updated);
      const selectedId = updated.campaigns[plan.release]?.selectedActionId;
      if (selectedId) navigateAfterUpdate(selectedId);
      setConfirmed(null);
      setMessage(done ? "Step completed. Your place is saved." : null);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Campaign progress could not be saved.");
    }
  }
  function skipBlock(): void {
    try {
      const updated = skipCampaignXpBlock(plan, progress, leg.id);
      update(updated);
      const id = updated.campaigns[plan.release]?.selectedActionId;
      if (id) navigateAfterUpdate(id);
      setConfirmed(null);
      setMessage(
        "Skipped XP-only work. No quests were marked rewarded and required preparation remains in the route.",
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "This block could not be skipped.");
    }
  }
  function navigateAfterUpdate(id: string): void {
    setPreviewId(id);
    const target = actions.find((entry) => entry.id === id);
    if (legId && target && campaignSectionFor(plan, target.legId, progress)?.id !== chapter.id)
      router.push(campaignChapterPath(plan, target.legId, id, progress), { scroll: false });
    else globalThis.history.replaceState(globalThis.history.state, "", `#campaign-${id}`);
  }
  function undo(): void {
    const completion = { ...journey.completion };
    delete completion[action.id];
    update({
      ...progress,
      campaigns: { ...progress.campaigns, [plan.release]: { ...journey, completion } },
    });
    setMessage(
      "Task check undone. This does not undo a real quest reward; correct reported quest state separately if needed.",
    );
  }
  const targets = campaignQuestTargets(action, progress);
  const needsConfirmation =
    !action.leaderOnly && action.questChanges.length > 0 && targets.length > 0;
  const doneDisabled =
    !enabled ||
    blocked.length > 0 ||
    (action.questChanges.length > 0 && targets.length === 0) ||
    (needsConfirmation && confirmed !== action.id);
  function renderAction(entry: CampaignAction, ordinal: number): React.JSX.Element {
    const selected = entry.id === action.id,
      done = journey.completion[entry.id] === "done";
    const next =
      nextCampaignAction(plan, progress, action.id).id === entry.id && entry.id !== action.id;
    const entryTargets = campaignQuestTargets(entry, progress);
    const targetNames = entryTargets.map((index) => `Player ${index + 1}`).join(", ");
    const entryBundle = entry.bundleId
      ? getDungeonBundle(entry.bundleId, "alliance", progress.guaranteedBundles)
      : null;
    return (
      <LevelingQuestCard
        key={entry.id}
        id={`campaign-${entry.id}`}
        title={entry.title}
        selectionLabel="Show campaign step"
        selected={selected}
        done={done}
        next={next}
        disabled={!loaded}
        onSelect={() => select(entry.id)}
        leading={<span className={styles.ordinal}>{ordinal + 1}</span>}
        meta={
          <>
            <span>
              {entry.kind === "checkpoint"
                ? entry.targetStopId
                  ? "Before entering the dungeon"
                  : "Finish"
                : entry.kind === "xp-check"
                  ? "Level requirement"
                  : entry.kind === "unverified"
                    ? "Dungeon details still pending"
                    : entry.leaderOnly
                      ? "Your character"
                      : "Party questing"}
            </span>
            {journey.completion[entry.id] === "skipped" && <span>Skipped XP work</span>}
            {entry.libraryQuestId && (
              <span>
                {entry.libraryBackbone
                  ? "Questing"
                  : entry.libraryRequired
                    ? "Required quest chain"
                    : entry.libraryObjective === "named-trophy"
                      ? "Check loot for every player"
                      : entry.libraryObjective === "delivery"
                        ? "Quest return"
                        : entry.libraryObjective === "interaction"
                          ? "Nearby objective"
                          : "Optional XP quest"}
              </span>
            )}
            {entry.questChanges.length > 0 && entryTargets.length === 0 && (
              <span>
                {campaignQuestAlreadyReported(entry, progress)
                  ? "Already reported in game · no repeat needed"
                  : "Accept the quest before reporting this step"}
              </span>
            )}
            {campaignOptionalXpReady(plan, progress, entry) && <span>Extra XP not needed</span>}
            {campaignRequiredDungeonQuest(entry) && leg.kind === "xp-bridge" && (
              <span>Required dungeon quest · keep even when ahead on XP</span>
            )}
          </>
        }
        progress={
          done ? (
            <div className={readerStyles.stepStatus}>
              <label className={readerStyles.completionControl}>
                <input
                  type="checkbox"
                  aria-label={`Completed: ${entry.title}`}
                  checked={done}
                  disabled={!done}
                  onChange={() => {
                    if (done) {
                      select(entry.id);
                      const completion = { ...journey.completion };
                      delete completion[entry.id];
                      update({
                        ...progress,
                        campaigns: {
                          ...progress.campaigns,
                          [plan.release]: { ...journey, selectedActionId: entry.id, completion },
                        },
                      });
                    }
                  }}
                />
                <span>Completed</span>
              </label>
            </div>
          ) : null
        }
      >
        <div data-campaign-action={entry.id} className={styles.instructions}>
          {entry.instructions.map((line, lineIndex) => (
            <p key={lineIndex}>{line}</p>
          ))}
          {selected && entry.questChanges.length > 0 && (
            <LevelingStepProjection guide={guide} actionId={entry.id} />
          )}
          {plan.combat?.activities
            .filter((activity) => activity.actionId === entry.id)
            .map((activity) => (
              <LevelingCombatTargets
                key={activity.id}
                objectives={activity.objectives}
                npcs={plan.combat!.npcs}
                referenceLevel={plan.legs.find((phase) => phase.id === entry.legId)?.from ?? 1}
                partySize={entry.leaderOnly ? 1 : 5}
                environment={activity.environment}
              />
            ))}
          {entryBundle && (
            <LevelingDungeonBundle
              key={dungeonBundleKey(entryBundle.dungeonId, entryBundle.faction)}
              bundle={entryBundle}
              dungeonName={leg.title}
              disabled={!enabled}
              rewardFacts={plan.rewardFacts ?? []}
              onChange={(next) => update(updatePremadeDungeonBundle(progress, next))}
            />
          )}
          <div className={styles.links}>
            {[...new Set(entry.questChanges.map((change) => change.questId))].map((id) => (
              <LevelingEntityLinks key={id} kind="quest" id={id} />
            ))}
            {entry.source && (
              <Link
                href={`${levelingChapterPath(createCharacterProfile("alliance", plan.race), entry.source.chapterId)}?edition=source#guide-${entry.source.stepId}`}
              >
                Original source step ↗
              </Link>
            )}
          </div>
          {selected &&
            entry.questChanges.length > 0 &&
            entryTargets.length > 0 &&
            !entry.leaderOnly && (
              <div className={styles.report}>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed === entry.id}
                    onChange={(event) => setConfirmed(event.target.checked ? entry.id : null)}
                    disabled={!enabled}
                  />
                  {entryTargets.length === 5
                    ? "All five completed this in game"
                    : `${targetNames} completed this in game`}
                </label>
                <small>
                  Done reports completion for these players. Already reported quest stages are kept.
                </small>
              </div>
            )}
          {selected && blocked.length > 0 && entry.kind === "quests" && (
            <div className={styles.report}>
              <p role="status">{blocked[0]}</p>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => progressButton.current?.click()}
              >
                Update level / XP
              </button>
            </div>
          )}
          {selected && ["checkpoint", "xp-check"].includes(entry.kind) && (
            <div className={styles.report}>
              <p>
                {blocked.length
                  ? blocked.join(" ")
                  : entry.kind === "xp-check"
                    ? "This level requirement is met. Continue to the next task."
                    : "The party meets the recorded entry requirements."}
              </p>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => progressButton.current?.click()}
              >
                Update level / XP
              </button>
            </div>
          )}
        </div>
      </LevelingQuestCard>
    );
  }
  if (chapter.dungeonFinish) {
    const checkpoint = legActions.find(
      (entry) => entry.kind === "checkpoint" && entry.targetLevel === 60,
    );
    const checkpointDone = checkpoint && journey.completion[checkpoint.id] === "done";
    return (
      <section className={finishStyles.page} data-dungeon-circuit-page="true">
        <nav className={finishStyles.pageNav} aria-label="Dungeon circuit navigation">
          <Link
            href={levelingPlanDashboardPath(
              active?.profile ?? {
                ...createCharacterProfile("alliance", plan.race),
                classSlug: plan.leaderClass,
              },
              "premade",
            )}
          >
            ← Chapters
          </Link>
          <Link href="/forever/leveling">Characters & setup</Link>
        </nav>
        <header className={finishStyles.pageHeading}>
          <span className="eyebrow">{race.name} · Premade 5 · Target level 60</span>
          <h1>55–60 & pre-raid gear</h1>
          <DungeonFinishStrategy
            progress={progress}
            onChange={(next): void => {
              update(next);
              router.replace(campaignChapterPath(plan, "level-60-finish", undefined, next), {
                scroll: false,
              });
            }}
          />
          {!active && loaded ? (
            <button className={guideStyles.button} type="button" onClick={savePlan}>
              Start guide
            </button>
          ) : (
            <LevelingGuideProgress
              plan={plan}
              progress={progress}
              actionId="level-60-finish-dungeon-circuit"
              personal={false}
              disabled={!enabled}
              onChange={update}
              buttonRef={progressButton}
            />
          )}
          <details className={finishStyles.partySetup}>
            <summary>Party setup</summary>
            <LevelingPartyIdentity
              progress={progress}
              disabled={!enabled}
              leader={{ raceId: plan.race, classSlug: plan.leaderClass }}
              onChange={update}
            />
          </details>
        </header>
        {(notice || message) && <p role="status">{notice ?? message}</p>}
        <LevelingDungeonFinish
          plan={plan}
          progress={progress}
          guide={guide}
          disabled={!enabled}
          onChange={update}
        />
        <details className={finishStyles.partySetup}>
          <summary>Access, quest rewards & repeat clears</summary>
          <ul>
            {legActions
              .filter((entry) => entry.dungeonFinishOnly)
              .flatMap((entry) => entry.instructions)
              .map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
          </ul>
        </details>
        <footer className={finishStyles.pageFooter}>
          {checkpoint && (
            <button
              className={guideStyles.button}
              type="button"
              disabled={
                !enabled ||
                (!checkpointDone &&
                  campaignActionReasons(checkpoint, progress, plan.rewardFacts).length > 0)
              }
              onClick={() => {
                try {
                  if (checkpointDone) {
                    const completion = { ...journey.completion };
                    delete completion[checkpoint.id];
                    update({
                      ...progress,
                      campaigns: {
                        ...progress.campaigns,
                        [plan.release]: { ...journey, completion },
                      },
                    });
                    setMessage("Finish check undone. Actual XP and quest states are unchanged.");
                  } else {
                    let next = updateCampaignAction(
                      plan,
                      progress,
                      "level-60-finish-dungeon-circuit",
                      true,
                    );
                    next = updateCampaignAction(plan, next, checkpoint.id, true);
                    update(next);
                    setMessage(
                      "Level 60 checkpoint saved. Earlier unfinished tasks and personal gear targets remain unchanged.",
                    );
                  }
                } catch (cause: unknown) {
                  setMessage(
                    cause instanceof Error
                      ? cause.message
                      : "The finish checkpoint could not be saved.",
                  );
                }
              }}
            >
              {checkpointDone ? "Undo finish checkpoint" : "Confirm all five at level 60"}
            </button>
          )}
          <span className={finishStyles.muted}>
            {storageStatus === "saved"
              ? "Saved on this device"
              : storageStatus === "memory"
                ? "Memory only; export a backup"
                : "Progress stays on this device"}
          </span>
          <LevelingBackupControls />
        </footer>
      </section>
    );
  }
  return (
    <LevelingReaderWorkspace
      scope={`${plan.release}-${legId ?? "full"}`}
      ready={loaded}
      title={legId ? chapter.title : "Premade 5 · full leveling campaign"}
      minimumLevel={legId ? guide.targetLevel : 1}
      maximumLevel={legId ? guide.targetLevel : 60}
      levelLabel={
        !legId
          ? "Route target 60"
          : `${guide.targetKind === "entry" ? "Entry" : "Target level"} ${guide.targetLevel}`
      }
      profile={`${race.name} · ${plan.leaderClass ?? "choose a class"} · ${guide.audience === "personal" ? "Personal starting route" : "Five-player route"}`}
      dashboardHref={
        legId
          ? `/forever/leveling/routes/alliance-${plan.race}?plan=premade${plan.leaderClass ? `&class=${plan.leaderClass}` : ""}`
          : "/forever/leveling"
      }
      completed={
        legId
          ? legActions.filter((entry) => journey.completion[entry.id] === "done").length
          : completed
      }
      total={legId ? legActions.length : actions.length}
      progressLabel={
        legId
          ? `${legActions.filter((entry) => journey.completion[entry.id] === "done").length}/${legActions.length} chapter steps done`
          : `${completed}/${actions.length} campaign steps done`
      }
      notice={notice ?? message}
      currentStepLabel={action.title}
      currentStepAnchor={`campaign-${action.id}`}
      nextDisabled={!loaded || index === actions.length - 1}
      doneDisabled={doneDisabled}
      previousDisabled={!loaded || index === 0}
      undoDisabled={!enabled || !journey.completion[action.id]}
      onPrevious={() => select(actions[index - 1]!.id)}
      onNext={() => advance(false)}
      onDone={() => advance(true)}
      onUndo={undo}
      onNavigate={(hash) => {
        const id = hash.replace(/^#campaign-/, "");
        if (actions.some((entry) => entry.id === id)) select(id);
      }}
      settingsButtonRef={settingsButton}
      settings={
        <>
          <h3>Starting race and class</h3>
          <div className={styles.races}>
            {CAMPAIGN_RACES.map((id) => (
              <Link
                key={id}
                href={
                  legId
                    ? `/forever/leveling/routes/alliance-${id}?plan=premade`
                    : `/forever/leveling/premade?race=${id}`
                }
                aria-current={plan.race === id ? "page" : undefined}
              >
                {getLevelingRace("alliance", id)?.name}
              </Link>
            ))}
          </div>
          <p>
            Mixed-race parties use separate starting branches, then meet at 16. Existing chapters
            and the earlier dungeon reference are not reset.
          </p>
          <form
            action={
              legId ? `/forever/leveling/routes/alliance-${plan.race}` : "/forever/leveling/premade"
            }
            method="get"
          >
            {legId ? (
              <input type="hidden" name="plan" value="premade" />
            ) : (
              <input type="hidden" name="race" value={plan.race} />
            )}
            <label>
              Player 1 class
              <select
                aria-label="Player 1 class"
                name="class"
                defaultValue={plan.leaderClass ?? ""}
                onChange={(event) => {
                  const slug =
                    race.classes.find((value) => value === event.currentTarget.value) ?? null;
                  const nextProfile = {
                    ...(active?.profile ?? createCharacterProfile("alliance", plan.race)),
                    classSlug: slug,
                  };
                  if (active && !saveCharacter(nextProfile, active.id)) return;
                  if (legId) router.push(levelingPlanDashboardPath(nextProfile, "premade"));
                  else
                    router.push(
                      `/forever/leveling/premade?race=${plan.race}${slug ? `&class=${slug}` : ""}`,
                    );
                }}
              >
                <option value="">Generic branch · personal class steps not resolved</option>
                {race.classes.map((slug) => (
                  <option key={slug} value={slug}>
                    {slug}
                  </option>
                ))}
              </select>
            </label>
          </form>
          <label>
            Dungeon entry policy
            <select
              value={progress.difficultyPolicy}
              disabled={!enabled}
              onChange={(event) =>
                update({
                  ...progress,
                  difficultyPolicy:
                    event.target.value === "experienced-premade"
                      ? "experienced-premade"
                      : "at-level",
                })
              }
            >
              <option value="at-level">Conservative · At level</option>
              <option value="experienced-premade">Experienced premade · requested targets</option>
            </select>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={progress.raidGoals}
              disabled={!enabled}
              onChange={(event) => update({ ...progress, raidGoals: event.target.checked })}
            />
            Include MC / Onyxia BRD stages / Shadowforge goals
          </label>
          <h3>XP calculation settings</h3>
          <LevelingCombatPlanningSettings
            progress={progress}
            disabled={!enabled}
            onChange={update}
          />
          <LevelingPartyIdentity
            progress={progress}
            disabled={!enabled}
            leader={{ raceId: plan.race, classSlug: plan.leaderClass }}
            onChange={update}
          />
          <p>
            The current quest curve is pinned to build 70205. World rewards are not assumed to have
            the dungeon multiplier. Later references and unverified dungeon data cannot certify a
            playtested route.
          </p>
          <Link href="/forever/leveling/premade/dungeons">
            Detailed dungeon reference and individual quest ledgers →
          </Link>
        </>
      }
      map={(revealAnchor) => (
        <LevelingZoneMap
          maps={maps}
          points={points}
          stepLabel={action.title === leg.title ? leg.title : `${leg.title} · ${action.title}`}
          onLocation={(point) => {
            select(point.stepId);
            revealAnchor(`campaign-${point.stepId}`);
          }}
        />
      )}
      toolbar={
        <div className={styles.toolbar}>
          <div>
            <span className="eyebrow">
              Chapter {chapters.findIndex((entry) => entry.id === chapter.id) + 1} /{" "}
              {chapters.length} · {chapter.kind === "zone" ? "zone questing" : chapter.kind}
            </span>
            <h2>{chapter.title}</h2>
            <p>
              {currentArea.title} ·{" "}
              {leg.kind === "xp-bridge"
                ? "catch-up only if XP is needed"
                : leg.kind === "starter"
                  ? "personal questing"
                  : leg.kind === "dungeon"
                    ? "dungeon objectives and hand-ins"
                    : "quest chains and pickups"}
            </p>
            {plan.dungeonFinish && (
              <DungeonFinishStrategy
                progress={progress}
                onChange={(next): void => {
                  update(next);
                  const target = campaignSectionFor(plan, chapter.id, next);
                  router.replace(
                    campaignChapterPath(plan, target?.id ?? "level-60-finish", undefined, next),
                    { scroll: false },
                  );
                }}
              />
            )}
            <LevelingChapterBudget guide={guide} compact />
            {!active && loaded ? (
              <button className={guideStyles.button} type="button" onClick={savePlan}>
                Start guide
              </button>
            ) : (
              <LevelingGuideProgress
                plan={plan}
                progress={progress}
                actionId={action.id}
                personal={guide.audience === "personal"}
                disabled={!enabled}
                onChange={update}
                buttonRef={progressButton}
              />
            )}
            <LevelingXpBudget plan={plan} guide={guide} />
            <LevelingCatchUpSuggestions plan={plan} legId={leg.id} progress={progress} />
            <LevelingDungeonPreparation plan={plan} chapter={chapter} progress={progress} />
          </div>
          <details className={guideStyles.details}>
            <summary>Jump to another chapter</summary>
            <label>
              Campaign chapter
              <select
                aria-label="Campaign chapter"
                value={chapter.id}
                disabled={!loaded}
                onChange={(event) => {
                  const section = campaignSectionFor(plan, event.target.value, progress);
                  const target = section
                    ? actions.find((entry) => section.actionIds.includes(entry.id))
                    : null;
                  if (target) select(target.id);
                }}
              >
                {chapters.map((entry, legIndex) => (
                  <option key={entry.id} value={entry.id}>
                    {legIndex + 1}. {entry.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setShowFullPath(!showFullPath)}
              aria-expanded={showFullPath}
            >
              Your complete 1–60 path {showFullPath ? "↑" : "↓"}
            </button>
            {showFullPath && (
              <ol className={styles.path} aria-label="Complete leveling campaign">
                {chapters.map((entry, legIndex) => {
                  const entries = campaignSectionActions(plan, entry, actions),
                    count = entries.filter((item) => journey.completion[item.id] === "done").length;
                  return (
                    <li key={entry.id} data-campaign-leg={entry.id} data-kind={entry.kind}>
                      <button
                        type="button"
                        disabled={!loaded || !entries.length}
                        aria-current={entry.id === chapter.id ? "step" : undefined}
                        onClick={() => select(entries[0]!.id)}
                      >
                        <span>Chapter {legIndex + 1}</span>
                        <strong>
                          {entry.kind === "dungeon" ? "⚑ " : ""}
                          {entry.title}
                        </strong>
                        <small>
                          {count}/{entries.length} steps · {entry.questIds.length} quest IDs
                          {entry.stopId
                            ? ` · entry ${premadeEntryLevel(
                                PREMADE_STOPS.find((stop) => stop.id === entry.stopId)!,
                                progress,
                                plan.rewardFacts,
                              )}`
                            : ""}
                        </small>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </details>
          {leg.kind === "xp-bridge" && (
            <button type="button" disabled={!enabled} onClick={skipBlock}>
              Ready for the next chapter? Skip this XP-only block
            </button>
          )}
        </div>
      }
    >
      <LevelingOptionalDungeonBundles
        progress={progress}
        disabled={!enabled}
        rewardFacts={plan.rewardFacts ?? []}
        onChange={(bundle) => update(updatePremadeDungeonBundle(progress, bundle))}
      />
      {leg.unresolvedQuestIds.length > 0 && (
        <p className={styles.warning}>
          Preparation references still needing source detail: {leg.unresolvedQuestIds.join(", ")}.
          They are not invented instructions or assumed XP.
        </p>
      )}
      {chapter.areas.map((area) => (
        <section key={area.id} className={styles.area} data-reader-area={area.id}>
          <h2>{area.title}</h2>
          {area.legIds.map((id) => {
            const phase = plan.legs.find((entry) => entry.id === id)!;
            const entries = legActions.filter((entry) => entry.legId === id);
            if (!entries.length) return null;
            const notNeeded =
              phase.kind === "xp-bridge" &&
              entries.every((entry) => campaignOptionalXpReady(plan, progress, entry));
            const tasks = (
              <ol className={`${styles.tasks} ${readerStyles.questSteps}`}>
                {entries.map((entry) => renderAction(entry, legActions.indexOf(entry)))}
              </ol>
            );
            return (
              <section key={id} data-campaign-phase={id}>
                <p className={styles.activityLabel}>{phase.title}</p>
                {notNeeded && action.legId !== id ? (
                  <details className={styles.optionalSteps}>
                    <summary>Extra XP not needed · view reference steps</summary>
                    {tasks}
                  </details>
                ) : (
                  tasks
                )}
              </section>
            );
          })}
        </section>
      ))}
      <LevelingCampaignHandoff
        guide={guide}
        next={
          nextChapter
            ? {
                title: nextChapter.title,
                href: campaignChapterPath(plan, nextChapter.id, undefined, progress),
              }
            : null
        }
      />
      {leg.id === "level-60-finish" && journey.completion[action.id] === "done" && (
        <p className={styles.save} role="status">
          All five have reached level 60. Your progress is saved; earlier unfinished tasks remain
          available.
        </p>
      )}
      {plan.leaderClass === null && (
        <p className={styles.warning}>
          Choose Player 1's class in Settings for the exact personal training/pet branch. The
          generic route does not mark those unresolved class steps complete.
        </p>
      )}
      <p className={styles.notice}>
        {storageStatus === "saved"
          ? "Saved on this device."
          : storageStatus === "memory"
            ? "Storage unavailable: export a backup before leaving."
            : "Progress saves locally after a change."}
      </p>
    </LevelingReaderWorkspace>
  );
}
