"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DUNGEON_RELEASE,
  LEVELING_EVIDENCE,
  DUNGEON_VISITS,
  DUNGEON_TRIP_STEPS,
  FOREVER_XP_CURVE,
  emptyDungeonPlan,
  dungeonRouteOption,
  dungeonTripKey,
  createDungeonTrip,
  createDungeonAlternativeTrip,
  createDungeonItineraryTrip,
  dungeonTripSourceReasons,
  DUNGEON_ITINERARIES,
  REDRIDGE_DUNGEON_ALTERNATIVE,
  dungeonContinuation,
  dungeonAlternativeKey,
  dungeonAlternativeSourceReasons,
  dungeonAlternativeReturnReady,
  itineraryDungeonOption,
  dungeonXpEndpoint,
  compareDungeonCheckpoint,
  dungeonPrerequisiteClosure,
  dungeonQuestCompatibility,
  dungeonSourceTags,
  chapterEligibility,
  dungeonGateConfirmations,
  evaluateDungeonGate,
  getDungeonQuest,
  getLevelingRace,
  getGuideStepView,
  type CharacterProfile,
  type ChapterReference,
  type ImportedChapter,
  type DungeonTrip,
  type DungeonQuestState,
  type PersonalDungeonPlan,
} from "@wow-trader/leveling";
import { useLeveling } from "./leveling-provider";
import { LevelingDungeonPlans } from "./leveling-dungeon-plans";
import { LevelingDungeonQuestStatus } from "./leveling-dungeon-quest-status";
import { LevelingDungeonItinerary } from "./leveling-dungeon-itinerary";
import { LevelingEntityLinks } from "./leveling-entity-links";
import { LevelingReaderWorkspace } from "./leveling-reader-workspace";
import { LevelingQuestCard } from "./leveling-quest-card";
import { LevelingStepProgress } from "./leveling-step-progress";
import { useLevelingReaderSelection } from "./leveling-reader-selection";
import { useReaderCompletion } from "./leveling-reader-completion";
import { LevelingZoneMap } from "./leveling-zone-map";
import type { LevelingChapterMaps } from "../lib/leveling-map-data";
import {
  chapterProgressKey,
  levelingChapterPath,
  levelingDashboardPath,
  profileSummary,
  type StepProgress,
} from "../lib/leveling-experience";
import styles from "./leveling-dungeon-plans.module.css";
import readerStyles from "./leveling-experience.module.css";

interface DungeonTripProps {
  readonly visitId: string;
  readonly chapter: ChapterReference | null;
  readonly guide: ImportedChapter | null;
  readonly continuationGuide: ImportedChapter | null;
  readonly alternative: boolean;
  readonly maps: LevelingChapterMaps;
  readonly defaultProfile: CharacterProfile;
}
function readNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000 ? number : null;
}

