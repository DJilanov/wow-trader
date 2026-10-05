"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  DUNGEON_RELEASE,
  THANES_REPLACEMENT,
  THANES_ROUTE_STEPS,
  dungeonCarryoverRequirements,
  dungeonReplacementRejoinReasons,
  emptyDungeonPlan,
  emptyDungeonReplacement,
  getDungeonQuest,
  getLevelingRace,
  estimateThanesReplacement,
  FOREVER_XP_CURVE,
  calibratedDungeonQuestXp,
  type CharacterProfile,
  type ChapterReference,
  type ImportedChapter,
  type DungeonReplacementPlan,
  type DungeonQuestState,
} from "@wow-trader/leveling";
import { useLeveling } from "./leveling-provider";
import { LevelingReaderWorkspace } from "./leveling-reader-workspace";
import { LevelingZoneMap } from "./leveling-zone-map";
import { LevelingQuestCard } from "./leveling-quest-card";
import { LevelingStepProgress } from "./leveling-step-progress";
import { LevelingEntityLinks } from "./leveling-entity-links";
import { LevelingRewardPreviewCard } from "./leveling-reward-preview";
import { LevelingDungeonAlternative } from "./leveling-dungeon-alternative";
import { LevelingDungeonPreparation } from "./leveling-dungeon-preparation";
import { LevelingDungeonQuestStatus } from "./leveling-dungeon-quest-status";
import { useLevelingReaderSelection } from "./leveling-reader-selection";
import { useReaderCompletion } from "./leveling-reader-completion";
import {
  chapterProgressKey,
  levelingChapterPath,
  levelingDashboardPath,
  profileSummary,
  type StepProgress,
} from "../lib/leveling-experience";
import type { LevelingChapterMaps } from "../lib/leveling-map-data";
import styles from "./leveling-experience.module.css";
import alternativeStyles from "./leveling-dungeon-alternative.module.css";

