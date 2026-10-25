"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  PREMADE_STOPS,
  PREMADE_STAGES,
  FOREVER_XP_CURVE,
  DUNGEON_RELEASE,
  createCharacterProfile,
  emptyPremadeProgress,
  forecastPremadeMember,
  getPremadeQuest,
  getPremadeStop,
  premadePreparationQuests,
  premadeEntryLevel,
  resolveQuestReward,
  premadeCheckpointReasons,
  selectedPremadeQuests,
  premadeQuestSelected,
  getDungeonBundle,
  dungeonBundleKey,
  forecastDungeonBundle,
  updatePremadeDungeonBundle,
  advancePremadeStage,
  recordPremadeXp,
  updatePremadeQuestState,
  type PremadeProgress,
  type PremadeMember,
  type PremadeQuestChoice,
  type DungeonGate,
  type QuestRewardFact,
} from "@wow-trader/leveling";
import { useLeveling } from "./leveling-provider";
import { LevelingZoneMap } from "./leveling-zone-map";
import { LevelingEntityLinks } from "./leveling-entity-links";
import { LevelingBackupControls } from "./leveling-backup-controls";
import { LevelingDungeonBundle } from "./leveling-dungeon-bundle";
import { LevelingPartyIdentity } from "./leveling-party-identity";
import { LevelingDungeonQuestPackage } from "./leveling-dungeon-quest-package";
import type { LevelingChapterMaps } from "../lib/leveling-map-data";
import styles from "./leveling-premade.module.css";

function number(value: number): string {
  return value.toLocaleString("en-US");
}
function confirmations(
  gate: DungeonGate,
): readonly { readonly id: string; readonly label: string }[] {
  if (gate.kind === "confirmation") return [{ id: gate.id, label: gate.label }];
  if (gate.kind === "item")
    return [{ id: `item-${gate.itemId}`, label: `Required item ${gate.itemId} held` }];
  return gate.kind === "all" || gate.kind === "any" ? gate.gates.flatMap(confirmations) : [];
}

interface PartyXpProps {
  readonly member: PremadeMember;
  readonly index: number;
  readonly disabled: boolean;
  readonly onSave: (level: number, xp: number) => void;
}
export function PremadePartyXp({
  member,
  index,
  disabled,
  onSave,
}: PartyXpProps): React.JSX.Element {
  const [level, setLevel] = useState(member.level?.toString() ?? "");
  const [xp, setXp] = useState(member.currentXp?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!level.trim() || !xp.trim()) {
      setError("Enter both your actual level and XP.");
      return;
    }
    try {
      onSave(Number(level), Number(xp));
      setError(null);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "XP could not be saved.");
    }
  }
  return (
    <form
      onSubmit={submit}
      className={styles.xpRow}
      aria-label={`Actual XP for player ${index + 1}`}
    >
      <strong>Player {index + 1}</strong>
      <label>
        Level
        <input
          aria-label={`Player ${index + 1} actual level`}
          type="number"
          min={1}
          max={60}
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          disabled={disabled}
          required
        />
      </label>
      <label>
        XP in this level
        <input
          aria-label={`Player ${index + 1} actual XP`}
          type="number"
          min={0}
          max={Number(level) === 60 ? 0 : (FOREVER_XP_CURVE[Number(level)] ?? 1_000_001) - 1}
          value={xp}
          onChange={(event) => setXp(event.target.value)}
          disabled={disabled}
          required
        />
      </label>
      <button type="submit" disabled={disabled}>
        Save actual XP
      </button>
      {member.xpNeedsUpdate && member.level !== null && (
        <small className={styles.warning}>Refresh after hand-ins.</small>
      )}
      {error && (
        <small role="alert" className={styles.warning}>
          {error}
        </small>
      )}
    </form>
  );
}