export function LevelingDungeonTrip({
  visitId,
  chapter,
  guide,
  continuationGuide,
  alternative,
  maps,
  defaultProfile,
}: DungeonTripProps): React.JSX.Element {
  const { session, loaded, notice, setDungeonPlan, saveCharacter } = useLeveling();
  const router = useRouter();
  const matching =
    session?.profile.faction === defaultProfile.faction &&
    session.profile.raceId === defaultProfile.raceId
      ? session
      : null;
  const profile = matching?.profile ?? defaultProfile;
  const visit = DUNGEON_VISITS.find((entry) => entry.id === visitId)!;
  const plan = matching?.dungeonPlans[DUNGEON_RELEASE] ?? emptyDungeonPlan();
  const continuation =
    alternative && guide ? dungeonContinuation(visitId, guide, continuationGuide, profile) : null;
  const alternativeKey = chapter ? dungeonAlternativeKey(chapter.id, visit.id) : null;
  const usesContinuation =
    alternative &&
    Boolean(continuation || (alternativeKey && plan.trips[alternativeKey]?.alternative));
  const key = chapter
    ? usesContinuation
      ? alternativeKey
      : dungeonTripKey(chapter.id, visit.id)
    : null;
  const trip = key ? plan.trips[key] : undefined;
  const option =
    alternative || trip?.itinerary
      ? itineraryDungeonOption(
          visitId,
          profile,
          trip
            ? { ...plan, selectedQuests: { ...plan.selectedQuests, [visitId]: trip.questIds } }
            : plan,
        )
      : dungeonRouteOption(
          visit,
          profile,
          trip
            ? { ...plan, selectedQuests: { ...plan.selectedQuests, [visitId]: trip.questIds } }
            : plan,
        );
  const sourceReasons =
    trip && guide
      ? [
          ...dungeonTripSourceReasons(trip, guide, profile, plan),
          ...dungeonAlternativeSourceReasons(trip, continuation),
          ...(trip.alternative && option.schedule.state === "reference-only"
            ? option.schedule.reasons
            : []),
        ]
      : [];
  const active = Boolean(key && trip && plan.activeTripId === key && guide && chapter);
  const enabled = loaded && Boolean(matching);
  const [error, setError] = useState<string | null>(null);
  const [lastReward, setLastReward] = useState<{
    id: number;
    previous: DungeonQuestState;
    next: DungeonQuestState;
  } | null>(null);
  const steps = DUNGEON_TRIP_STEPS.map((step) =>
    trip?.alternative && step.id === "bridge"
      ? { ...step, title: "Keep the preparations your later route needs" }
      : trip?.alternative && step.id === "rejoin"
        ? { ...step, title: "Check level 20 and continue to Darkshore", stage: "Continue" }
        : step,
  );
  const ids: readonly string[] = steps.map((step) => step.id);
  const scope = `${matching?.id ?? "preview"}:${key ?? visitId}:${trip?.sourceVersion ?? "reference"}`;
  const selection = useLevelingReaderSelection(
    scope,
    "trip-",
    active ? ids : [],
    active ? ids.filter((id) => !trip?.progress[id as keyof DungeonTrip["progress"]]) : [],
    active ? ids : [],
    active ? (trip?.stepId ?? null) : null,
    active && enabled
      ? (stepId) => {
          const selected = steps.find((step) => step.id === stepId);
          if (selected && trip?.stepId !== selected.id) update({ stepId: selected.id });
        }
      : undefined,
  );
  function update(change: Partial<DungeonTrip>): void {
    if (!matching || !key) return;
    setDungeonPlan(matching.id, (current) => {
      const previous = current.trips[key];
      return previous
        ? { ...current, trips: { ...current.trips, [key]: { ...previous, ...change } } }
        : current;
    });
  }
  function mark(id: string, status: StepProgress): void {
    const step = steps.find((entry) => entry.id === id);
    if (!trip || !step) return;
    const progress = { ...trip.progress };
    if (status === "pending") delete progress[step.id];
    else progress[step.id] = status;
    update({ progress });
  }
  const completion = useReaderCompletion({
    scope,
    selectedId: selection.selectedId,
    enabled: enabled && active,
    progress: trip?.progress ?? {},
    mark,
    advance: selection.next,
    restore: selection.restore,
  });
  const selectedIds = trip?.questIds ?? option.questIds;
  const selectedQuests = selectedIds.map((id) => getDungeonQuest(id)!);
  const preparation = dungeonPrerequisiteClosure(selectedIds, plan);
  const scenario = plan.scenarios[visitId] ?? {
    mode: "whole-trip" as const,
    referenceOnly: false,
    fields: {},
  };
  const fields: PersonalDungeonPlan["scenarios"][string]["fields"] = trip
    ? trip.checkpointFields
    : scenario.fields;
  const targetLevel =
    trip?.targetLevel ??
    continuation?.targetLevel ??
    Math.min(
      option.schedule.state === "reference-only" ? 60 : LEVELING_EVIDENCE.betaLevelCap,
      Math.max(profile.level ?? 0, option.schedule.level ?? 59) + 1,
    );
  const range = (
    minimum: string | undefined,
    maximum: string | undefined,
  ): { minimum: number; maximum: number } | null => {
    const min = readNumber(minimum ?? ""),
      max = readNumber(maximum ?? "");
    return min !== null && max !== null && max >= min ? { minimum: min, maximum: max } : null;
  };
  const comparison = compareDungeonCheckpoint({
    visit,
    profile,
    plan,
    questIds: selectedIds,
    currentXp: trip ? trip.currentXp : readNumber(fields.currentXp ?? ""),
    targetLevel,
    killXp: trip ? trip.killXp : readNumber(fields.kills ?? ""),
    tripMinutes: range(fields.min, fields.max),
    outdoorMinutes: range(fields.outdoorMin, fields.outdoorMax),
    outdoorXpPerHour: readNumber(fields.rate ?? ""),
  });
  const previewXp = trip ? trip.currentXp : readNumber(fields.currentXp ?? "");
  const endpoint =
    profile.level === null || option.questXp === null
      ? null
      : dungeonXpEndpoint(profile.level, previewXp ?? 0, option.questXp);
  const entryReasons = [...sourceReasons, ...option.schedule.reasons];
  for (const quest of preparation) {
    if (plan.questStates[String(quest.id)] === "rewarded") continue;
    if (dungeonQuestCompatibility(quest, profile) !== "match")
      entryReasons.push(`Character restrictions for ${quest.title} need review.`);
    if (quest.minimumLevel === null || profile.level === null || profile.level < quest.minimumLevel)
      entryReasons.push(
        `Confirm pickup level for ${quest.title}: ${quest.minimumLevel ?? "unknown"}.`,
      );
    if (quest.pickupStage === "unknown" || quest.objectiveStage === "unknown")
      entryReasons.push(`Lifecycle review needed for ${quest.title}.`);
    if (
      quest.pickupStage === "before" &&
      !["accepted", "objectives-complete"].includes(plan.questStates[String(quest.id)] ?? "")
    )
      entryReasons.push(`Collect ${quest.title} before entry, or remove it from your bundle.`);
    if (quest.pickupStage === "before" && evaluateDungeonGate(quest.gate, plan) !== "ready")
      entryReasons.push(`Check the prerequisites for ${quest.title}.`);
    for (const gate of dungeonGateConfirmations(quest.gate))
      if (plan.confirmations[gate.id] !== true) entryReasons.push(gate.label);
    for (const item of quest.requiredItems)
      if (plan.confirmations[`item-${item.id}`] !== true)
        entryReasons.push(`Confirm starting item: ${item.title}.`);
  }
  function questStatus(id: number, action: "prepare" | "clear" | "reward"): React.JSX.Element {
    const quest = getDungeonQuest(id)!;
    const state = plan.questStates[String(id)] ?? "unknown";
    return (
      <section key={`${id}-${action}`} className={styles.quest} data-trip-quest={id}>
        <strong>{quest.title}</strong>
        <p>
          {action === "prepare"
            ? quest.pickup
            : action === "clear"
              ? quest.objective
              : quest.turnin}
        </p>
        <LevelingEntityLinks kind="quest" id={id} />
        <LevelingDungeonQuestStatus
          title={quest.title}
          state={state}
          action={action}
          disabled={
            !enabled ||
            (action === "clear" && (entryReasons.length > 0 || !trip?.preparationConfirmed))
          }
          onChange={(next) => {
            if (!matching) return;
            if ((state === "rewarded") !== (next === "rewarded"))
              setLastReward({ id, previous: state, next });
            setDungeonPlan(matching.id, (current) => ({
              ...current,
              questStates: { ...current.questStates, [String(id)]: next },
            }));
          }}
        />
        {quest.minimumLevel !== null && (
          <small>
            Pickup minimum {quest.minimumLevel} · {quest.pickupStage} start · instruction Done never
            records a reward.
          </small>
        )}
        {quest.notes.map((note) => (
          <p key={note} className={styles.note}>
            {note}
          </p>
        ))}
      </section>
    );
  }
  function comparisonPanel(): React.JSX.Element {
    return (
      <section className={styles.plans} aria-label="Dungeon checkpoint comparison">
        <h2>Does this cover the next checkpoint?</h2>
        <p>
          Compare the same start state and goal: level {targetLevel}. This does not skip outdoor
          quests or prove a faster route.
        </p>
        <div className={styles.fields}>
          {(
            [
              ["currentXp", "Actual XP into your current level"],
              ["kills", "Estimated kill XP per player"],
              ["min", "Total trip minutes — optimistic"],
              ["max", "Total trip minutes — conservative"],
              ["outdoorMin", "Outdoor minutes to same goal — optimistic"],
              ["outdoorMax", "Outdoor minutes to same goal — conservative"],
              ["rate", "Attainable outdoor XP/hour"],
            ] as const
          ).map(([field, title]) => (
            <label key={field}>
              {title}
              <input
                type="number"
                min="0"
                max="1000000"
                step={field === "currentXp" || field === "kills" ? "1" : "any"}
                value={
                  field === "currentXp" && trip
                    ? (trip.currentXp ?? "")
                    : field === "kills" && trip
                      ? (trip.killXp ?? "")
                      : (fields[field] ?? "")
                }
                disabled={!enabled}
                onChange={(event) => {
                  if (!matching) return;
                  const value = event.target.value;
                  if (trip && (field === "currentXp" || field === "kills")) {
                    const parsed = readNumber(value);
                    if (parsed === null || Number.isInteger(parsed))
                      update(field === "currentXp" ? { currentXp: parsed } : { killXp: parsed });
                  } else if (trip && field !== "currentXp" && field !== "kills")
                    update({ checkpointFields: { ...trip.checkpointFields, [field]: value } });
                  else
                    setDungeonPlan(matching.id, (current) => ({
                      ...current,
                      scenarios: {
                        ...current.scenarios,
                        [visitId]: { ...scenario, fields: { ...fields, [field]: value } },
                      },
                    }));
                }}
              />
            </label>
          ))}
        </div>
        <p className={styles.note}>
          Trip bounds include preparation, group waiting, both journeys, clear, detours, all
          hand-ins and retained outdoor work. Enter kill XP once per player; no party multiplier is
          applied. Blank values are unknown, not zero.
        </p>
        <p role="status">
          {trip?.xpNeedsUpdate
            ? "Hand-in state changed — refresh actual XP before trusting coverage."
            : `Eligible quest XP: ${comparison.eligibleQuestXp?.toLocaleString() ?? "unknown"} · Needed: ${comparison.neededXp?.toLocaleString() ?? "unknown"} · Catch-up XP: ${comparison.shortfallXp?.toLocaleString() ?? "unknown"}`}
        </p>
        <p className={styles.note}>
          Known reward subtotal: {comparison.knownSubtotal?.toLocaleString() ?? "unknown"} ·{" "}
          {comparison.missingRewards} missing values. Crest-based estimates are not observed
          rewards; outdoor prerequisites are not multiplied.
        </p>
        {!trip?.xpNeedsUpdate && comparison.timeSaved && (
          <p>
            Modeled time saved to the same XP goal: {comparison.timeSaved.minimum.toFixed(1)}–
            {comparison.timeSaved.maximum.toFixed(1)} min, including{" "}
            {comparison.catchUpMinutes?.minimum.toFixed(1)} min catch-up. These are your
            assumptions, not measured travel or clear times.
          </p>
        )}
        {comparison.reasons.length > 0 && (
          <details>
            <summary>{comparison.reasons.length} missing inputs / eligibility checks</summary>
            <ul>
              {comparison.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    );
  }
  function actualXpForm(): React.JSX.Element {
    return (
      <form
        aria-label="Record actual dungeon XP"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget),
            level = Number(form.get("level")),
            xp = Number(form.get("xp"));
          if (
            !matching ||
            !Number.isInteger(level) ||
            level < 1 ||
            level > 60 ||
            !Number.isInteger(xp) ||
            xp < 0 ||
            xp >= (FOREVER_XP_CURVE[level] ?? 0) ||
            String(form.get("xp")) === ""
          ) {
            setError(
              "Enter the actual level and XP shown by your game, below the next-level requirement.",
            );
            return;
          }
          if (!saveCharacter({ ...profile, level }, matching.id)) return;
          update({
            returnLevel: level,
            returnXp: xp,
            currentXp: xp,
            killXp: null,
            xpNeedsUpdate: false,
          });
          setError(null);
        }}
      >
        <div className={styles.fields}>
          <label>
            Actual level after hand-ins
            <input
              name="level"
              type="number"
              min="1"
              max="60"
              defaultValue={profile.level ?? ""}
              required
              disabled={!enabled}
            />
          </label>
          <label>
            Actual XP after hand-ins
            <input name="xp" type="number" min="0" required disabled={!enabled} />
          </label>
        </div>
        <button type="submit" disabled={!enabled}>
          Save actual XP
        </button>
        <p className={styles.note}>
          Only your reported game XP is saved. Estimates and instruction checkmarks never award XP.
        </p>
      </form>
    );
  }
  function body(stepId: string): React.JSX.Element {
    if (stepId === "prepare")
      return (
        <>
          <p>
            Prepare at your current level, but enter no earlier than{" "}
            {option.schedule.level ?? "a reviewed level"}. You may need remote pickups and outdoor
            prerequisite hand-ins.
          </p>
          {preparation
            .filter((q) => q.pickupStage === "before")
            .map((q) => questStatus(q.id, "prepare"))}
          {preparation
            .flatMap((q) => dungeonGateConfirmations(q.gate))
            .filter((gate, index, all) => all.findIndex((entry) => entry.id === gate.id) === index)
            .map((gate) => (
              <label className={styles.check} key={gate.id}>
                <input
                  type="checkbox"
                  checked={plan.confirmations[gate.id] === true}
                  disabled={!enabled}
                  onChange={(event) => {
                    if (matching)
                      setDungeonPlan(matching.id, (current) => ({
                        ...current,
                        confirmations: {
                          ...current.confirmations,
                          [gate.id]: event.target.checked,
                        },
                      }));
                  }}
                />
                {gate.label}
              </label>
            ))}
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={trip?.preparationConfirmed ?? false}
              disabled={!enabled || entryReasons.length > 0}
              onChange={(event) => {
                update({ preparationConfirmed: event.target.checked });
                if (matching)
                  setDungeonPlan(matching.id, (current) => ({
                    ...current,
                    confirmations: {
                      ...current.confirmations,
                      [`${visitId}-quest-log-space`]: event.target.checked,
                    },
                  }));
              }}
            />
            I checked pickup gates, quest-start items, quest-log space, tank/healer, party and both
            journeys in game.
          </label>
          <details>
            <summary>Prerequisite chains and reward choices</summary>
            <LevelingDungeonPlans
              profile={profile}
              sessionId={matching?.id ?? null}
              visitIds={[visitId]}
            />
          </details>
        </>
      );
    if (stepId === "travel")
      return (
        <>
          <p>{DUNGEON_ITINERARIES[visitId]!.preparation}</p>
          <p>
            Meet your group at {DUNGEON_ITINERARIES[visitId]!.area}. Use your known flight paths and
            confirm entrance directions in game; no unverified entrance pin or duration is invented.
          </p>
          {!trip?.preparationConfirmed && (
            <p className={styles.notice}>
              Preparation is not confirmed. Review the previous stage before entry.
            </p>
          )}
          {entryReasons.length > 0 && (
            <ul>
              {entryReasons.map((reason, index) => (
                <li key={`${index}-${reason}`}>{reason}</li>
              ))}
            </ul>
          )}
        </>
      );
    if (stepId === "clear")
      return (
        <>
          <p>{DUNGEON_ITINERARIES[visitId]!.scope}</p>
          <p>
            Check inside-start quests before passing their starter, complete only this visit's
            objective scope, and hand in any inside rewards before leaving. Multiple-visit class
            rewards are not paid once per dungeon.
          </p>
          {selectedQuests
            .filter((q) => q.pickupStage === "inside")
            .map((q) => questStatus(q.id, "prepare"))}
          {selectedIds.map((id) => questStatus(id, "clear"))}
          {selectedQuests
            .filter((q) => /inside|corpse/i.test(q.turnin ?? ""))
            .map((q) => questStatus(q.id, "reward"))}
        </>
      );
    if (stepId === "hand-ins")
      return (
        <>
          <p>{DUNGEON_ITINERARIES[visitId]!.exit}</p>
          {selectedIds.map((id) => questStatus(id, "reward"))}
          {actualXpForm()}
        </>
      );
    if (stepId === "bridge")
      return (
        <>
          {trip?.alternative ? (
            <>
              <p>
                Replace the Redridge XP work, not its future dependencies. Complete the retained
                preparation below before continuing at level 20. Your original source and bookmark
                remain saved.
              </p>
              <ul>
                <li>
                  <a
                    href="https://www.wowhead.com/forever/quest=124"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    The Price of Shoes → Return to Verner → A Baying of Gnolls
                  </a>
                  : finish the level-24 Redridge prerequisite.
                </li>
                <li>
                  <a
                    href="https://www.wowhead.com/forever/quest=3765"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    The Corruption Abroad
                  </a>
                  : accept it in Stormwind for Darkshore, or confirm it was already rewarded.
                </li>
                <li>
                  Cooking 50 for later Duskwood work. Keep trainer, weapon and utility instructions.
                </li>
              </ul>
              <details>
                <summary>Retained source instructions · review in game</summary>
                {continuation?.retainedSteps.map((view) => (
                  <section key={view.step.id} className={styles.quest}>
                    <strong>Outdoor step {view.step.ordinal}</strong>
                    {view.directives
                      .filter((directive) => directive.text)
                      .map((directive) => (
                        <p key={directive.sourceLine}>{directive.text}</p>
                      ))}
                    <Link
                      href={`${levelingChapterPath(profile, trip.chapterId)}?outdoor=1#guide-${view.step.id}`}
                    >
                      Open original step & map →
                    </Link>
                  </section>
                ))}
              </details>
              {REDRIDGE_DUNGEON_ALTERNATIVE.carryoverIds.map((id) => (
                <label key={id} className={styles.check}>
                  <input
                    type="checkbox"
                    disabled={!enabled || sourceReasons.length > 0}
                    checked={trip.alternative?.carryover[id] === true}
                    onChange={(event) => {
                      if (trip.alternative)
                        update({
                          alternative: {
                            ...trip.alternative,
                            carryover: {
                              ...trip.alternative.carryover,
                              [id]: event.target.checked,
                            },
                          },
                        });
                    }}
                  />
                  {id === "124"
                    ? "A Baying of Gnolls was turned in; the later Redridge chain is ready."
                    : id === "3765"
                      ? "The Corruption Abroad is in my quest log or already rewarded."
                      : "I trained Cooking to 50 and reviewed the retained class / utility work."}
                </label>
              ))}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={trip.sourceRetained}
                  disabled={!enabled || sourceReasons.length > 0}
                  onChange={(event) => update({ sourceRetained: event.target.checked })}
                />
                I reviewed the retained source work. Leave the replaced XP steps unmarked; preserve
                my outdoor bookmark.
              </label>
            </>
          ) : (
            <>
              <p>
                This trip does not discard or complete any outdoor instructions. Return to the exact
                saved step and keep every prerequisite, trainer visit, flight path and later chain
                in the source. XP coverage alone does not make those steps dispensable.
              </p>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={trip?.sourceRetained ?? false}
                  disabled={!enabled}
                  onChange={(event) => update({ sourceRetained: event.target.checked })}
                />
                Keep my full outdoor source route and resume its saved step; do not auto-skip
                quests.
              </label>
            </>
          )}
        </>
      );
    const canReturn =
      trip &&
      !trip.xpNeedsUpdate &&
      trip.returnLevel !== null &&
      trip.returnXp !== null &&
      trip.sourceRetained &&
      (!trip.alternative || dungeonAlternativeReturnReady(trip, continuation)) &&
      sourceReasons.length === 0;
    return (
      <>
        <p>
          {trip?.alternative
            ? `Reach actual level ${trip.targetLevel}, confirm the retained preparation, then continue at Darkshore / Ashenvale 20–21. No source steps are marked done or skipped.`
            : `After recording actual XP, resume outdoor step ${trip?.returnStepId}. The checkpoint is a comparison goal, not permission to jump over source quests.`}
        </p>
        {actualXpForm()}
        <button
          type="button"
          disabled={!enabled || !canReturn}
          onClick={() => {
            if (!matching || !trip || !key || !canReturn) return;
            setDungeonPlan(matching.id, (current) => ({ ...current, activeTripId: null }));
            router.push(
              trip.alternative
                ? `${levelingChapterPath(profile, trip.alternative.chapterId)}#guide-${trip.alternative.stepId}`
                : `${levelingChapterPath(profile, trip.chapterId)}?outdoor=1#guide-${trip.returnStepId}`,
            );
          }}
        >
          {trip?.alternative ? "Continue at level 20 →" : "Return to saved outdoor step →"}
        </button>
        {!canReturn && (
          <p className={styles.notice}>
            {trip?.alternative
              ? "Record actual level 20+, complete the retained chains and Cooking, and resolve source-version checks. If short on XP, use your saved outdoor route below for top-up work."
              : "Record actual XP, confirm the full source route is retained, and resolve source-version checks first."}
          </p>
        )}
        {trip?.alternative && (
          <Link
            href={`${levelingChapterPath(profile, trip.chapterId)}?outdoor=1#guide-${trip.returnStepId}`}
          >
            Open saved outdoor route for top-up / preparation →
          </Link>
        )}
      </>
    );
  }
  if (!active || !trip || !guide || !chapter)
    return (
      <div className={readerStyles.dashboard}>
        <Link href={levelingDashboardPath(profile)}>← Chapter path</Link>
        <section
          className={`${styles.plans} ${styles.reviewHero}`}
          data-dungeon-trip-review={visitId}
        >
          <span className="eyebrow">Dungeon trip · At level or later</span>
          <h1>{visit.name}</h1>
          <p>
            Earliest run: {option.schedule.level ?? "unconfirmed"} · {option.questIds.length}{" "}
            selected quests · {option.beforeCount} before entry · {option.insideCount} inside
            starts.
          </p>
          <p>
            {option.knownXp === null
              ? "Quest XP unknown"
              : `${option.xpKind === "estimated" ? "≈" : ""}${option.knownXp.toLocaleString()} ${option.xpKind} XP`}{" "}
            · {option.knownRewardCount}/{option.rewardCount} remaining rewards known. A partial
            subtotal does not cover a checkpoint.
          </p>
          {notice && (
            <p role="status" className={styles.notice}>
              {notice}
            </p>
          )}
          {!matching && loaded && (
            <button type="button" onClick={() => saveCharacter(profile)}>
              Save character to plan this trip
            </button>
          )}
          <div className={styles.fields}>
            <label>
              Class
              <select
                disabled={!enabled || profile.classSlug !== null}
                value={profile.classSlug ?? ""}
                onChange={(event) => {
                  const slug = getLevelingRace(profile.faction, profile.raceId)?.classes.find(
                    (value) => value === event.target.value,
                  );
                  if (matching && slug) saveCharacter({ ...profile, classSlug: slug }, matching.id);
                }}
              >
                <option value="">Choose your class</option>
                {getLevelingRace(profile.faction, profile.raceId)?.classes.map((slug) => (
                  <option key={slug} value={slug}>
                    {slug}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Known outdoor XP rate
              <select
                value={profile.xpRate ?? ""}
                disabled={!enabled}
                onChange={(event) => {
                  if (matching)
                    saveCharacter(
                      {
                        ...profile,
                        xpRate: event.target.value ? Number(event.target.value) : null,
                      },
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
            <label>
              Actual current level
              <input
                type="number"
                min="1"
                max="60"
                value={profile.level ?? ""}
                disabled={!enabled}
                onChange={(event) => {
                  const level = event.target.value === "" ? null : Number(event.target.value);
                  if (
                    matching &&
                    (level === null || (Number.isInteger(level) && level >= 1 && level <= 60))
                  )
                    saveCharacter({ ...profile, level }, matching.id);
                }}
              />
            </label>
          </div>
          <ul>
            {sourceReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {option.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {!guide && (
              <li>
                A matching authorized chapter is required to save an exact return bookmark. You can
                still review the reference.
              </li>
            )}
          </ul>
          <p className={styles.note}>
            Run instructions are available only for known quest life cycles at the required actual
            level. Unknown schedules, later chains and above-cap visits remain reference-only. No
            {continuation
              ? " source completion is inferred. This reviewed alternative rejoins at level 20 after its retained chains."
              : " reviewed chapter replacement is available for this character; continue from the saved outdoor step."}
          </p>
          <button
            type="button"
            disabled={
              !enabled ||
              !guide ||
              !chapter ||
              option.schedule.state !== "ready" ||
              option.reviewedCount !== option.questIds.length ||
              option.questIds.length === 0 ||
              option.laterCount > 0 ||
              profile.classSlug === null ||
              profile.xpRate === null ||
              sourceReasons.length > 0 ||
              chapterEligibility(chapter, profile) !== "match"
            }
            onClick={() => {
              if (!matching || !chapter || !guide || !key) return;
              try {
                const savedStep =
                  matching.readerPositions[
                    chapterProgressKey(chapter.id, guide.version, guide.targetBuild)
                  ];
                const returnStep =
                  guide.steps.find(
                    (step) =>
                      step.id === savedStep &&
                      getGuideStepView(step, profile, { dungeons: dungeonSourceTags(plan) })
                        .condition === "match",
                  ) ??
                  guide.steps.find(
                    (step) =>
                      getGuideStepView(step, profile, { dungeons: dungeonSourceTags(plan) })
                        .condition === "match",
                  );
                if (!returnStep) throw new Error("No applicable outdoor return step.");
                const created =
                  trip && sourceReasons.length === 0
                    ? trip
                    : continuation
                      ? createDungeonAlternativeTrip(
                          visitId,
                          chapter,
                          guide,
                          continuationGuide,
                          profile,
                          plan,
                          returnStep.id,
                        )
                      : alternative
                        ? createDungeonItineraryTrip(
                            visitId,
                            chapter,
                            guide,
                            profile,
                            plan,
                            returnStep.id,
                          )
                        : createDungeonTrip(
                            visit,
                            chapter,
                            guide,
                            profile,
                            {
                              ...plan,
                              selectedQuests: {
                                ...plan.selectedQuests,
                                [visitId]: [...option.questIds],
                              },
                            },
                            returnStep.id,
                          );
                if (trip && sourceReasons.length > 0)
                  throw new Error(
                    "Source evidence changed. The saved trip is preserved; use the source route and review the changed definition before resuming.",
                  );
                setDungeonPlan(matching.id, (current) => ({
                  ...current,
                  trips: { ...current.trips, [key]: created },
                  activeTripId: key,
                  selectedQuests: { ...current.selectedQuests, [visitId]: created.questIds },
                }));
                setError(null);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Unable to save this trip.");
              }
            }}
          >
            {trip
              ? "Resume dungeon instructions"
              : continuation
                ? "Use level-20 alternative"
                : "Use dungeon trip · keep outdoor route"}
          </button>
          {error && (
            <p role="alert" className={styles.notice}>
              {error}
            </p>
          )}
        </section>
        <section className={styles.plans} data-dungeon-itinerary={visitId}>
          <span className="eyebrow">Your alternative plan</span>
          <h2>Preparation → run → rewards → continue</h2>
          <p>
            {endpoint
              ? `Selected quest rewards alone: ≈${profile.level} → ${endpoint.level} + ${endpoint.percent}% of that level.`
              : "Complete reward data and actual XP are needed for a level endpoint."}
            {previewXp === null
              ? " Preview assumes zero current XP."
              : " Uses your entered current XP."}{" "}
            No kill or prerequisite XP is included in this preview.
          </p>
          <p>
            {
              DUNGEON_ITINERARIES[visitId]![
                profile.faction === "alliance" ? "allianceFit" : "hordeFit"
              ]
            }
          </p>
          <LevelingDungeonItinerary option={option} profile={profile} plan={plan} />
          {continuation && (
            <p className={styles.note}>
              Actual level 20+, A Baying of Gnolls, Cooking 50 and The Corruption Abroad are
              required for the reviewed Darkshore continuation. Retained preparations are still
              work, not free XP. Include them in your full-trip time.
            </p>
          )}
        </section>
        <details className={styles.reviewDetails} data-trip-review-panel="comparison">
          <summary>
            <span>
              Compare XP & total trip time
              <small>Actual XP, per-player kills and your full-trip assumptions</small>
            </span>
          </summary>
          {comparisonPanel()}
        </details>
        <details className={styles.reviewDetails} data-trip-review-panel="quests">
          <summary>
            <span>
              Quest bundle & preparation
              <small>
                {option.questIds.length} selected quests · prerequisites, pickup locations and
                rewards
              </small>
            </span>
          </summary>
          <LevelingDungeonPlans
            profile={profile}
            sessionId={matching?.id ?? null}
            visitIds={[visitId]}
          />
        </details>
      </div>
    );
  const selected = steps.find((step) => step.id === selection.selectedId);
  const points =
    selection.selectedId === "prepare"
      ? maps.points.filter((point) =>
          preparation.some((q) => point.stepId === `dungeon-pickup-${q.id}`),
        )
      : trip.alternative && selection.selectedId === "bridge"
        ? maps.points.filter((point) =>
            continuation?.retainedSteps.some((view) => view.step.id === point.stepId),
          )
        : trip.alternative && selection.selectedId === "rejoin"
          ? maps.points.filter(
              (point) =>
                point.stepId ===
                `continuation-${
                  continuationGuide?.steps.find(
                    (step) =>
                      getGuideStepView(step, profile, { dungeons: dungeonSourceTags(plan) })
                        .condition === "match" &&
                      step.directives.some((directive) => directive.position !== null),
                  )?.id
                }`,
            )
          : selection.selectedId === "bridge" || selection.selectedId === "rejoin"
            ? maps.points.filter((point) => point.stepId === trip.returnStepId)
            : [];
  return (
    <LevelingReaderWorkspace
      scope={scope}
      ready={loaded}
      title={visit.name}
      minimumLevel={option.schedule.level ?? 1}
      maximumLevel={trip.targetLevel}
      profile={`${profileSummary(profile)} · ${trip.alternative ? "level-20 alternative · dependencies retained" : "dungeon trip · full source retained"}`}
      dashboardHref={levelingDashboardPath(profile)}
      completed={Object.values(trip.progress).filter((value) => value === "done").length}
      total={ids.length}
      progressLabel="Dungeon instructions tracked separately"
      notice={notice}
      currentStepLabel={selected?.title ?? "Dungeon trip"}
      currentStepAnchor={selection.selectedId ? `trip-${selection.selectedId}` : null}
      nextDisabled={selection.nextId === null}
      doneDisabled={completion.doneDisabled}
      previousDisabled={selection.previousId === null}
      undoDisabled={completion.undoDisabled}
      onPrevious={selection.previous}
      onNext={selection.next}
      onDone={completion.finish}
      onUndo={completion.undo}
      onNavigate={selection.navigate}
      settings={
        <>
          <button
            type="button"
            onClick={() => {
              if (matching)
                setDungeonPlan(matching.id, (current) => ({ ...current, activeTripId: null }));
              router.push(
                `${levelingChapterPath(profile, chapter.id)}?outdoor=1#guide-${trip.returnStepId}`,
              );
            }}
          >
            Keep questing · preserve this trip
          </button>
          {comparisonPanel()}
        </>
      }
      map={() => (
        <LevelingZoneMap
          maps={maps}
          points={points}
          preferredUiMapId={points[0]?.uiMapId ?? null}
          stepLabel={
            points.length
              ? trip.alternative && selection.selectedId === "bridge"
                ? "Retained source preparation references"
                : trip.alternative && selection.selectedId === "rejoin"
                  ? "Next-chapter source reference · not a travel pin"
                  : "Reference pickups / saved return step"
              : "Entrance and boss route unpinned"
          }
        />
      )}
      toolbar={null}
    >
      {sourceReasons.length > 0 && (
        <p className={styles.notice} role="alert">
          {sourceReasons.join(" ")}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.notice}>
          {error}
        </p>
      )}
      {lastReward && plan.questStates[String(lastReward.id)] === lastReward.next && (
        <p className={styles.notice} role="status">
          Reported hand-in state changed.{" "}
          <button
            type="button"
            onClick={() => {
              if (matching)
                setDungeonPlan(matching.id, (current) => ({
                  ...current,
                  questStates: {
                    ...current.questStates,
                    [String(lastReward.id)]: lastReward.previous,
                  },
                }));
              setLastReward(null);
            }}
          >
            Undo reported hand-in
          </button>
        </p>
      )}
      {trip.xpNeedsUpdate && (
        <p className={styles.notice} role="status">
          Reward status changed. <a href="#trip-hand-ins">Refresh actual XP →</a>
        </p>
      )}
      <details className={styles.plans}>
        <summary>Dungeon stages · outdoor step {trip.returnStepId} preserved</summary>
        <nav aria-label="Dungeon trip stages">
          {steps.map((step) => (
            <p key={step.id}>
              <a href={`#trip-${step.id}`}>
                {step.stage} · {step.title}
              </a>
            </p>
          ))}
        </nav>
      </details>
      <ol className={readerStyles.questSteps}>
        {steps.map((step, index) => (
          <LevelingQuestCard
            key={step.id}
            id={`trip-${step.id}`}
            title={step.title}
            selectionLabel={`Select trip step ${index + 1}`}
            selected={selection.selectedId === step.id}
            done={trip.progress[step.id] === "done"}
            next={selection.nextId === step.id}
            onSelect={() => selection.select(step.id)}
            leading={
              <span className={readerStyles.actionIcon} aria-hidden="true">
                {index + 1}
              </span>
            }
            meta={`Dungeon instruction ${index + 1} · ${step.stage}`}
            progress={
              <LevelingStepProgress
                label={`trip step ${index + 1}`}
                value={trip.progress[step.id] ?? "pending"}
                disabled={!enabled}
                onChange={(status) => mark(step.id, status)}
              />
            }
          >
            <div className={styles.plans}>{body(step.id)}</div>
          </LevelingQuestCard>
        ))}
      </ol>
    </LevelingReaderWorkspace>
  );
}
