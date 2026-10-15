"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CAMPAIGN_XP_REVISION,
  type CampaignPlan,
  type CampaignXpSectionForecast,
  type XpPosition,
  type CampaignSectionCoverage,
  xpToCheckpoint,
  FOREVER_XP_CURVE,
} from "@wow-trader/leveling";
import { estimateChapterMinutes, formatChapterMinutes } from "../lib/leveling-chapter-path";
import styles from "./leveling-xp-budget.module.css";

function bar(value: XpPosition | null): string {
  return value ? `Level ${value.level} + ${value.currentXp.toLocaleString("en-US")} XP` : "Unknown";
}
function xpRange(values: readonly number[]): string {
  const minimum = Math.min(...values),
    maximum = Math.max(...values);
  return minimum === maximum
    ? minimum.toLocaleString("en-US")
    : `${minimum.toLocaleString("en-US")}–${maximum.toLocaleString("en-US")}`;
}

export function LevelingLibraryStatus({
  plan,
}: {
  readonly plan: CampaignPlan;
}): React.JSX.Element | null {
  if (!plan.library) return null;
  const selected = plan.library.choices.filter((choice) => choice.role !== "held");
  const kills = selected.filter(
    (choice) => choice.role === "kill-loop" && choice.objective === "shared-kills",
  ).length;
  const trophies = selected.filter((choice) => choice.objective === "named-trophy").length;
  const prerequisites = selected.filter((choice) => choice.role === "prerequisite").length;
  const nearby = selected.filter((choice) => choice.role === "nearby-quest").length;
  const available = selected.filter((choice) =>
    plan.rewardFacts?.some(
      (fact) => fact.questId === choice.questId && fact.status === "available",
    ),
  ).length;
  const farms = plan.library.choices.filter(
    (choice) => choice.role === "held" && choice.objective === "collection",
  ).length;
  return (
    <details className={styles.budget} data-library-quests={selected.length}>
      <summary>Kill-first quest backbone · {selected.length} additional quests</summary>
      <p>
        {kills} shared-kill quests · {trophies} named-target trophy quests · {nearby} nearby short
        quests · {prerequisites} chain lead-ins. Source order and pickup/objective/return stages are
        included in the quest list, not just a recommendation panel.
      </p>
      <p>
        {farms} collection-farm candidates are held. Required dungeon unlocks are retained. Named
        trophies require all five players to confirm loot/credit; no guaranteed drop rate is
        assumed.
      </p>
      <p>
        {available} / {selected.length} additional quests have published XP evidence. Missing values
        remain unresolved, not zero. Dungeon gains carry forward; unstarted XP loops become
        unnecessary when every player reaches their target. Accepted chains and required unlocks
        remain.
      </p>
    </details>
  );
}