interface PremadeProps {
  readonly rewardFacts?: readonly QuestRewardFact[];
  readonly revision: string;
  readonly maps: LevelingChapterMaps;
}
export function LevelingPremade({
  revision,
  maps,
  rewardFacts = [],
}: PremadeProps): React.JSX.Element {
  const { session, loaded, notice, storageStatus, saveCharacter, setDungeonPlan } = useLeveling();
  const fallback = useMemo(emptyPremadeProgress, []);
  const active = session?.profile.faction === "alliance" ? session : null;
  const progress = active?.dungeonPlans[DUNGEON_RELEASE]?.premade ?? fallback;
  const stop = getPremadeStop(progress.selectedStopId) ?? PREMADE_STOPS[0]!;
  const stopIndex = PREMADE_STOPS.findIndex((entry) => entry.id === stop.id);
  const selected = selectedPremadeQuests(stop, progress);
  const bundle =
    stop.dataStatus === "guaranteed-bundle"
      ? getDungeonBundle(stop.id, "alliance", progress.guaranteedBundles)
      : null;
  const parity = progress.parityScenarios[stop.id] ?? { extraQuests: 0, baseXp: null };
  const preparation = premadePreparationQuests(stop, progress);
  const forecasts = progress.members.map((member) =>
    forecastPremadeMember(stop, progress, member, (choice, level) =>
      resolveQuestReward(choice.questId, level, rewardFacts),
    ),
  );
  const blocked = premadeCheckpointReasons(stop, progress);
  const editable = loaded && active !== null;
  const [message, setMessage] = useState<string | null>(null);
  const [mapQuestId, setMapQuestId] = useState<number | null>(null);
  const reader = useRef<HTMLDivElement>(null);
  const stage = PREMADE_STAGES.find((entry) => entry.id === progress.selectedStage)!;
  const stageText =
    progress.selectedStage === "prepare"
      ? stop.preparation
      : progress.selectedStage === "clear"
        ? stop.clear
        : progress.selectedStage === "hand-in"
          ? stop.handIn
          : stop.bridge;
  const chosenIds = new Set([
    ...selected.map((choice) => choice.questId),
    ...preparation.map((quest) => quest.id),
  ]);
  const points = maps.points.filter((point) =>
    mapQuestId !== null
      ? point.stepId === `premade-quest-${mapQuestId}`
      : chosenIds.has(Number(point.stepId.replace("premade-quest-", ""))),
  );
  const doneCount = PREMADE_STOPS.filter(
    (entry) => progress.stages[`${entry.id}-checkpoint`],
  ).length;
  const knownTimings = PREMADE_STOPS.flatMap((entry) =>
    progress.timings[entry.id] ? [progress.timings[entry.id]!] : [],
  );
  function update(next: PremadeProgress): void {
    if (!active) {
      setMessage("Save an Alliance party plan first; existing characters are kept.");
      return;
    }
    setDungeonPlan(active.id, (current) => ({ ...current, premade: next }));
  }
  function chooseStop(id: string): void {
    const selectedStop = getPremadeStop(id);
    if (!selectedStop) return;
    update({ ...progress, selectedStopId: selectedStop.id, selectedStage: "prepare" });
    setMapQuestId(null);
    setMessage(null);
    reader.current?.scrollTo({ top: 0 });
  }
  function advance(done: boolean): void {
    try {
      update(advancePremadeStage(progress, done));
      setMapQuestId(null);
      setMessage(done ? "Task checked. Only recorded game XP changes your XP checkpoint." : null);
      reader.current?.scrollTo({ top: 0 });
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "This step could not advance.");
    }
  }
  function bulkState(id: number): void {
    let next = progress;
    for (let index = 0; index < 5; index++)
      next = updatePremadeQuestState(next, index, id, "rewarded");
    update(next);
    setMessage(
      "Recorded five reported hand-ins. Save fresh actual XP after those rewards; checkmarks do not add XP.",
    );
  }
  function renderQuest(choice: PremadeQuestChoice): React.JSX.Element {
    const quest = getPremadeQuest(choice.questId);
    if (!quest)
      return (
        <p className={styles.warning} key={choice.questId}>
          Quest identity {choice.questId} is unavailable; no instructions are inferred.
        </p>
      );
    const reward = resolveQuestReward(
      choice.questId,
      premadeEntryLevel(stop, progress),
      rewardFacts,
    );
    const paid = progress.members.filter(
      (member) => member.questStates[String(quest.id)] === "rewarded",
    ).length;
    const selectedExtra = premadeQuestSelected(choice, progress);
    const isOptional = choice.role === "opportunistic";
    const confirm = confirmations(quest.gate).filter((entry) => !entry.id.startsWith("lifecycle-"));
    return (
      <article
        className={styles.quest}
        key={`${choice.role}-${quest.id}`}
        data-premade-quest={quest.id}
      >
        <div className={styles.questHeading}>
          {isOptional && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={selectedExtra}
                disabled={!editable}
                onChange={(event) =>
                  update({
                    ...progress,
                    selectedExtras: {
                      ...progress.selectedExtras,
                      [quest.id]: event.target.checked,
                    },
                  })
                }
              />
              <span>Include</span>
            </label>
          )}
          <div>
            <h3>{quest.title}</h3>
            <span className={styles.tag}>
              {choice.role === "prerequisite"
                ? "World / earlier-stage prerequisite"
                : choice.role === "raid"
                  ? "Selected raid / key goal"
                  : choice.role === "deferred"
                    ? "Later return · not first-run XP"
                    : isOptional
                      ? "Opportunistic · do not wait for drops"
                      : "Selected core objective"}
            </span>
          </div>
          <span className={styles.reward}>
            {reward.xp === null ? "XP unconfirmed" : `${number(reward.xp)} XP`}
            <small>
              {reward.basis === "reported-forever"
                ? "Reported Forever"
                : reward.basis === "wowhead-reference"
                  ? "Wowhead Forever reference"
                  : reward.basis === "base-estimate"
                    ? "Estimated at entry level"
                    : "Unknown / overleveled"}
            </small>
          </span>
        </div>
        {quest.objective && <p>{quest.objective}</p>}
        <div className={styles.locations}>
          <span>
            Pickup: {quest.pickup ?? "Use the quest reference; exact pickup is not mapped here."}
          </span>
          <span>
            Hand-in: {quest.turnin ?? "Outside/inside delivery needs current-game verification."}
          </span>
        </div>
        {quest.minimumLevel !== null && (
          <small>
            Pickup minimum: {quest.minimumLevel} ·{" "}
            {quest.pickupStage === "inside"
              ? "Starts inside"
              : quest.pickupStage === "unknown"
                ? "Lifecycle unverified"
                : "Prepare before entry"}
          </small>
        )}
        <LevelingEntityLinks kind="quest" id={quest.id} />
        {quest.position && (
          <button type="button" onClick={() => setMapQuestId(quest.id)}>
            Show pickup on map
          </button>
        )}
        {choice.role !== "deferred" && (
          <details>
            <summary>Party quest status · {paid}/5 handed in</summary>
            <div className={styles.partyChecks}>
              {progress.members.map((member, index) => (
                <label key={index}>
                  Player {index + 1}
                  <select
                    aria-label={`Player ${index + 1} quest ${quest.id} status`}
                    disabled={!editable}
                    value={member.questStates[String(quest.id)] ?? "not-started"}
                    onChange={(event) => {
                      const state = event.target.value;
                      if (
                        state === "not-started" ||
                        state === "accepted" ||
                        state === "objectives-complete" ||
                        state === "rewarded"
                      )
                        update(updatePremadeQuestState(progress, index, quest.id, state));
                    }}
                  >
                    <option value="not-started">Not started</option>
                    <option value="accepted">Accepted</option>
                    <option value="objectives-complete">Objectives done</option>
                    <option value="rewarded">Handed in</option>
                  </select>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => bulkState(quest.id)}
              disabled={!editable || paid === 5}
            >
              Record all 5 handed in
            </button>
            {confirm.map((entry) => (
              <div className={styles.confirmation} key={entry.id}>
                <strong>{entry.label}</strong>
                <div className={styles.partyChecks}>
                  {progress.members.map((member, index) => (
                    <label className={styles.check} key={index}>
                      <input
                        type="checkbox"
                        checked={member.confirmations[entry.id] ?? false}
                        disabled={!editable}
                        onChange={(event) =>
                          update({
                            ...progress,
                            members: progress.members.map((current, i) =>
                              i === index
                                ? {
                                    ...current,
                                    confirmations: {
                                      ...current.confirmations,
                                      [entry.id]: event.target.checked,
                                    },
                                  }
                                : current,
                            ),
                          })
                        }
                      />
                      <span>Player {index + 1}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </details>
        )}
      </article>
    );
  }

  return (
    <div className={styles.page} data-premade-revision={revision}>
      <header className={styles.hero}>
        <div>
          <span className="eyebrow">Forever Leveling · Alliance review edition</span>
          <h1>Five players. One dungeon path.</h1>
          <p>
            Prepare together, clear once, deliver in batches. Skip slow drop farming—not the unlocks
            you need.
          </p>
        </div>
        <Link href="/forever/leveling">Character chapters →</Link>
      </header>
      <div className={styles.summary}>
        <span>
          <strong>21</strong> planned stops
        </span>
        <span>
          <strong>{doneCount}</strong> checked checkpoints
        </span>
        <span>3 new-dungeon data gaps</span>
        <span>
          {knownTimings.length
            ? `${knownTimings.reduce((n, t) => n + t.min, 0)}–${knownTimings.reduce((n, t) => n + t.max, 0)} min across ${knownTimings.length}/21 timed stops`
            : "Trip times need your estimates"}
        </span>
      </div>
      {!loaded && <p role="status">Loading saved party progress…</p>}
      {notice && (
        <p className={styles.warning} role="status">
          {notice}
        </p>
      )}
      {!active && loaded && (
        <div className={styles.callout}>
          <p>
            Save a separate Alliance character to keep this party plan. Existing Horde/other
            character progress is preserved.
          </p>
          <button
            type="button"
            onClick={() =>
              saveCharacter({
                ...createCharacterProfile(),
                party: { size: 5, readiness: "together", tank: "unknown", healer: "unknown" },
              })
            }
          >
            Save a five-player plan
          </button>
        </div>
      )}
      <div className={styles.toolbar}>
        <label>
          Current stop
          <select
            aria-label="Current dungeon stop"
            value={stop.id}
            disabled={!editable}
            onChange={(event) => chooseStop(event.target.value)}
          >
            {PREMADE_STOPS.map((entry, index) => (
              <option key={entry.id} value={entry.id}>
                {index + 1}. {entry.name} · {entry.level}
                {entry.dataStatus === "missing-quest-data" ? " · data pending" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Entry policy
          <select
            aria-label="Dungeon entry policy"
            value={progress.difficultyPolicy}
            disabled={!editable}
            onChange={(event) =>
              update({
                ...progress,
                difficultyPolicy:
                  event.target.value === "experienced-premade" ? "experienced-premade" : "at-level",
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
            disabled={!editable}
            onChange={(event) => update({ ...progress, raidGoals: event.target.checked })}
          />
          <span>Include MC / Onyxia preparation / key goals</span>
        </label>
      </div>
      <LevelingDungeonQuestPackage
        stopId={stop.id}
        progress={progress}
        rewardFacts={rewardFacts}
        disabled={!editable}
        onChange={update}
      />
      <details className={styles.path}>
        <summary>Your full dungeon path · quests, XP and time</summary>
        <ol>
          {PREMADE_STOPS.map((entry, index) => {
            const entryBundle =
              entry.dataStatus === "guaranteed-bundle"
                ? getDungeonBundle(entry.id, "alliance", progress.guaranteedBundles)
                : null;
            const bundleForecast = entryBundle
              ? forecastDungeonBundle(entryBundle, null, {}, (questId, level) =>
                  resolveQuestReward(questId, level, rewardFacts),
                )
              : null;
            const quests = selectedPremadeQuests(entry, progress),
              rewards = quests.map((q) =>
                resolveQuestReward(q.questId, premadeEntryLevel(entry, progress), rewardFacts),
              ),
              unknown = rewards.filter((q) => q.xp === null).length;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  disabled={!editable}
                  aria-current={stop.id === entry.id ? "step" : undefined}
                  onClick={() => chooseStop(entry.id)}
                >
                  <span>
                    {index + 1} · Level {premadeEntryLevel(entry, progress)}
                  </span>
                  <strong>{entry.name}</strong>
                  <small>
                    {entryBundle
                      ? `${entryBundle.slots.filter((slot) => slot.selected).length}/4 guaranteed slots selected · ${number((bundleForecast?.referenceXp ?? 0) + (bundleForecast?.estimatedXp ?? 0))} planning XP · IDs pending`
                      : quests.length
                        ? `${quests.length} selected quests · ${number(rewards.reduce((n, q) => n + (q.xp ?? 0), 0))} known/estimated XP${unknown ? ` + ${unknown} unknown` : ""}`
                        : "Quest bundle not verified"}
                  </small>
                  <small>
                    {progress.timings[entry.id]
                      ? `${progress.timings[entry.id]!.min}–${progress.timings[entry.id]!.max} min · your estimate`
                      : "Whole-trip time not estimated"}
                  </small>
                </button>
              </li>
            );
          })}
        </ol>
      </details>
      <div className={styles.workspace}>
        <aside className={styles.map}>
          <LevelingZoneMap
            maps={maps}
            points={points}
            stepLabel={`${stop.name} · ${stage.label}`}
          />
          <p>
            Map pins are reference pickups, not invented boss positions. The map stays here while
            your task list scrolls.
          </p>
          {mapQuestId !== null && (
            <button type="button" onClick={() => setMapQuestId(null)}>
              Show all preparation locations
            </button>
          )}
        </aside>
        <div className={styles.reader} ref={reader}>
          <div className={styles.stopHeader}>
            <span className="eyebrow">
              Stop {stopIndex + 1} of 21 · {stop.zone}
            </span>
            <h2>{stop.name}</h2>
            <div className={styles.badges}>
              <span>
                Requested {stop.level} · current policy {premadeEntryLevel(stop, progress)}
              </span>
              <span>
                {stop.dataStatus === "guaranteed-bundle"
                  ? "Four guaranteed quests · identities pending"
                  : stop.dataStatus === "missing-quest-data"
                    ? "Quest data missing"
                    : stop.dataStatus === "historical-reference"
                      ? "Historical reference · not playtested"
                      : "Journal 1.6.3 · runtime verification pending"}
              </span>
            </div>
          </div>
          {progress.difficultyPolicy === "experienced-premade" && (
            <p className={styles.warning}>
              Expert targets may be below the At-level band. A ready party does not remove
              access/pickup minima or make red bosses safe.
            </p>
          )}
          <nav className={styles.stages} aria-label="Dungeon stages">
            {PREMADE_STAGES.map((entry) => (
              <button
                type="button"
                key={entry.id}
                disabled={!editable}
                aria-current={entry.id === progress.selectedStage ? "step" : undefined}
                onClick={() => {
                  update({ ...progress, selectedStage: entry.id });
                  reader.current?.scrollTo({ top: 0 });
                }}
              >
                {progress.stages[`${stop.id}-${entry.id}`] ? "✓ " : ""}
                {entry.label}
              </button>
            ))}
          </nav>
          <section className={styles.instructions} aria-labelledby="premade-stage-heading">
            <h3 id="premade-stage-heading">{stage.label}</h3>
            <p>{stageText}</p>
          </section>
          {stop.notes.map((note) => (
            <p className={styles.note} key={note}>
              {note}
            </p>
          ))}
          {bundle && (
            <LevelingDungeonBundle
              key={dungeonBundleKey(bundle.dungeonId, bundle.faction)}
              bundle={bundle}
              dungeonName={stop.name}
              disabled={!editable}
              rewardFacts={rewardFacts}
              onChange={(next) => update(updatePremadeDungeonBundle(progress, next))}
            />
          )}
          <details className={styles.party} open={progress.selectedStage === "checkpoint"}>
            <summary>Party XP checkpoint · record all five actual bars</summary>
            <p>
              Enter current in-game values after hand-ins. Quest ticks never add XP. Rewards are per
              player, not multiplied or divided by five.
            </p>
            <LevelingPartyIdentity progress={progress} disabled={!editable} onChange={update} />
            {progress.members.map((member, index) => (
              <PremadePartyXp
                key={`${index}-${member.level}-${member.currentXp}`}
                member={member}
                index={index}
                disabled={!editable}
                onSave={(level, xp) => update(recordPremadeXp(progress, index, level, xp))}
              />
            ))}
            <div className={styles.forecasts}>
              {forecasts.map((forecast, index) => (
                <div key={index}>
                  <strong>Player {index + 1}</strong>
                  <span>
                    {number(forecast.knownQuestXp)} remaining known/estimated quest XP
                    {bundle
                      ? ` + ${number(forecast.bundleQuestXp)} guaranteed-bundle planning XP`
                      : ""}
                    {forecast.unknownQuestIds.length
                      ? ` + ${forecast.unknownQuestIds.length} unknown`
                      : ""}
                  </span>
                  <span>
                    {forecast.gapXp === null
                      ? "Actual XP needed before calculating the shortfall"
                      : `${number(forecast.gapXp)} XP gap before kills / preparation / unknown rewards`}
                  </span>
                  {forecast.endpoint && (
                    <small>
                      {bundle ? "Planning scenario" : "Known-reward scenario"}:{" "}
                      {forecast.endpoint.level} + {forecast.endpoint.percent}%
                    </small>
                  )}
                  <small className={forecast.actualReady ? styles.ready : styles.warning}>
                    {forecast.actualReady
                      ? "Actual next-level gate met · quest/item checks still apply"
                      : "Next-level gate not confirmed"}
                  </small>
                </div>
              ))}
            </div>
          </details>
          {progress.selectedStage === "prepare" && (
            <section>
              <h3>Prerequisites · completed and handed in, not just accepted</h3>
              {preparation.length ? (
                preparation.map((quest) => renderQuest({ questId: quest.id, role: "prerequisite" }))
              ) : (
                <p>
                  No additional cataloged chain for this selected scope. Check its preparation
                  instructions and item starts.
                </p>
              )}
            </section>
          )}
          {progress.selectedStage !== "checkpoint" && (
            <section>
              <h3>
                Selected quest bundle ·{" "}
                {selected.length + (bundle?.slots.filter((slot) => slot.selected).length ?? 0)}{" "}
                quests / slots
              </h3>
              {selected.map(renderQuest)}
              {selected.length === 0 && !bundle && (
                <p className={styles.warning}>
                  No verified quest IDs for this new dungeon yet. This stop is reviewable but not a
                  completed/runnable quest bundle.
                </p>
              )}
            </section>
          )}
          {progress.selectedStage === "checkpoint" && (
            <div className={styles.callout}>
              {blocked.length ? (
                <>
                  <h3>Before the next departure</h3>
                  <ul>
                    {blocked.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <h3>All five actual XP gates and recorded obligations are ready.</h3>
              )}
              <p>{stop.bridge}</p>
            </div>
          )}
          <details className={styles.extras}>
            <summary>Included quests & separate preparations · adjust your clear</summary>
            <p>
              Ordinary collection quests are included by default. Explicit exclusions stay saved.
              Prior hand-ins, cross-dungeon chains and outside farming remain separate; no repeat
              clear or guaranteed personal drop is assumed.
            </p>
            {stop.quests
              .filter((q) => q.role === "opportunistic" || q.role === "deferred")
              .map(renderQuest)}
          </details>
          <details className={styles.extras}>
            <summary>Prepare two stops ahead</summary>
            {PREMADE_STOPS.slice(stopIndex + 1, stopIndex + 3).map((next) => (
              <section key={next.id}>
                <h3>
                  {next.name} · requested {next.level}
                </h3>
                <p>{next.preparation}</p>
                <button type="button" disabled={!editable} onClick={() => chooseStop(next.id)}>
                  Review preparation
                </button>
              </section>
            ))}
          </details>
          <details className={styles.extras}>
            <summary>XP assumptions, faction-parity what-if & your trip time</summary>
            <p>
              Ordinary unknown dungeon rewards use 2.375× base with estimated rounding. Reported
              Forever rewards are not boosted again. Historical/unknown reductions remain explicit.
              Current curve: build 70205, runtime unconfirmed.
            </p>
            <form
              key={stop.id}
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget),
                  min = Number(data.get("min")),
                  max = Number(data.get("max"));
                if (
                  !Number.isInteger(min) ||
                  !Number.isInteger(max) ||
                  min < 0 ||
                  max < min ||
                  max > 10000
                ) {
                  setMessage(
                    "Enter a valid whole-trip minimum/maximum, with maximum at least minimum.",
                  );
                  return;
                }
                update({ ...progress, timings: { ...progress.timings, [stop.id]: { min, max } } });
                setMessage(
                  "Whole-trip estimate saved, including preparation, travel, clear and hand-ins.",
                );
              }}
              className={styles.timings}
            >
              <label>
                Whole-trip minimum minutes
                <input
                  name="min"
                  type="number"
                  min={0}
                  max={10000}
                  defaultValue={progress.timings[stop.id]?.min ?? ""}
                  required
                  disabled={!editable}
                />
              </label>
              <label>
                Whole-trip maximum minutes
                <input
                  name="max"
                  type="number"
                  min={0}
                  max={10000}
                  defaultValue={progress.timings[stop.id]?.max ?? ""}
                  required
                  disabled={!editable}
                />
              </label>
              <button disabled={!editable} type="submit">
                Save trip estimate
              </button>
            </form>
            <label>
              Hypothetical extra quests
              <input
                aria-label="Hypothetical faction-balancing quests"
                type="number"
                min={0}
                max={10}
                value={parity.extraQuests}
                disabled={!editable}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value >= 0 && value <= 10)
                    update({
                      ...progress,
                      parityScenarios: {
                        ...progress.parityScenarios,
                        [stop.id]: { ...parity, extraQuests: value },
                      },
                    });
                }}
              />
            </label>
            <label>
              Assumed base XP per extra quest
              <input
                aria-label="Hypothetical base quest XP"
                type="number"
                min={0}
                max={10000}
                value={parity.baseXp ?? ""}
                disabled={!editable}
                onChange={(event) => {
                  const value = event.target.value === "" ? null : Number(event.target.value);
                  if (value === null || (Number.isInteger(value) && value >= 0 && value <= 10000))
                    update({
                      ...progress,
                      parityScenarios: {
                        ...progress.parityScenarios,
                        [stop.id]: { ...parity, baseXp: value },
                      },
                    });
                }}
              />
            </label>
            <p>
              What-if only, applied to the currently viewed stop. Equal faction counts are not
              announced or guaranteed. These unnamed quests never become instructions, actual
              progress or departure permission.
            </p>
            {forecasts.some((f) => f.parityGapXp !== null) && (
              <p>
                Hypothetical gaps:{" "}
                {forecasts
                  .map(
                    (f, i) =>
                      `P${i + 1}: ${f.parityGapXp === null ? "unknown" : number(f.parityGapXp)} XP`,
                  )
                  .join(" · ")}
              </p>
            )}
          </details>
          <footer className={styles.controls}>
            <button
              type="button"
              disabled={
                !editable || (progress.selectedStage === "checkpoint" && blocked.length > 0)
              }
              onClick={() => advance(false)}
            >
              Next step
            </button>
            <button
              type="button"
              disabled={
                !editable || (progress.selectedStage === "checkpoint" && blocked.length > 0)
              }
              onClick={() => advance(true)}
            >
              {stopIndex === 20 && progress.selectedStage === "checkpoint"
                ? "Done · finish route"
                : "Done → next step"}
            </button>
            {progress.stages[`${stop.id}-${progress.selectedStage}`] && (
              <button
                type="button"
                onClick={() =>
                  update({
                    ...progress,
                    stages: { ...progress.stages, [`${stop.id}-${progress.selectedStage}`]: false },
                  })
                }
                disabled={!editable}
              >
                Undo task check
              </button>
            )}
          </footer>
          {stopIndex === 20 && progress.stages["stratholme-checkpoint"] && (
            <p className={styles.callout} role="status">
              Final checkpoint saved. All five players have reported level 60 and the selected
              hand-ins are checked. Earlier unchecked stops remain visible in your path.
            </p>
          )}
          {message && (
            <p className={styles.note} role="status">
              {message}
            </p>
          )}
        </div>
      </div>
      <div className={styles.release}>
        <p>
          Review revision {revision}. The KFC RestedXP review pack is compiled from this same route
          model. Public download remains held until build 70450 with RestedXP v4.11.26 passes the
          bounded in-game install, parser, quest-tracking, checkpoint and reload review.
        </p>
        <p>
          {storageStatus === "saved"
            ? "Party plan saved on this device."
            : storageStatus === "memory"
              ? "Storage unavailable: export a backup before leaving."
              : "Party progress saves locally after a change."}{" "}
          Browser reports are not game-verified.
        </p>
        <LevelingBackupControls />
      </div>
    </div>
  );
}
