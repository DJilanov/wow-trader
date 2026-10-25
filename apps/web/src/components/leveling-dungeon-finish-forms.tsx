"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  DUNGEON_FINISH_OPTIONS,
  dungeonFinishPartyKey,
  recordDungeonFinishRun,
  recordCampaignGuideXp,
  premadeProgressSchema,
  type CampaignPlan,
  type PremadeProgress,
} from "@wow-trader/leveling";
import { withHelperBasePath } from "../lib/site-path";
import styles from "./leveling-dungeon-finish.module.css";

interface FinishFormProps {
  readonly plan: CampaignPlan;
  readonly progress: PremadeProgress;
  readonly onChange: (progress: PremadeProgress) => void;
  readonly onClose: () => void;
}
const number = (data: FormData, name: string): number => {
  const value = data.get(name);
  if (typeof value !== "string" || !value.trim())
    throw new Error("Complete every required XP field.");
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Enter a valid number.");
  return parsed;
};

export function DungeonClearForm({
  plan,
  progress,
  onChange,
  onClose,
}: FinishFormProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState("");
  const option = DUNGEON_FINISH_OPTIONS.find(
    (entry) => entry.id === progress.dungeonFinish.selectedDungeonId,
  )!;
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    try {
      if (!mode) throw new Error("Choose whether quest rewards are included in this measurement.");
      const data = new FormData(event.currentTarget);
      const before = progress.members.map((_, index) => ({
        level: number(data, `before-level-${index}`),
        currentXp: number(data, `before-xp-${index}`),
      }));
      const after = progress.members.map((_, index) => ({
        level: number(data, `after-level-${index}`),
        currentXp: number(data, `after-xp-${index}`),
      }));
      const questXp = progress.members.map((_, index) => {
        if (mode === "kills") return 0;
        const value = data.get(`quest-xp-${index}`);
        return typeof value === "string" && value.trim() ? number(data, `quest-xp-${index}`) : null;
      });
      let next = recordDungeonFinishRun(progress, {
        id: crypto.randomUUID(),
        dungeonId: option.id,
        scope: progress.dungeonFinish.selectedScope,
        recordedAt: new Date().toISOString(),
        build: plan.rewardBuild ?? plan.targetBuild,
        partyKey: dungeonFinishPartyKey(progress),
        minutes: number(data, "minutes"),
        before,
        after,
        questXp,
      });
      for (let index = 0; index < 5; index++)
        next = recordCampaignGuideXp(
          plan,
          next,
          index,
          after[index]!.level,
          after[index]!.currentXp,
          "level-60-finish-dungeon-circuit",
        );
      onChange(next);
      onClose();
    } catch (cause: unknown) {
      setError(
        cause instanceof z.ZodError
          ? (cause.issues[0]?.message ?? "Check the entered XP bars.")
          : cause instanceof Error
            ? cause.message
            : "The clear could not be recorded.",
      );
    }
  }
  return (
    <form onSubmit={submit} className={styles.form}>
      <h2>Record {option.name}</h2>
      <div className={styles.formFields}>
        <label>
          Total minutes, including resets
          <input name="minutes" type="number" min="1" max="600" step="any" required />
        </label>
        <label>
          XP measurement
          <select value={mode} onChange={(event) => setMode(event.target.value)} required>
            <option value="">Choose measurement</option>
            <option value="kills">Kill XP only; no quest rewards</option>
            <option value="quests">Includes quest rewards</option>
          </select>
        </label>
      </div>
      {mode === "quests" && (
        <p>
          Unknown quest XP keeps this clear out of repeat-run estimates. Actual party progress is
          still saved.
        </p>
      )}
      {progress.members.map((member, index) => (
        <fieldset key={index} className={styles.playerFields}>
          <legend>
            Player {index + 1}
            {member.classSlug ? ` · ${member.classSlug}` : ""}
          </legend>
          <label>
            Starting level
            <input
              name={`before-level-${index}`}
              type="number"
              min="1"
              max="60"
              defaultValue={member.level ?? ""}
              required
            />
          </label>
          <label>
            Starting XP
            <input
              name={`before-xp-${index}`}
              type="number"
              min="0"
              max="1000000"
              defaultValue={member.currentXp ?? ""}
              required
            />
          </label>
          <label>
            Ending level
            <input
              name={`after-level-${index}`}
              type="number"
              min="1"
              max="60"
              defaultValue={member.level ?? ""}
              required
            />
          </label>
          <label>
            Ending XP
            <input name={`after-xp-${index}`} type="number" min="0" max="1000000" required />
          </label>
          {mode === "quests" && (
            <label>
              Quest XP included
              <input
                name={`quest-xp-${index}`}
                type="number"
                min="0"
                max="1000000"
                placeholder="Unknown"
              />
            </label>
          )}
        </fieldset>
      ))}
      <p>
        Use the XP bars shown in game. At level 60 enter zero XP. Saving does not mark any quest
        completed.
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit">Save clear</button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const itemResponseSchema = z.object({
  item: z.object({
    itemId: z.number().int().positive(),
    name: z.string().min(1).max(200),
    requiredLevel: z.number().int().nonnegative(),
    allowedClasses: z.array(z.object({ name: z.string() })),
  }),
});
function itemId(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") throw new Error("Enter a Forever item link or item ID.");
  let id = value.trim();
  if (!/^\d+$/.test(id)) {
    let url: URL;
    try {
      url = new URL(id);
    } catch {
      throw new Error("Enter a valid Wowhead Forever item link.");
    }
    if (
      url.protocol !== "https:" ||
      !["www.wowhead.com", "wowhead.com"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw new Error("Only HTTPS Wowhead Forever item links are accepted.");
    id = /^\/forever\/item=(\d+)(?:\/|$)/.exec(url.pathname)?.[1] ?? "";
  }
  return z.coerce.number().int().positive().max(10_000_000).parse(id);
}
export function DungeonGearForm({
  plan,
  progress,
  onChange,
  onClose,
}: FinishFormProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const data = new FormData(event.currentTarget),
        id = itemId(data.get("item")),
        player = number(data, "player");
      if (progress.dungeonFinish.targets.length >= 50)
        throw new Error("The party target list is full.");
      const dungeonId = String(data.get("dungeon"));
      if (
        progress.dungeonFinish.targets.some(
          (target) =>
            target.itemId === id && target.player === player && target.dungeonId === dungeonId,
        )
      )
        throw new Error("This player already has that target in this dungeon.");
      const response = await fetch(withHelperBasePath(`/api/v1/public/forever/items/${id}`), {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "That item is not in the published Forever catalog."
            : "The item catalog is temporarily unavailable. Your targets were not changed.",
        );
      const { item } = itemResponseSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      if (item.itemId !== id) throw new Error("Item identity did not match.");
      const member = progress.members[player - 1];
      if (!member) throw new Error("Choose a party member.");
      const classSlug = member.classSlug ?? (player === 1 ? plan.leaderClass : null);
      if (
        classSlug &&
        item.allowedClasses.length &&
        !item.allowedClasses.some((entry) => entry.name.toLowerCase() === classSlug)
      )
        throw new Error("This item is not usable by the selected class.");
      const next = premadeProgressSchema.parse({
        ...progress,
        dungeonFinish: {
          ...progress.dungeonFinish,
          targets: [
            ...progress.dungeonFinish.targets,
            {
              id: crypto.randomUUID(),
              dungeonId,
              player,
              itemId: id,
              name: item.name,
              priority: number(data, "priority"),
              obtained: false,
            },
          ],
        },
      });
      onChange(next);
      onClose();
    } catch (cause: unknown) {
      if (controller.signal.aborted) return;
      setError(
        cause instanceof z.ZodError
          ? (cause.issues[0]?.message ?? "Check the entered item and player.")
          : cause instanceof Error
            ? cause.message
            : "The target could not be added.",
      );
    } finally {
      if (!controller.signal.aborted) setSaving(false);
      if (request.current === controller) request.current = null;
    }
  }
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className={styles.form}
    >
      <h2>Add a gear target</h2>
      <label>
        Item ID or Wowhead Forever link
        <input name="item" required maxLength={500} />
      </label>
      <div className={styles.formFields}>
        <label>
          Player
          <select name="player">
            {progress.members.map((member, index) => (
              <option key={index} value={index + 1}>
                Player {index + 1}
                {member.classSlug ? ` · ${member.classSlug}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dungeon
          <select name="dungeon" defaultValue={progress.dungeonFinish.selectedDungeonId}>
            {DUNGEON_FINISH_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select name="priority" defaultValue="2">
            <option value="3">High</option>
            <option value="2">Normal</option>
            <option value="1">Low</option>
          </select>
        </label>
      </div>
      <p>
        The item is checked against the current Forever catalog. Dungeon assignment and upgrade
        priority are your own selections, not a verified drop or guaranteed best-in-slot
        recommendation.
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" disabled={saving}>
          {saving ? "Checking item…" : "Add target"}
        </button>
        <button type="button" onClick={onClose} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
