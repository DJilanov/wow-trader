"use client";

import { useEffect, useState } from "react";
import {
  classSlugs,
  compareBranches,
  createThanesBranch,
  DUNGEON_LEVELS,
  FOREVER_XP_CURVE,
  missingPrerequisites,
  parseNumericInput,
  planDungeonLevel,
  type BranchComparison,
  type LevelingRoute,
  type XpActivity,
} from "@wow-trader/leveling";

import {
  createPlannerState,
  readPlannerState,
  type LevelingField,
  type LevelingPlannerState,
} from "../lib/leveling-planner-state";
import styles from "./forever-leveling-planner.module.css";
import { LEGACY_PLANNER_STORAGE_KEY } from "../lib/leveling-experience";

interface ForeverLevelingPlannerProps {
  readonly route: LevelingRoute;
  readonly storageKey?: string;
}
const CROWD_MULTIPLIERS = { quiet: 1, busy: 1.5, severe: 2 } as const;
const FIELD_LABELS: Record<LevelingField, string> = {
  level: "Current level",
  currentXp: "Current XP into this level",
  preDungeonXp: "Retained XP earned before entry",
  afterDungeonXp: "Retained XP earned after the return",
  outdoorMinutes: "Remaining outdoor minutes · quiet traffic",
  clear: "Dungeon clear minutes",
  travel: "Extra travel minutes · including the return",
  pickups: "Extra pickup minutes",
  idleWait: "Idle group wait minutes",
  prerequisites: "Extra prerequisite minutes",
  turnins: "Extra turn-in minutes",
  omittedKillXp: "Remaining outdoor kill / exploration XP lost",
  dungeonKillXp: "Additional dungeon kill XP",
  prerequisiteXp: "Additional prerequisite XP",
  alternativeXpPerHour: "Achievable catch-up XP per hour",
};