export function LevelingRewardStatus({ plan }: { readonly plan: CampaignPlan }): React.JSX.Element {
  const router = useRouter(),
    [pending, startTransition] = useTransition();
  const handIns = new Set(
    plan.actions.flatMap((action) =>
      action.questChanges
        .filter((change) => change.state === "rewarded")
        .map((change) => change.questId),
    ),
  );
  const available =
    plan.rewardFacts?.filter((fact) => fact.status === "available" && handIns.has(fact.questId))
      .length ?? 0;
  return (
    <div className={styles.source} data-xp-evidence={available}>
      <p>
        {available} / {handIns.size} hand-ins have published Wowhead XP evidence. This is data
        coverage, not proof of reaching the next level.
      </p>
      <p>
        Route under validation. Dungeon entry levels are targets, not guaranteed chapter gains.
        Five-player planning credits 1/5 of solo kill XP per player, while each player keeps the
        full eligible quest reward. Outdoor combat uses a historical estimate, not a confirmed
        Forever payout. Unmeasured combat is excluded, not assumed to fill a gap.
      </p>
      {plan.combat && (
        <details>
          <summary>Combat reference coverage</summary>
          <p>
            {
              plan.combat.activities.filter((activity) =>
                activity.objectives.some((objective) => objective.requiredKills !== null),
              ).length
            }{" "}
            objective steps have reconciled kill quotas. Source revision{" "}
            {plan.combat.sourceRevision.slice(0, 12)}. Collection drops and current dungeon tuning
            remain separate.
          </p>
          {plan.combat.notice && <p>{plan.combat.notice}</p>}
        </details>
      )}
      {plan.rewardNotice && <p role="status">{plan.rewardNotice}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={(): void => startTransition(() => router.refresh())}
      >
        {pending ? "Refreshing XP evidence…" : "Refresh reward data"}
      </button>
    </div>
  );
}

export function LevelingChapterBudget({
  audit,
  forecast,
  pace = null,
  compact = false,
}: {
  readonly audit: CampaignSectionCoverage;
  readonly forecast: CampaignXpSectionForecast;
  readonly pace?: number | null;
  readonly compact?: boolean;
}): React.JSX.Element {
  const live = forecast.members.some(
    (member) => member.status !== "no-start" && member.status !== "before-start",
  );
  const rows = live ? forecast.members : audit.forecast.members;
  const relevant = audit.audience === "leader" ? rows.slice(0, 1) : rows;
  const values = relevant.map((member) => member.referenceQuestXp + member.estimatedQuestXp);
  const outdoorRows = relevant.flatMap((member) =>
    member.combatRows.filter((row) => row.environment === "outdoor"),
  );
  const dungeonRows = relevant.flatMap((member) =>
    member.combatRows.filter((row) => row.environment === "dungeon"),
  );
  const minimum = Math.min(...values),
    maximum = Math.max(...values);
  const xp =
    minimum === maximum
      ? minimum.toLocaleString("en-US")
      : `${minimum.toLocaleString("en-US")}–${maximum.toLocaleString("en-US")}`;
  const gaps = relevant.map((member, player) =>
    live ? member.residualXp : (audit.gapByPlayer[player] ?? null),
  );
  const remaining = gaps.some((gap) => gap === null) ? null : Math.max(...gaps.map((gap) => gap!));
  const startRequirements = relevant.map((member) =>
    member.start
      ? xpToCheckpoint(
          member.start.level,
          member.start.currentXp,
          member.targetLevel,
          FOREVER_XP_CURVE,
        )
      : null,
  );
  const required = live
    ? startRequirements.some((xp) => xp === null)
      ? null
      : Math.max(...startRequirements.map((xp) => xp!))
    : audit.requiredXp;
  const blocked = relevant.find((member) => member.blockedReason);
  const status = live
    ? blocked
      ? "blocked"
      : relevant.some((member) => member.status === "incomplete" || member.status === "no-start")
        ? "incomplete"
        : remaining
          ? "shortfall"
          : "reference-covered"
    : audit.status;
  const label =
    status === "blocked"
      ? "Progression blocked"
      : status === "incomplete"
        ? "XP coverage unresolved"
        : status === "shortfall"
          ? "More XP work needed"
          : "Modeled XP reaches target";
  return (
    <section
      className={styles.coverage}
      data-section-coverage={audit.sectionId}
      data-coverage-status={status}
      aria-label="Chapter XP budget"
    >
      <strong>{label}</strong>
      <details open={!compact} className={styles.budget}>
        <summary>Review quest + combat XP and remaining work</summary>
        <p>
          {live
            ? "From your saved current step and actual bars."
            : `Independent quest + required-combat check from level ${audit.referenceEntryLevel}, empty XP bar; earlier prerequisites are assumed. Not a continuous route forecast.`}
        </p>
        <dl className={styles.metrics}>
          <div>
            <dt>Quest hand-ins</dt>
            <dd>
              {audit.handInQuestIds.length}
              <small>{audit.availableRewardIds.length} have published XP evidence</small>
            </dd>
          </div>
          <div>
            <dt>Accounted quest XP / player</dt>
            <dd>
              {xp}
              <small>Only hand-ins reached before a blocker</small>
            </dd>
          </div>
          <div>
            <dt>Required outdoor combat / player</dt>
            <dd>
              {outdoorRows.some((row) => row.xp !== null)
                ? xpRange(relevant.map((member) => member.outdoorCombatXp))
                : "Not accounted"}
              <small>
                {outdoorRows.some((row) => row.basis === "reference-estimate")
                  ? "Lower-end historical estimate · no rested XP"
                  : outdoorRows.some((row) => row.basis === "observed")
                    ? "Matched controlled observations · no rested XP"
                    : "No resolved XP-paying kills reached before the blocker"}
              </small>
            </dd>
          </div>
          <div>
            <dt>Dungeon combat / player</dt>
            <dd>
              {dungeonRows.some((row) => row.xp !== null)
                ? xpRange(relevant.map((member) => member.dungeonCombatXp))
                : "Unmeasured"}
              <small>Requires a sourced clear path and current tuning; no flat level bonus</small>
            </dd>
          </div>
          <div>
            <dt>
              {audit.goalKind === "next-departure"
                ? "Next departure target"
                : live
                  ? "Forecast target"
                  : "Reference target"}
            </dt>
            <dd>
              Level {live ? relevant[0]!.targetLevel : audit.targetLevel}
              <small>
                {required?.toLocaleString("en-US") ?? "Unknown"} XP from{" "}
                {live ? "saved entry bars" : "the reference entry bar"}
              </small>
            </dd>
          </div>
          <div>
            <dt>Unfunded XP</dt>
            <dd>
              {remaining === null ? "Unresolved" : remaining.toLocaleString("en-US")}
              <small>
                {remaining === null
                  ? "Resolve the blocker before predicting an exit"
                  : "Remaining after the quest and combat XP accounted above"}
              </small>
            </dd>
          </div>
        </dl>
        {blocked && <p className={styles.warning}>{blocked.blockedReason}</p>}
        {forecast.skippedOptionalActionIds.length > 0 && (
          <p>
            This forecast omits {forecast.skippedOptionalActionIds.length} unstarted optional steps
            after every player reaches the departure target. Required unlocks and accepted chains
            remain. Actual saved progress is unchanged.
          </p>
        )}
        {audit.conflictingMinimumIds.length > 0 && (
          <p className={styles.warning}>
            Conflicting pickup levels: {audit.conflictingMinimumIds.join(", ")}. Conservative
            requirements remain active.
          </p>
        )}
        <p>
          Combat planning: 1/5 solo kill XP per member. Shared kills are counted once, not five
          times. Fast camp clears improve time, not reward amounts.
        </p>
        <small>
          Gap equivalent at your observed pace:{" "}
          {remaining === null
            ? "not measured"
            : formatChapterMinutes(estimateChapterMinutes(remaining, pace))}
          . This is not a travel or clear-time estimate.
        </small>
      </details>
    </section>
  );
}

export function LevelingXpBudget({
  forecast,
  plan,
}: {
  readonly forecast: CampaignXpSectionForecast;
  readonly plan?: CampaignPlan;
}): React.JSX.Element {
  const [open, setOpen] = useState(false),
    [player, setPlayer] = useState<number | null>(null);
  const selected = forecast.members.find((member) => member.player === player);
  return (
    <details
      className={styles.budget}
      data-xp-budget={forecast.sectionId}
      data-xp-forecast-revision={CAMPAIGN_XP_REVISION}
      onToggle={(event): void => setOpen(event.currentTarget.open)}
    >
      <summary>Per-player XP coverage · quests + required combat</summary>
      {open && (
        <>
          {plan && <LevelingRewardStatus plan={plan} />}
          <p>
            From the saved current step and fresh actual XP. Overflow carries forward; rewards are
            resolved at the predicted hand-in level. Required combat is included where identities,
            quotas and a payout model are available. Estimates never change saved progress.
          </p>
          <div
            className={styles.scroll}
            role="region"
            aria-label="Per-player XP forecast"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Entry bar</th>
                  <th scope="col">Quest XP</th>
                  <th scope="col">Combat XP</th>
                  <th scope="col">Subtotal exit</th>
                  <th scope="col">Gap to target</th>
                </tr>
              </thead>
              <tbody>
                {forecast.members.map((member) => (
                  <tr key={member.player}>
                    <th scope="row">Player {member.player}</th>
                    <td>{bar(member.start)}</td>
                    <td>
                      {member.referenceQuestXp.toLocaleString("en-US")} reference
                      <small>
                        {member.estimatedQuestXp
                          ? `${member.estimatedQuestXp.toLocaleString("en-US")} estimated`
                          : "No historical estimate added"}
                      </small>
                      <small>
                        {member.unknownQuestIds.length
                          ? `${member.unknownQuestIds.length} unresolved rewards so far`
                          : "No unresolved rewards"}
                      </small>
                    </td>
                    <td>
                      {member.combatXp.toLocaleString("en-US")}
                      <small>
                        {member.outdoorCombatXp.toLocaleString("en-US")} outdoor ·{" "}
                        {member.dungeonCombatXp.toLocaleString("en-US")} dungeon
                      </small>
                      <small>Reference estimate; unmeasured kills excluded</small>
                    </td>
                    <td>
                      {bar(member.endpoint)}
                      <small>
                        {member.status === "blocked"
                          ? "Blocked before completion; later rewards excluded"
                          : member.status === "incomplete"
                            ? "Incomplete scenario, not a validated exit"
                            : member.status === "before-start"
                              ? "Before the forecast starting step"
                              : member.status === "no-start"
                                ? "Record actual XP"
                                : "Quest + combat reference scenario"}
                      </small>
                    </td>
                    <td>
                      {member.residualXp === null
                        ? "Unknown"
                        : `${member.residualXp.toLocaleString("en-US")} XP`}
                      <small>Target level {member.targetLevel}</small>
                      {member.eligibilityIssues.length > 0 && (
                        <small>{member.eligibilityIssues.length} eligibility / unlock issues</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {forecast.members.some((member) => member.blockedReason) && (
            <ul className={styles.warning}>
              {forecast.members
                .filter((member) => member.blockedReason)
                .map((member) => (
                  <li key={member.player}>
                    Player {member.player}: {member.blockedReason}
                    {member.knownEndpoint && (
                      <small>
                        Last accounted bar: {bar(member.knownEndpoint)}. This is not a completed
                        exit.
                      </small>
                    )}
                  </li>
                ))}
            </ul>
          )}
          <div role="group" aria-label="Reward breakdown player">
            {forecast.members.map((member) => (
              <button
                type="button"
                key={member.player}
                aria-pressed={player === member.player}
                onClick={(): void => setPlayer(player === member.player ? null : member.player)}
              >
                Player {member.player} breakdown
              </button>
            ))}
          </div>
          {selected && (
            <>
              {selected.combatRows.length > 0 && (
                <details className={styles.budget}>
                  <summary>
                    Combat breakdown ·{" "}
                    {selected.combatRows.reduce((sum, row) => sum + row.kills, 0)} modeled target
                    kills
                  </summary>
                  <ul className={styles.rewards}>
                    {selected.combatRows.map((row, index) => (
                      <li key={`${row.activityId}-${row.npcId}-${index}`}>
                        <a
                          href={`https://www.wowhead.com/forever/npc=${row.npcId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.name}
                        </a>
                        {" · "}
                        {row.kills} kills · level {row.minimumLevel ?? "?"}
                        {row.maximumLevel !== row.minimumLevel ? `–${row.maximumLevel ?? "?"}` : ""}
                        <small>
                          {row.xp === null
                            ? "XP unmeasured; not added"
                            : `${row.xp.toLocaleString("en-US")} XP added · ${row.basis === "observed" ? "matched observations" : "reference estimate"}`}{" "}
                          · {row.environment}
                        </small>
                        <small>{row.source}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <ul>
                {[...selected.eligibilityIssues, ...selected.evidenceIssues].map((issue, index) => (
                  <li key={`${index}-${issue}`}>{issue}</li>
                ))}
              </ul>
              {selected.rewards.length ? (
                <ol className={styles.rewards}>
                  {selected.rewards.map((reward) => (
                    <li key={`${reward.actionId}-${reward.questId}`}>
                      <a
                        href={`https://www.wowhead.com/forever/quest=${reward.questId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {reward.title}
                      </a>
                      {" · "}
                      {reward.xp === null
                        ? "XP unresolved"
                        : `${reward.xp.toLocaleString("en-US")} XP`}
                      <small>
                        {reward.handInLevel === null
                          ? "Hand-in level unknown"
                          : `Hand-in level ${reward.handInLevel}`}{" "}
                        · {reward.basis.replaceAll("-", " ")}
                      </small>
                      <small>{reward.source}</small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No new reward is forecast for this player in this section.</p>
              )}
            </>
          )}
        </>
      )}
    </details>
  );
}
