"use client";

import { useState } from "react";
import {
  DUNGEON_RELEASE,
  DUNGEON_VISITS,
  LEVELING_EVIDENCE,
  dungeonQuestStates,
  emptyDungeonPlan,
  getDungeonQuest,
  dungeonPrerequisiteClosure,
  dungeonRewardQuestIds,
  dungeonQuestCompatibility,
  dungeonQuestReadiness,
  describeDungeonGate,
  dungeonGateConfirmations,
  compareDungeonPlan,
  scheduleDungeonVisit,
  defaultDungeonBundle,
  type CharacterProfile,
  type PersonalDungeonPlan,
  type DungeonVisit,
  type DungeonQuestState,
} from "@wow-trader/leveling";
import { useLeveling } from "./leveling-provider";
import { LevelingRewardPreviewCard } from "./leveling-reward-preview";
import styles from "./leveling-dungeon-plans.module.css";

interface DungeonPlansProps {
  readonly profile: CharacterProfile;
  readonly sessionId: string | null;
  readonly onLocation?: (questId: number) => void;
  readonly onRejoin?: () => void;
  readonly visitIds?: readonly string[];
}
const names: Readonly<Record<DungeonQuestState, string>> = {
  unknown: "Not confirmed",
  "not-started": "Not started",
  accepted: "I have this quest",
  "objectives-complete": "Objectives complete — not turned in",
  rewarded: "Already turned in",
  abandoned: "Abandoned",
};
function parseNumber(value: string, whole = false): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) &&
    number >= 0 &&
    number <= 1_000_000_000 &&
    (!whole || Number.isSafeInteger(number))
    ? number
    : null;
}
export function LevelingDungeonPlans({
  profile,
  sessionId,
  onLocation,
  onRejoin,
  visitIds,
}: DungeonPlansProps): React.JSX.Element {
  const { session, loaded, setDungeonPlan } = useLeveling();
  const matching = session && session.id === sessionId ? session : null;
  const plan = matching?.dungeonPlans[DUNGEON_RELEASE] ?? emptyDungeonPlan();
  const [showFuture, setShowFuture] = useState(false);
  const [undo, setUndo] = useState<{
    readonly sessionId: string;
    readonly plan: PersonalDungeonPlan;
  } | null>(null);
  function change(update: (current: PersonalDungeonPlan) => PersonalDungeonPlan): void {
    if (!matching) return;
    setUndo({ sessionId: matching.id, plan });
    setDungeonPlan(matching.id, update);
  }
  const visits = DUNGEON_VISITS.filter(
    (visit) =>
      (visit.faction === "both" || visit.faction === profile.faction) &&
      (!visitIds || visitIds.includes(visit.id)) &&
      (visitIds ||
        showFuture ||
        (visit.availability === "beta" &&
          visit.levels !== null &&
          visit.levels.atLevel <= LEVELING_EVIDENCE.betaLevelCap)),
  );
  return (
    <section className={styles.plans} aria-labelledby="dungeon-plans-title" id="dungeon-plans">
      <header className={styles.header}>
        <div>
          <span className="eyebrow">Optional adventures</span>
          <h2 id="dungeon-plans-title">Prepare once. Arrive ready.</h2>
        </div>
        {undo && matching && undo.sessionId === matching.id && (
          <button
            type="button"
            onClick={() => {
              setDungeonPlan(undo.sessionId, () => undo.plan);
              setUndo(null);
            }}
          >
            Undo last dungeon change
          </button>
        )}
      </header>
      <p>
        Choose a trip to add preparation alongside your route. Quest state is confirmed separately
        from instruction checkmarks. Your source order and bookmarks stay unchanged.
      </p>
      <p className={styles.note}>
        Reference data · current-build reward XP unconfirmed. A listed dungeon is not automatically
        recommended. At level is the minimum run level, even with a premade party. You can prepare
        quests earlier, but their pickup minimums never authorize an earlier run.
      </p>
      {!loaded && <p role="status">Loading saved dungeon plans…</p>}
      {loaded && !matching && (
        <p className={styles.notice}>
          Save a character first to plan trips and record quest state.
        </p>
      )}
      {!visitIds && (
        <label>
          <input
            type="checkbox"
            checked={showFuture}
            onChange={(event) => setShowFuture(event.target.checked)}
          />{" "}
          Show future and reference-only visits through 60
        </label>
      )}
      <div className={styles.visits}>
        {visits.map((visit) => {
          const allowed = visit.questIds.filter((id) => {
            const quest = getDungeonQuest(id);
            return quest && dungeonQuestCompatibility(quest, profile) === "match";
          });
          const selected = plan.selectedQuests[visit.id] ?? defaultDungeonBundle(visit, profile);
          const rewardQuestIds = new Set(dungeonRewardQuestIds(selected, plan));
          const state = plan.visits[visit.id];
          const target = profile.pace === "relaxed" ? visit.levels?.easy : visit.levels?.atLevel;
          const schedule = scheduleDungeonVisit(
            visit,
            profile,
            selected.map((id) => getDungeonQuest(id)!),
          );
          const unavailable =
            schedule.state === "reference-only" || visit.groupSize !== 5 || !visit.questIds.length;
          return (
            <details key={visit.id} className={styles.visit} id={`dungeon-visit-${visit.id}`}>
              <summary>
                <span>
                  {visit.name}
                  <small>
                    {visit.levels ? `At level ${visit.levels.atLevel}` : "Visit band unconfirmed"} ·{" "}
                    {allowed.length} applicable quests ·{" "}
                    {unavailable ? "Reference only / coverage pending" : `Target ${target}`}
                  </small>
                </span>
                <span className={styles.badge}>
                  {state === "planned"
                    ? "Planned"
                    : state === "deferred"
                      ? "Not now"
                      : state === "finished"
                        ? "Visit finished"
                        : "Optional"}
                </span>
              </summary>
              {visit.levels && (
                <p>
                  Earliest run: level {schedule.level}. Reference At level {visit.levels.atLevel} ·
                  Easy {visit.levels.easy}. Selected quest minimums can move the run later, never
                  earlier. Pickups can be prepared separately.
                </p>
              )}
              {visit.levels && visit.levels.atLevel > LEVELING_EVIDENCE.betaLevelCap && (
                <p className={styles.notice}>
                  Reference target is above the reviewed beta cap of{" "}
                  {LEVELING_EVIDENCE.betaLevelCap}. No automatic recommendation.
                </p>
              )}
              {visit.notes.map((note) => (
                <p className={styles.note} key={note}>
                  {note}
                </p>
              ))}
              {profile.party.size !== 5 || profile.party.readiness !== "together" ? (
                <p className={styles.note}>
                  Keep questing while you recruit. Include actual idle waiting and travel; sharing
                  does not bypass requirements.
                </p>
              ) : (
                <p className={styles.note}>
                  Five together removes recruitment delay only. Check every player's level, quests,
                  starting items, tank and healer.
                </p>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={!matching || unavailable || allowed.length === 0}
                  onClick={() =>
                    change((current) => ({
                      ...current,
                      visits: { ...current.visits, [visit.id]: "planned" },
                      selectedQuests: { ...current.selectedQuests, [visit.id]: [...selected] },
                    }))
                  }
                >
                  Plan trip
                </button>
                <button
                  type="button"
                  disabled={!matching}
                  onClick={() =>
                    change((current) => ({
                      ...current,
                      visits: { ...current.visits, [visit.id]: "deferred" },
                    }))
                  }
                >
                  Not now
                </button>
                {state === "planned" && (
                  <button
                    type="button"
                    onClick={() =>
                      change((current) => ({
                        ...current,
                        visits: { ...current.visits, [visit.id]: "finished" },
                      }))
                    }
                  >
                    Mark visit finished
                  </button>
                )}
              </div>
              {!visit.questIds.length ? (
                <p>
                  Quest lifecycle coverage for this wing is not published yet. It cannot produce a
                  profitable or faster-run ranking.
                </p>
              ) : (
                <>
                  <fieldset className={styles.bundle}>
                    <legend>Choose your quest bundle</legend>
                    {visit.questIds.map((id) => {
                      const quest = getDungeonQuest(id)!;
                      const eligibility = dungeonQuestCompatibility(quest, profile);
                      if (eligibility === "exclude") return null;
                      return (
                        <label key={id}>
                          <input
                            type="checkbox"
                            disabled={!matching || eligibility !== "match"}
                            checked={selected.includes(id)}
                            onChange={(event) =>
                              change((current) => ({
                                ...current,
                                selectedQuests: {
                                  ...current.selectedQuests,
                                  [visit.id]: event.target.checked
                                    ? [...selected, id]
                                    : selected.filter((value) => value !== id),
                                },
                              }))
                            }
                          />{" "}
                          {quest.title}{" "}
                          <small>
                            #{id}
                            {eligibility === "unknown"
                              ? quest.restrictionsKnown
                                ? " · Select class to resolve"
                                : " · Eligibility reference incomplete"
                              : ""}
                            {quest.pickupStage === "inside" ? " · Starts inside" : ""}
                            {quest.pickupStage === "after" ? " · Later stage" : ""}
                          </small>
                        </label>
                      );
                    })}
                  </fieldset>
                  <div className={styles.itinerary}>
                    <h3>Before entry → Inside → Turn-ins → Rejoin</h3>
                    {dungeonPrerequisiteClosure(selected, plan).map((quest) => {
                      const value = plan.questStates[String(quest.id)] ?? "unknown";
                      return (
                        <article key={quest.id} className={styles.quest}>
                          <div className={styles.questHeading}>
                            <a
                              href={`https://www.wowhead.com/forever/quest=${quest.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {quest.title} · #{quest.id} ↗
                            </a>
                            <span>
                              {quest.minimumLevel === null
                                ? "Minimum unknown"
                                : `Pickup ${quest.minimumLevel}+`}
                            </span>
                          </div>
                          <p className={styles.status}>
                            {dungeonQuestReadiness(quest, profile, plan)}
                          </p>
                          {!rewardQuestIds.has(quest.id) && (
                            <p className={styles.notice}>
                              Accept-only prerequisite for this bundle. Its dungeon objectives and
                              reward XP are not counted unless you also select that quest.
                            </p>
                          )}
                          {quest.position && (
                            <p className={styles.note}>
                              Reference pickup · map {quest.position.mapId} ·{" "}
                              {quest.position.x.toFixed(1)}, {quest.position.y.toFixed(1)}. Verify
                              the NPC and floor in game.
                            </p>
                          )}
                          <p>
                            <strong>
                              {quest.pickupStage === "inside"
                                ? "Start inside"
                                : quest.pickupStage === "after"
                                  ? "Later pickup"
                                  : "Pickup"}
                              :
                            </strong>{" "}
                            {quest.pickup ?? "Location unconfirmed"}
                          </p>
                          {quest.objective && (
                            <p>
                              <strong>
                                {quest.objectiveStage === "multiple-visits"
                                  ? "Multiple visits"
                                  : "Objective"}
                                :
                              </strong>{" "}
                              {quest.objective}
                            </p>
                          )}
                          <p>
                            <strong>Turn in:</strong> {quest.turnin ?? "Location unconfirmed"}. XP
                            is earned here, not at the kill.
                          </p>
                          <p className={styles.note}>
                            Requires: {describeDungeonGate(quest.gate)}. Sharing:{" "}
                            {quest.shareable === null
                              ? "unknown"
                              : quest.shareable
                                ? "reference says yes; eligibility still required"
                                : "reference says no"}
                            .
                          </p>
                          {quest.notes.map((note) => (
                            <p key={note} className={styles.notice}>
                              {note}
                            </p>
                          ))}
                          <div className={styles.controls}>
                            <label>
                              Confirmed game state
                              <select
                                value={value}
                                disabled={!matching}
                                aria-label={`${quest.title} (${quest.id}) game state`}
                                onChange={(event) =>
                                  change((current) => ({
                                    ...current,
                                    questStates: {
                                      ...current.questStates,
                                      [quest.id]: event.target.value as DungeonQuestState,
                                    },
                                  }))
                                }
                              >
                                {dungeonQuestStates.map((state) => (
                                  <option key={state} value={state}>
                                    {names[state]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {quest.position && onLocation && (
                              <button type="button" onClick={() => onLocation(quest.id)}>
                                Show pickup on map
                              </button>
                            )}
                          </div>
                          {dungeonGateConfirmations(quest.gate).map((gate) => (
                            <label key={gate.id} className={styles.check}>
                              <input
                                type="checkbox"
                                disabled={!matching}
                                checked={plan.confirmations[gate.id] === true}
                                onChange={(event) =>
                                  change((current) => ({
                                    ...current,
                                    confirmations: {
                                      ...current.confirmations,
                                      [gate.id]: event.target.checked,
                                    },
                                  }))
                                }
                              />{" "}
                              {gate.label}
                            </label>
                          ))}
                          {quest.requiredItems.map((item) => (
                            <label key={item.id} className={styles.check}>
                              <input
                                type="checkbox"
                                disabled={!matching}
                                checked={plan.confirmations[`item-${item.id}`] === true}
                                onChange={(event) =>
                                  change((current) => ({
                                    ...current,
                                    confirmations: {
                                      ...current.confirmations,
                                      [`item-${item.id}`]: event.target.checked,
                                    },
                                  }))
                                }
                              />{" "}
                              Held:{" "}
                              <a
                                href={`https://www.wowhead.com/forever/item=${item.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {item.title}
                              </a>
                            </label>
                          ))}
                          <label className={styles.check}>
                            <input
                              type="checkbox"
                              disabled={!matching}
                              checked={plan.retainedQuestIds.includes(quest.id)}
                              onChange={(event) =>
                                change((current) => ({
                                  ...current,
                                  retainedQuestIds: event.target.checked
                                    ? [...new Set([...current.retainedQuestIds, quest.id])]
                                    : current.retainedQuestIds.filter((id) => id !== quest.id),
                                }))
                              }
                            />{" "}
                            Already part of my outdoor route — do not count its XP again
                          </label>
                          <p className={styles.note}>
                            Current XP: unknown
                            {quest.referenceXp !== null
                              ? ` · offline reference ${quest.referenceXp.toLocaleString()} XP (not current server XP)`
                              : " · no offline XP evidence either"}
                            .
                          </p>
                          {quest.rewards.fixed.length > 0 && (
                            <p>
                              Fixed rewards:{" "}
                              {quest.rewards.fixed.map((item, index) => (
                                <span key={item.id}>
                                  {index > 0 ? " + " : ""}
                                  <a href={`/forever/encyclopedia/items/${item.id}`}>
                                    {item.title}
                                  </a>{" "}
                                  <a
                                    href={`https://www.wowhead.com/forever/item=${item.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    ↗
                                  </a>
                                </span>
                              ))}
                            </p>
                          )}
                          {quest.rewards.choices.length > 0 && (
                            <fieldset className={styles.rewards}>
                              <legend>Choose ONE reward — not all alternatives</legend>
                              {quest.rewards.choices.map((item) => (
                                <label key={item.id}>
                                  <input
                                    type="radio"
                                    name={`reward-${sessionId}-${visit.id}-${quest.id}`}
                                    disabled={!matching}
                                    checked={plan.rewardChoices[String(quest.id)] === item.id}
                                    onChange={() =>
                                      change((current) => ({
                                        ...current,
                                        rewardChoices: {
                                          ...current.rewardChoices,
                                          [quest.id]: item.id,
                                        },
                                      }))
                                    }
                                  />{" "}
                                  <a href={`/forever/encyclopedia/items/${item.id}`}>
                                    {item.title}
                                  </a>{" "}
                                  <a
                                    href={`https://www.wowhead.com/forever/item=${item.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`${item.title} on Wowhead`}
                                  >
                                    ↗
                                  </a>
                                </label>
                              ))}
                            </fieldset>
                          )}
                          {[...quest.rewards.fixed, ...quest.rewards.choices].map((item) => (
                            <LevelingRewardPreviewCard
                              key={item.id}
                              itemId={item.id}
                              name={item.title}
                            />
                          ))}
                        </article>
                      );
                    })}
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        disabled={!matching}
                        checked={plan.confirmations[`${visit.id}-quest-log-space`] === true}
                        onChange={(event) =>
                          change((current) => ({
                            ...current,
                            confirmations: {
                              ...current.confirmations,
                              [`${visit.id}-quest-log-space`]: event.target.checked,
                            },
                          }))
                        }
                      />{" "}
                      I checked quest-log space and required quest-start items for this bundle
                    </label>
                    <p className={styles.note}>
                      A visit-finished mark does not turn in these quests. Follow the hand-ins
                      above, then resume your unchanged source step. Incomplete chains and
                      multi-dungeon materials stay pending.
                    </p>
                    {onRejoin && (
                      <button type="button" onClick={onRejoin}>
                        Rejoin current route step
                      </button>
                    )}
                  </div>
                  <DungeonComparisonForm
                    key={`${sessionId ?? "unsaved"}-${visit.id}`}
                    visit={visit}
                    selected={selected}
                    profile={profile}
                    plan={plan}
                    sessionId={matching?.id ?? null}
                  />
                </>
              )}
            </details>
          );
        })}
      </div>
      <p className={styles.note}>
        Sources:{" "}
        <a
          href="https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location"
          target="_blank"
          rel="noopener noreferrer"
        >
          Forever dungeon reference
        </a>{" "}
        · supplemental quest facts: ForeverDungeonJournal 1.4.4 · reviewed beta availability:
        October 1. Item rewards are reference identities, not confirmed current loot or automatic
        gear upgrades.
      </p>
    </section>
  );
}

interface ComparisonProps {
  readonly visit: DungeonVisit;
  readonly selected: readonly number[];
  readonly profile: CharacterProfile;
  readonly plan: PersonalDungeonPlan;
  readonly sessionId: string | null;
}
function DungeonComparisonForm({
  visit,
  selected,
  profile,
  plan,
  sessionId,
}: ComparisonProps): React.JSX.Element {
  const { setDungeonPlan } = useLeveling();
  type Scenario = PersonalDungeonPlan["scenarios"][string];
  const [local, setLocal] = useState<Scenario>({
    mode: "extra-chain",
    referenceOnly: false,
    fields: {},
  });
  const scenario = sessionId
    ? (plan.scenarios[visit.id] ?? {
        mode: "extra-chain" as const,
        referenceOnly: false,
        fields: {},
      })
    : local;
  const { mode, fields, referenceOnly: reference } = scenario;
  function changeScenario(next: Scenario): void {
    if (sessionId)
      setDungeonPlan(sessionId, (current) => ({
        ...current,
        scenarios: { ...current.scenarios, [visit.id]: next },
      }));
    else setLocal(next);
  }
  function input(name: keyof Scenario["fields"], label: string): React.JSX.Element {
    return (
      <label>
        {label}
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="1000000000"
          step="any"
          value={fields[name] ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            if (value.length <= 24)
              changeScenario({ ...scenario, fields: { ...fields, [name]: value } });
          }}
        />
      </label>
    );
  }
  const min = parseNumber(fields.min ?? ""),
    max = parseNumber(fields.max ?? ""),
    rate = parseNumber(fields.rate ?? ""),
    outdoorTime = parseNumber(fields.outdoorTime ?? "");
  const invalid = min !== null && max !== null && max < min;
  const result =
    !invalid && min !== null && max !== null
      ? compareDungeonPlan({
          visit,
          profile,
          plan,
          questIds: selected,
          mode,
          segments: [
            {
              id: `${visit.id}-incremental-trip`,
              minutes: { minimum: min, maximum: max },
              retained: false,
            },
          ],
          useReferenceXp: reference,
          killXp: parseNumber(fields.kills ?? "", true),
          outdoorXpPerHour: rate && rate > 0 ? { minimum: rate, maximum: rate } : null,
          omittedOutdoorXp: parseNumber(fields.outdoorXp ?? "", true),
          omittedOutdoorMinutes:
            outdoorTime === null ? null : { minimum: outdoorTime, maximum: outdoorTime },
        })
      : null;
  return (
    <details className={styles.comparison}>
      <summary>Is the trip or extra chain worth my time?</summary>
      <p>
        Scenario calculator, not a live recommendation. Per-player XP only. Include shared travel
        once, extra rooms, preparation, recovery and hand-ins. Productive questing while recruiting
        is not idle waiting.
      </p>
      <label>
        Decision
        <select
          aria-label="Decision"
          value={mode}
          onChange={(event) =>
            changeScenario({
              ...scenario,
              mode: event.target.value as "whole-trip" | "extra-chain",
            })
          }
        >
          <option value="extra-chain">Already going — additional quest bundle</option>
          <option value="whole-trip">Whole trip versus outdoor route</option>
        </select>
      </label>
      <div className={styles.fields}>
        {input("rate", "My outdoor XP/hour")}
        {input("min", "Extra minutes — optimistic")}
        {input("max", "Extra minutes — conservative")}
        {mode === "whole-trip" && (
          <>
            {input("kills", "Per-player dungeon kill XP")}
            {input("outdoorXp", "Outdoor XP replaced")}
            {input("outdoorTime", "Outdoor minutes replaced")}
          </>
        )}
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={reference}
          onChange={(event) => changeScenario({ ...scenario, referenceOnly: event.target.checked })}
        />{" "}
        Use outdated offline XP for an illustrative scenario only. Do not treat it as current
        rewards.
      </label>
      {invalid && <p role="alert">Conservative time must be at least the optimistic time.</p>}
      {!result && !invalid && <p>Enter both time bounds to compare; blank evidence is not zero.</p>}
      {result && (
        <div className={styles.notice} role="status">
          <strong>
            {result.state === "scenario"
              ? result.decision === "worthwhile"
                ? "Worth adding in this reference scenario"
                : result.decision === "not-for-speed"
                  ? "Not worthwhile for XP speed in this scenario"
                  : "Conditional — time estimates change the outcome"
              : "No recommendation — evidence or gates missing"}
          </strong>
          <p>
            Extra time {result.minutes.minimum}–{result.minutes.maximum} min · Added XP{" "}
            {result.addedXp === null ? "unknown" : result.addedXp.toLocaleString()}.
          </p>
          {result.breakEvenMinutes && (
            <p>
              XP-only break-even: {result.breakEvenMinutes.minimum.toFixed(1)}–
              {result.breakEvenMinutes.maximum.toFixed(1)} extra minutes.
            </p>
          )}
          {result.timeSaved && (
            <p>
              Time saved at an equal XP goal: {result.timeSaved.minimum.toFixed(1)}–
              {result.timeSaved.maximum.toFixed(1)} min.
            </p>
          )}
          {result.reasons.length > 0 && (
            <ul>
              {result.reasons.map((reason, index) => (
                <li key={`${index}-${reason}`}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className={styles.note}>
        Cash, reputation and gear upgrades are not assigned invented XP weights. Reward links use
        the Forever item catalog; no vendor/AH profit is assumed for an item you keep.
      </p>
    </details>
  );
}
