"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { encodeHealerTalents, type HealerItem } from "@wow-trader/forever-data/healing-simulator";
import {
  healerAssetPath,
  parseHealerWorkspaceJob,
  parseHealerWorkspaceReply,
  type HealerWorkspaceBuild as HealerBuild,
  type HealerWorkspaceConfiguration as HealerConfiguration,
  type HealerWorkspaceLibrary as HealerLibrary,
  type WorkspaceHealingResult as HealingResult,
} from "@wow-trader/forever-data/healer-workspace";
import {
  configurationForHealerBuild,
  decodeHealerConfiguration,
  encodeHealerConfiguration,
  healerConfigurationProblem,
  healerWorkloadForConfiguration,
  isOriginalHealerConfiguration,
  healerConsumeMenus,
  healerSpellSupportsHot,
  healerEquippedItemUse,
} from "../lib/healer-configuration";
import { withHelperBasePath } from "../lib/site-path";
import { getItemHoverPlacement } from "../lib/item-hover-placement";
import { HealerIcon } from "./healer-icon";
import { HealerGearDialog } from "./healer-gear-dialog";
import { HealerItemStats } from "./healer-item-stats";
import { HealerTalentEditor } from "./healer-talent-editor";
import style from "./healer-simulator-workspace.module.css";

interface HealerWorkspaceProps {
  readonly library: HealerLibrary;
  readonly release: string;
  readonly initialSharedBuild?: string;
}
type RunState =
  | { readonly kind: "idle" | "loading" | "running" | "stopped" }
  | { readonly kind: "complete"; readonly result: HealingResult }
  | { readonly kind: "error"; readonly message: string };
