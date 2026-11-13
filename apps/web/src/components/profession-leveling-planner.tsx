"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { withHelperBasePath } from "../lib/site-path";
import {
  DEFAULT_PROFESSION_LEVELING_OPTIONS,
  professionLevelingOptionsSchema,
} from "../lib/profession-leveling-settings";
import type {
  ProfessionLevelingData,
  ProfessionLevelingOptions,
  ProfessionLevelingPlan,
} from "../lib/profession-leveling-types";
import type {
  LevelingWorkerRequest,
  LevelingWorkerResponse,
} from "../lib/profession-leveling.worker";
import styles from "./profession-leveling.module.css";
import { ProfessionRecipeCosts } from "./profession-recipe-costs";
import { ProfessionLevelingResult } from "./profession-leveling-result";
import { ProfessionLevelingRecovery } from "./profession-leveling-recovery";

export function ProfessionLevelingPlanner({
  data,
}: {
  readonly data: ProfessionLevelingData;
}): React.JSX.Element {
  const [options, setOptions] = useState<ProfessionLevelingOptions>(
    DEFAULT_PROFESSION_LEVELING_OPTIONS,
  );
  const [plan, setPlan] = useState<ProfessionLevelingPlan | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageKey = `wow-trader:profession-leveling:v1:${data.market}:${data.profession}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = professionLevelingOptionsSchema.safeParse(JSON.parse(saved));
        if (parsed.success) setOptions(parsed.data);
      }
    } catch {
      /* Browser storage is optional; calculation remains available. */
    }
    return (): void => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [storageKey]);

  function update(next: ProfessionLevelingOptions): void {
    worker.current?.terminate();
    if (timer.current) clearTimeout(timer.current);
    setOptions(next);
    setPlan(null);
    setStatus("idle");
    setError("");
  }

  function calculate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const validated = professionLevelingOptionsSchema.safeParse(options);
    if (!validated.success) {
      setError(validated.error.issues[0]?.message ?? "Check your skill range.");
      setStatus("error");
      return;
    }
    worker.current?.terminate();
    if (timer.current) clearTimeout(timer.current);
    setStatus("working");
    setPlan(null);
    setError("");
    try {
      const instance = new Worker(new URL("../lib/profession-leveling.worker.ts", import.meta.url));
      worker.current = instance;
      const stop = (): void => {
        instance.terminate();
        if (timer.current) clearTimeout(timer.current);
      };
      instance.onmessage = (message: MessageEvent<LevelingWorkerResponse>): void => {
        stop();
        if ("error" in message.data) {
          setError(message.data.error);
          setStatus("error");
          return;
        }
        setPlan(message.data.plan);
        setStatus("ready");
        try {
          localStorage.setItem(storageKey, JSON.stringify(options));
        } catch {
          /* Saving preferences is optional. */
        }
      };
      instance.onerror = (): void => {
        stop();
        setStatus("error");
        setError("The planner could not start. Reload this page and try again.");
      };
      timer.current = setTimeout((): void => {
        stop();
        setStatus("error");
        setError("Calculation took too long. Try a shorter skill range.");
      }, 30_000);
      const request: LevelingWorkerRequest = {
        data: { recipes: data.recipes, items: data.items },
        options: validated.data,
      };
      instance.postMessage(request);
    } catch {
      setStatus("error");
      setError("This browser could not start the planner. Enable site workers and reload.");
    }
  }

  const profession = data.professions.find((candidate) => candidate.slug === data.profession);
  return (
    <div className={styles.planner}>
      {data.profession === "mining" ? (
        <p className={styles.note}>
          Mining routes cover smelting recipes. Gathering skill-ups require playing in the world and
          are not priced from AH materials.
        </p>
      ) : null}
      <form onSubmit={calculate} className={styles.controls}>
        <fieldset disabled={status === "working" || Boolean(data.limitation)}>
          <legend>Plan your {profession?.name ?? "profession"} leveling</legend>
          <p className={styles.intro}>Start where you are. Choose the skill you want to reach.</p>
          <div className={styles.fields}>
            <label>
              Current skill
              <input
                type="number"
                min={1}
                max={300}
                required
                value={options.from}
                onChange={(event) => update({ ...options, from: Number(event.target.value) })}
              />
            </label>
            <label>
              Target skill
              <input
                type="number"
                min={options.from}
                max={300}
                required
                value={options.to}
                onChange={(event) => update({ ...options, to: Number(event.target.value) })}
              />
            </label>
            <label>
              Character level
              <input
                type="number"
                min={1}
                max={60}
                required
                value={options.playerLevel}
                onChange={(event) =>
                  update({ ...options, playerLevel: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Skill-up strategy
              <select
                value={options.mode}
                onChange={(event) =>
                  update({
                    ...options,
                    mode: event.target.value === "orange" ? "orange" : "expected",
                  })
                }
              >
                <option value="expected">Include yellow / green · estimated</option>
                <option value="orange">Orange recipes · reliable skill-ups</option>
              </select>
            </label>
          </div>
          <ProfessionLevelingRecovery options={options} onChange={update} />
          <p className={styles.learningHint}>
            <strong>Already know a recipe?</strong> Mark it below to skip its learning fee. Add a
            price where it is missing; unknown learning costs are excluded.
          </p>
          <ProfessionRecipeCosts recipes={data.recipes} options={options} onChange={update} />
          <div className={styles.actions}>
            <button type="submit" className={styles.primary}>
              {status === "working" ? "Comparing routes…" : "Find lowest-cost route"}
            </button>
            <span>Crafting order + a copyable shopping list</span>
          </div>
        </fieldset>
      </form>
      <p className={styles.note}>
        Includes materials and one-time recipe purchases or training fees. Profession rank upgrades,
        tools and travel are extra. Keep the shopping budget available before selling or
        disenchanting your crafts.
      </p>
      {!data.scan?.fresh && data.scan ? (
        <p role="status" className={styles.warning}>
          Reference prices: this scan is over one hour old. Run a fresh AH scan before buying.
        </p>
      ) : null}
      <div aria-live="polite" aria-busy={status === "working"}>
        {status === "error" ? (
          <p role="alert" className={styles.warning}>
            {error}
          </p>
        ) : null}
        {status === "working" ? (
          <p>
            Comparing recipe unlocks, skill-ups and available auction stacks. You can keep using the
            page.
          </p>
        ) : null}
        {plan ? (
          <ProfessionLevelingResult plan={plan} />
        ) : status === "idle" && !data.limitation ? (
          <div className={styles.emptyResult}>
            <span aria-hidden="true">1 → 300</span>
            <div>
              <strong>Your crafting plan will appear here</strong>
              <p>Set your skill goal and known recipes, then compare routes for this market.</p>
            </div>
          </div>
        ) : null}
      </div>
      <p>
        <Link href={withHelperBasePath("/forever/trader")}>← Back to Auction House prices</Link>
      </p>
    </div>
  );
}