export function ForeverLevelingPlanner({
  route,
  storageKey = LEGACY_PLANNER_STORAGE_KEY,
}: ForeverLevelingPlannerProps): React.JSX.Element {
  const [state, setState] = useState<LevelingPlannerState>(createPlannerState);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get("plan");
    let restored = readPlannerState(shared);
    if (!shared) {
      try {
        restored = readPlannerState(localStorage.getItem(storageKey));
        setLegacyAvailable(
          storageKey !== LEGACY_PLANNER_STORAGE_KEY &&
            readPlannerState(localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY)) !== null,
        );
      } catch {
        setNotice("Browser storage is unavailable. You can still use and share the planner.");
      }
    } else if (!restored) setNotice("That shared plan is invalid. Start with a fresh comparison.");
    setState(restored ? { ...restored, applied: false } : createPlannerState());
    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      setNotice(
        "Browser storage is unavailable. Calculations remain usable, but this comparison will not be saved.",
      );
    }
  }, [loadedKey, state, storageKey]);

  function importLegacyComparison(): void {
    try {
      const restored = readPlannerState(localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY));
      if (!restored) {
        setNotice("The legacy comparison is no longer available or is invalid.");
        return;
      }
      setState({ ...restored, applied: false });
      setLegacyAvailable(false);
      setNotice(
        "Legacy comparison copied for this character. The original saved comparison has been preserved; review its character and quest choices.",
      );
    } catch {
      setNotice("Browser storage is unavailable. The legacy comparison could not be read.");
    }
  }

  const dungeon = DUNGEON_LEVELS.find((entry) => entry.id === state.dungeonId)!;
  const knownIds = new Set(route.quests.map((quest) => quest.id));
  const selectedIds = state.selectedQuestIds.filter(
    (id) => dungeon.questIds.includes(id) && !state.completedQuestIds.includes(id),
  );
  const visitLevel = planDungeonLevel(dungeon, selectedIds, route.quests);
  const prerequisites = [
    ...new Set(
      selectedIds.flatMap((id) =>
        missingPrerequisites(
          id,
          new Set([...state.readyQuestIds, ...state.completedQuestIds]),
          route.quests,
        ),
      ),
    ),
  ];
  const requiredIds = [
    ...new Set(selectedIds.flatMap((id) => missingPrerequisites(id, new Set(), route.quests))),
  ];
  const numbers = Object.fromEntries(
    Object.entries(state.fields).map(([key, value]) => [
      key,
      parseNumericInput(
        value,
        ![
          "outdoorMinutes",
          "clear",
          "travel",
          "pickups",
          "idleWait",
          "prerequisites",
          "turnins",
          "alternativeXpPerHour",
        ].includes(key),
      ),
    ]),
  ) as Record<LevelingField, number | null>;
  const requiredFields = Object.keys(FIELD_LABELS) as LevelingField[];
  const emptyFields = requiredFields.filter((key) => numbers[key] === null);
  const completed = new Set(state.completedQuestIds);
  const added: XpActivity[] = selectedIds.map((id) => ({
    id: `quest-${id}`,
    questId: id,
    xp: state.retainedQuestIds.includes(id)
      ? 0
      : parseNumericInput(state.rewards[String(id)] ?? "", true),
  }));
  added.push(
    { id: "dungeon-kills", xp: numbers.dungeonKillXp },
    { id: "new-prerequisites", xp: numbers.prerequisiteXp },
  );
  const omitted: XpActivity[] = state.omittedQuestIds
    .filter((id) => route.omittedCandidates.includes(id) && !completed.has(id))
    .map((id) => ({
      id: `quest-${id}`,
      questId: id,
      xp: parseNumericInput(state.rewards[String(id)] ?? "", true),
    }));
  omitted.push({ id: "outdoor-shared-kills", xp: numbers.omittedKillXp });
  const addedXp = added.some((entry) => entry.xp === null)
    ? null
    : added.reduce((sum, entry) => sum + (entry.xp ?? 0), 0);
  const omittedXp = omitted.some((entry) => entry.xp === null)
    ? null
    : omitted.reduce((sum, entry) => sum + (entry.xp ?? 0), 0);
  const catchupXp =
    addedXp === null || omittedXp === null ? null : Math.max(0, omittedXp - addedXp);
  const result: BranchComparison | null = emptyFields.length
    ? null
    : compareBranches({
        level: numbers.level!,
        currentXp: numbers.currentXp!,
        curve: FOREVER_XP_CURVE,
        omitted,
        added,
        completedQuestIds: state.completedQuestIds,
        outdoorMinutes: numbers.outdoorMinutes! * CROWD_MULTIPLIERS[state.crowd],
        time: {
          clear: numbers.clear!,
          travel: numbers.travel!,
          pickups: numbers.pickups!,
          idleWait: numbers.idleWait!,
          prerequisites: numbers.prerequisites!,
          turnins: numbers.turnins!,
        },
        alternativeXpPerHour: numbers.alternativeXpPerHour!,
        checkpoints: [
          { id: "Before entry", level: visitLevel, cumulativeEarnedXp: numbers.preDungeonXp },
          {
            id: "Route continuation after catch-up",
            level: Math.max(15, visitLevel),
            cumulativeEarnedXp:
              addedXp === null || catchupXp === null
                ? null
                : numbers.preDungeonXp! + addedXp + numbers.afterDungeonXp! + catchupXp,
          },
        ],
      });
  const supported = state.faction === route.faction && route.classes.includes(state.classSlug);
  const outsideSlice = visitLevel > route.maximumLevel;
  const characterWithinSlice =
    numbers.level !== null &&
    numbers.level >= route.minimumLevel &&
    numbers.level <= route.maximumLevel;
  const canApply =
    supported &&
    characterWithinSlice &&
    !outsideSlice &&
    !prerequisites.length &&
    result?.state === "complete" &&
    result.savedMinutes !== null &&
    result.savedMinutes > 0;
  const applied = state.applied && canApply;

  function update(patch: Partial<LevelingPlannerState>): void {
    setState((previous) => ({ ...previous, ...patch, applied: false }));
  }
  function toggle(
    key:
      | "selectedQuestIds"
      | "omittedQuestIds"
      | "completedQuestIds"
      | "retainedQuestIds"
      | "readyQuestIds",
    id: number,
  ): void {
    if (!knownIds.has(id)) return;
    update({
      [key]: state[key].includes(id)
        ? state[key].filter((entry) => entry !== id)
        : [...state[key], id],
    });
  }
  function input(key: LevelingField): React.JSX.Element {
    return (
      <label className={styles.field} key={key}>
        <span>{FIELD_LABELS[key]}</span>
        <input
          type="number"
          min={0}
          max={key === "level" ? 30 : undefined}
          step={
            key === "level" || (key.toLowerCase().includes("xp") && key !== "alternativeXpPerHour")
              ? 1
              : "any"
          }
          inputMode="decimal"
          value={state.fields[key]}
          placeholder="Enter your value"
          onChange={(event) => update({ fields: { ...state.fields, [key]: event.target.value } })}
        />
      </label>
    );
  }
  async function share(): Promise<void> {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("plan", JSON.stringify({ ...state, applied: false }));
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice(
        "Plan link copied. It includes your estimates and quest choices, with no character identity.",
      );
    } catch {
      setNotice("Your plan is in the address bar. Copy that URL to share it.");
    }
  }

  return (
    <section className={styles.planner} id="planner" aria-labelledby="planner-heading">
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">Your remaining work</span>
          <h2 id="planner-heading">Is the dungeon detour worth it?</h2>
        </div>
        <button className={styles.button} onClick={share}>
          Share this plan
        </button>
      </div>
      <p className={styles.muted}>
        Enter rewards shown by your current beta character. All times are editable estimates; 25
        minutes is an initial clear assumption. Keep kills and travel shared by several quests in
        one block.
      </p>
      {notice ? (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      ) : null}
      {legacyAvailable && (
        <button type="button" className={styles.button} onClick={importLegacyComparison}>
          Load legacy Westfall comparison
        </button>
      )}
      <div className={styles.character}>
        <label className={styles.field}>
          <span>Faction</span>
          <select
            aria-label="Faction"
            value={state.faction}
            onChange={(event) =>
              update({ faction: event.target.value === "horde" ? "horde" : "alliance" })
            }
          >
            <option value="alliance">Alliance</option>
            <option value="horde">Horde</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Class</span>
          <select
            aria-label="Class"
            value={state.classSlug}
            onChange={(event) => {
              const selected = classSlugs.find((entry) => entry === event.target.value);
              if (selected) update({ classSlug: selected });
            }}
          >
            {classSlugs.map((entry) => (
              <option key={entry} value={entry}>
                {entry[0]!.toUpperCase() + entry.slice(1)}
              </option>
            ))}
          </select>
        </label>
        {input("level")}
        {input("currentXp")}
      </div>
      {!supported ? (
        <div className={styles.notice} role="status">
          This release covers Alliance Westfall. The Horde route is not available yet.
        </div>
      ) : (
        <>
          <p className={styles.muted}>
            This is a class-neutral quest and travel preview. Keep your class training and unlocks;
            it does not estimate class-specific damage or clear speed.
          </p>
          <div className={styles.columns}>
            <div className={styles.panel}>
              <h3>1. Choose the visit</h3>
              <label className={styles.field}>
                <span>Dungeon alternative</span>
                <select
                  aria-label="Dungeon alternative"
                  value={state.dungeonId}
                  onChange={(event) => {
                    const id = event.target.value === "deadmines" ? "deadmines" : "thanes";
                    update({
                      dungeonId: id,
                      selectedQuestIds: id === "thanes" ? [96395, 96403] : [168, 167, 2040],
                    });
                  }}
                >
                  <option value="thanes">Hall of Thanes · At level 14</option>
                  <option value="deadmines">Deadmines · later visit at level 19</option>
                </select>
              </label>
              <div className={styles.visit}>
                <strong>Plan entry at level {visitLevel}</strong>
                <span>
                  At level {dungeon.atLevel}; selected quests need up to{" "}
                  {Math.max(
                    0,
                    ...selectedIds.map(
                      (id) => route.quests.find((quest) => quest.id === id)!.minimumLevel,
                    ),
                  )}
                  .
                </span>
              </div>
              {outsideSlice ? (
                <p className={styles.notice}>
                  This visit is beyond the Westfall 13–15 slice. Compare it for later; continue the
                  outdoor route now. Deadmines can be prepared early and cleared at 19.
                </p>
              ) : null}
              <p className={styles.muted}>
                Hard {dungeon.hard} · Medium {dungeon.medium} · At level {dungeon.atLevel} · Easy{" "}
                {dungeon.easy}. These are reference difficulty bands, not minimum entry levels.
              </p>
              {input("preDungeonXp")}
              {input("afterDungeonXp")}
              <p className={styles.muted}>
                Retained XP is work you still do on either branch. Rewards from inside the dungeon
                cannot help you reach its entry level.
              </p>
              <h4>One-time dungeon rewards</h4>
              <div className={styles.questList}>
                {dungeon.questIds.map((id) => {
                  const quest = route.quests.find((entry) => entry.id === id)!;
                  const done = completed.has(id);
                  const selected = state.selectedQuestIds.includes(id);
                  return (
                    <div key={id} className={styles.quest}>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={done}
                          onChange={() => toggle("selectedQuestIds", id)}
                        />
                        <span>
                          <strong>{quest.title}</strong>
                          <small>
                            Pickup from level {quest.minimumLevel} · {quest.pickup}
                          </small>
                        </span>
                      </label>
                      <div className={styles.questControls}>
                        <label className={styles.field}>
                          <span>{quest.title} · current reward XP</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            placeholder="Unknown"
                            value={state.rewards[String(id)] ?? ""}
                            disabled={!selected || done || state.retainedQuestIds.includes(id)}
                            onChange={(event) =>
                              update({
                                rewards: { ...state.rewards, [String(id)]: event.target.value },
                              })
                            }
                          />
                        </label>
                        <label className={styles.check}>
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => toggle("completedQuestIds", id)}
                          />
                          <span>Already completed</span>
                        </label>
                        <label className={styles.check}>
                          <input
                            type="checkbox"
                            checked={state.retainedQuestIds.includes(id)}
                            disabled={done}
                            onChange={() => toggle("retainedQuestIds", id)}
                          />
                          <span>Already planned on the original route</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              {requiredIds.length ? (
                <details className={styles.details} open>
                  <summary>Prerequisites before this visit</summary>
                  <p className={styles.muted}>
                    Mark only work that will be completed before entry. Include new preparation time
                    and XP below.
                  </p>
                  {requiredIds.map((id) => (
                    <label className={styles.check} key={id}>
                      <input
                        type="checkbox"
                        checked={state.readyQuestIds.includes(id)}
                        onChange={() => toggle("readyQuestIds", id)}
                      />
                      <span>
                        {id} · {route.quests.find((quest) => quest.id === id)!.title}
                      </span>
                    </label>
                  ))}
                </details>
              ) : null}
            </div>
            <div className={styles.panel}>
              <h3>2. Replace one outdoor block</h3>
              <p className={styles.muted}>
                Select only quests you would otherwise finish. Enter their remaining turn-in rewards
                and count shared kill XP once below.
              </p>
              <div className={styles.questList}>
                {route.omittedCandidates.map((id) => {
                  const quest = route.quests.find((entry) => entry.id === id)!;
                  const done = completed.has(id);
                  return (
                    <div className={styles.quest} key={id}>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={state.omittedQuestIds.includes(id)}
                          disabled={done}
                          onChange={() => toggle("omittedQuestIds", id)}
                        />
                        <span>
                          <strong>{quest.title}</strong>
                          <small>{quest.sharedWork}</small>
                        </span>
                      </label>
                      <div className={styles.questControls}>
                        <label className={styles.field}>
                          <span>{quest.title} · remaining reward XP</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            placeholder="Unknown"
                            disabled={done || !state.omittedQuestIds.includes(id)}
                            value={state.rewards[String(id)] ?? ""}
                            onChange={(event) =>
                              update({
                                rewards: { ...state.rewards, [String(id)]: event.target.value },
                              })
                            }
                          />
                        </label>
                        <label className={styles.check}>
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => toggle("completedQuestIds", id)}
                          />
                          <span>Already completed</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              {input("outdoorMinutes")}
              <fieldset className={styles.crowd}>
                <legend>Crowd assumption</legend>
                {(["quiet", "busy", "severe"] as const).map((entry) => (
                  <label className={styles.check} key={entry}>
                    <input
                      type="radio"
                      name="crowd"
                      value={entry}
                      checked={state.crowd === entry}
                      onChange={() => update({ crowd: entry })}
                    />
                    <span>
                      {entry} ×{CROWD_MULTIPLIERS[entry]}
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className={styles.muted}>
                Crowd factors are planning assumptions. Replace them with your observed remaining
                time; spent time and earned XP do not belong here.
              </p>
              {input("omittedKillXp")}
              {input("dungeonKillXp")}
              {input("prerequisiteXp")}
              {input("alternativeXpPerHour")}
            </div>
          </div>
          <div className={styles.panel}>
            <h3>3. Count the full detour</h3>
            <p className={styles.muted}>
              Include only time added by the visit. Idle wait excludes questing while the group
              forms; retained pickups and travel are not charged again.
            </p>
            <div className={styles.timeGrid}>
              {(
                ["clear", "travel", "pickups", "idleWait", "prerequisites", "turnins"] as const
              ).map(input)}
            </div>
          </div>
          <div className={styles.result} aria-live="polite" aria-atomic="true">
            <span className="eyebrow">Comparison</span>
            <h3>
              {emptyFields.length
                ? "Complete your estimates"
                : prerequisites.length
                  ? "Finish the required preparation"
                  : result?.state !== "complete"
                    ? "The branch needs more work"
                    : result.savedMinutes! > 0
                      ? `Estimated saving: ${formatNumber(result.savedMinutes!)} minutes`
                      : `Estimated extra time: ${formatNumber(-result.savedMinutes!)} minutes`}
            </h3>
            {emptyFields.length ? (
              <p>
                {emptyFields.length} estimate{emptyFields.length === 1 ? " is" : "s are"} missing or
                invalid: {emptyFields.map((key) => FIELD_LABELS[key]).join(", ")}.
              </p>
            ) : null}
            {prerequisites.length ? (
              <p>Quest preparation still unconfirmed: {prerequisites.join(", ")}.</p>
            ) : null}
            {result ? (
              <>
                <div className={styles.metrics}>
                  {[
                    ["Omitted XP", result.omittedXp],
                    ["Additional XP", result.addedXp],
                    ["XP shortfall", result.shortfallXp],
                    ["Detour minutes", result.detourMinutes],
                    ["Catch-up minutes", result.catchupMinutes],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <span>{label}</span>
                      <strong>{typeof value === "number" ? formatNumber(value) : "Unknown"}</strong>
                    </div>
                  ))}
                </div>
                {result.messages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
                {result.checkpoints.map((checkpoint) => (
                  <p key={checkpoint.id}>
                    {checkpoint.id} · level {checkpoint.level}:{" "}
                    {checkpoint.state === "reachable"
                      ? "reachable from your estimates"
                      : checkpoint.shortfallXp === null
                        ? "XP evidence missing"
                        : `${formatNumber(checkpoint.shortfallXp)} XP still needed`}
                    .
                  </p>
                ))}
              </>
            ) : null}
            <p>
              Uses the extracted build {route.clientBuild} XP curve; live curve confirmation and a
              route playthrough remain pending. This result depends on your inputs.
            </p>
            {!characterWithinSlice ? (
              <p>
                This route can only be applied to a character within levels {route.minimumLevel}–
                {route.maximumLevel}.
              </p>
            ) : null}
            <div className={styles.actions}>
              <button
                className={styles.button}
                disabled={!canApply}
                onClick={() =>
                  setState((previous) => ({ ...previous, applied: !previous.applied }))
                }
              >
                {applied ? "Return to the outdoor branch" : "Use this browser branch"}
              </button>
              <button
                className={styles.button}
                onClick={() => {
                  setState(createPlannerState());
                  setNotice("Planner reset.");
                  window.history.replaceState(null, "", window.location.pathname);
                }}
              >
                Reset estimates
              </button>
            </div>
            {applied ? (
              <div className={styles.branch}>
                <h4>Your selected dungeon branch</h4>
                <p className={styles.notice}>
                  Replace only the selected, unfinished outdoor tasks:{" "}
                  {route.quests
                    .filter(
                      (quest) =>
                        state.omittedQuestIds.includes(quest.id) && !completed.has(quest.id),
                    )
                    .map((quest) => quest.title)
                    .join(", ") || "none"}
                  . Preserve the Defias and any retained Toxic Soil work. The addon preview packages
                  the default level-14 bundle and still requires manual guide selection.
                </p>
                <ol>
                  {createThanesBranch(selectedIds).map((step) => (
                    <li key={step.id}>
                      <strong>{step.title}</strong>
                      <p>{step.text}</p>
                    </li>
                  ))}
                </ol>
                <p>
                  Complete {formatNumber(result?.catchupMinutes ?? 0)} estimated catch-up minutes,
                  retain the remaining outdoor work, and confirm the level-15 continuation
                  checkpoint.
                </p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}