interface ReplacementReaderProps {
  readonly chapter: ChapterReference;
  readonly guide: ImportedChapter;
  readonly continuation: ImportedChapter;
  readonly defaultProfile: CharacterProfile;
  readonly maps: LevelingChapterMaps;
  readonly sessionId: string;
}
export function LevelingDungeonReplacementReader({
  chapter,
  guide,
  continuation,
  defaultProfile,
  maps,
  sessionId,
}: ReplacementReaderProps): React.JSX.Element {
  const { session, loaded, notice, setDungeonPlan, saveCharacter } = useLeveling();
  const router = useRouter();
  const matching = session?.id === sessionId ? session : null;
  const profile = matching?.profile ?? defaultProfile;
  const plan = matching?.dungeonPlans[DUNGEON_RELEASE] ?? emptyDungeonPlan();
  const replacement = plan.replacements[chapter.id] ?? emptyDungeonReplacement();
  const enabled = loaded && Boolean(matching);
  const [xpError, setXpError] = useState<string | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [lastRewardChange, setLastRewardChange] = useState<{
    readonly id: number;
    readonly previous: DungeonQuestState;
    readonly next: DungeonQuestState;
  } | null>(null);
  const estimate = estimateThanesReplacement(profile, plan);
  const scope = `${sessionId}:${chapter.id}:${THANES_REPLACEMENT.version}`;
  const outdoorHref = `${levelingChapterPath(profile, chapter.id)}?outdoor=1`;
  const carryover = useMemo(
    () => dungeonCarryoverRequirements(guide, continuation, profile),
    [guide, continuation, profile],
  );
  const rejoinReasons = [
    ...dungeonReplacementRejoinReasons(profile, replacement, carryover, guide.targetBuild),
  ];
  if (continuation.targetBuild !== guide.targetBuild)
    rejoinReasons.push("The next chapter belongs to a different source build.");

  function update(change: Partial<DungeonReplacementPlan>): void {
    if (!matching) return;
    setDungeonPlan(matching.id, (current) => ({
      ...current,
      replacements: {
        ...current.replacements,
        [chapter.id]: {
          ...(current.replacements[chapter.id] ?? emptyDungeonReplacement()),
          ...change,
        },
      },
    }));
  }
  const ids: readonly string[] = THANES_ROUTE_STEPS.map((step) => step.id);
  const selection = useLevelingReaderSelection(
    scope,
    "dungeon-",
    ids,
    ids.filter((id) => !replacement.progress[id]),
    ids,
    replacement.stepId,
    enabled
      ? (stepId) => {
          if (!matching) return;
          setDungeonPlan(matching.id, (current) => {
            const previous = current.replacements[chapter.id] ?? emptyDungeonReplacement();
            if (previous.stepId === stepId) return current;
            return {
              ...current,
              replacements: { ...current.replacements, [chapter.id]: { ...previous, stepId } },
            };
          });
        }
      : undefined,
  );
  function mark(id: string, status: StepProgress): void {
    if (!matching) return;
    setDungeonPlan(matching.id, (current) => {
      const previous = current.replacements[chapter.id] ?? emptyDungeonReplacement();
      const progress = { ...previous.progress };
      if (status === "pending") delete progress[id];
      else progress[id] = status;
      return {
        ...current,
        replacements: { ...current.replacements, [chapter.id]: { ...previous, progress } },
      };
    });
  }
  const completion = useReaderCompletion({
    scope,
    selectedId: selection.selectedId,
    enabled,
    progress: replacement.progress,
    mark,
    advance: selection.next,
    restore: selection.restore,
  });
  const selected = THANES_ROUTE_STEPS.find((step) => step.id === selection.selectedId);
  const completed = ids.filter((id) => replacement.progress[id] === "done").length;
  const pendingQuests = THANES_REPLACEMENT.questIds.filter(
    (id) => plan.questStates[String(id)] !== "rewarded" && !plan.retainedQuestIds.includes(id),
  );
  const referencePoints =
    selection.selectedId === "prepare" &&
    pendingQuests.includes(96393) &&
    plan.questStates["96391"] !== "rewarded"
      ? maps.points.filter((point) => point.stepId === "dungeon-pickup-96391")
      : [];
  const mapZoneName = ["bridge", "rejoin"].includes(selection.selectedId ?? "")
    ? "Darkshore"
    : "Ironforge";

  function changeQuest(id: number, state: DungeonQuestState): void {
    if (!matching) return;
    const previous = plan.questStates[String(id)] ?? "unknown";
    if ((previous === "rewarded") !== (state === "rewarded"))
      setLastRewardChange({ id, previous, next: state });
    setDungeonPlan(matching.id, (current) => ({
      ...current,
      questStates: { ...current.questStates, [String(id)]: state },
    }));
  }
  function preparation(unresolvedOnly: boolean): React.JSX.Element {
    return (
      <LevelingDungeonPreparation
        quests={carryover}
        reviewed={replacement.carryover}
        enabled={enabled}
        outdoorHref={outdoorHref}
        unresolvedOnly={unresolvedOnly}
        onChange={(value) => update({ carryover: value })}
      />
    );
  }
  function xpUpdate(): React.JSX.Element {
    return (
      <form
        className={alternativeStyles.xpForm}
        aria-label="Update actual XP"
        onSubmit={(event) => {
          event.preventDefault();
          if (!matching) return;
          const form = new FormData(event.currentTarget);
          const levelText = String(form.get("actualLevel") ?? "");
          const xpText = String(form.get("actualXp") ?? "");
          const level = Number(levelText),
            xp = Number(xpText);
          if (
            !levelText ||
            !xpText ||
            !Number.isInteger(level) ||
            level < 1 ||
            level > 60 ||
            !Number.isInteger(xp) ||
            xp < 0 ||
            xp > 1_000_000 ||
            (FOREVER_XP_CURVE[level] !== undefined && xp >= FOREVER_XP_CURVE[level]!)
          ) {
            setXpError("Enter your actual level and an XP value below the next-level requirement.");
            return;
          }
          if (!saveCharacter({ ...profile, level }, matching.id)) return;
          update({ currentXp: xp, killXp: null, xpNeedsUpdate: false });
          setXpError(null);
        }}
      >
        <p className={alternativeStyles.note}>
          Enter what your game XP bar shows. This refresh clears the earlier kill-XP assumption; no
          estimated reward is added automatically.
        </p>
        <div className={alternativeStyles.fields}>
          <label>
            Actual current level
            <input
              name="actualLevel"
              type="number"
              min="1"
              max="60"
              defaultValue={profile.level ?? ""}
              required
              disabled={!enabled}
            />
          </label>
          <label>
            Actual current XP
            <input
              name="actualXp"
              type="number"
              min="0"
              max="1000000"
              required
              disabled={!enabled}
            />
          </label>
        </div>
        {xpError && (
          <p className={alternativeStyles.warning} role="alert">
            {xpError}
          </p>
        )}
        <div className={alternativeStyles.actions}>
          <button type="submit" disabled={!enabled}>
            Save actual XP
          </button>
        </div>
      </form>
    );
  }

  function quest(id: number, action: "prepare" | "clear" | "reward"): React.JSX.Element {
    const entry = getDungeonQuest(id)!;
    const value = plan.questStates[String(id)] ?? "unknown";
    return (
      <div key={id} className={alternativeStyles.carryover}>
        <strong>{entry.title}</strong>
        <p>
          {action === "prepare"
            ? `Pickup: ${entry.pickup ?? "Check the current quest reference."}`
            : action === "clear"
              ? entry.objective
              : `Hand-in: ${entry.turnin ?? "Check the current quest reference."}`}
        </p>
        <LevelingEntityLinks kind="quest" id={id} />
        <LevelingDungeonQuestStatus
          title={entry.title}
          state={value}
          action={action}
          disabled={!enabled}
          onChange={(state) => changeQuest(id, state)}
        />
        {action === "reward" && (
          <>
            <p className={alternativeStyles.note}>
              ≈
              {calibratedDungeonQuestXp(id, Math.max(15, profile.level ?? 15))?.toLocaleString() ??
                "unknown"}{" "}
              XP · estimated, not a recorded reward.
            </p>
            {[...entry.rewards.fixed, ...entry.rewards.choices].map((reward) => (
              <LevelingRewardPreviewCard key={reward.id} itemId={reward.id} name={reward.title} />
            ))}
          </>
        )}
      </div>
    );
  }

  function body(id: string): React.JSX.Element {
    switch (id) {
      case "prepare":
        return (
          <>
            <p>
              Start at actual level 15. Earlier Darkshore work is not replaced. Reserve quest-log
              space, arrange a tank and healer, and include both journeys in your time comparison.
            </p>
            {profile.level === null || profile.level < 15 ? (
              <p className={alternativeStyles.warning}>
                Your level is not confirmed at 15 or higher. Keep questing first, or update your
                current level in Settings.
              </p>
            ) : null}
            {pendingQuests.includes(96393) && (
              <>
                <p className={alternativeStyles.warning}>
                  Complete and turn in Underground Map before taking Old Ironforge Incursion. Its
                  outdoor XP is not multiplied by the Crest calibration.
                </p>
                {quest(96391, "prepare")}
              </>
            )}
            {pendingQuests
              .filter((questId) => questId !== 96395)
              .map((questId) => quest(questId, "prepare"))}
            <details>
              <summary>Keep your outdoor quest chains · review before entry</summary>
              {preparation(false)}
            </details>
            <label className={alternativeStyles.check}>
              <input
                type="checkbox"
                checked={replacement.preparationConfirmed}
                disabled={!enabled}
                onChange={(event) => update({ preparationConfirmed: event.target.checked })}
              />
              I checked my level, prerequisites, quest log, party and return travel in game.
            </label>
          </>
        );
      case "travel":
        return (
          <>
            <p>
              Travel to Ironforge using your available boat, tram and flight paths. Meet the group
              at the Hall of Thanes entrance in Old Ironforge. Confirm directions in game; no
              invented entrance pin or travel time is shown.
            </p>
            {!replacement.preparationConfirmed && (
              <p className={alternativeStyles.warning}>
                Preparation is not confirmed. Review the previous step before entering.
              </p>
            )}
          </>
        );
      case "clear":
        return (
          <>
            <p>
              Pick up An Ancient Grudge from the Ghostly Attendant after the first room if it is
              still available. Complete the selected quest objectives with your party. Done marks
              this instruction, not the actual quest state.
            </p>
            {pendingQuests.map((questId) => quest(questId, "clear"))}
            {plan.questStates["96395"] !== "rewarded" && (
              <>
                <p>
                  Turn in An Ancient Grudge to the Ghostly Attendant before leaving. This inside
                  reward and actual kills may help you reach 16 before the Treaty pickup.
                </p>
                {quest(96395, "reward")}
              </>
            )}
          </>
        );
      case "treaty":
        return (
          <>
            <p>
              The Treaty of Understanding is in the vault in the Reliquary of Kings, in Durgen
              Dirgehammer's room. Check that your character is already level 16 and that the quest
              is offered before leaving.
            </p>
            <p className={alternativeStyles.warning}>
              Treaty is not included in the default four-quest XP. Later Ironforge hand-ins cannot
              make an earlier inside pickup eligible. Do not add its reward unless you actually
              obtained it.
            </p>
            {quest(98423, "prepare")}
          </>
        );
      case "hand-ins":
        return (
          <>
            <p>
              Reward the completed quests at their actual NPCs. Already rewarded quests cannot pay
              again; rewards below are reference estimates. Record the actual result in your quest
              actions. Instruction Done does not record a hand-in.
            </p>
            <p>
              An Ancient Grudge must be handed in inside before leaving; the other bundle hand-ins
              are around Ironforge. Do not count or repeat an inside reward that was already paid.
            </p>
            {pendingQuests.map((questId) => quest(questId, "reward"))}
            {THANES_REPLACEMENT.questIds.some(
              (questId) => plan.questStates[String(questId)] === "rewarded",
            ) && (
              <details>
                <summary>Already handed in · view or correct status</summary>
                {THANES_REPLACEMENT.questIds
                  .filter((questId) => plan.questStates[String(questId)] === "rewarded")
                  .map((questId) => quest(questId, "reward"))}
              </details>
            )}
            {["accepted", "objectives-complete", "rewarded"].includes(
              plan.questStates["98423"] ?? "",
            ) && quest(98423, "reward")}
            {xpUpdate()}
          </>
        );
      case "bridge":
        return (
          <>
            <p>
              This replaces XP work, not every quest chain. These quests are accepted in the skipped
              chapter and used by the next Darkshore chapter. Keep the required preparation; use the
              original step links to find it.
            </p>
            <p className={alternativeStyles.note}>
              The list is derived from your class/race/XP-rate source variant, not a complete server
              prerequisite database. Conditional rows can be ruled out only after checking the next
              chapter in game.
            </p>
            {preparation(true)}
            <details>
              <summary>Reviewed preparations · view or correct</summary>
              {preparation(false)}
            </details>
          </>
        );
      default:
        return (
          <section id="chapter-handoff" aria-label="Dungeon return checkpoint">
            <p>
              Return to Darkshore and check your actual level and carried quest chains. If you are
              short of 16, finish the remaining outdoor work. The XP estimate never automatically
              skips it.
            </p>
            <label className={styles.field}>
              Actual level after the run and hand-ins
              <input
                type="number"
                min="1"
                max="60"
                value={replacement.returnLevel ?? ""}
                disabled={!enabled}
                onChange={(event) => {
                  const value = event.target.value === "" ? null : Number(event.target.value);
                  if (value === null || (Number.isInteger(value) && value >= 1 && value <= 60))
                    update({ returnLevel: value });
                }}
              />
            </label>
            <p className={alternativeStyles.status} role="status">
              {rejoinReasons.length
                ? `${rejoinReasons.length} checks remaining before continuing.`
                : "Return checks complete · you can continue."}
            </p>
            {rejoinReasons.length > 0 && (
              <ul className={alternativeStyles.checkpointChecks}>
                {rejoinReasons.map((reason) => (
                  <li key={reason}>
                    {reason}
                    {reason.startsWith("Choose your class") && (
                      <button
                        className={alternativeStyles.undoAction}
                        type="button"
                        onClick={() => settingsButton.current?.click()}
                      >
                        Open character settings →
                      </button>
                    )}
                    {reason.startsWith("Review ") && (
                      <>
                        {" "}
                        <a href="#dungeon-bridge">Review outdoor preparation →</a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className={alternativeStyles.actions}>
              <button
                className={alternativeStyles.primary}
                type="button"
                disabled={!enabled || rejoinReasons.length > 0}
                onClick={() => {
                  if (!matching || replacement.returnLevel === null || rejoinReasons.length > 0)
                    return;
                  saveCharacter({ ...profile, level: replacement.returnLevel }, matching.id);
                  update({ active: false });
                  router.push(
                    levelingChapterPath(
                      { ...profile, level: replacement.returnLevel },
                      THANES_REPLACEMENT.continuationId,
                    ),
                  );
                }}
              >
                Continue to Darkshore 16–19 →
              </button>
              <Link
                href={`${outdoorHref}#guide-${matching?.readerPositions[chapterProgressKey(chapter.id, guide.version, guide.targetBuild)] ?? guide.steps[0]?.id ?? ""}`}
              >
                Finish remaining outdoor work →
              </Link>
            </div>
          </section>
        );
    }
  }

  return (
    <LevelingReaderWorkspace
      scope={scope}
      ready={loaded}
      title="Hall of Thanes"
      minimumLevel={15}
      maximumLevel={16}
      profile={`${profileSummary(profile)} · Darkshore alternative · estimated XP`}
      dashboardHref={levelingDashboardPath(profile)}
      completed={completed}
      total={ids.length}
      progressLabel={`${completed} / ${ids.length} dungeon instructions done`}
      notice={notice}
      currentStepLabel={selected?.title ?? "Dungeon route"}
      currentStepAnchor={selection.selectedId ? `dungeon-${selection.selectedId}` : null}
      nextDisabled={selection.nextId === null}
      doneDisabled={completion.doneDisabled}
      previousDisabled={selection.previousId === null}
      undoDisabled={completion.undoDisabled}
      onPrevious={selection.previous}
      onNext={selection.next}
      onDone={completion.finish}
      onUndo={completion.undo}
      onNavigate={selection.navigate}
      settingsButtonRef={settingsButton}
      settings={
        <>
          <LevelingDungeonAlternative
            chapter={chapter}
            profile={profile}
            sourceAvailable={true}
            compact
          />
          <label className={styles.field}>
            Class
            <select
              value={profile.classSlug ?? ""}
              disabled={!enabled || Boolean(profile.classSlug)}
              onChange={(event) => {
                const slug = getLevelingRace(profile.faction, profile.raceId)?.classes.find(
                  (entry) => entry === event.target.value,
                );
                if (matching && slug) saveCharacter({ ...profile, classSlug: slug }, matching.id);
              }}
            >
              <option value="">Choose to resolve class instructions</option>
              {getLevelingRace(profile.faction, profile.raceId)?.classes.map((slug) => (
                <option key={slug} value={slug}>
                  {slug}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Known outdoor XP rate
            <select
              value={profile.xpRate ?? ""}
              disabled={!enabled}
              onChange={(event) => {
                if (matching)
                  saveCharacter(
                    { ...profile, xpRate: event.target.value ? Number(event.target.value) : null },
                    matching.id,
                  );
              }}
            >
              <option value="">Unknown · do not guess</option>
              {[1, 1.5, 2, 3].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}×
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Current level
            <input
              type="number"
              min="1"
              max="60"
              value={profile.level ?? ""}
              disabled={!enabled}
              onChange={(event) => {
                const value = event.target.value === "" ? null : Number(event.target.value);
                if (
                  matching &&
                  (value === null || (Number.isInteger(value) && value >= 1 && value <= 60))
                )
                  saveCharacter({ ...profile, level: value }, matching.id);
              }}
            />
          </label>
          <p className={styles.muted}>
            Your outdoor progress and bookmark remain untouched. Dungeon instructions are tracked
            separately per character.
          </p>
        </>
      }
      map={() => (
        <LevelingZoneMap
          maps={maps}
          points={referencePoints}
          preferredUiMapId={maps.zones.find((zone) => zone.name === mapZoneName)?.uiMapId ?? null}
          stepLabel={
            referencePoints.length
              ? "Underground Map · reference pickup"
              : `${mapZoneName} · ${mapZoneName === "Ironforge" ? "entrance unpinned" : "quest-chain bridge"}`
          }
        />
      )}
      toolbar={null}
    >
      <details className={alternativeStyles.routeSummary} data-dungeon-route-options>
        <summary>
          Step {Math.max(1, ids.indexOf(selection.selectedId ?? "") + 1)} / {ids.length} · Route &
          XP
        </summary>
        <div className={alternativeStyles.actions}>
          <button
            type="button"
            disabled={!enabled}
            onClick={() => {
              update({ active: false });
              router.push(outdoorHref);
            }}
          >
            Keep questing
          </button>
        </div>
        <nav className={alternativeStyles.stageNavigation} aria-label="Dungeon stages">
          {THANES_ROUTE_STEPS.map((step, index) => (
            <a
              key={step.id}
              href={`#dungeon-${step.id}`}
              aria-current={selection.selectedId === step.id ? "step" : undefined}
            >
              {index + 1}. {step.stage} · {step.title}
            </a>
          ))}
        </nav>
        <p className={alternativeStyles.note}>
          Original estimated quest XP: ≈
          {replacement.xpForecast?.questXp?.toLocaleString() ?? "not recorded for this older save"}.
          Remaining estimated rewards: ≈{estimate.questXp?.toLocaleString() ?? "unknown"}. These are
          not earned XP.
        </p>
        <p className={alternativeStyles.note}>
          A level-15 alternative, not a blanket skip of Darkshore. Source progress is unchanged.
          Quest and return checks stay manual.
        </p>
      </details>
      {replacement.xpNeedsUpdate && (
        <p className={alternativeStyles.xpPrompt} role="status">
          Hand-in status changed. <a href="#dungeon-hand-ins">Update actual level and XP →</a>
        </p>
      )}
      {lastRewardChange &&
        plan.questStates[String(lastRewardChange.id)] === lastRewardChange.next && (
          <p className={alternativeStyles.xpPrompt} role="status">
            Reported reward status changed for {getDungeonQuest(lastRewardChange.id)?.title}.{" "}
            <button
              type="button"
              className={alternativeStyles.undoAction}
              disabled={!enabled}
              onClick={() => {
                changeQuest(lastRewardChange.id, lastRewardChange.previous);
                setLastRewardChange(null);
              }}
            >
              Undo reported hand-in change
            </button>
          </p>
        )}
      <ol className={styles.questSteps}>
        {THANES_ROUTE_STEPS.map((step, index) => (
          <LevelingQuestCard
            key={step.id}
            id={`dungeon-${step.id}`}
            title={step.title}
            selectionLabel={`Select dungeon step ${index + 1}`}
            selected={selection.selectedId === step.id}
            done={replacement.progress[step.id] === "done"}
            next={selection.nextId === step.id}
            onSelect={() => selection.select(step.id)}
            leading={
              <span className={`${styles.actionIcon} ${styles.sourceStepIcon}`} aria-hidden="true">
                {index + 1}
              </span>
            }
            meta={`Dungeon step ${index + 1} · ${step.stage}`}
            progress={
              <LevelingStepProgress
                label={`dungeon step ${index + 1}`}
                value={replacement.progress[step.id] ?? "pending"}
                disabled={!enabled}
                onChange={(status) => mark(step.id, status)}
              />
            }
          >
            <div className={`${alternativeStyles.card} ${alternativeStyles.stepBody}`}>
              {body(step.id)}
            </div>
          </LevelingQuestCard>
        ))}
      </ol>
    </LevelingReaderWorkspace>
  );
}
