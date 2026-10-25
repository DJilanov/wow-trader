"use client";

import { useId, useRef, useState } from "react";
import {
  DUNGEON_FINISH_OPTIONS,
  rankedDungeonFinishOptions,
  estimateDungeonFinish,
  dungeonFinishQuestRewards,
  premadeProgressSchema,
  updatePremadeQuestState,
  type CampaignPlan,
  type PremadeProgress,
  type CampaignGuideSection,
} from "@wow-trader/leveling";
import { DungeonClearForm, DungeonGearForm } from "./leveling-dungeon-finish-forms";
import { withHelperBasePath } from "../lib/site-path";
import styles from "./leveling-dungeon-finish.module.css";

interface FinishProps {
  readonly plan: CampaignPlan;
  readonly progress: PremadeProgress;
  readonly disabled: boolean;
  readonly guide?: CampaignGuideSection;
  readonly onChange: (progress: PremadeProgress) => void;
}
const format = (value: number): string => Math.round(value).toLocaleString("en-US");
export function DungeonFinishStrategy({
  progress,
  onChange,
  disabled = false,
}: {
  readonly progress: PremadeProgress;
  readonly onChange: (progress: PremadeProgress) => void;
  readonly disabled?: boolean;
}): React.JSX.Element {
  return (
    <div className={styles.strategy} role="group" aria-label="Late-game leveling strategy">
      <span>55–60 route</span>
      {(
        [
          ["dungeons", "Dungeon finish"],
          ["mixed", "Mixed quest route"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          aria-pressed={progress.dungeonFinish.strategy === value}
          onClick={() =>
            onChange({ ...progress, dungeonFinish: { ...progress.dungeonFinish, strategy: value } })
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function LevelingDungeonFinish({
  plan,
  progress,
  disabled,
  guide,
  onChange,
}: FinishProps): React.JSX.Element {
  const [tab, setTab] = useState("dungeons"),
    [player, setPlayer] = useState(0);
  const [form, setForm] = useState<"clear" | "gear" | null>(null),
    [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useId(),
    tabs = useId();
  const option = DUNGEON_FINISH_OPTIONS.find(
    (entry) => entry.id === progress.dungeonFinish.selectedDungeonId,
  )!;
  const estimate = estimateDungeonFinish(progress, option.id, plan.rewardBuild ?? plan.targetBuild);
  const ready = estimate.remainingXp.every((value) => value === 0);
  const known = estimate.remainingXp.every((value) => value !== null);
  const options = rankedDungeonFinishOptions(progress);
  const selectedMember = progress.members[player]!;
  const rewards = dungeonFinishQuestRewards(
    option,
    player === 0
      ? {
          ...selectedMember,
          classSlug: selectedMember.classSlug ?? plan.leaderClass,
          raceId: selectedMember.raceId ?? plan.race,
        }
      : selectedMember,
    plan.rewardFacts ?? [],
  );
  function update(next: PremadeProgress): void {
    try {
      onChange(premadeProgressSchema.parse(next));
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "The change could not be saved.");
    }
  }
  function open(mode: "clear" | "gear"): void {
    setForm(mode);
    dialog.current?.showModal();
  }
  function close(): void {
    dialog.current?.close();
    setForm(null);
  }
  return (
    <section className={styles.finish} aria-labelledby={heading} data-dungeon-finish="true">
      <header className={styles.heading}>
        <div>
          <span className="eyebrow">Premade 5 · {ready ? "Level 60" : "55–60"}</span>
          <h2 id={heading}>
            {ready ? "Your pre-raid gear circuit" : "Dungeon finish & gear circuit"}
          </h2>
        </div>
        <strong>{DUNGEON_FINISH_OPTIONS.length} run options</strong>
      </header>
      <dl className={styles.metrics}>
        <div>
          <dt>Largest remaining XP gap</dt>
          <dd>
            {known
              ? `${format(Math.max(...(estimate.remainingXp as number[])))} XP`
              : "Party XP not recorded"}
          </dd>
        </div>
        <div>
          <dt>{option.name} clears remaining</dt>
          <dd>
            {estimate.clears === null
              ? "No calibrated estimate"
              : estimate.clears === 0
                ? "Leveling complete"
                : `≈ ${estimate.clears}`}
          </dd>
        </div>
        <div>
          <dt>
            {estimate.samples} matching clear{estimate.samples === 1 ? "" : "s"}
          </dt>
          <dd>
            {estimate.minutes === null
              ? "Timing not measured"
              : estimate.minutes === 0
                ? "Gear targets remain optional"
                : `≈ ${format(estimate.minutes)} min`}
          </dd>
        </div>
      </dl>
      <p>
        {ready
          ? "All five recorded level 60. Continue for gear, keys or attunements; there are no mandatory leveling zones after this point."
          : "Repeat suitable dungeon routes for XP and your party's gear targets. Recommended levels are advisory; actual entry restrictions, quest pickup levels and keys still apply."}
      </p>
      {!known && guide?.forecast.members[0]?.start && (
        <p className={styles.muted}>
          Route reference entry: level {guide.forecast.members[0].start.level}. Run estimates use
          recorded party XP, not this reference.
        </p>
      )}
      <div className={styles.tabs} role="tablist" aria-label="Dungeon circuit views">
        {["dungeons", "quests", "gear", "log"].map((value) => (
          <button
            key={value}
            id={`${tabs}-${value}`}
            role="tab"
            type="button"
            aria-selected={tab === value}
            aria-controls={`${tabs}-panel`}
            tabIndex={tab === value ? 0 : -1}
            onKeyDown={(event) => {
              const values = ["dungeons", "quests", "gear", "log"],
                index = values.indexOf(tab);
              const next =
                event.key === "ArrowRight"
                  ? values[(index + 1) % 4]
                  : event.key === "ArrowLeft"
                    ? values[(index + 3) % 4]
                    : event.key === "Home"
                      ? values[0]
                      : event.key === "End"
                        ? values[3]
                        : null;
              if (next) {
                event.preventDefault();
                setTab(next);
                document.getElementById(`${tabs}-${next}`)?.focus();
              }
            }}
            onClick={() => setTab(value)}
          >
            {value === "dungeons"
              ? "Dungeons"
              : value === "quests"
                ? "First-clear quests"
                : value === "gear"
                  ? "Gear targets"
                  : "Clear log"}
          </button>
        ))}
      </div>
      <div id={`${tabs}-panel`} role="tabpanel" aria-labelledby={`${tabs}-${tab}`}>
        {tab === "dungeons" && (
          <>
            <div className={styles.options} role="radiogroup" aria-label="Next dungeon">
              {options.map((entry) => {
                const targets = progress.dungeonFinish.targets.filter(
                  (target) => target.dungeonId === entry.id && !target.obtained,
                );
                return (
                  <label
                    key={entry.id}
                    className={`${styles.option} ${option.id === entry.id ? styles.selected : ""}`}
                  >
                    <input
                      type="radio"
                      name={`${tabs}-dungeon`}
                      value={entry.id}
                      checked={option.id === entry.id}
                      onChange={() =>
                        update({
                          ...progress,
                          dungeonFinish: { ...progress.dungeonFinish, selectedDungeonId: entry.id },
                        })
                      }
                    />
                    <span>
                      <strong>{entry.name}</strong>
                      <small>
                        {entry.area} ·{" "}
                        {entry.availability === "announced"
                          ? "Announced range"
                          : "Reference recommendation"}{" "}
                        {entry.recommendedLevel}
                        {entry.recommendedLevel < 60 ? "–60" : ""}
                      </small>
                      <small>
                        {targets.length
                          ? `${targets.length} outstanding gear target${targets.length === 1 ? "" : "s"}`
                          : "No assigned gear targets"}
                        {entry.expertLevel < entry.recommendedLevel
                          ? ` · expert reference ${entry.expertLevel}+`
                          : ""}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className={styles.selectedDetail}>
              <h3>{option.name}</h3>
              <p>{option.preparation}</p>
              <a href={option.sourceUrl} target="_blank" rel="noopener noreferrer">
                {option.availability === "announced"
                  ? "Blizzard dungeon overview"
                  : "Quest and access reference"}
              </a>
              <label>
                Run scope
                <select
                  value={progress.dungeonFinish.selectedScope}
                  onChange={(event) =>
                    update({
                      ...progress,
                      dungeonFinish: {
                        ...progress.dungeonFinish,
                        selectedScope: event.target
                          .value as PremadeProgress["dungeonFinish"]["selectedScope"],
                      },
                    })
                  }
                >
                  <option value="full-clear">Full clear</option>
                  <option value="boss-loop">Boss loop</option>
                  <option value="quest-run">Quest route</option>
                </select>
              </label>
              <button type="button" disabled={disabled} onClick={() => open("clear")}>
                Record a clear
              </button>
            </div>
            <p className={styles.muted}>
              Estimates use up to five recent matching manual clears, the same catalog build, party
              setup, route scope and nearby levels. Quest rewards are removed from repeatable XP.
              Unmeasured clear XP and item drops are not assumed.
            </p>
          </>
        )}
        {tab === "quests" && (
          <>
            <div className={styles.actions}>
              <h3>{option.name}</h3>
              <label>
                Player
                <select value={player} onChange={(event) => setPlayer(Number(event.target.value))}>
                  {progress.members.map((member, index) => (
                    <option key={index} value={index}>
                      Player {index + 1}
                      {member.classSlug ? ` · ${member.classSlug}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!rewards.length ? (
              <p>
                Quest identities and reward details for this dungeon are not confirmed in the route
                catalog. No quest XP is invented.
              </p>
            ) : (
              <ul className={styles.list}>
                {rewards.map((reward) => (
                  <li key={reward.questId}>
                    <div>
                      <a
                        href={`https://www.wowhead.com/forever/quest=${reward.questId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {reward.title}
                      </a>
                      <small>
                        {reward.status === "claimed"
                          ? "Already rewarded; no repeat XP"
                          : reward.status === "level-locked"
                            ? "Pickup level not met"
                            : reward.status === "restricted"
                              ? "Not eligible for this character"
                              : reward.status === "prerequisite"
                                ? "Prerequisite still required"
                                : reward.status === "unverified"
                                  ? "Eligibility or reward needs confirmation"
                                  : "Eligible reward reference"}
                      </small>
                    </div>
                    <strong>
                      {reward.xp === null
                        ? "Not counted"
                        : reward.xp === 0
                          ? "Claimed"
                          : `≈ ${format(reward.xp)} XP`}
                    </strong>
                    <label>
                      Reported state
                      <select
                        disabled={disabled}
                        value={
                          progress.members[player]!.questStates[String(reward.questId)] ??
                          "not-started"
                        }
                        onChange={(event) =>
                          update(
                            updatePremadeQuestState(
                              progress,
                              player,
                              reward.questId,
                              event.target.value as
                                "not-started" | "accepted" | "objectives-complete" | "rewarded",
                            ),
                          )
                        }
                      >
                        <option value="not-started">Not started</option>
                        <option value="accepted">Accepted</option>
                        <option value="objectives-complete">Objectives complete</option>
                        <option
                          value="rewarded"
                          disabled={
                            reward.status === "restricted" || reward.status === "level-locked"
                          }
                        >
                          Rewarded in game
                        </option>
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.muted}>
              Quest rewards are per player and one-time. Reporting a hand-in requests a fresh XP
              update; it never adds XP to a recorded bar.
            </p>
          </>
        )}
        {tab === "gear" && (
          <>
            <div className={styles.actions}>
              <h3>Party gear targets</h3>
              <button type="button" disabled={disabled} onClick={() => open("gear")}>
                Add target
              </button>
            </div>
            {!progress.dungeonFinish.targets.length ? (
              <p>No gear targets assigned.</p>
            ) : (
              <ul className={styles.list}>
                {progress.dungeonFinish.targets.map((target) => (
                  <li key={target.id}>
                    {progress.members[target.player - 1]?.classSlug ||
                    (target.player === 1 && plan.leaderClass) ? (
                      <img
                        className={styles.portrait}
                        src={withHelperBasePath(
                          `/wow-assets/classes/${progress.members[target.player - 1]?.classSlug ?? plan.leaderClass}.jpg`,
                        )}
                        alt=""
                        width="36"
                        height="36"
                      />
                    ) : (
                      <span className={styles.portrait} aria-hidden="true">
                        P{target.player}
                      </span>
                    )}
                    <div>
                      <a
                        href={withHelperBasePath(`/forever/encyclopedia/items/${target.itemId}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {target.name}
                      </a>
                      <small>
                        Player {target.player} ·{" "}
                        {
                          DUNGEON_FINISH_OPTIONS.find((entry) => entry.id === target.dungeonId)!
                            .name
                        }{" "}
                        ·{" "}
                        {target.priority === 3 ? "High" : target.priority === 2 ? "Normal" : "Low"}{" "}
                        priority
                      </small>
                      <small>Personal target; dungeon source not independently verified</small>
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={target.obtained}
                        onChange={(event) =>
                          update({
                            ...progress,
                            dungeonFinish: {
                              ...progress.dungeonFinish,
                              targets: progress.dungeonFinish.targets.map((entry) =>
                                entry.id === target.id
                                  ? { ...entry, obtained: event.target.checked }
                                  : entry,
                              ),
                            },
                          })
                        }
                      />
                      Obtained
                    </label>
                    <button
                      type="button"
                      disabled={disabled}
                      title="Remove gear target"
                      aria-label={`Remove ${target.name} for player ${target.player}`}
                      onClick={() =>
                        update({
                          ...progress,
                          dungeonFinish: {
                            ...progress.dungeonFinish,
                            targets: progress.dungeonFinish.targets.filter(
                              (entry) => entry.id !== target.id,
                            ),
                          },
                        })
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {tab === "log" && (
          <>
            <div className={styles.actions}>
              <h3>Recorded clears</h3>
              <button type="button" disabled={disabled} onClick={() => open("clear")}>
                Record a clear
              </button>
            </div>
            {!progress.dungeonFinish.runs.length ? (
              <p>No dungeon clears recorded. XP per clear and completion time remain unmeasured.</p>
            ) : (
              <ul className={styles.list}>
                {[...progress.dungeonFinish.runs].reverse().map((run) => (
                  <li key={run.id}>
                    <div>
                      <strong>
                        {DUNGEON_FINISH_OPTIONS.find((entry) => entry.id === run.dungeonId)!.name}
                      </strong>
                      <small>
                        {new Date(run.recordedAt).toLocaleString("en-GB")} · {run.minutes} min ·{" "}
                        {run.scope.replaceAll("-", " ")}
                      </small>
                      <small>
                        {run.questXp.some((value) => value === null)
                          ? "Quest XP unknown; excluded from repeat-run calibration"
                          : "Quest rewards excluded from repeatable XP"}{" "}
                        · build {run.build}
                      </small>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      title="Remove this log entry; current XP remains unchanged"
                      aria-label={`Remove clear recorded ${run.recordedAt}`}
                      onClick={() =>
                        update({
                          ...progress,
                          dungeonFinish: {
                            ...progress.dungeonFinish,
                            runs: progress.dungeonFinish.runs.filter(
                              (entry) => entry.id !== run.id,
                            ),
                          },
                        })
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {disabled && (
        <p className={styles.muted}>
          Recording clears and gear targets requires a saved five-player route.
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        className={styles.dialog}
        onCancel={() => setForm(null)}
        aria-label={form === "gear" ? "Add gear target" : "Record dungeon clear"}
      >
        <button
          className={styles.close}
          type="button"
          aria-label="Close dialog"
          title="Close"
          onClick={close}
        >
          ×
        </button>
        {form === "clear" && (
          <DungeonClearForm plan={plan} progress={progress} onChange={onChange} onClose={close} />
        )}
        {form === "gear" && (
          <DungeonGearForm plan={plan} progress={progress} onChange={onChange} onClose={close} />
        )}
      </dialog>
    </section>
  );
}