interface HoveredItem {
  readonly item: HealerItem;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
}
const slots = [
  "Head",
  "Neck",
  "Shoulders",
  "Back",
  "Chest",
  "Wrists",
  "Hands",
  "Waist",
  "Legs",
  "Feet",
  "Ring 1",
  "Ring 2",
  "Trinket 1",
  "Trinket 2",
  "Main hand",
  "Off hand",
  "Wand",
];
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function HealerSimulatorWorkspace({
  library,
  release,
  initialSharedBuild,
}: HealerWorkspaceProps): React.JSX.Element {
  const [config, setConfig] = useState<HealerConfiguration>(() =>
      configurationForHealerBuild(
        library,
        library.builds.find((build) => build.id === library.defaultBuildId)!,
      ),
    ),
    [run, setRun] = useState<RunState>({ kind: "idle" }),
    [message, setMessage] = useState(""),
    [editingSlot, setEditingSlot] = useState<number | null>(null),
    [hovered, setHovered] = useState<HoveredItem | null>(null),
    [mounted, setMounted] = useState(false),
    [tooltipHeight, setTooltipHeight] = useState(280);
  const workerRef = useRef<Worker | null>(null),
    restoredIdentity = useRef<string | null>(null),
    generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    tooltipRef = useRef<HTMLDivElement>(null),
    id = useId(),
    storageKey = "kfc-healer-build:" + library.profile + ":" + library.modelIdentity;
  const archetypes = [...new Set(library.builds.map((build) => build.archetype))],
    consumeMenus = healerConsumeMenus(library),
    equippedItemUse = healerEquippedItemUse(library, config),
    slotNames = slots.map((name, slot) => (slot === 16 ? library.rangedSlotName : name));
  const build = library.builds.find((build) => build.id === config.buildId)!,
    race = library.races.find((race) => race.id === config.race)!,
    problem = healerConfigurationProblem(library, config),
    busy = run.kind === "loading" || run.kind === "running",
    original = isOriginalHealerConfiguration(library, config),
    reference = original
      ? build.references.find((reference) => reference.policyId === config.policyId)
      : null,
    result = run.kind === "complete" ? run.result : null;
  const dispose = useCallback((): void => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);
  useEffect((): (() => void) => {
    setRun((current) =>
      !workerRef.current && (current.kind === "loading" || current.kind === "running")
        ? { kind: "stopped" }
        : current,
    );
    return dispose;
  }, [dispose]);
  useEffect((): void => {
    const identity = JSON.stringify([storageKey, release, initialSharedBuild ?? null]);
    if (restoredIdentity.current === identity) return;
    restoredIdentity.current = identity;
    dispose();
    setRun({ kind: "idle" });
    setMounted(true);
    try {
      const saved =
        initialSharedBuild ??
        localStorage.getItem(storageKey) ??
        (library.profile === "healing-priest"
          ? localStorage.getItem("kfc-healer-build:" + library.modelIdentity)
          : null);
      if (saved) {
        const candidate = decodeHealerConfiguration(saved),
          invalid = healerConfigurationProblem(library, candidate, false);
        if (invalid) setMessage(invalid);
        else {
          setConfig(candidate);
          setMessage(
            initialSharedBuild ? "Shared build loaded." : "Your saved build was restored.",
          );
        }
      }
    } catch {
      setMessage("The saved build could not be restored. The reviewed default is loaded.");
    }
  }, [dispose, initialSharedBuild, library, release, storageKey]);
  useEffect((): (() => void) => {
    const hide = (): void => setHovered(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return (): void => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);
  useEffect((): void => {
    if (tooltipRef.current) setTooltipHeight(tooltipRef.current.scrollHeight);
  }, [hovered]);
  function change(next: HealerConfiguration): void {
    dispose();
    setRun({ kind: "idle" });
    setConfig(next);
  }
  function loadPreset(
    archetype: HealerBuild["archetype"],
    assignment = build.assignment,
    layout = build.layout,
    durationSeconds = build.durationSeconds,
  ): void {
    const selected = library.builds.find(
      (candidate) =>
        candidate.archetype === archetype &&
        candidate.assignment === assignment &&
        candidate.layout === (assignment === "tank" ? "stacked" : layout) &&
        candidate.durationSeconds === durationSeconds,
    );
    if (!selected) {
      setMessage("That assignment has not been reviewed yet.");
      return;
    }
    change(configurationForHealerBuild(library, selected));
    setMessage("Loaded " + selected.title + " with its reviewed gear and casting plan.");
  }
  function updateFields(fields: Record<string, number>): void {
    change({ ...config, fields });
  }
  function chooseItem(itemId: number): void {
    if (editingSlot === null) return;
    const gear = globalThis.structuredClone(config.gear),
      previous = gear[editingSlot]!,
      item = library.items.find((item) => item.id === itemId);
    gear[editingSlot] = {
      id: itemId,
      ...(previous.enchant && item?.enchantIds.includes(previous.enchant)
        ? { enchant: previous.enchant }
        : {}),
    };
    if (editingSlot === 14 && item?.twoHanded) gear[15] = { id: 0 };
    change({ ...config, gear });
    setEditingSlot(null);
    setHovered(null);
  }
  function changeEnchant(slot: number, enchant: number): void {
    const gear = globalThis.structuredClone(config.gear),
      item = gear[slot]!;
    gear[slot] = { id: item.id, ...(enchant ? { enchant } : {}) };
    change({ ...config, gear });
  }
  function preview(item: HealerItem, element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    setHovered({ item, top: rect.top, bottom: rect.bottom, left: rect.left });
  }
  async function simulate(): Promise<void> {
    if (problem) {
      setMessage(problem);
      return;
    }
    dispose();
    const token = generation.current,
      asset = (name: string): string =>
        withHelperBasePath(healerAssetPath(library.profile, release, name));
    setRun({ kind: "loading" });
    setHovered(null);
    function fail(message: string): void {
      if (generation.current !== token) return;
      dispose();
      setRun({ kind: "error", message });
    }
    timer.current = setTimeout(
      (): void =>
        fail("The healing engine could not finish loading. Retry or check your connection."),
      30_000,
    );
    try {
      const imported: unknown = await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ asset("request-codec.js")
      );
      if (generation.current !== token) return;
      const codec = object(imported);
      if (typeof codec?.createJob !== "function")
        throw new Error("The healing request builder could not load.");
      const createJob = codec.createJob as (input: unknown) => unknown;
      const raw: unknown = createJob({
        id: "healer-" + crypto.randomUUID(),
        requestBase64: build.requestBase64,
        gear: config.gear,
        talentsString: encodeHealerTalents(library.talents, config.fields),
        race: config.race,
        consumes: config.consumes,
        iterations: config.iterations,
        seed: 109743,
        workload: healerWorkloadForConfiguration(library, config),
      });
      const job = parseHealerWorkspaceJob(library.profile, raw),
        worker = new Worker(asset("healing-worker.js"), {
          name: "KFC " + library.className + " healing",
        });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<unknown>): void => {
        if (generation.current !== token || workerRef.current !== worker) return;
        try {
          const data = object(event.data);
          if (data?.type === "ready") {
            if (timer.current) clearTimeout(timer.current);
            timer.current = null;
            setRun({ kind: "running" });
            worker.postMessage({ type: "run", job });
          } else if (data?.type === "result") {
            const reply = parseHealerWorkspaceReply(library.profile, data.reply);
            if (reply.id !== job.id) throw new Error("The engine returned a different simulation.");
            if (reply.status === "error") fail(reply.error.message);
            else setRun({ kind: "complete", result: reply.result });
          } else if (data?.type === "fatal")
            fail(
              typeof data.error === "string"
                ? data.error
                : "The healing engine stopped unexpectedly.",
            );
        } catch (error: unknown) {
          fail(error instanceof Error ? error.message : "The healing response could not be read.");
        }
      };
      worker.onerror = (event: ErrorEvent): void => {
        event.preventDefault();
        fail("The healing engine could not run. Retry to start a fresh worker.");
      };
    } catch (error: unknown) {
      fail(error instanceof Error ? error.message : "The healing engine could not start.");
    }
  }
  function save(): void {
    try {
      localStorage.setItem(storageKey, encodeHealerConfiguration(config));
      setMessage("Build saved in this browser.");
    } catch {
      setMessage("This browser could not save the build. You can still copy a share link.");
    }
  }
  async function share(): Promise<void> {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("release", release);
    url.searchParams.set("build", encodeHealerConfiguration(config));
    try {
      await navigator.clipboard.writeText(url.toString());
      setMessage("Build link copied.");
    } catch {
      setMessage("Copy this build link: " + url.toString());
    }
  }
  const stats = result
    ? {
        effective: result.effectiveHealingHps,
        absorbed: result.absorbedHps,
        overheal: result.overhealingHps,
        survival: result.survivalRate,
        mana: result.manaRemainingMean,
        missing: result.missingHealthSecondsMean / build.durationSeconds,
      }
    : reference
      ? {
          effective: reference.effectiveHealingHps,
          absorbed: reference.absorbedHps,
          overheal: reference.overhealingHps,
          survival: reference.survivalRate,
          mana: reference.manaRemaining,
          missing: reference.meanMissingHealth,
        }
      : null;
  const failed =
    result &&
    (result.survivalRate < 1 ||
      Math.abs(result.deliveredIncomingDamageMean - result.plannedIncomingPostMitigationDamage) >
        Math.max(1, result.plannedIncomingPostMitigationDamage) * 1e-7);
  const placement =
    hovered && mounted
      ? getItemHoverPlacement({
          anchorTop: hovered.top,
          anchorBottom: hovered.bottom,
          tooltipHeight,
          viewportHeight: window.innerHeight,
        })
      : null;
  return (
    <div className={style.workspace} aria-busy={!mounted} inert={!mounted}>
      <section className={style.library} aria-labelledby="healer-library-heading">
        <header className={style.sectionHeading}>
          <div>
            <span className="eyebrow">Reviewed pre-raid builds</span>
            <h2 id="healer-library-heading">Build library</h2>
          </div>
          <span className={style.chip}>{library.className} · Level 60</span>
        </header>
        <div className={style.archetypes}>
          {archetypes.map((archetype) => (
            <button
              type="button"
              aria-pressed={build.archetype === archetype}
              key={archetype}
              onClick={(): void => loadPreset(archetype)}
            >
              {library.builds.find((build) => build.archetype === archetype)?.title}
            </button>
          ))}
        </div>
        <div className={style.selectors}>
          <label>
            Assignment
            <select
              value={build.assignment}
              onChange={(event): void =>
                loadPreset(build.archetype, event.currentTarget.value as HealerBuild["assignment"])
              }
            >
              <option value="tank">Tank healing</option>
              <option value="group">Group healing</option>
              <option value="burst">Burst recovery</option>
            </select>
          </label>
          {build.assignment !== "tank" ? (
            <label>
              Group spacing
              <select
                value={build.layout}
                onChange={(event): void =>
                  loadPreset(
                    build.archetype,
                    build.assignment,
                    event.currentTarget.value as HealerBuild["layout"],
                  )
                }
              >
                <option value="stacked">Stacked · within 8 yards</option>
                <option value="spread">Spread · 12–30 yards</option>
              </select>
            </label>
          ) : null}
          <label>
            Fight length
            <select
              value={build.durationSeconds}
              onChange={(event): void =>
                loadPreset(
                  build.archetype,
                  build.assignment,
                  build.layout,
                  Number(event.currentTarget.value) as 180 | 300,
                )
              }
            >
              <option value={180}>3 minutes</option>
              <option value={300}>5 minutes</option>
            </select>
          </label>
          <label>
            Race
            <select
              value={config.race}
              onChange={(event): void =>
                change({ ...config, race: Number(event.currentTarget.value) })
              }
            >
              {library.races.map((race) => (
                <option value={race.id} key={race.id}>
                  {race.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={style.helper}>
          Selecting a preset loads its gear, talents and casting plan. Save a custom build before
          switching.
        </p>
        <p className={style.helper}>
          Beta healing model ·{" "}
          {Math.round(
            build.workload.damage.reduce((sum, event) => sum + event.amount, 0) /
              build.durationSeconds,
          ).toLocaleString()}{" "}
          incoming damage/s on average in this stationary example. Spell-rank scaling is still being
          verified; <a href="#healing-assumptions">compare the declared scenarios</a>.
        </p>
      </section>
      <div className={style.runBar}>
        <div>
          <strong>
            {run.kind === "loading"
              ? "Loading the healing engine…"
              : run.kind === "running"
                ? "Simulating " + config.iterations.toLocaleString() + " fights…"
                : run.kind === "stopped"
                  ? "Simulation stopped"
                  : run.kind === "complete"
                    ? "Simulation complete"
                    : original
                      ? "Reviewed setup loaded"
                      : "Custom build"}
          </strong>
          <small>{problem ?? "Full improved raid support · Engineering and Tailoring"}</small>
        </div>
        <div className={style.runActions}>
          <label className={style.iterations}>
            Fights
            <select
              value={config.iterations}
              onChange={(event): void =>
                change({ ...config, iterations: Number(event.currentTarget.value) })
              }
            >
              {[128, 512, 2000, 10000].map((count) => (
                <option value={count} key={count}>
                  {count.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={style.primary}
            disabled={!mounted || busy || Boolean(problem)}
            onClick={(): void => {
              void simulate();
            }}
          >
            Simulate
          </button>
          <button
            type="button"
            disabled={!busy}
            onClick={(): void => {
              dispose();
              setRun({ kind: "stopped" });
            }}
          >
            Stop
          </button>
        </div>
        {busy ? (
          <progress aria-label="Healing simulation in progress" className={style.progress} />
        ) : null}
      </div>
      {run.kind === "error" ? (
        <p role="alert" className={style.error}>
          {run.message}{" "}
          <button
            type="button"
            onClick={(): void => {
              void simulate();
            }}
          >
            Retry simulation
          </button>
        </p>
      ) : null}
      {message ? (
        <p className={style.message} role="status">
          {message}
        </p>
      ) : null}
      <section className={style.results} aria-label="Healing results" aria-live="polite">
        <header className={style.sectionHeading}>
          <div>
            <span className="eyebrow">
              {result
                ? "Your simulation"
                : reference
                  ? "Confirmed preset reference"
                  : "Your character"}
            </span>
            <h2>{result ? "Healing results" : "Know what your build can cover"}</h2>
          </div>
          {result ? (
            <span className={style.chip}>{result.iterations.toLocaleString()} fights</span>
          ) : reference ? (
            <span className={style.chip}>
              {reference.iterations.toLocaleString()} confirmation fights
            </span>
          ) : null}
        </header>
        {failed ? (
          <p role="alert" className={style.error}>
            Assignment failed: a target died. High raw healing does not make this setup safe for the
            selected damage.
          </p>
        ) : null}
        {stats ? (
          <>
            <dl className={style.metrics}>
              {[
                ["Effective healing", stats.effective.toFixed(1) + " HPS"],
                ["Damage absorbed", stats.absorbed.toFixed(1) + " HPS"],
                ["Survival", (stats.survival * 100).toFixed(1) + "%"],
                ["Mana remaining", Math.round(stats.mana).toLocaleString()],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className={style.helper}>
              Overhealing {stats.overheal.toFixed(1)} HPS · Average missing friendly health{" "}
              {stats.missing.toFixed(1)} (lower is better). Only consumed shields count as absorbed
              damage.
            </p>
          </>
        ) : (
          <p className={style.empty}>
            Your changes are ready to measure. Run a simulation to compare this character with the
            selected assignment.
          </p>
        )}
      </section>
      <div className={style.columns}>
        <section className={style.gear} aria-labelledby="healer-gear-heading">
          <header className={style.sectionHeading}>
            <div>
              <span className="eyebrow">Every slot · Every enchant</span>
              <h2 id="healer-gear-heading">Equipment</h2>
            </div>
            <button type="button" onClick={(): void => loadPreset(build.archetype)}>
              Reset preset
            </button>
          </header>
          {config.gear.map((spec, slot) => {
            const item = library.items.find((item) => item.id === spec.id),
              twoHands = library.items.find((item) => item.id === config.gear[14]?.id)?.twoHanded,
              choices = library.enchants.filter((enchant) => item?.enchantIds.includes(enchant.id));
            return (
              <div className={style.gearRow} key={slot}>
                <button
                  type="button"
                  className={style.gearButton}
                  disabled={slot === 15 && twoHands}
                  onClick={(): void => {
                    setEditingSlot(slot);
                    setHovered(null);
                  }}
                  aria-label={"Change " + slotNames[slot] + (item ? ": " + item.name : "")}
                  aria-describedby={
                    hovered?.item.id === item?.id ? id + "-item-tooltip" : undefined
                  }
                  onFocus={(event): void => {
                    if (item) preview(item, event.currentTarget);
                  }}
                  onBlur={(): void => setHovered(null)}
                  onMouseEnter={(event): void => {
                    if (item) preview(item, event.currentTarget);
                  }}
                  onMouseLeave={(): void => setHovered(null)}
                >
                  <span className={style.itemIcon}>
                    {item ? <HealerIcon name={item.icon} /> : <span aria-hidden="true">—</span>}
                  </span>
                  <span>
                    <small>{slotNames[slot]}</small>
                    <strong className={item ? "quality-text-" + item.quality : undefined}>
                      {item?.name ?? (twoHands ? "Two-handed weapon equipped" : "Empty")}
                    </strong>
                  </span>
                  <span className={style.change} aria-hidden="true">
                    Change
                  </span>
                </button>
                {choices.length ? (
                  <label className={style.enchant}>
                    <span className="sr-only">{slotNames[slot]} enchant</span>
                    <select
                      aria-label={slotNames[slot] + " enchant"}
                      value={spec.enchant ?? 0}
                      onChange={(event): void =>
                        changeEnchant(slot, Number(event.currentTarget.value))
                      }
                    >
                      <option value={0}>No enchant</option>
                      {choices.map((enchant) => (
                        <option key={enchant.id} value={enchant.id}>
                          {enchant.name.replace(/^Enchant [^-]+ - /, "")}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            );
          })}
        </section>
        <div className={style.sidebar}>
          <section className={style.panel} aria-labelledby="healer-casting-heading">
            <header className={style.sectionHeading}>
              <div>
                <span className="eyebrow">Reactive healing guidance</span>
                <h2 id="healer-casting-heading">Casting plan</h2>
              </div>
            </header>
            <p className={style.helper}>
              Work down this list. Cast the first available spell on the living assigned target with
              the lowest health percentage once its threshold is met.
            </p>
            {equippedItemUse ? (
              <p className={style.helper} data-testid="healer-equipped-item-use">
                Major Recombobulator activates automatically on{" "}
                {equippedItemUse.recombobulatorTarget === "self"
                  ? "your character"
                  : "the eligible ally with the lowest health percentage"}
                . A target qualifies with{" "}
                {equippedItemUse.minimumMissingHealth
                  ? `${equippedItemUse.minimumMissingHealth.toLocaleString()}+ health missing`
                  : "any health missing"}{" "}
                or{" "}
                {equippedItemUse.minimumMissingMana
                  ? `${equippedItemUse.minimumMissingMana.toLocaleString()}+ mana missing`
                  : "any mana missing"}
                . Both resources go to that same target. The model assumes a fully charged item and
                a five-minute cooldown; item-heal critical behavior follows the selected scenario.
              </p>
            ) : null}
            <details className={style.details}>
              <summary>How to use this healing build</summary>
              <ul>
                {build.guidance.map((guidance) => (
                  <li key={guidance}>{guidance}</li>
                ))}
              </ul>
            </details>
            <ol className={style.priorities}>
              {config.priorities.map((priority, index) => {
                const spell = library.spells.find((spell) => spell.id === priority.spellId);
                return (
                  <li key={index}>
                    <strong>
                      {spell?.name ?? "Unknown spell"} <small>Rank {spell?.rank}</small>
                    </strong>
                    <span>
                      {spell?.requiredTalentField && !config.fields[spell.requiredTalentField]
                        ? "Requires talent · learn it or remove this priority"
                        : priority.minimumMissingHealth
                          ? Math.round(priority.minimumMissingHealth).toLocaleString() +
                            "+ health missing"
                          : "When available"}
                      {priority.keepHot ? " · keep HoT active" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
            <details className={style.details}>
              <summary>Edit spell priorities and ranks</summary>
              {config.priorities.map((priority, index) => (
                <div className={style.priorityEditor} key={index}>
                  <label>
                    Spell
                    <select
                      value={priority.spellId}
                      onChange={(event): void => {
                        const spellId = Number(event.currentTarget.value),
                          priorities = config.priorities.map((row, position) =>
                            position === index
                              ? {
                                  ...row,
                                  spellId,
                                  raidIndex:
                                    library.spells.find((spell) => spell.id === spellId)?.family ===
                                    "tranquility"
                                      ? -1
                                      : row.raidIndex,
                                  keepHot:
                                    healerSpellSupportsHot(
                                      library.spells.find((spell) => spell.id === spellId)
                                        ?.family ?? "",
                                    ) && row.keepHot,
                                }
                              : row,
                          );
                        change({ ...config, priorities });
                      }}
                    >
                      {library.spells
                        .filter(
                          (spell) =>
                            spell.id === priority.spellId ||
                            !spell.requiredTalentField ||
                            config.fields[spell.requiredTalentField],
                        )
                        .map((spell) => (
                          <option
                            value={spell.id}
                            key={spell.id}
                            disabled={Boolean(
                              spell.requiredTalentField &&
                              !config.fields[spell.requiredTalentField],
                            )}
                          >
                            {spell.name} · Rank {spell.rank}
                            {spell.requiredTalentField && !config.fields[spell.requiredTalentField]
                              ? " · requires talent"
                              : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Missing health
                    <input
                      type="number"
                      min={0}
                      max={20000}
                      step={50}
                      value={priority.minimumMissingHealth}
                      onChange={(event): void => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isFinite(value) && value >= 0 && value <= 20000)
                          change({
                            ...config,
                            priorities: config.priorities.map((row, position) =>
                              position === index ? { ...row, minimumMissingHealth: value } : row,
                            ),
                          });
                      }}
                    />
                  </label>
                  <label>
                    Target
                    <select
                      aria-label={"Priority " + (index + 1) + " target"}
                      value={priority.raidIndex}
                      disabled={
                        library.spells.find((spell) => spell.id === priority.spellId)?.family ===
                        "tranquility"
                      }
                      onChange={(event): void =>
                        change({
                          ...config,
                          priorities: config.priorities.map((row, position) =>
                            position === index
                              ? { ...row, raidIndex: Number(event.currentTarget.value) }
                              : row,
                          ),
                        })
                      }
                    >
                      <option value={-1}>Lowest health ally</option>
                      {build.workload.targets
                        .filter((target) => target.raidIndex > 0)
                        .map((target) => (
                          <option value={target.raidIndex} key={target.raidIndex}>
                            Ally {target.raidIndex}
                          </option>
                        ))}
                    </select>
                  </label>
                  {healerSpellSupportsHot(
                    library.spells.find((spell) => spell.id === priority.spellId)?.family ?? "",
                  ) ? (
                    <label>
                      <input
                        type="checkbox"
                        checked={priority.keepHot}
                        onChange={(event): void =>
                          change({
                            ...config,
                            priorities: config.priorities.map((row, position) =>
                              position === index
                                ? { ...row, keepHot: event.currentTarget.checked }
                                : row,
                            ),
                          })
                        }
                      />
                      Keep HoT active
                    </label>
                  ) : null}
                  <div className={style.priorityButtons}>
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={"Move priority " + (index + 1) + " up"}
                      onClick={(): void => {
                        const priorities = config.priorities.slice();
                        [priorities[index - 1], priorities[index]] = [
                          priorities[index]!,
                          priorities[index - 1]!,
                        ];
                        change({ ...config, priorities });
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={config.priorities.length <= 1}
                      aria-label={"Remove priority " + (index + 1)}
                      onClick={(): void =>
                        change({
                          ...config,
                          priorities: config.priorities.filter((_, position) => position !== index),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                disabled={config.priorities.length >= 32}
                onClick={(): void =>
                  change({
                    ...config,
                    priorities: [
                      ...config.priorities,
                      {
                        spellId: library.defaultDirectSpellId,
                        raidIndex: build.assignment === "tank" ? 1 : -1,
                        minimumMissingHealth: 400,
                        keepHot: false,
                      },
                    ],
                  })
                }
              >
                Add healing spell
              </button>
            </details>
          </section>
          <section className={style.panel} aria-labelledby="healer-consumes-heading">
            <header className={style.sectionHeading}>
              <div>
                <span className="eyebrow">Resources and preparation</span>
                <h2 id="healer-consumes-heading">Consumables</h2>
              </div>
            </header>
            <div className={style.consumeGrid}>
              {consumeMenus.map((menu) => (
                <label key={menu.key}>
                  {menu.label}
                  <select
                    value={config.consumes[menu.key]}
                    onChange={(event): void =>
                      change({
                        ...config,
                        consumes: {
                          ...config.consumes,
                          [menu.key]: Number(event.currentTarget.value),
                        },
                      })
                    }
                  >
                    {menu.choices.map((choice) => (
                      <option value={choice.id} key={choice.id}>
                        {choice.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className={style.helper}>
              Greater Mageblood and Major Mana Potion are included. Owned healing and mana items
              activate only when equipped; Demonic Rune includes its real self-damage.
              {library.profile === "healing-priest"
                ? " Berserking activates only for Trolls."
                : " Innervate and talented Nature’s Swiftness follow the selected assignment."}
            </p>
          </section>
          <section className={style.panel}>
            <h2>Save and share</h2>
            <p className={style.helper}>
              Build links keep their exact engine release. Your saved character stays in this
              browser.
            </p>
            <div className={style.saveActions}>
              <button type="button" onClick={save}>
                Save build
              </button>
              <button
                type="button"
                onClick={(): void => {
                  void share();
                }}
              >
                Copy build link
              </button>
            </div>
          </section>
        </div>
      </div>
      <HealerTalentEditor trees={library.talents} fields={config.fields} onChange={updateFields} />
      <details className={style.assumptions} id="healing-assumptions">
        <summary>Scenario, utility and beta model assumptions</summary>
        <label>
          {library.profile === "healing-priest"
            ? "Spell-rank scaling"
            : "Rank, proc and item scenario"}
          <select
            value={config.policyId}
            onChange={(event): void => change({ ...config, policyId: event.currentTarget.value })}
          >
            {library.rankPolicies.map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.label}
              </option>
            ))}
          </select>
        </label>
        <p>{library.rankPolicies.find((policy) => policy.id === config.policyId)?.description}</p>
        <p>
          These are explicit sensitivity hypotheses. The level 60 downranking formula has not been
          verified on the server.
        </p>
        <p>
          {build.evidence === "all-slot-benchmark"
            ? "The three-minute baseline includes the all-slot gear search and independent retained-contender checks."
            : "This duration/spacing setup adapts the reviewed gear and casting plan; it has separate survival checks and does not claim a fresh global gear optimum."}
        </p>
        <ul>
          {library.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
        {library.profile === "healing-priest" ? (
          <p>
            Inspiration rank {config.fields.inspiration ?? 0} · Spirit of Redemption rank{" "}
            {config.fields.spiritOfRedemption ?? 0}. Their defensive/death utility is not part of
            this post-mitigation score.
          </p>
        ) : null}
        <p>
          Preset references use the recorded{" "}
          {library.races.find((race) => race.id === library.defaultRaceId)?.name} character. Custom
          gear, talents, race or spell priorities need a new simulation. Model{" "}
          {library.modelIdentity.slice(0, 12)} · client {library.sourceBuild}.
        </p>
      </details>
      {editingSlot !== null ? (
        <HealerGearDialog
          key={editingSlot}
          library={library}
          slot={editingSlot}
          slotName={slotNames[editingSlot]!}
          currentId={config.gear[editingSlot]!.id}
          faction={race.faction}
          onSelect={chooseItem}
          onClose={(): void => setEditingSlot(null)}
        />
      ) : null}
      {hovered && placement && mounted
        ? createPortal(
            <div
              id={id + "-item-tooltip"}
              role="tooltip"
              ref={tooltipRef}
              className={style.itemPopup}
              style={{
                left: Math.max(8, Math.min(window.innerWidth - 336, hovered.left)),
                top: placement.placement === "above" ? undefined : hovered.bottom + 8,
                bottom:
                  placement.placement === "above"
                    ? window.innerHeight - hovered.top + 8
                    : undefined,
                maxHeight: placement.maxHeight,
              }}
            >
              <HealerItemStats item={hovered.item} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
